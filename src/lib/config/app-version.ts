export const APP_VERSION = '0.0.19';
export const APP_USER_AGENT = `radio-world/${APP_VERSION}`;

export type VersionHistoryEntry = {
	version: string;
	label: string;
	fixes: string[];
};

export const VERSION_HISTORY: VersionHistoryEntry[] = [
	{
		version: '0.0.19',
		label: 'current',
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
		fixes: [
			'added Worldwide FM from London as a curated station'
		]
	},
	{
		version: '0.0.10',
		label: 'previous',
		fixes: [
			'added Oroko Radio from Accra, Ghana as a curated station'
		]
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
		fixes: ['baseline before this session of fixes and curated sources']
	}
];
