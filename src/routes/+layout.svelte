<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
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
