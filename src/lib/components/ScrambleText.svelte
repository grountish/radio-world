<script lang="ts">
	import { onMount, untrack } from 'svelte';

	type Props = {
		text?: string;
		as?: string;
		className?: string;
		animateInitial?: boolean;
	};

	let {
		text = '',
		as = 'span',
		className = '',
		animateInitial = false
	}: Props = $props();

	const glyphs = 'a*c_e1f·ij#l¢n$pq%s&u/w()=0^23456789:/-•.,';
	const extraFrames = 10;
	let displayText = $state(text);
	let initialized = false;
	let reduceMotion = false;
	let frameId = 0;
	let lastTargetText = text;

	function cancelFrame() {
		if (frameId) {
			cancelAnimationFrame(frameId);
			frameId = 0;
		}
	}

	function randomGlyph() {
		return glyphs[Math.floor(Math.random() * glyphs.length)] ?? '.';
	}

	function isLockedCharacter(character: string) {
		return character === '' || /\s/.test(character);
	}

	function scrambleTo(fromText: string, nextText: string) {
		cancelFrame();

		if (reduceMotion || nextText === fromText) {
			displayText = nextText;
			return;
		}

		const maxLength = Math.max(fromText.length, nextText.length);
		const queue = Array.from({ length: maxLength }, (_, index) => {
			const from = fromText[index] ?? '';
			const to = nextText[index] ?? '';
			const locked = isLockedCharacter(from) && isLockedCharacter(to);

				return {
					from,
					to,
					locked,
					start: locked ? 0 : Math.floor(Math.random() * 5),
					end: locked ? 0 : 7 + Math.floor(Math.random() * 9) + index * 0.35 + extraFrames,
					glyph: from
				};
			});

		let frame = 0;

		const render = () => {
			let completed = 0;
			let output = '';

			for (const item of queue) {
				if (item.locked || frame >= item.end) {
					completed += 1;
					output += item.to;
					continue;
				}

				if (frame < item.start) {
					output += item.from;
					continue;
				}

				if (!item.glyph || Math.random() < 0.28) {
					item.glyph = randomGlyph();
				}

				output += item.glyph;
			}

			displayText = output;

			if (completed === queue.length) {
				displayText = nextText;
				frameId = 0;
				return;
			}

			frame += 1;
			frameId = requestAnimationFrame(render);
		};

		render();
	}

	onMount(() => {
		const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		reduceMotion = mediaQuery.matches;

		const updateReducedMotion = (event: MediaQueryListEvent) => {
			reduceMotion = event.matches;
			if (reduceMotion) {
				cancelFrame();
				displayText = text;
			}
		};

		mediaQuery.addEventListener('change', updateReducedMotion);

		return () => {
			cancelFrame();
			mediaQuery.removeEventListener('change', updateReducedMotion);
		};
	});

	$effect(() => {
		const nextText = text ?? '';

		if (!initialized) {
			initialized = true;
			lastTargetText = nextText;
			displayText = nextText;
			if (!animateInitial) {
				return;
			}
		}

		if (nextText === lastTargetText) {
			return;
		}

		const fromText = untrack(() => displayText);
		lastTargetText = nextText;
		scrambleTo(fromText, nextText);
	});
</script>

<svelte:element this={as} class={`scramble-text ${className}`.trim()}>
	<span aria-hidden="true">{displayText}</span>
	<span class="sr-only">{text}</span>
</svelte:element>

<style>
	.scramble-text {
		white-space: pre-wrap;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
