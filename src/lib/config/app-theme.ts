export type AppTheme = {
	id: string;
	name: string;
	accent: string;
	accentRgb: string;
};

export const APP_THEMES: AppTheme[] = [
	{
		id: 'ember',
		name: 'Ember',
		accent: '#f18c34',
		accentRgb: '241, 140, 52'
	},
	{
		id: 'cyan',
		name: 'Cyan',
		accent: '#4fc4ff',
		accentRgb: '79, 196, 255'
	},
	{
		id: 'lime',
		name: 'Lime',
		accent: '#a8dc52',
		accentRgb: '168, 220, 82'
	},
	{
		id: 'rose',
		name: 'Rose',
		accent: '#ff6f91',
		accentRgb: '255, 111, 145'
	},
	{
		id: 'violet',
		name: 'Violet',
		accent: '#a67cff',
		accentRgb: '166, 124, 255'
	}
];

export const DEFAULT_THEME_ID = APP_THEMES[0]?.id ?? 'ember';
