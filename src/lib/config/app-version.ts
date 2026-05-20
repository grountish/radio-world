export const APP_VERSION = '0.0.29';
export const APP_USER_AGENT = `radio-world/${APP_VERSION}`;

export type VersionHistoryEntry = {
	version: string;
	label: string;
	fixes: string[];
};

export const VERSION_HISTORY: VersionHistoryEntry[] = [
	{
		version: '0.0.29',
		label: 'current',
		fixes: [
			'made the station tags clickable so tapping one searches and filters the globe by that tag',
			'brightened the tags on hover and focus to signal they are interactive'
		]
	},
	{
		version: '0.0.28',
		label: 'previous',
		fixes: [
			'fixed the live globe rotation readout so it tracks the camera orbit angle in real time instead of a static value',
			'replaced the theme toggle flower glyph with an inline SVG so it spins perfectly in place without drifting off center',
			'gave every theme swatch the same flower SVG shape for a consistent themed look',
			'normalized the toolbar icon sizes so the stats and clock buttons match the favorites and theme icons'
		]
	},
	{
		version: '0.0.27',
		label: 'previous',
		fixes: [
			'added Hong Kong Community Radio as a curated station with its verified browser-playable HLS livestream',
			'kept the curated catalog regression coverage up to date so official hand-picked stations remain pinned in the dataset'
		]
	},
	{
		version: '0.0.26',
		label: 'previous',
		fixes: [
			'added runtime track metadata parsing for HLS ID3 tags so compatible stations can surface live artist and title updates',
			'added an ICY metadata sidecar reader for direct stream urls when the server exposes metadata intervals and browser CORS allows it',
			'kept the player resilient by clearing stale metadata on station switches and falling back to native audio metadata and text tracks when available'
		]
	},
	{
		version: '0.0.25',
		label: 'previous',
		fixes: [
			'added a proper app title and description plus canonical, robots, Open Graph, and Twitter metadata in the shared document head',
			'added a web app manifest and dedicated social-card asset so the app presents cleanly in installs, previews, and shares',
			'published structured data for the website and app so search engines get richer context about the radio globe experience'
		]
	},
	{
		version: '0.0.24',
		label: 'previous',
		fixes: [
			'quarantine stations on the client as soon as playback proves they are broken, so they stop reappearing during the same session',
			'persist the failed-station quarantine in session storage and exclude those ids from the globe, search results, and favorites lists',
			'keep background validation pruning bad streams on the server while closing the cold-start gap on the client'
		]
	},
	{
		version: '0.0.23',
		label: 'previous',
		fixes: [
			'rejected HLS streams that are reachable on the server but unusable in the browser because they do not expose CORS headers',
			'kept browser-safe HLS stations such as NTS while filtering qingting-style manifests that hls.js cannot actually load',
			'added regression coverage for no-CORS HLS validation in the station filtering pipeline'
		]
	},
	{
		version: '0.0.22',
		label: 'previous',
		fixes: [
			'extended background stream validation to work through the full cached catalog in batches instead of only the first slice',
			'kept the station list stable while progressively removing streams that are actually proven bad',
			'added regression coverage for deep-tail station validation so lower-ranked dead streams are filtered more consistently'
		]
	},
	{
		version: '0.0.21',
		label: 'previous',
		fixes: [
			'fixed station validation so background filtering no longer collapses the catalog to a smaller verified subset',
			'remove only stations that are actually proven bad while keeping the rest of the list stable',
			'kept curated stations merged into the validated result and added regression coverage for the filtering flow'
		]
	},
	{
		version: '0.0.20',
		label: 'previous',
		fixes: [
			'polished mobile controls: calmer close-up drag, hidden stats toggle, and non-selectable long-press surfaces',
			'added mobile long-press cluster pinning and suppressed Brave/iOS context actions during hold interactions',
			'refined search UX with animated expansion, larger mobile input sizing, and no auto-zoom on focus'
		]
	},
	{
		version: '0.0.19',
		label: 'previous',
		fixes: [
			'collapsed the search input behind a magnifying-glass trigger by default',
			'kept the HD filter visible while the search field expands inline when activated',
			'auto-collapse the search input again on blur when the query is empty and animate the expansion over 0.5 seconds'
		]
	},
	{
		version: '0.0.18',
		label: 'previous',
		fixes: [
			'prefer https stream, homepage, and favicon urls over http during station normalization',
			'upgrade stale insecure stream urls on the client before playback to avoid mixed-content warnings on the deployed https app',
			'point the Stream link in the station panel at the secure url too'
		]
	},
	{
		version: '0.0.17',
		label: 'previous',
		fixes: [
			'polished melt mode: globe auto-rotates and camera zooms out for full view',
			'added echo/ghost effect with time-offset distortion creating shimmering trails',
			'melt mode activated by typing "melt" instead of button for hidden easter egg feel'
		]
	},
	{
		version: '0.0.16',
		label: 'previous',
		fixes: [
			'added experimental melt mode with psychedelic shader that distorts country borders in real-time',
			'borders melt using layered sine waves at different frequencies for organic motion',
			'fragment shader cycles through vibrant colors using cosine palette formula and spatial position'
		]
	},
	{
		version: '0.0.15',
		label: 'previous',
		fixes: [
			'added pinned search results panel at bottom-right that auto-shows when filtering',
			'search panel automatically closes other panels (favorites, stats, etc.) when active',
			'search results use the same scrollable list component as favorites for consistency'
		]
	},
	{
		version: '0.0.14',
		label: 'previous',
		fixes: [
			'improved missing favicon fallback with color-coded initials instead of generic icon',
			'fixed auto-focus zoom depth when searching to prevent extreme close-up views',
			'added Rinse FM from London and Japan City Pop from Tokyo as curated stations'
		]
	},
	{
		version: '0.0.12',
		label: 'previous',
		fixes: [
			'added Japan City Pop from Tokyo as a curated station',
			'added graceful fallback for Web Audio API when CORS blocks frequency data',
			'visualizer now pulses smoothly even on CORS-restricted streams'
		]
	},
	{
		version: '0.0.11',
		label: 'previous',
		fixes: ['added Worldwide FM from London as a curated station']
	},
	{
		version: '0.0.10',
		label: 'previous',
		fixes: ['added Oroko Radio from Accra, Ghana as a curated station']
	},
	{
		version: '0.0.9',
		label: 'previous',
		fixes: [
			'added a theme picker with five accent swatches in the top-right control row',
			'replaced the fixed orange accent with a shared theme color across the HUD and globe',
			'persisted the selected theme so it survives reloads'
		]
	},
	{
		version: '0.0.8',
		label: 'previous',
		fixes: [
			'kept the top mobile search bar clear by moving favorites, stats, and version controls below it',
			'let the mobile filter row use the full viewport width again',
			'preserved the icon-only top-right controls without overlapping the search UI',
			'corrected the CSS rule-order issue so the mobile HUD layout actually applies'
		]
	},
	{
		version: '0.0.7',
		label: 'previous',
		fixes: [
			'converted top-right stats and version log toggles to icon-only buttons',
			'removed chevrons from the top-right controls and use orange active state instead',
			'kept favorites, stats, and version log panels mutually exclusive'
		]
	},
	{
		version: '0.0.6',
		label: 'previous',
		fixes: [
			'added curated NTS Radio 1 and NTS Radio 2',
			'fixed signed stream urls expiring before playback',
			'added HLS playback support for m3u8 radio streams',
			'improved loading transition and kept scramble/fade active during globe boot'
		]
	},
	{
		version: '0.0.5',
		label: 'session start',
		fixes: ['logs added - hi there curious person (✿ ♡‿♡)']
	}
];
