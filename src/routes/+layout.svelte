<script lang="ts">
	import { page } from '$app/state';
	import favicon from '$lib/assets/favicon.svg';
	import {
		APP_ACCENT_COLOR,
		APP_CATEGORY,
		APP_DESCRIPTION,
		APP_KEYWORDS,
		APP_LOCALE,
		APP_NAME,
		APP_SHORT_NAME,
		APP_SOCIAL_IMAGE_PATH,
		APP_THEME_COLOR,
		APP_TITLE,
		buildAbsoluteUrl,
		buildCanonicalUrl,
		buildMetadataJsonLd
	} from '$lib/config/app-metadata';

	let { children } = $props();

	const canonicalUrl = $derived(buildCanonicalUrl(page.url.origin, page.url.pathname));
	const socialImageUrl = $derived(buildAbsoluteUrl(page.url.origin, APP_SOCIAL_IMAGE_PATH));
	const metadataJsonLd = $derived(
		JSON.stringify(buildMetadataJsonLd(canonicalUrl, socialImageUrl)).replace(/</g, '\\u003c')
	);
	const metadataJsonLdTag = $derived(
		'<script type="application/ld+json">' + metadataJsonLd + '</' + 'script>'
	);
</script>

<svelte:head>
	<title>{APP_TITLE}</title>
	<meta name="description" content={APP_DESCRIPTION} />
	<meta name="keywords" content={APP_KEYWORDS.join(', ')} />
	<meta name="application-name" content={APP_NAME} />
	<meta name="apple-mobile-web-app-title" content={APP_SHORT_NAME} />
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
	<meta name="mobile-web-app-capable" content="yes" />
	<meta name="theme-color" content={APP_THEME_COLOR} />
	<meta name="msapplication-TileColor" content={APP_ACCENT_COLOR} />
	<meta name="color-scheme" content="dark" />
	<meta name="category" content={APP_CATEGORY} />
	<meta name="format-detection" content="telephone=no" />
	<meta name="referrer" content="strict-origin-when-cross-origin" />
	<meta
		name="robots"
		content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
	/>
	<meta
		name="googlebot"
		content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
	/>

	<link rel="canonical" href={canonicalUrl} />
	<link rel="manifest" href="/site.webmanifest" />
	<link rel="icon" href={favicon} />
	<link rel="shortcut icon" href={favicon} />
	<link rel="mask-icon" href={favicon} color={APP_ACCENT_COLOR} />

	<meta property="og:type" content="website" />
	<meta property="og:site_name" content={APP_NAME} />
	<meta property="og:locale" content={APP_LOCALE} />
	<meta property="og:title" content={APP_TITLE} />
	<meta property="og:description" content={APP_DESCRIPTION} />
	<meta property="og:url" content={canonicalUrl} />
	<meta property="og:image" content={socialImageUrl} />
	<meta property="og:image:type" content="image/svg+xml" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content={`${APP_NAME} social card`} />

	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={APP_TITLE} />
	<meta name="twitter:description" content={APP_DESCRIPTION} />
	<meta name="twitter:image" content={socialImageUrl} />
	<meta name="twitter:image:alt" content={`${APP_NAME} social card`} />

	{@html metadataJsonLdTag}
</svelte:head>

<div class="page-content">
	{@render children()}
</div>

<style>
	:global(html),
	:global(body) {
		margin: 0;
		padding: 0;
		height: 100%;
		background: #050505;
	}

	:global(#svelte) {
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100vh;
	}

	.page-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
</style>
