export const APP_VERSION = '0.0.8';
export const APP_USER_AGENT = `radio-world/${APP_VERSION}`;

export type VersionHistoryEntry = {
	version: string;
	label: string;
	fixes: string[];
};

export const VERSION_HISTORY: VersionHistoryEntry[] = [
	{
		version: '0.0.8',
		label: 'current',
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
