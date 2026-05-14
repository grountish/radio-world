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
	let selectedStation = $state<RadioStation | null>(null);
	let hoveredStation = $state<RadioStation | null>(null);
	let audioElement = $state<HTMLAudioElement | null>(null);
	let isPlaying = $state(false);
	let isBuffering = $state(false);
	let isMuted = $state(false);
	let volume = $state(0.85);
	let elapsed = $state(0);
	let lastAutoplayStationId = '';

	onMount(async () => {
		globeModule = import('$lib/components/RadioGlobe.svelte');

		try {
			const response = await fetch('/api/stations');
			if (!response.ok) {
				throw new Error('The live radio directory could not be reached.');
			}

			const payload = (await response.json()) as RadioStationPayload;
			stations = payload.stations;
			stats = payload.stats;
		} catch (cause) {
			error =
				cause instanceof Error ? cause.message : 'The live radio directory could not be reached.';
		} finally {
			isLoading = false;
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

	function pickStation(station: RadioStation | null) {
		selectedStation = station;
	}

	function previewStation(station: RadioStation | null) {
		hoveredStation = station;
	}

	function clearFilters() {
		query = '';
		country = 'all';
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
					onhover={previewStation}
				/>
			{:catch}
				<div class="loading-card error-card">
					<p>The 3D globe component could not be loaded.</p>
				</div>
			{/await}
		{/if}

		{#if hoveredStation}
			<div class="hover-pill">
				<span class="hover-label">hovering</span>
				<p>{hoveredStation.name}</p>
			</div>
		{/if}

		<div class="hud hud-top">
			<div class="filter-row">
				<input bind:value={query} placeholder="Search station, country, language" />
				<select bind:value={country}>
					<option value="all">All countries</option>
					{#each countryOptions as option (option)}
						<option value={option}>{option}</option>
					{/each}
				</select>
				{#if query || country !== 'all'}
					<button class="ghost-button" type="button" onclick={clearFilters}>Reset</button>
				{/if}
			</div>

			<div class="metric-row">
				<span>{visibleStations.length} visible</span>
				<span>{isLoading ? '...' : (stats?.total ?? 0)} total</span>
				<span>{isLoading ? '...' : (stats?.countries ?? 0)} countries</span>
				<span>{isLoading ? '...' : languageCount} languages</span>
			</div>
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
						{#if spotlight.favicon}
							<img alt="" class="station-icon" src={spotlight.favicon} loading="lazy" />
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
				<p class="empty-copy">
					Hover a marker to preview its name. Click a marker to inspect a station.
				</p>
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
		--panel-bg: rgba(0, 0, 0, 0.72);
		--text-soft: rgba(255, 255, 255, 0.62);
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

	.hover-pill {
		position: absolute;
		right: 1rem;
		bottom: 1rem;
		z-index: 4;
		display: grid;
		gap: 0.15rem;
		min-width: min(18rem, calc(100vw - 2rem));
		max-width: min(24rem, calc(100vw - 2rem));
		padding: 0.7rem 0.9rem 0.75rem;
		background: rgba(0, 0, 0, 0.78);
		backdrop-filter: blur(10px);
		color: var(--ink);
		pointer-events: none;
	}

	.hover-pill p {
		margin: 0;
		font-size: 0.94rem;
		line-height: 1.3;
		text-transform: lowercase;
	}

	.hover-label {
		color: var(--orange);
		font-size: 0.64rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.hud {
		position: absolute;
		left: 1rem;
		right: 1rem;
		z-index: 4;
		pointer-events: none;
	}

	.hud-top {
		top: 1rem;
		display: grid;
		gap: 0.75rem;
		max-width: min(46rem, calc(100vw - 2rem));
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
		display: grid;
		grid-template-columns: minmax(0, 1.2fr) minmax(10rem, 0.8fr) auto;
		gap: 0.6rem;
		padding: 0.55rem;
	}

	.metric-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.metric-row span {
		padding: 0.25rem 0.45rem;
		background: rgba(0, 0, 0, 0.58);
		color: var(--text-soft);
		font-size: 0.72rem;
		letter-spacing: 0.02em;
		text-transform: lowercase;
	}

	input:not([type='range']),
	select,
	button {
		font: inherit;
	}

	input:not([type='range']),
	select {
		width: 100%;
		border: 0;
		border-radius: 0;
		background: rgba(0, 0, 0, 0.72);
		color: var(--ink);
		padding: 0.75rem 0.8rem;
		text-transform: lowercase;
	}

	.ghost-button {
		border: 0;
		border-radius: 0;
		padding: 0.62rem 0.82rem;
		background: rgba(0, 0, 0, 0.72);
		color: var(--orange);
		cursor: pointer;
		text-transform: lowercase;
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
		background: rgba(0, 0, 0, 0.72);
	}

	.player-button.playing {
		background: rgba(0, 0, 0, 0.72);
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
		padding: 0.85rem 1rem;
		line-height: 1.6;
		color: var(--text-soft);
		font-size: 0.78rem;
	}

	@media (max-width: 42rem) {
		.hover-pill {
			right: 0.75rem;
			bottom: 0.75rem;
			min-width: 0;
			width: min(20rem, calc(100vw - 1.5rem));
		}

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
</style>
