<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import RadioGlobe from '$lib/components/RadioGlobe.svelte';
	import ScrambleText from '$lib/components/ScrambleText.svelte';
	import { APP_THEMES, DEFAULT_THEME_ID } from '$lib/config/app-theme';
	import { VERSION_HISTORY } from '$lib/config/app-version';
	import type { RadioStation, RadioStationPayload } from '$lib/types/radio';
	import { buildRadioUrl, parseRadioUrlState } from '$lib/utils/radio-url';
	import { preferSecureUrl } from '$lib/utils/url-security';

	type HlsClass = typeof import('hls.js').default;
	type HlsInstance = import('hls.js').default;

	let stations = $state<RadioStation[]>([]);
	let stats = $state<RadioStationPayload['stats'] | null>(null);
	let isLoading = $state(true);
	let error = $state('');
	let shouldMountGlobe = $state(false);
	let globeReady = $state(false);
	let globeFailed = $state(false);
	let loadingScrambleCycle = $state(0);
	let query = $state('');
	let searchExpanded = $state(false);
	let country = $state('all');
	let hiQualityOnly = $state(false);
	let selectedStation = $state<RadioStation | null>(null);
	let queryInput: HTMLInputElement | null = null;
	let audioElement = $state<HTMLAudioElement | null>(null);
	let playerExpanded = $state(false);
	let isPlaying = $state(false);
	let isBuffering = $state(false);
	let playbackStatus = $state<'idle' | 'buffering' | 'ready' | 'error'>('idle');
	let isMuted = $state(false);
	let volume = $state(0.85);
	let elapsed = $state(0);
	let loadedStationId = '';
	let loadedStreamUrl = '';
	let hlsPlayer: HlsInstance | null = null;
	let hlsClass: HlsClass | null = null;
	let sourcePreparationKey = '';
	let sourcePreparationPromise: Promise<boolean> | null = null;
	let favoriteIds = $state<Set<string>>(new Set());
	let favoritesOpen = $state(false);
	let debugOpen = $state(false);
	let versionLogOpen = $state(false);
	let themePanelOpen = $state(false);
	let apiResponseTime = $state(0);
	let isOnline = $state(true);
	let rawApiStats = $state<any>(null);
	let failedFavicons = $state<Set<string>>(new Set());
	let favoriteFocusRequestId = $state(0);
	let isCompactViewport = $state(false);
	let instructionsOpen = $state(true);
	let urlStateReady = $state(false);
	let pendingUrlStationId = $state('');
	let urlStateRevision = $state(0);
	let urlSyncLocked = $state(true);
	let selectedThemeId = $state(DEFAULT_THEME_ID);
	let currentTrackArtist = $state('');
	let currentTrackTitle = $state('');
	let meltActive = $state(false);
	const initialLoadingAnimationMs = 650;
	const loadingScrambleLoopMs = 1300;
	const hasActiveFilters = $derived(query.trim().length > 0 || country !== 'all' || hiQualityOnly);
	const focusKey = $derived(
		`${query.trim().toLowerCase()}|${country}|${hiQualityOnly ? '1' : '0'}`
	);
	const showLoadingOverlay = $derived(!error && (isLoading || (!globeReady && !globeFailed)));
	const selectedTheme = $derived(
		APP_THEMES.find((theme) => theme.id === selectedThemeId) ?? APP_THEMES[0]
	);
	const themeCssVars = $derived(
		`--accent: ${selectedTheme.accent}; --accent-rgb: ${selectedTheme.accentRgb};`
	);
	const isSearchExpanded = $derived(searchExpanded || query.trim().length > 0);
	const spotlightStreamUrl = $derived.by(() => {
		if (!spotlight) {
			return '';
		}

		return preferSecureUrl(spotlight.streamUrl);
	});

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

	function focusStation(station: RadioStation | null) {
		if (!station) {
			return;
		}

		favoriteFocusRequestId += 1;
	}

	function setSelectedStation(station: RadioStation | null, options?: { focus?: boolean }) {
		const nextId = station?.id ?? '';
		const previousId = untrack(() => selectedStation?.id ?? '');
		selectedStation = station;

		if (options?.focus && nextId && nextId !== previousId) {
			focusStation(station);
		}
	}

	function applyUrlState() {
		if (typeof window === 'undefined') {
			return;
		}

		const urlState = parseRadioUrlState(new URL(window.location.href));
		urlSyncLocked = true;
		query = urlState.query;
		country = urlState.country;
		hiQualityOnly = urlState.hiQualityOnly;
		pendingUrlStationId = urlState.stationId;
		urlStateRevision += 1;
	}

	function syncUrlState() {
		if (!urlStateReady || typeof window === 'undefined') {
			return;
		}

		const nextUrl = buildRadioUrl(new URL(window.location.href), {
			query,
			country,
			hiQualityOnly,
			stationId: selectedStation?.id ?? ''
		});
		const nextPath = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
		const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;

		if (nextPath !== currentPath) {
			window.history.replaceState(window.history.state, '', nextPath);
		}
	}

	onMount(async () => {
		let firstFrameId = 0;
		let secondFrameId = 0;
		let globeMountTimeoutId = 0;
		let meltSequence = '';
		const updateViewportState = () => {
			const compact = window.innerWidth < 672;
			if (compact !== isCompactViewport) {
				isCompactViewport = compact;
				instructionsOpen = compact ? false : true;
				playerExpanded = compact ? false : true;
			}
		};
		const handlePopState = () => {
			applyUrlState();
		};
		const handleKeyDown = (e: KeyboardEvent) => {
			meltSequence += e.key.toLowerCase();
			if (meltSequence.includes('melt')) {
				toggleMelt();
				meltSequence = '';
			}
			if (meltSequence.length > 4) {
				meltSequence = meltSequence.slice(-4);
			}
		};

		updateViewportState();
		applyUrlState();
		searchExpanded = query.trim().length > 0;
		firstFrameId = requestAnimationFrame(() => {
			secondFrameId = requestAnimationFrame(() => {
				globeMountTimeoutId = window.setTimeout(() => {
					shouldMountGlobe = true;
				}, initialLoadingAnimationMs);
			});
		});

		const saved = localStorage.getItem('radio-world-favorites');
		if (saved) {
			try {
				favoriteIds = new Set(JSON.parse(saved) as string[]);
			} catch {
				// ignore malformed storage
			}
		}

		const savedThemeId = localStorage.getItem('radio-world-theme');
		if (savedThemeId && APP_THEMES.some((theme) => theme.id === savedThemeId)) {
			selectedThemeId = savedThemeId;
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
			window.addEventListener('resize', updateViewportState);
			window.addEventListener('popstate', handlePopState);
			window.addEventListener('keydown', handleKeyDown);
		}

		urlStateReady = true;

		return () => {
			cancelAnimationFrame(firstFrameId);
			cancelAnimationFrame(secondFrameId);
			window.clearTimeout(globeMountTimeoutId);
			destroyHlsPlayer();
			if (typeof window !== 'undefined') {
				window.removeEventListener('resize', updateViewportState);
				window.removeEventListener('popstate', handlePopState);
				window.removeEventListener('keydown', handleKeyDown);
			}
		};
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
	const spotlightSubtitle = $derived.by(() => {
		if (!selectedStation) {
			return '';
		}

		return `${selectedStation.country} • ${selectedStation.language} • ${selectedStation.codec}${selectedStation.bitrate ? ` • ${selectedStation.bitrate} kbps` : ''}`;
	});

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
	const playingStation = $derived(isPlaying ? selectedStation : null);

	function pickStation(station: RadioStation | null) {
		setSelectedStation(station, { focus: true });
		if (station) {
			void playStation(station, 'Station selection playback failed');
		}
	}

	function pickFavoriteStation(station: RadioStation) {
		setSelectedStation(station, { focus: true });
		void playStation(station, 'Favorite station playback failed');
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

	function toggleFavoritesPanel() {
		favoritesOpen = !favoritesOpen;
		if (favoritesOpen) {
			debugOpen = false;
			versionLogOpen = false;
			themePanelOpen = false;
		}
	}

	function toggleDebugPanel() {
		debugOpen = !debugOpen;
		if (debugOpen) {
			favoritesOpen = false;
			versionLogOpen = false;
			themePanelOpen = false;
		}
	}

	function toggleVersionLogPanel() {
		versionLogOpen = !versionLogOpen;
		if (versionLogOpen) {
			favoritesOpen = false;
			debugOpen = false;
			themePanelOpen = false;
		}
	}

	function toggleThemePanel() {
		themePanelOpen = !themePanelOpen;
		if (themePanelOpen) {
			favoritesOpen = false;
			debugOpen = false;
			versionLogOpen = false;
		}
	}

	function selectTheme(themeId: string) {
		selectedThemeId = themeId;
		themePanelOpen = false;
	}

	function clearFilters() {
		query = '';
		country = 'all';
		hiQualityOnly = false;
		searchExpanded = false;
	}

	function expandSearch() {
		searchExpanded = true;
		requestAnimationFrame(() => {
			queryInput?.focus();
			queryInput?.select();
		});
	}

	function handleSearchBlur() {
		if (query.trim().length === 0) {
			searchExpanded = false;
		}
	}

	function handleMobileContextMenu(event: MouseEvent) {
		if (typeof window !== 'undefined' && window.innerWidth < 672) {
			event.preventDefault();
		}
	}

	function toggleMelt() {
		meltActive = !meltActive;
	}

	function getStationInitials(name: string): string {
		return name
			.split(' ')
			.slice(0, 2)
			.map((word) => word[0])
			.join('')
			.toUpperCase();
	}

	function getStationBg(stationId: string): string {
		const hues = [
			0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 225, 240, 255, 270, 285,
			300, 315, 330, 345
		];
		let hash = 0;
		for (let i = 0; i < stationId.length; i++) {
			hash = (hash << 5) - hash + stationId.charCodeAt(i);
			hash |= 0;
		}
		const hue = hues[Math.abs(hash) % hues.length];
		return `hsl(${hue}, 65%, 55%)`;
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

	function setPlaybackStatus(nextStatus: 'idle' | 'buffering' | 'ready' | 'error') {
		playbackStatus = nextStatus;
		isBuffering = nextStatus === 'buffering';
	}

	function isHlsStreamUrl(streamUrl: string) {
		return /\.m3u8($|[?#])/i.test(streamUrl);
	}

	function getPlayableStreamUrl(streamUrl: string) {
		return preferSecureUrl(streamUrl);
	}

	function destroyHlsPlayer() {
		if (!hlsPlayer) {
			return;
		}

		hlsPlayer.destroy();
		hlsPlayer = null;
	}

	async function getHlsClass() {
		if (hlsClass) {
			return hlsClass;
		}

		const module = await import('hls.js');
		hlsClass = module.default;
		return hlsClass;
	}

	async function attachHlsStream(streamUrl: string) {
		if (!audioElement) {
			return;
		}

		const media = audioElement;
		const Hls = await getHlsClass();
		if (Hls.isSupported()) {
			await new Promise<void>((resolve, reject) => {
				const player = new Hls();
				hlsPlayer = player;
				let settled = false;

				const cleanup = () => {
					player.off(Hls.Events.MEDIA_ATTACHED, handleMediaAttached);
					player.off(Hls.Events.MANIFEST_PARSED, handleManifestParsed);
					player.off(Hls.Events.ERROR, handleError);
					media.removeEventListener('canplay', handleCanPlay);
					media.removeEventListener('loadedmetadata', handleCanPlay);
				};

				const finish = (callback: () => void) => {
					if (settled) {
						return;
					}

					settled = true;
					cleanup();
					callback();
				};

				const handleMediaAttached = () => {
					player.loadSource(streamUrl);
				};

				const handleManifestParsed = () => {
					if (media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
						finish(resolve);
					}
				};

				const handleCanPlay = () => {
					finish(resolve);
				};

				const handleError = (
					_event: string,
					data: { fatal: boolean; details?: string; type?: string }
				) => {
					if (!data.fatal) {
						return;
					}

					finish(() =>
						reject(new Error(data.details || data.type || 'Unable to load HLS stream.'))
					);
				};

				player.on(Hls.Events.MEDIA_ATTACHED, handleMediaAttached);
				player.on(Hls.Events.MANIFEST_PARSED, handleManifestParsed);
				player.on(Hls.Events.ERROR, handleError);
				media.addEventListener('canplay', handleCanPlay);
				media.addEventListener('loadedmetadata', handleCanPlay);
				player.attachMedia(media);
			});
			return;
		}

		if (media.canPlayType('application/vnd.apple.mpegurl')) {
			media.src = streamUrl;
			media.load();
			return;
		}

		throw new Error('HLS playback is not supported in this browser.');
	}

	async function prepareSelectedStationAudio(station: RadioStation | null) {
		if (!audioElement) {
			return false;
		}

		const preparationKey = station ? `${station.id}|${station.streamUrl}` : '__none__';
		if (sourcePreparationPromise && sourcePreparationKey === preparationKey) {
			return sourcePreparationPromise;
		}

		sourcePreparationKey = preparationKey;
		sourcePreparationPromise = (async () => {
			if (!station) {
				audioElement.pause();
				destroyHlsPlayer();
				if (loadedStationId || audioElement.getAttribute('src')) {
					audioElement.removeAttribute('src');
					audioElement.load();
				}
				loadedStationId = '';
				loadedStreamUrl = '';
				elapsed = 0;
				isPlaying = false;
				setPlaybackStatus('idle');
				return false;
			}

			const nextStreamUrl = getPlayableStreamUrl(station.streamUrl);
			if (loadedStationId === station.id && loadedStreamUrl === nextStreamUrl) {
				return true;
			}

			audioElement.pause();
			destroyHlsPlayer();
			audioElement.removeAttribute('src');

			if (isHlsStreamUrl(nextStreamUrl)) {
				await attachHlsStream(nextStreamUrl);
			} else {
				audioElement.src = nextStreamUrl;
				audioElement.load();
			}

			audioElement.currentTime = 0;
			loadedStationId = station.id;
			loadedStreamUrl = nextStreamUrl;
			elapsed = 0;
			isPlaying = false;
			return true;
		})();

		try {
			return await sourcePreparationPromise;
		} finally {
			if (sourcePreparationKey === preparationKey) {
				sourcePreparationPromise = null;
			}
		}
	}

	async function playStation(station: RadioStation, failureLabel: string) {
		if (!audioElement) {
			return;
		}

		try {
			await prepareSelectedStationAudio(station);
			setPlaybackStatus('buffering');
			await audioElement.play();
		} catch (error) {
			setPlaybackStatus('error');
			console.warn(failureLabel, error);
		}
	}

	async function togglePlayback() {
		if (!audioElement || !selectedStation) {
			return;
		}

		if (audioElement.paused) {
			await playStation(selectedStation, 'Manual playback failed');
			return;
		}

		audioElement.pause();
		setPlaybackStatus('ready');
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

	function handleGlobeReady() {
		globeFailed = false;
		globeReady = true;
	}

	function handleGlobeInitError() {
		globeFailed = true;
	}

	$effect(() => {
		selectedStation;
		audioElement;

		void prepareSelectedStationAudio(selectedStation);
	});

	$effect(() => {
		const element = audioElement;

		if (!element) {
			return;
		}

		element.volume = volume;

		const handlePlay = () => {
			isPlaying = true;
			setPlaybackStatus('ready');
		};
		const handlePause = () => {
			isPlaying = false;
			setPlaybackStatus(selectedStation ? 'ready' : 'idle');
		};
		const handleWaiting = () => {
			setPlaybackStatus('buffering');
		};
		const handlePlaying = () => {
			isPlaying = true;
			setPlaybackStatus('ready');
		};
		const handleCanPlay = () => {
			if (!isPlaying) {
				setPlaybackStatus('ready');
			}
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
			setPlaybackStatus(selectedStation ? 'buffering' : 'idle');
			elapsed = 0;
		};
		const handleError = () => {
			isPlaying = false;
			setPlaybackStatus('error');
		};

		element.addEventListener('play', handlePlay);
		element.addEventListener('pause', handlePause);
		element.addEventListener('waiting', handleWaiting);
		element.addEventListener('playing', handlePlaying);
		element.addEventListener('canplay', handleCanPlay);
		element.addEventListener('timeupdate', handleTimeUpdate);
		element.addEventListener('volumechange', handleVolumeChange);
		element.addEventListener('emptied', handleEmptied);
		element.addEventListener('error', handleError);
		syncAudioState();

		return () => {
			element.removeEventListener('play', handlePlay);
			element.removeEventListener('pause', handlePause);
			element.removeEventListener('waiting', handleWaiting);
			element.removeEventListener('playing', handlePlaying);
			element.removeEventListener('canplay', handleCanPlay);
			element.removeEventListener('timeupdate', handleTimeUpdate);
			element.removeEventListener('volumechange', handleVolumeChange);
			element.removeEventListener('emptied', handleEmptied);
			element.removeEventListener('error', handleError);
		};
	});

	$effect(() => {
		localStorage.setItem('radio-world-favorites', JSON.stringify([...favoriteIds]));
	});

	$effect(() => {
		urlStateRevision;

		if (!urlStateReady) {
			return;
		}

		if (!pendingUrlStationId) {
			setSelectedStation(null);
			urlSyncLocked = false;
		}
	});

	$effect(() => {
		stations;
		isLoading;
		pendingUrlStationId;

		if (!urlStateReady || !pendingUrlStationId) {
			return;
		}

		const station = stations.find((candidate) => candidate.id === pendingUrlStationId) ?? null;
		if (station) {
			setSelectedStation(station, { focus: true });
			urlSyncLocked = false;
			return;
		}

		if (!isLoading) {
			urlSyncLocked = false;
		}
	});

	$effect(() => {
		query;
		country;
		hiQualityOnly;
		selectedStation?.id;
		urlSyncLocked;

		if (urlSyncLocked) {
			return;
		}

		syncUrlState();
	});

	$effect(() => {
		if (!showLoadingOverlay || typeof window === 'undefined') {
			return;
		}

		const intervalId = window.setInterval(() => {
			loadingScrambleCycle += 1;
		}, loadingScrambleLoopMs);

		return () => {
			window.clearInterval(intervalId);
		};
	});

	$effect(() => {
		if (typeof window === 'undefined') {
			return;
		}

		localStorage.setItem('radio-world-theme', selectedThemeId);
	});

	$effect(() => {
		if (hasActiveFilters) {
			favoritesOpen = false;
			debugOpen = false;
			versionLogOpen = false;
			themePanelOpen = false;
		}
	});

	$effect(() => {
		if (!audioElement) {
			return;
		}

		const element = audioElement;

		const extractMetadata = () => {
			const metadata = (element as any)?.metadata;
			if (metadata) {
				currentTrackTitle = metadata.title || '';
				currentTrackArtist = metadata.artist || '';
				return;
			}

			// Try to extract from text tracks
			for (let i = 0; i < element.textTracks.length; i++) {
				const track = element.textTracks[i];
				if (track.kind === 'metadata' && track.cues) {
					for (let j = 0; j < track.cues.length; j++) {
						const cue = track.cues[j];
						const data = (cue as any)?.data;
						if (data) {
							currentTrackTitle = data.title || '';
							currentTrackArtist = data.artist || '';
							return;
						}
					}
				}
			}
		};

		const handleLoadStart = () => {
			currentTrackTitle = '';
			currentTrackArtist = '';
		};

		const handleTimeUpdate = () => {
			extractMetadata();
		};

		element.addEventListener('loadstart', handleLoadStart);
		element.addEventListener('loadedmetadata', extractMetadata);
		element.addEventListener('timeupdate', handleTimeUpdate);

		return () => {
			element.removeEventListener('loadstart', handleLoadStart);
			element.removeEventListener('loadedmetadata', extractMetadata);
			element.removeEventListener('timeupdate', handleTimeUpdate);
		};
	});
</script>

<div class="page-shell" style={themeCssVars} oncontextmenu={handleMobileContextMenu}>
	<section class="stage">
		{#if shouldMountGlobe && !error}
			<RadioGlobe
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
				shouldAutoFocus={hasActiveFilters}
				{focusKey}
				favoriteFocusStation={selectedStation}
				{favoriteFocusRequestId}
				{playingStation}
				{debugOpen}
				themeAccent={selectedTheme.accent}
				{meltActive}
				onready={handleGlobeReady}
				oniniterror={handleGlobeInitError}
			/>
		{/if}

		{#if error}
			<div class="loading-card error-card">
				<p>{error}</p>
			</div>
		{:else if showLoadingOverlay}
			<div class="loading-card">
				{#key loadingScrambleCycle}
					<p class="loading-copy">
						<ScrambleText
							text="Loading live station coordinates…"
							animateInitial={true}
							speed="slow"
						/>
					</p>
				{/key}
			</div>
		{/if}

		<div class="hud hud-top">
			<div class="filter-row">
				<div class="search-control" class:expanded={isSearchExpanded}>
					<button
						class="ghost-button search-toggle"
						class:active={isSearchExpanded}
						type="button"
						onclick={expandSearch}
						aria-label="Expand search input"
						title="Search"
					>
						<span aria-hidden="true">⌕</span>
					</button>

					<div class="search-input-shell">
						<input
							bind:this={queryInput}
							bind:value={query}
							class="search-input"
							placeholder="Search station, country, language"
							onblur={handleSearchBlur}
						/>
					</div>
				</div>

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
			<div class="panel-toggle-row">
				<button
					type="button"
					class="fav-toggle"
					class:active={favoritesOpen}
					onclick={toggleFavoritesPanel}
				>
					♥ {favoriteIds.size}
				</button>
				<button
					type="button"
					class="fav-toggle icon-toggle-button debug-toggle-button"
					class:active={debugOpen}
					onclick={toggleDebugPanel}
					aria-label={debugOpen ? 'Collapse stats panel' : 'Expand stats panel'}
					title="Stats"
				>
					<span aria-hidden="true">▥</span>
				</button>
				<button
					type="button"
					class="fav-toggle icon-toggle-button version-log-toggle-button"
					class:active={versionLogOpen}
					onclick={toggleVersionLogPanel}
					aria-label={versionLogOpen ? 'Collapse version log panel' : 'Expand version log panel'}
					title="Version Log"
				>
					<span aria-hidden="true">◷</span>
				</button>
				<button
					type="button"
					class="fav-toggle icon-toggle-button theme-toggle-button"
					class:active={themePanelOpen}
					onclick={toggleThemePanel}
					aria-label={themePanelOpen ? 'Collapse theme panel' : 'Expand theme panel'}
					title="Theme"
				>
					<span
						class="theme-toggle-swatch"
						aria-hidden="true"
						style={`--theme-swatch: ${selectedTheme.accent};`}
					></span>
				</button>
			</div>
			{#if favoritesOpen}
				<div class="fav-list">
					{#if favoriteStations.length === 0}
						<p class="fav-empty">no favorites yet</p>
					{:else}
						{#each favoriteStations as station (station.id)}
							<button type="button" class="fav-item" onclick={() => pickFavoriteStation(station)}>
								<span class="fav-name">{station.name}</span>
								{#if station.country}<span class="fav-country">{station.country}</span>{/if}
							</button>
						{/each}
					{/if}
				</div>
			{/if}
			{#if themePanelOpen}
				<div class="theme-panel">
					{#each APP_THEMES as theme (theme.id)}
						<button
							type="button"
							class="theme-swatch-button"
							class:active={selectedThemeId === theme.id}
							onclick={() => selectTheme(theme.id)}
							aria-label={`Switch to ${theme.name} theme`}
							title={theme.name}
						>
							<span
								class="theme-swatch"
								aria-hidden="true"
								style={`--theme-swatch: ${theme.accent};`}
							></span>
						</button>
					{/each}
				</div>
			{/if}
			{#if versionLogOpen}
				<div class="version-log-panel">
					{#each VERSION_HISTORY as release (release.version)}
						<section class="version-log-entry">
							<div class="version-log-header">
								<p class="version-log-version">{release.version}</p>
								<p class="version-log-label">{release.label}</p>
							</div>
							<ul class="version-log-fixes">
								{#each release.fixes as fix (fix)}
									<li>{fix}</li>
								{/each}
							</ul>
						</section>
					{/each}
				</div>
			{/if}
		</div>

		<div class="hud hud-bottom">
			{#if spotlight}
				<div class="spotlight-meta">
					{#if isCompactViewport}
						<div class="compact-station-row">
							<div class="player-controls compact-player-controls">
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
								<button
									class="player-expand"
									type="button"
									aria-label={playerExpanded ? 'Collapse player' : 'Expand player'}
									onclick={() => (playerExpanded = !playerExpanded)}
								>
									{playerExpanded ? '▾' : '▸'}
								</button>
							</div>

							<ScrambleText
								as="p"
								className="station-name compact-station-name"
								text={spotlight.name}
							/>

							<button
								type="button"
								class="fav-button compact-fav-button"
								class:is-faved={favoriteIds.has(spotlight.id)}
								onclick={() => toggleFavorite(spotlight.id)}
								aria-label={favoriteIds.has(spotlight.id)
									? 'Remove from favorites'
									: 'Add to favorites'}
							>
								{favoriteIds.has(spotlight.id) ? '♥' : '♡'}
							</button>
						</div>

						<!-- <ScrambleText
								as="p"
								className="station-subtitle compact-station-subtitle"
								text={spotlightSubtitle}
							/> -->

						{#if playerExpanded}
							<div class="player-main compact-player-panel">
								<div class="player-topline">
									<div class="status-row">
										<span class="live-pill">Live Radio</span>
										<span>{formatTime(elapsed)}</span>
									</div>
								</div>

								<div class="progress-rail" aria-hidden="true">
									<div
										class="progress-fill"
										class:buffering={playbackStatus === 'buffering'}
										class:ready={playbackStatus === 'ready'}
										class:error={playbackStatus === 'error'}
									></div>
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
						{/if}
					{:else}
						<div class="station-title">
							<div>
								<ScrambleText as="p" className="station-name" text={spotlight.name} />
								<ScrambleText as="p" className="station-subtitle" text={spotlightSubtitle} />
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
									onerror={(e) => {
										failedFavicons.add(spotlight.id);
									}}
								/>
							{/if}
							{#if !spotlight.favicon || failedFavicons.has(spotlight.id)}
								<div
									class="station-icon-fallback"
									title={spotlight.name}
									style={`background: ${getStationBg(spotlight.id)};`}
								>
									{getStationInitials(spotlight.name)}
								</div>
							{/if}
						</div>

						<ScrambleText
							as="p"
							className="coordinates"
							text={`Lat ${spotlight.lat.toFixed(2)} / Lon ${spotlight.lon.toFixed(2)}`}
						/>

						{#if currentTrackTitle || currentTrackArtist}
							<div class="track-info">
								{#if currentTrackArtist}
									<p class="track-artist">{currentTrackArtist}</p>
								{/if}
								{#if currentTrackTitle}
									<p class="track-title">{currentTrackTitle}</p>
								{/if}
							</div>
						{/if}

						{#if spotlight.tags.length > 0}
							<div class="tag-list">
								{#each spotlight.tags.slice(0, 5) as tag (tag)}
									<span>{tag}</span>
								{/each}
							</div>
						{/if}

						<div class="player-shell">
							<div class="player-controls">
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
							</div>

							<div class="player-main">
								<div class="player-topline">
									<div class="status-row">
										<span class="live-pill">Live Radio</span>
										<span>{formatTime(elapsed)}</span>
									</div>
								</div>

								<div class="progress-rail" aria-hidden="true">
									<div
										class="progress-fill"
										class:buffering={playbackStatus === 'buffering'}
										class:ready={playbackStatus === 'ready'}
										class:error={playbackStatus === 'error'}
									></div>
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
					{/if}

					<div class="meta-row">
						<ScrambleText as="span" text={refreshedAt || '...'} />
						<div class="link-row">
							{#if spotlight.homepage}
								<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
								<a href={spotlight.homepage} target="_blank" rel="noreferrer">Site</a>
							{/if}
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
							<a href={spotlightStreamUrl} target="_blank" rel="noreferrer">Stream</a>
							{#if stats}
								<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
								<a href={stats.source} target="_blank" rel="noreferrer">Source</a>
							{/if}
						</div>
					</div>
				</div>
			{:else}
				<div class="empty-copy">
					<div class="hint-panel" class:compact={isCompactViewport}>
						<div class="hint-panel-header">
							<p class="hint-panel-title">how to use</p>
							{#if isCompactViewport}
								<button
									type="button"
									class="hint-toggle"
									aria-expanded={instructionsOpen}
									onclick={() => (instructionsOpen = !instructionsOpen)}
								>
									{instructionsOpen ? 'hide' : 'show'}
								</button>
							{/if}
						</div>
						{#if !isCompactViewport || instructionsOpen}
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
						{/if}
					</div>
				</div>
			{/if}
		</div>

		{#if hasActiveFilters}
			<div class="hud hud-search-panel">
				<div class="fav-list">
					{#if visibleStations.length === 0}
						<p class="fav-empty">no results</p>
					{:else}
						{#each visibleStations as station (station.id)}
							<button type="button" class="fav-item" onclick={() => pickStation(station)}>
								<span class="fav-name">{station.name}</span>
								{#if station.country}<span class="fav-country">{station.country}</span>{/if}
							</button>
						{/each}
					{/if}
				</div>
			</div>
		{/if}

		<audio bind:this={audioElement} class="hidden-audio" preload="auto"></audio>
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
		--accent: #f18c34;
		--accent-rgb: 241, 140, 52;
		--orange: var(--accent);
		height: 100dvh;
		-webkit-touch-callout: none;
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

	.loading-copy {
		animation: loading-fade 1.5s ease-in-out infinite;
		will-change: opacity;
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
		bottom: 3rem;
		max-width: min(32rem, calc(100vw - 2rem));
	}

	.hud-search-panel {
		bottom: 3rem;
		right: 1rem;
		left: auto;
		max-width: min(24rem, calc(100vw - 2rem));
		pointer-events: auto;
	}

	.hud-search-panel .fav-list {
		max-height: 60vh;
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
		-webkit-user-select: none;
		user-select: none;
	}

	.filter-row {
		display: flex;
		align-items: stretch;
		gap: 0.3rem;
		padding: 0;
	}

	.search-control {
		display: grid;
		grid-template-columns: auto 0fr;
		align-items: stretch;
		flex: 0 0 auto;
		min-width: 0;
		transition: grid-template-columns 0.5s ease;
	}

	.search-control.expanded {
		flex: 1 1 auto;
		grid-template-columns: auto 1fr;
	}

	.search-input-shell {
		width: 100%;
		min-width: 0;
		overflow: hidden;
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.18s ease;
	}

	.search-control.expanded .search-input-shell {
		opacity: 1;
		pointer-events: auto;
	}

	.search-input {
		width: 100%;
		min-width: 0;
		opacity: 0;
		transform: translateX(-0.2rem);
		transition:
			opacity 0.18s ease,
			transform 0.5s ease;
	}

	.search-control.expanded .search-input {
		opacity: 1;
		transform: translateX(0);
	}

	.metric-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		width: 100px;
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
		outline: none;
		box-shadow: none;
		appearance: none;
		-webkit-appearance: none;
		-webkit-user-select: text;
		user-select: text;
	}

	input:not([type='range'])::placeholder {
		color: #ffffff;
		opacity: 1;
	}

	input:not([type='range']):focus,
	input:not([type='range']):focus-visible,
	input:not([type='range']):active {
		outline: none;
		box-shadow: none;
		border: 0;
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
		color: white;
		transition: all 0.1s;
	}

	.search-toggle {
		color: white;
		width: 2rem;
		display: grid;
		place-items: center;
		flex-shrink: 0;
	}

	.search-toggle.active {
		color: var(--orange);
	}

	.filter-toggle.active {
		background: rgba(var(--accent-rgb), 0.15);
		color: var(--orange);
	}

	.panel-toggle-row {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.3rem;
	}

	.fav-toggle.active {
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

	:global(.station-name) {
		margin: 0;
		font-size: 1rem;
		line-height: 1.2;
		letter-spacing: 0;
		font-weight: 500;
		text-transform: lowercase;
	}

	:global(.station-subtitle),
	:global(.coordinates) {
		margin: 0.35rem 0 0;
		line-height: 1.5;
		color: var(--text-soft);
		font-size: 0.78rem;
	}

	.track-info {
		margin: 0.6rem 0 0;
		padding: 0.5rem 0;
		border-top: 1px solid rgba(var(--accent-rgb), 0.2);
		border-bottom: 1px solid rgba(var(--accent-rgb), 0.2);
	}

	.track-artist {
		margin: 0;
		color: rgba(255, 255, 255, 0.6);
		font-size: 0.72rem;
		line-height: 1.4;
		text-transform: lowercase;
	}

	.track-title {
		margin: 0.2rem 0 0;
		color: var(--orange);
		font-size: 0.84rem;
		line-height: 1.4;
		font-weight: 500;
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
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		color: #ffffff;
		font-size: 0.75rem;
		font-weight: 600;
		line-height: 1;
		letter-spacing: 0.05em;
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

	.compact-station-row,
	:global(.compact-station-name),
	:global(.compact-station-subtitle),
	.compact-player-panel,
	.compact-player-controls,
	.compact-fav-button {
		display: none;
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

	.player-controls {
		display: flex;
		gap: 0.3rem;
		align-items: center;
	}

	.player-expand {
		border: 0;
		background: rgba(0, 0, 0, 0.54);
		color: var(--ink);
		font-size: 0.75rem;
		line-height: 1;
		cursor: pointer;
		padding: 0.3rem 0.35rem;
		display: none;
	}

	.player-button {
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

	.filter-toggle-content {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		font-size: 0.82rem;
	}

	.progress-rail {
		position: relative;
		height: 2px;
		border-radius: 0;
		background: rgba(242, 230, 210, 0.14);
		overflow: hidden;
	}

	.progress-fill {
		position: absolute;
		inset: 0;
		width: 0;
		border-radius: 0;
		background: rgba(var(--accent-rgb), 0.5);
		transition:
			width 180ms ease,
			background-color 180ms ease,
			opacity 180ms ease,
			background-position 180ms ease;
	}

	.progress-fill.buffering {
		width: 100%;
		opacity: 0.95;
		background: linear-gradient(
			90deg,
			rgba(var(--accent-rgb), 0.08) 0%,
			rgba(var(--accent-rgb), 0.24) 30%,
			rgba(255, 217, 166, 0.9) 50%,
			rgba(var(--accent-rgb), 0.24) 70%,
			rgba(var(--accent-rgb), 0.08) 100%
		);
		background-size: 220% 100%;
		background-position: 100% 0;
		animation: loading-sweep 1.35s linear infinite;
	}

	.progress-fill.ready {
		width: 100%;
		background: var(--orange);
	}

	.progress-fill.error {
		width: 100%;
		background: #c53b2c;
	}

	.volume-slider {
		flex: 1;
		height: 0.3rem;
		padding: 0;
		border: 0;
		background: transparent;
		appearance: none;
		accent-color: var(--accent);
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

	.hint-panel {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
	}

	.hint-panel.compact {
		gap: 0.35rem;
	}

	.hint-panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.hint-panel-title {
		margin: 0;
		color: var(--text-soft);
		font-size: 0.66rem;
		letter-spacing: 0.08em;
		text-transform: lowercase;
	}

	.hint-toggle {
		border: 0;
		padding: 0.1rem 0;
		background: transparent;
		color: var(--orange);
		font-size: 0.66rem;
		line-height: 1;
		text-transform: lowercase;
		cursor: pointer;
		font-family: inherit;
	}

	.hint-toggle:hover {
		color: var(--text);
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

		.debug-toggle-button {
			display: none;
		}

		input.search-input {
			font-size: 16px;
			line-height: 1.2;
		}

		.hud-top {
			top: 0.75rem;
			max-width: calc(100vw - 1.5rem);
		}

		.hud-bottom {
			bottom: calc(0.75rem);
			max-width: calc(100vw - 1.5rem);
		}

		.hud-search-panel {
			bottom: calc(0.75rem + 50px);
			right: 0.75rem;
			max-width: calc(100vw - 1.5rem);
		}

		.filter-row {
			gap: 0.2rem;
		}

		.metric-row {
			display: none;
		}

		.meta-row {
			display: none;
		}

		.spotlight-meta {
			padding: 0.4rem 0.75rem;
			display: flex;
			flex-direction: column;
			align-items: stretch;
			gap: 0.35rem;
		}

		:global(.coordinates) {
			display: none;
		}

		.tag-list {
			display: none;
		}

		.station-title,
		.player-shell {
			display: none;
		}

		.compact-station-row {
			display: grid;
			grid-template-columns: auto minmax(0, 1fr) auto;
			align-items: center;
			gap: 0.45rem;
			min-width: 0;
		}

		.compact-player-controls {
			display: flex;
			gap: 0.15rem;
			align-items: center;
		}

		:global(.compact-station-name) {
			display: block;
			min-width: 0;
			margin: 0;
			font-size: 0.78rem;
			line-height: 1;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}

		:global(.compact-station-subtitle) {
			display: block;
			margin: 0;
			font-size: 0.62rem;
			line-height: 1.2;
			color: var(--text-soft);
		}

		.player-expand {
			display: block;
			padding: 0.2rem 0.25rem;
			font-size: 0.65rem;
		}

		.compact-player-panel {
			display: grid;
			gap: 0.4rem;
			margin: 0.1rem 0 0;
		}

		.player-button {
			width: 1.8rem;
			height: 1.8rem;
		}

		.compact-fav-button {
			display: grid;
			place-items: center;
			min-width: 1.3rem;
			min-height: 1.3rem;
			font-size: 0.95rem;
			padding: 0.15rem;
		}
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@keyframes loading-sweep {
		0% {
			background-position: 100% 0;
		}
		100% {
			background-position: -120% 0;
		}
	}

	@keyframes loading-fade {
		0%,
		100% {
			opacity: 0.35;
		}
		50% {
			opacity: 1;
		}
	}

	.hud-fav-panel {
		top: 0.75rem;
		right: 1rem;
		left: auto;
		max-width: 24rem;
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
		color: var(--ink);
		font-size: 0.85rem;
		line-height: 1;
		cursor: pointer;
		font-weight: 500;
		transition: color 0.1s ease;
	}

	.fav-toggle:hover {
		color: var(--orange);
	}

	.icon-toggle-button {
		min-width: 2.4rem;
		padding-inline: 0.45rem;
		text-align: center;
	}

	.theme-toggle-button {
		padding-inline: 0.4rem;
	}

	.theme-toggle-swatch,
	.theme-swatch {
		display: inline-block;
		width: 0.78rem;
		margin-top: 5px;
		height: 0.78rem;
		border-radius: 999px;
		background: var(--theme-swatch);
	}

	.theme-panel {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.4rem;
		margin-top: 0.3rem;
		padding: 0.5rem 0.65rem;
		background: var(--panel-bg);
		backdrop-filter: blur(10px);
	}

	.theme-swatch-button {
		border: 0;
		padding: 0.25rem;
		background: transparent;
		cursor: pointer;
		line-height: 0;
		border-radius: 999px;
		outline: 1px solid transparent;
		outline-offset: 2px;
		transition:
			outline-color 0.12s ease,
			transform 0.12s ease;
	}

	.theme-swatch-button:hover,
	.theme-swatch-button.active {
		transform: scale(1.05);
	}

	.theme-swatch-button.active .theme-swatch {
		box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.5);
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
		background: rgba(var(--accent-rgb), 0.1);
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

	.version-log-panel {
		width: min(24rem, calc(100vw - 2rem));
		background: var(--panel-bg);
		backdrop-filter: blur(10px);
		margin-top: 0.3rem;
		max-height: 60vh;
		overflow-y: auto;
		padding: 0.85rem 1rem 0.95rem;
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
	}

	.version-log-entry {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		padding-top: 0.1rem;
	}

	.version-log-entry + .version-log-entry {
		padding-top: 0.8rem;
		border-top: 1px solid rgba(242, 230, 210, 0.08);
	}

	.version-log-header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.version-log-version,
	.version-log-label {
		margin: 0;
	}

	.version-log-version {
		color: var(--ink);
		font-size: 0.86rem;
		font-weight: 600;
		letter-spacing: 0.02em;
	}

	.version-log-label {
		color: var(--orange);
		font-size: 0.65rem;
		text-transform: lowercase;
	}

	.version-log-fixes {
		margin: 0;
		padding: 0 0 0 1rem;
		color: var(--text-soft);
		font-size: 0.72rem;
		line-height: 1.45;
	}

	.version-log-fixes li + li {
		margin-top: 0.3rem;
	}

	@media (max-width: 42rem) {
		.hud-fav-panel {
			top: 3rem;
			right: 0.75rem;
			left: auto;
			max-width: calc(100vw - 1.5rem);
		}

		.fav-list,
		.theme-panel,
		.version-log-panel {
			width: min(24rem, calc(100vw - 1.5rem));
		}
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
