<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type { RadioStation, RadioStationPayload } from '$lib/types/radio';

	let stations = $state<RadioStation[]>([]);
	let stats = $state<RadioStationPayload['stats'] | null>(null);
	let isLoading = $state(true);
	let error = $state('');
	let globeModule = $state<Promise<typeof import('$lib/components/RadioGlobe.svelte')> | null>(
		null
	);
	let query = $state('');
	let country = $state('all');
	let hiQualityOnly = $state(false);
	let selectedStation = $state<RadioStation | null>(null);
	let audioElement = $state<HTMLAudioElement | null>(null);
	let isPlaying = $state(false);
	let isBuffering = $state(false);
	let isMuted = $state(false);
	let volume = $state(0.85);
	let elapsed = $state(0);
	let lastAutoplayStationId = '';
	let favoriteIds = $state<Set<string>>(new Set());
	let favoritesOpen = $state(false);
	let apiResponseTime = $state(0);
	let isOnline = $state(true);
	let rawApiStats = $state<any>(null);
	let failedFavicons = $state<Set<string>>(new Set());

	const dataAge = $derived.by(() => {
		if (!stats?.updatedAt) return '';
		const updated = new Date(stats.updatedAt);
		const now = new Date();
		const diffMs = now.getTime() - updated.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		if (diffMins < 1) return 'now';
		if (diffMins < 60) return `${diffMins}m ago`;
		const diffHours = Math.floor(diffMins / 60);
		return `${diffHours}h ago`;
	});

	onMount(async () => {
		globeModule = import('$lib/components/RadioGlobe.svelte');

		const saved = localStorage.getItem('radio-world-favorites');
		if (saved) {
			try {
				favoriteIds = new Set(JSON.parse(saved) as string[]);
			} catch {
				// ignore malformed storage
			}
		}

		try {
			const startTime = performance.now();
			const response = await fetch('/api/stations');
			apiResponseTime = Math.round(performance.now() - startTime);
			if (!response.ok) {
				throw new Error('The live radio directory could not be reached.');
			}

			const payload = (await response.json()) as RadioStationPayload;
			stations = payload.stations;
			stats = payload.stats;
			rawApiStats = payload.stats;
		} catch (cause) {
			error =
				cause instanceof Error ? cause.message : 'The live radio directory could not be reached.';
		} finally {
			isLoading = false;
		}

		if (typeof window !== 'undefined') {
			window.addEventListener('online', () => (isOnline = true));
			window.addEventListener('offline', () => (isOnline = false));
		}
	});

	const countryOptions = $derived.by(() => {
		return [...new Set(stations.map((station) => station.country).filter(Boolean))].sort(
			(left, right) => left.localeCompare(right)
		);
	});

	const visibleStations = $derived.by(() => {
		const normalizedQuery = query.trim().toLowerCase();

		return stations.filter((station) => {
			if (country !== 'all' && station.country !== country) {
				return false;
			}

			if (hiQualityOnly && (!station.bitrate || station.bitrate < 192)) {
				return false;
			}

			if (!normalizedQuery) {
				return true;
			}

			return [
				station.name,
				station.country,
				station.language,
				station.codec,
				station.tags.join(' ')
			].some((value) => value.toLowerCase().includes(normalizedQuery));
		});
	});

	const languageCount = $derived.by(() => {
		return new Set(stations.map((station) => station.language).filter(Boolean)).size;
	});

	const spotlight = $derived(selectedStation);

	const refreshedAt = $derived.by(() => {
		if (!stats) {
			return '';
		}

		return new Intl.DateTimeFormat('en', {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(new Date(stats.updatedAt));
	});

	const favoriteStations = $derived(stations.filter((s) => favoriteIds.has(s.id)));

	function pickStation(station: RadioStation | null) {
		selectedStation = station;
	}

	function toggleFavorite(id: string) {
		const next = new Set(favoriteIds);
		if (next.has(id)) {
			next.delete(id);
		} else {
			next.add(id);
		}
		favoriteIds = next;
	}

	function clearFilters() {
		query = '';
		country = 'all';
		hiQualityOnly = false;
	}

	function formatTime(totalSeconds: number) {
		if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
			return '0:00';
		}

		const minutes = Math.floor(totalSeconds / 60);
		const seconds = Math.floor(totalSeconds % 60);
		return `${minutes}:${seconds.toString().padStart(2, '0')}`;
	}

	function syncAudioState() {
		if (!audioElement) {
			return;
		}

		isPlaying = !audioElement.paused && !audioElement.ended;
		isMuted = audioElement.muted;
		volume = audioElement.volume;
		elapsed = audioElement.currentTime;
	}

	async function togglePlayback() {
		if (!audioElement) {
			return;
		}

		if (audioElement.paused) {
			try {
				await audioElement.play();
			} catch (error) {
				console.warn('Manual playback failed', error);
			}
			return;
		}

		audioElement.pause();
	}

	function updateVolume(nextVolume: number) {
		if (!audioElement) {
			return;
		}

		volume = nextVolume;
		audioElement.volume = nextVolume;
		audioElement.muted = nextVolume === 0;
		syncAudioState();
	}

	function toggleMute() {
		if (!audioElement) {
			return;
		}

		audioElement.muted = !audioElement.muted;

		if (!audioElement.muted && audioElement.volume === 0) {
			audioElement.volume = 0.85;
		}

		syncAudioState();
	}

	$effect(() => {
		const station = selectedStation;

		if (!station || !audioElement || lastAutoplayStationId === station.id) {
			return;
		}

		lastAutoplayStationId = station.id;

		void tick().then(async () => {
			if (!audioElement || selectedStation?.id !== station.id) {
				return;
			}

			audioElement.pause();
			audioElement.currentTime = 0;
			isBuffering = true;

			try {
				await audioElement.play();
			} catch (error) {
				console.warn('Autoplay failed for selected station', error);
			}
		});
	});

	$effect(() => {
		const element = audioElement;

		if (!element) {
			return;
		}

		element.volume = volume;

		const handlePlay = () => {
			isPlaying = true;
			isBuffering = false;
		};
		const handlePause = () => {
			isPlaying = false;
			isBuffering = false;
		};
		const handleWaiting = () => {
			isBuffering = true;
		};
		const handlePlaying = () => {
			isPlaying = true;
			isBuffering = false;
		};
		const handleTimeUpdate = () => {
			elapsed = element.currentTime;
		};
		const handleVolumeChange = () => {
			isMuted = element.muted;
			volume = element.volume;
		};
		const handleEmptied = () => {
			isPlaying = false;
			isBuffering = false;
			elapsed = 0;
		};

		element.addEventListener('play', handlePlay);
		element.addEventListener('pause', handlePause);
		element.addEventListener('waiting', handleWaiting);
		element.addEventListener('playing', handlePlaying);
		element.addEventListener('timeupdate', handleTimeUpdate);
		element.addEventListener('volumechange', handleVolumeChange);
		element.addEventListener('emptied', handleEmptied);
		element.addEventListener('error', handlePause);
		syncAudioState();

		return () => {
			element.removeEventListener('play', handlePlay);
			element.removeEventListener('pause', handlePause);
			element.removeEventListener('waiting', handleWaiting);
			element.removeEventListener('playing', handlePlaying);
			element.removeEventListener('timeupdate', handleTimeUpdate);
			element.removeEventListener('volumechange', handleVolumeChange);
			element.removeEventListener('emptied', handleEmptied);
			element.removeEventListener('error', handlePause);
		};
	});

	$effect(() => {
		localStorage.setItem('radio-world-favorites', JSON.stringify([...favoriteIds]));
	});
</script>

<div class="page-shell">
	<section class="stage">
		{#if isLoading}
			<div class="loading-card">
				<p>Loading live station coordinates…</p>
			</div>
		{:else if error}
			<div class="loading-card error-card">
				<p>{error}</p>
			</div>
		{:else if globeModule}
			{#await globeModule then module}
				{@const Globe = module.default}
				<Globe
					stations={visibleStations}
					{selectedStation}
					onselect={pickStation}
					{apiResponseTime}
					{dataAge}
					apiError={error}
					{query}
					{country}
					{isOnline}
					{rawApiStats}
				/>
			{:catch}
				<div class="loading-card error-card">
					<p>The 3D globe component could not be loaded.</p>
				</div>
			{/await}
		{/if}

		<div class="hud hud-top">
			<div class="filter-row">
				<input bind:value={query} placeholder="Search station, country, language" />

				<button
					class="ghost-button filter-toggle"
					class:active={hiQualityOnly}
					type="button"
					onclick={() => (hiQualityOnly = !hiQualityOnly)}
					aria-label="Filter high quality stations (192+ kbps)"
					title="192+ kbps"
				>
					<div class="filter-toggle-content"><span> HD</span> <span>♪</span></div>
				</button>

				{#if query || country !== 'all' || hiQualityOnly}
					<button
						class="ghost-button"
						type="button"
						onclick={clearFilters}
						aria-label="Clear filters">×</button
					>
				{/if}
			</div>

			<div class="metric-row">
				<span>{visibleStations.length} visible</span>
				<span>{isLoading ? '...' : (stats?.total ?? 0)} total</span>
				<span>{isLoading ? '...' : (stats?.countries ?? 0)} countries</span>
				<span>{isLoading ? '...' : languageCount} languages</span>
			</div>
		</div>

		<div class="hud hud-fav-panel">
			<button type="button" class="fav-toggle" onclick={() => (favoritesOpen = !favoritesOpen)}>
				{favoritesOpen ? '▾' : '▸'} ♥ {favoriteIds.size}
			</button>
			{#if favoritesOpen}
				<div class="fav-list">
					{#if favoriteStations.length === 0}
						<p class="fav-empty">no favorites yet</p>
					{:else}
						{#each favoriteStations as station (station.id)}
							<button type="button" class="fav-item" onclick={() => pickStation(station)}>
								<span class="fav-name">{station.name}</span>
								{#if station.country}<span class="fav-country">{station.country}</span>{/if}
							</button>
						{/each}
					{/if}
				</div>
			{/if}
		</div>

		<div class="hud hud-bottom">
			{#if spotlight}
				<div class="spotlight-meta">
					<div class="station-title">
						<div>
							<p class="station-name">{spotlight.name}</p>
							<p class="station-subtitle">
								{spotlight.country} • {spotlight.language} • {spotlight.codec}
								{#if spotlight.bitrate}
									• {spotlight.bitrate} kbps
								{/if}
							</p>
						</div>
						<button
							type="button"
							class="fav-button"
							class:is-faved={favoriteIds.has(spotlight.id)}
							onclick={() => toggleFavorite(spotlight.id)}
							aria-label={favoriteIds.has(spotlight.id)
								? 'Remove from favorites'
								: 'Add to favorites'}
						>
							{favoriteIds.has(spotlight.id) ? '♥' : '♡'}
						</button>
						{#if spotlight.favicon && !failedFavicons.has(spotlight.id)}
							<img
								alt=""
								class="station-icon"
								src={spotlight.favicon}
								loading="lazy"
								onerror={() => failedFavicons.add(spotlight.id)}
							/>
						{:else if spotlight.favicon}
							<div class="station-icon-fallback" title={spotlight.name}>▶︎</div>
						{/if}
					</div>

					<p class="coordinates">
						Lat {spotlight.lat.toFixed(2)} / Lon {spotlight.lon.toFixed(2)}
					</p>

					{#if spotlight.tags.length > 0}
						<div class="tag-list">
							{#each spotlight.tags.slice(0, 5) as tag (tag)}
								<span>{tag}</span>
							{/each}
						</div>
					{/if}

					<div class="player-shell">
						<button
							class:playing={isPlaying}
							aria-label={isPlaying ? 'Pause stream' : 'Play stream'}
							class="player-button"
							type="button"
							onclick={togglePlayback}
						>
							{#if isBuffering}
								<span class="spinner"></span>
							{:else if isPlaying}
								<span class="pause-icon"></span>
							{:else}
								<span class="play-icon"></span>
							{/if}
						</button>

						<div class="player-main">
							<div class="player-topline">
								<div class="status-row">
									<span class="live-pill">Live Radio</span>
									<span>{formatTime(elapsed)}</span>
								</div>
								<button
									aria-label={isMuted || volume === 0 ? 'Unmute stream' : 'Mute stream'}
									class="icon-button"
									type="button"
									onclick={toggleMute}
								>
									{#if isMuted || volume === 0}
										<span class="volume-off"></span>
									{:else}
										<span class="volume-on"></span>
									{/if}
								</button>
							</div>

							<div class="progress-rail" aria-hidden="true">
								<div class:buffering={isBuffering} class="progress-fill"></div>
							</div>

							<div class="volume-row">
								<input
									aria-label="Volume"
									bind:value={volume}
									class="volume-slider"
									max="1"
									min="0"
									oninput={(event) =>
										updateVolume(Number((event.currentTarget as HTMLInputElement).value))}
									step="0.01"
									type="range"
								/>
								<span>{Math.round(volume * 100)}%</span>
							</div>
						</div>
					</div>

					<audio
						bind:this={audioElement}
						class="hidden-audio"
						preload="auto"
						src={spotlight.streamUrl}
					></audio>

					<div class="meta-row">
						<span>{refreshedAt || '...'}</span>
						<div class="link-row">
							{#if spotlight.homepage}
								<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
								<a href={spotlight.homepage} target="_blank" rel="noreferrer">Site</a>
							{/if}
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
							<a href={spotlight.streamUrl} target="_blank" rel="noreferrer">Stream</a>
							{#if stats}
								<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
								<a href={stats.source} target="_blank" rel="noreferrer">Source</a>
							{/if}
						</div>
					</div>
				</div>
			{:else}
				<div class="empty-copy">
					<dl class="hint-grid">
						<dt>drag</dt>
						<dd>orbit the globe</dd>
						<dt>scroll</dt>
						<dd>zoom in / out</dd>
						<dt>hover</dt>
						<dd>preview stations at that location</dd>
						<dt>click</dt>
						<dd>select a station and start listening</dd>
						<dt>right-click</dt>
						<dd>pin the cluster list so you can browse it</dd>
						<dt>pin + right-click</dt>
						<dd>switch pinned cluster to another location</dd>
					</dl>
				</div>
			{/if}
		</div>
	</section>
</div>

<style>
	:global(body) {
		margin: 0;
		font-family:
			'Doto', ui-monospace, 'SFMono-Regular', 'SF Mono', Menlo, Monaco, Consolas, 'Liberation Mono',
			monospace;
		overflow: hidden;
		background: #050505;
		color: #ffffff;
	}

	:global(html) {
		height: 100%;
	}

	:global(*) {
		box-sizing: border-box;
	}

	.page-shell {
		--panel-bg: rgba(0, 0, 0, 0.54);
		--text-soft: rgba(255, 255, 255);
		--ink: #ffffff;
		--orange: #f18c34;
		height: 100dvh;
	}

	.stage {
		position: relative;
		height: 100dvh;
	}

	.loading-card {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 2rem;
		color: var(--text-soft);
		z-index: 3;
	}

	.error-card {
		color: #ffd6dd;
	}

	.hud {
		position: absolute;
		left: 1rem;
		right: 1rem;
		z-index: 4;
		pointer-events: none;
	}

	.hud-top {
		top: 0.6rem;
		display: grid;
		gap: 0.35rem;
		max-width: min(18rem, calc(100vw - 2rem));
	}

	.hud-bottom {
		bottom: 1rem;
		max-width: min(32rem, calc(100vw - 2rem));
	}

	.filter-row,
	.spotlight-meta,
	.empty-copy {
		background: var(--panel-bg);
		backdrop-filter: blur(10px);
	}

	.filter-row,
	.spotlight-meta,
	.empty-copy {
		pointer-events: auto;
	}

	.filter-row {
		display: flex;
		gap: 0.3rem;
		padding: 0;
	}

	.metric-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}

	.metric-row span {
		padding: 0.18rem 0.35rem;
		background: rgba(0, 0, 0, 0.4);
		color: rgba(255, 255, 255, 0.85);
		font-size: 0.62rem;
		letter-spacing: 0.02em;
		text-transform: lowercase;
	}

	input:not([type='range']),
	button {
		font: inherit;
	}

	input:not([type='range']) {
		width: 100%;
		border: 0;
		border-radius: 0;
		background: rgba(0, 0, 0, 0.54);
		color: var(--ink);
		padding: 0.3rem 0.6rem;
		font-size: 0.72rem;
		text-transform: lowercase;
	}

	.ghost-button {
		border: 0;
		border-radius: 0;
		background: rgba(0, 0, 0, 0.54);
		color: var(--orange);
		font-size: 1rem;
		line-height: 1;
		cursor: pointer;
	}

	.filter-toggle {
		color: rgba(242, 230, 210, 0.5);
		transition: all 0.1s;
	}

	.filter-toggle.active {
		background: rgba(241, 140, 52, 0.15);
		color: var(--orange);
	}

	.spotlight-meta {
		padding: 0.95rem 1rem;
	}

	.station-title {
		display: flex;
		gap: 0.9rem;
		justify-content: space-between;
		align-items: center;
	}

	.station-name {
		margin: 0;
		font-size: 1rem;
		line-height: 1.2;
		letter-spacing: 0;
		font-weight: 500;
		text-transform: lowercase;
	}

	.station-subtitle,
	.coordinates {
		margin: 0.35rem 0 0;
		line-height: 1.5;
		color: var(--text-soft);
		font-size: 0.78rem;
	}

	.station-icon {
		width: 2.2rem;
		height: 2.2rem;
		border-radius: 0;
		object-fit: cover;
		background: rgba(255, 255, 255, 0.1);
		filter: grayscale(1) contrast(1.05);
	}

	.station-icon-fallback {
		width: 2.2rem;
		height: 2.2rem;
		border-radius: 0;
		background: linear-gradient(135deg, rgba(241, 140, 52, 0.2), rgba(241, 140, 52, 0.1));
		border: 1px solid rgba(241, 140, 52, 0.3);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		color: rgba(241, 140, 52, 0.8);
		font-size: 0.9rem;
		line-height: 1;
	}

	.tag-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 1rem 0;
	}

	.tag-list span {
		padding: 0;
		background: transparent;
		color: var(--orange);
		font-size: 0.72rem;
		text-transform: lowercase;
	}

	.player-shell {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.85rem;
		align-items: center;
		margin: 0.95rem 0 0.4rem;
		padding: 0.5rem 0;
		background: transparent;
	}

	.player-button,
	.icon-button {
		border: 0;
		background: none;
		color: var(--ink);
		cursor: pointer;
	}

	.player-button {
		position: relative;
		display: grid;
		place-items: center;
		width: 2.4rem;
		height: 2.4rem;
		border-radius: 0;
		background: rgba(0, 0, 0, 0.54);
	}

	.player-button.playing {
		background: rgba(0, 0, 0, 0.54);
	}

	.play-icon {
		width: 0;
		height: 0;
		margin-left: 0.2rem;
		border-top: 0.52rem solid transparent;
		border-bottom: 0.52rem solid transparent;
		border-left: 0.85rem solid currentColor;
	}

	.pause-icon {
		position: relative;
		width: 0.9rem;
		height: 0.9rem;
	}

	.pause-icon::before,
	.pause-icon::after {
		content: '';
		position: absolute;
		top: 0;
		width: 0.24rem;
		height: 100%;
		border-radius: 999px;
		background: currentColor;
	}

	.pause-icon::before {
		left: 0.12rem;
	}

	.pause-icon::after {
		right: 0.12rem;
	}

	.spinner {
		width: 1rem;
		height: 1rem;
		border: 2px solid rgba(255, 255, 255, 0.22);
		border-top-color: currentColor;
		border-radius: 999px;
		animation: spin 0.8s linear infinite;
	}

	.player-main {
		display: grid;
		gap: 0.45rem;
		min-width: 0;
	}

	.player-topline,
	.status-row,
	.volume-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.status-row,
	.volume-row {
		color: var(--text-soft);
		font-size: 0.72rem;
	}

	.live-pill {
		padding: 0;
		background: transparent;
		color: var(--orange);
		text-transform: lowercase;
		letter-spacing: 0;
		font-size: 0.68rem;
	}

	.icon-button {
		position: relative;
		width: 1.8rem;
		height: 1.8rem;
		border-radius: 0;
		background: transparent;
	}

	.volume-on,
	.volume-off {
		position: relative;
		display: inline-block;
		width: 1rem;
		height: 1rem;
	}

	.volume-on::before,
	.volume-off::before {
		content: '';
		position: absolute;
		left: 0;
		top: 0.28rem;
		width: 0.36rem;
		height: 0.44rem;
		border-radius: 0.08rem;
		background: currentColor;
	}
	.filter-toggle-content {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		font-size: 0.82rem;
	}

	.volume-on::after,
	.volume-off::after {
		content: '';
		position: absolute;
		left: 0.28rem;
		top: 0.14rem;
		width: 0.42rem;
		height: 0.42rem;
		border: 0.14rem solid currentColor;
		border-left-color: transparent;
		border-bottom-color: transparent;
		transform: rotate(45deg);
		border-radius: 0.08rem;
	}

	.volume-off::after {
		border: 0;
		width: 0.64rem;
		height: 0.12rem;
		top: 0.46rem;
		left: 0.28rem;
		background: currentColor;
		transform: rotate(-45deg);
		border-radius: 999px;
	}

	.progress-rail {
		position: relative;
		height: 1px;
		border-radius: 0;
		background: rgba(242, 230, 210, 0.22);
		overflow: hidden;
	}

	.progress-fill {
		position: absolute;
		inset: 0;
		width: 38%;
		border-radius: 0;
		background: var(--orange);
	}

	.progress-fill.buffering {
		animation: drift 1.2s ease-in-out infinite;
	}

	.volume-slider {
		flex: 1;
		height: 0.3rem;
		padding: 0;
		border: 0;
		background: transparent;
		appearance: none;
		accent-color: #f18c34;
	}

	.volume-slider::-webkit-slider-runnable-track {
		height: 1px;
		border-radius: 0;
		background: rgba(242, 230, 210, 0.22);
	}

	.volume-slider::-webkit-slider-thumb {
		appearance: none;
		width: 0.5rem;
		height: 0.5rem;
		margin-top: -0.22rem;
		border: 0;
		border-radius: 0;
		background: var(--orange);
		box-shadow: none;
	}

	.volume-slider::-moz-range-track {
		height: 1px;
		border: 0;
		border-radius: 0;
		background: rgba(242, 230, 210, 0.22);
	}

	.volume-slider::-moz-range-thumb {
		width: 0.5rem;
		height: 0.5rem;
		border: 0;
		border-radius: 0;
		background: var(--orange);
		box-shadow: none;
	}

	.hidden-audio {
		display: none;
	}

	.meta-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		margin-top: 0.75rem;
		color: var(--text-soft);
		font-size: 0.72rem;
	}

	.link-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}

	.link-row a {
		color: var(--orange);
		text-decoration: none;
	}

	.empty-copy {
		margin: 0;
		padding: 0.75rem 1rem;
	}

	.hint-grid {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.22rem 0.9rem;
		margin: 0;
	}

	.hint-grid dt {
		color: var(--orange);
		font-size: 0.66rem;
		text-transform: lowercase;
		white-space: nowrap;
		padding-top: 0.05em;
	}

	.hint-grid dd {
		margin: 0;
		color: var(--text-soft);
		font-size: 0.66rem;
		text-transform: lowercase;
		line-height: 1.4;
	}

	@media (max-width: 42rem) {
		.hud {
			left: 0.75rem;
			right: 0.75rem;
		}

		.hud-top {
			top: 0.75rem;
		}

		.hud-bottom {
			bottom: 0.75rem;
		}

		.filter-row {
			grid-template-columns: 1fr;
		}

		.meta-row {
			flex-direction: column;
			align-items: flex-start;
		}

		.player-shell {
			grid-template-columns: 1fr;
		}

		.player-button {
			width: 2.7rem;
			height: 2.7rem;
		}
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@keyframes drift {
		0% {
			transform: translateX(-50%);
		}
		50% {
			transform: translateX(120%);
		}
		100% {
			transform: translateX(-50%);
		}
	}

	.hud-fav-panel {
		top: 0.6rem;
		right: 1rem;
		left: auto;
		max-width: 16rem;
		pointer-events: auto;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.3rem;
	}

	.fav-toggle {
		border: 0;
		border-radius: 0;
		padding: 0.3rem 0.5rem;
		background: rgba(0, 0, 0, 0.54);
		color: var(--text-soft);
		font-size: 0.85rem;
		line-height: 1;
		cursor: pointer;
		font-weight: 500;
	}

	.fav-toggle:hover {
		color: var(--orange);
	}

	.fav-list {
		background: var(--panel-bg);
		backdrop-filter: blur(10px);
		margin-top: 0.3rem;
		max-height: 60vh;
		overflow-y: auto;
		border-radius: 0;
	}

	.fav-empty {
		margin: 0;
		padding: 0.75rem 1rem;
		color: var(--text-soft);
		font-size: 0.72rem;
		text-align: center;
		text-transform: lowercase;
	}

	.fav-item {
		width: 100%;
		border: 0;
		background: transparent;
		color: var(--ink);
		padding: 0.6rem 1rem;
		font-size: 0.78rem;
		text-align: left;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		font-family: inherit;
	}

	.fav-item:hover {
		background: rgba(241, 140, 52, 0.1);
	}

	.fav-name {
		text-transform: lowercase;
		font-weight: 500;
	}

	.fav-country {
		color: var(--text-soft);
		font-size: 0.66rem;
		text-transform: lowercase;
	}

	.fav-button {
		border: 0;
		background: none;
		color: var(--text-soft);
		font-size: 1.2rem;
		line-height: 1;
		cursor: pointer;
		padding: 0.2rem;
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 1.6rem;
		min-height: 1.6rem;
	}

	.fav-button:hover {
		color: var(--orange);
	}

	.fav-button.is-faved {
		color: var(--orange);
	}
</style>
