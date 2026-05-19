export const APP_NAME = 'Radio World';
export const APP_SHORT_NAME = 'Radio World';
export const APP_TITLE = 'Radio World | Explore Live Radio on a 3D Globe';
export const APP_DESCRIPTION =
	'Explore live internet radio stations on an interactive 3D globe. Filter geo-tagged streams by country, language, and quality, then tune in instantly from anywhere in the world.';
export const APP_THEME_COLOR = '#050505';
export const APP_BACKGROUND_COLOR = '#050505';
export const APP_ACCENT_COLOR = '#f18c34';
export const APP_CATEGORY = 'music';
export const APP_LOCALE = 'en_US';
export const APP_SOCIAL_IMAGE_PATH = '/social-card.svg';
export const APP_KEYWORDS = [
	'live radio',
	'internet radio',
	'world radio',
	'radio globe',
	'3D globe',
	'streaming radio',
	'global radio stations',
	'station map',
	'Radio Browser',
	'music discovery'
] as const;

export function buildAbsoluteUrl(origin: string, path: string) {
	return new URL(path, origin).toString();
}

export function buildCanonicalUrl(origin: string, pathname: string) {
	return new URL(pathname, origin).toString();
}

export function buildMetadataJsonLd(url: string, imageUrl: string) {
	return [
		{
			'@context': 'https://schema.org',
			'@type': 'WebSite',
			name: APP_NAME,
			url,
			description: APP_DESCRIPTION,
			inLanguage: 'en',
			potentialAction: {
				'@type': 'SearchAction',
				target: `${url}?q={search_term_string}`,
				'query-input': 'required name=search_term_string'
			}
		},
		{
			'@context': 'https://schema.org',
			'@type': 'SoftwareApplication',
			name: APP_NAME,
			applicationCategory: 'MusicApplication',
			operatingSystem: 'Web Browser',
			description: APP_DESCRIPTION,
			url,
			image: imageUrl,
			isAccessibleForFree: true,
			offers: {
				'@type': 'Offer',
				price: '0',
				priceCurrency: 'USD'
			}
		}
	];
}
