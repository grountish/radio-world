<script lang="ts">
	import { onMount } from 'svelte';
	import { geoEquirectangular, geoPath } from 'd3-geo';
	import * as THREE from 'three';
	import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
	import { feature, mesh } from 'topojson-client';
	import countriesAtlas from 'world-atlas/countries-10m.json';
	import type { RadioStation } from '$lib/types/radio';
	import { latLonToCartesian } from '$lib/utils/geo';

	type Props = {
		stations?: RadioStation[];
		selectedStation?: RadioStation | null;
		onselect?: (station: RadioStation | null) => void;
		onhover?: (station: RadioStation | null) => void;
	};

	let {
		stations = [],
		selectedStation = null,
		onselect = undefined,
		onhover = undefined
	}: Props = $props();

	let container: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let webglError = $state('');

	const radius = 1.35;
	const clusterGridDegrees = 0.2;
	const baseColor = new THREE.Color('#f18c34');
	const hoverColor = new THREE.Color('#ffd9a6');
	const selectedColor = new THREE.Color('#ff6b1a');
	const pointer = new THREE.Vector2();
	const raycaster = new THREE.Raycaster();
	const dummy = new THREE.Object3D();
	const clickMovementThreshold = 8;

	let renderer: THREE.WebGLRenderer | null = null;
	let scene: THREE.Scene | null = null;
	let camera: THREE.PerspectiveCamera | null = null;
	let controls: OrbitControls | null = null;
	let earthGroup: THREE.Group | null = null;
	let markerMesh: THREE.InstancedMesh | null = null;
	let markerHitMesh: THREE.InstancedMesh | null = null;
	let hoveredIndex = -1;
	let visibleStations: RadioStation[] = [];
	let clusterKeyByIndex: string[] = [];
	let baseMarkerPositions: THREE.Vector3[] = [];
	let hoveredClusterStations = $state<RadioStation[]>([]);
	let stickyClusterStations = $state<RadioStation[]>([]);
	let isSticky = $state(false);
	const displayedClusterStations = $derived(isSticky ? stickyClusterStations : hoveredClusterStations);
	let currentZoomScale = 1.0;
	let lastZoomScale = -1;
	let currentCamDist = 0;
	let currentNormalizedZoom = 0;
	let debugOpen = $state(false);
	let debugStats = { fps: 0, visibleStations: 0, hoveredCount: 0 };
	let frameCount = 0;
	let lastFrameTime = Date.now();
	let pointerDownX = 0;
	let pointerDownY = 0;
	let pointerIsActive = false;
	let lastPointerUpTime = 0;
	let animationFrame = 0;
	let resizeObserver: ResizeObserver | null = null;

	function createBackdrop() {
		if (!scene) {
			return;
		}

		const starGeometry = new THREE.BufferGeometry();
		const starPositions: number[] = [];

		for (let index = 0; index < 1800; index += 1) {
			const distance = 12 + Math.random() * 20;
			const theta = Math.random() * Math.PI * 2;
			const phi = Math.acos(2 * Math.random() - 1);
			starPositions.push(
				distance * Math.sin(phi) * Math.cos(theta),
				distance * Math.cos(phi),
				distance * Math.sin(phi) * Math.sin(theta)
			);
		}

		starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));

		const stars = new THREE.Points(
			starGeometry,
			new THREE.PointsMaterial({
				color: '#8b7d67',
				size: 0.045,
				transparent: true,
				opacity: 0.35,
				sizeAttenuation: true
			})
		);

		scene.add(stars);
	}

	function createEarthTexture() {
		const canvas = document.createElement('canvas');
		canvas.width = 4096;
		canvas.height = 2048;

		const context = canvas.getContext('2d');

		if (!context) {
			throw new Error('Unable to create a canvas texture');
		}

		const oceanGradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
		oceanGradient.addColorStop(0, '#040404');
		oceanGradient.addColorStop(0.5, '#0a0a0a');
		oceanGradient.addColorStop(1, '#111111');
		context.fillStyle = oceanGradient;
		context.fillRect(0, 0, canvas.width, canvas.height);

		context.globalCompositeOperation = 'source-over';
		const projection = geoEquirectangular().fitExtent(
			[
				[0, 0],
				[canvas.width, canvas.height]
			],
			{ type: 'Sphere' }
		);
		const path = geoPath(projection, context);
		const atlas = countriesAtlas as {
			objects: { countries: object; land: object };
		};
		const land = feature(atlas as never, atlas.objects.land as never);
		const coastlines = mesh(atlas as never, atlas.objects.land as never);
		const countryBorders = mesh(
			atlas as never,
			atlas.objects.countries as never,
			(left, right) => left !== right
		);

		context.save();
		context.beginPath();
		path({ type: 'Sphere' });
		context.clip();

		context.fillStyle = '#171717';
		context.beginPath();
		path(land);
		context.fill();

		context.globalAlpha = 0.22;
		context.fillStyle = '#242424';
		context.beginPath();
		path(land);
		context.fill();
		context.globalAlpha = 1;

		context.strokeStyle = 'rgba(255, 255, 255, 0.12)';
		context.lineWidth = 1.5;
		context.beginPath();
		path(coastlines);
		context.stroke();

		context.strokeStyle = 'rgba(255, 255, 255, 0.075)';
		context.lineWidth = 0.9;
		context.beginPath();
		path(countryBorders);
		context.stroke();

		context.strokeStyle = 'rgba(255, 255, 255, 0.025)';
		context.lineWidth = 1.1;
		for (let longitude = 0; longitude <= canvas.width; longitude += canvas.width / 18) {
			context.beginPath();
			context.moveTo(longitude, 0);
			context.lineTo(longitude, canvas.height);
			context.stroke();
		}

		for (let latitude = 0; latitude <= canvas.height; latitude += canvas.height / 10) {
			context.beginPath();
			context.moveTo(0, latitude);
			context.lineTo(canvas.width, latitude);
			context.stroke();
		}
		context.restore();

		const texture = new THREE.CanvasTexture(canvas);
		texture.colorSpace = THREE.SRGBColorSpace;
		texture.wrapS = THREE.RepeatWrapping;
		texture.offset.x = 0.25;
		return texture;
	}

	function createLatLonGrid() {
		const group = new THREE.Group();
		const material = new THREE.LineBasicMaterial({
			color: '#7a6f5f',
			transparent: true,
			opacity: 0.1
		});

		for (let lat = -75; lat <= 75; lat += 15) {
			const points: THREE.Vector3[] = [];

			for (let lon = -180; lon <= 180; lon += 4) {
				const point = latLonToCartesian(lat, lon, radius, 0.005);
				points.push(new THREE.Vector3(point.x, point.y, point.z));
			}

			group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), material));
		}

		for (let lon = -180; lon < 180; lon += 15) {
			const points: THREE.Vector3[] = [];

			for (let lat = -90; lat <= 90; lat += 4) {
				const point = latLonToCartesian(lat, lon, radius, 0.005);
				points.push(new THREE.Vector3(point.x, point.y, point.z));
			}

			group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
		}

		return group;
	}

	function disposeObject(object: THREE.Object3D) {
		object.traverse(
			(node: THREE.Object3D & { geometry?: THREE.BufferGeometry; material?: unknown }) => {
				if ('geometry' in node && node.geometry instanceof THREE.BufferGeometry) {
					node.geometry.dispose();
				}

				if ('material' in node) {
					const material = node.material;
					if (Array.isArray(material)) {
						for (const item of material) {
							item.dispose();
						}
					} else if (material instanceof THREE.Material) {
						material.dispose();
					}
				}
			}
		);
	}

	function updateRendererSize() {
		if (!container || !renderer || !camera) {
			return;
		}

		const { clientWidth, clientHeight } = container;
		if (clientWidth === 0 || clientHeight === 0) {
			return;
		}

		renderer.setSize(clientWidth, clientHeight, false);
		camera.aspect = clientWidth / clientHeight;
		camera.updateProjectionMatrix();
	}

	function updateMarkerColors() {
		if (!markerMesh) {
			return;
		}

		const hoveredClusterKey = hoveredIndex >= 0 ? clusterKeyByIndex[hoveredIndex] : null;

		for (let index = 0; index < visibleStations.length; index += 1) {
			const station = visibleStations[index];
			const isSelected = selectedStation?.id === station.id;
			const isHovered =
				hoveredClusterKey !== null && clusterKeyByIndex[index] === hoveredClusterKey;
			const color = isSelected ? selectedColor : isHovered ? hoverColor : baseColor;
			markerMesh.setColorAt(index, color);
		}

		if (markerMesh.instanceColor) {
			markerMesh.instanceColor.needsUpdate = true;
		}
	}

	function toClusterKey(lat: number, lon: number) {
		return `${Math.round(lat / clusterGridDegrees)}:${Math.round(lon / clusterGridDegrees)}`;
	}

	function applyMarkerLayout() {
		if (!markerMesh || !markerHitMesh) {
			return;
		}

		for (let index = 0; index < visibleStations.length; index += 1) {
			const point = baseMarkerPositions[index];
			const markerScale = 0.5 * currentZoomScale;
			const hitScale = 1.1 * currentZoomScale;

			dummy.position.copy(point);
			dummy.scale.setScalar(markerScale);
			dummy.updateMatrix();
			markerMesh.setMatrixAt(index, dummy.matrix);

			dummy.scale.setScalar(hitScale);
			dummy.updateMatrix();
			markerHitMesh.setMatrixAt(index, dummy.matrix);
		}

		markerMesh.instanceMatrix.needsUpdate = true;
		markerHitMesh.instanceMatrix.needsUpdate = true;
	}

	function rebuildMarkers() {
		if (!earthGroup) {
			return;
		}

		visibleStations = stations.slice();
		clusterKeyByIndex = [];
		baseMarkerPositions = [];
		hoveredIndex = -1;
		hoveredClusterStations = [];
		stickyClusterStations = [];
		isSticky = false;
		onhover?.(null);

		if (markerMesh) {
			earthGroup.remove(markerMesh);
			disposeObject(markerMesh);
			markerMesh = null;
		}

		if (markerHitMesh) {
			earthGroup.remove(markerHitMesh);
			disposeObject(markerHitMesh);
			markerHitMesh = null;
		}

		if (visibleStations.length === 0) {
			return;
		}

		const markerGeometry = new THREE.SphereGeometry(0.007, 20, 20);
		const markerMaterial = new THREE.MeshBasicMaterial();
		markerMesh = new THREE.InstancedMesh(markerGeometry, markerMaterial, visibleStations.length);
		markerMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
		markerMesh.frustumCulled = false;

		const hitGeometry = new THREE.SphereGeometry(0.02, 12, 12);
		const hitMaterial = new THREE.MeshBasicMaterial({
			transparent: true,
			opacity: 0,
			depthWrite: false
		});
		markerHitMesh = new THREE.InstancedMesh(hitGeometry, hitMaterial, visibleStations.length);
		markerHitMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
		markerHitMesh.frustumCulled = false;

		for (let index = 0; index < visibleStations.length; index += 1) {
			const station = visibleStations[index];
			clusterKeyByIndex[index] = toClusterKey(station.lat, station.lon);
			const basePoint = latLonToCartesian(station.lat, station.lon, radius, 0.04);
			baseMarkerPositions[index] = new THREE.Vector3(basePoint.x, basePoint.y, basePoint.z);
		}

		earthGroup.add(markerMesh);
		earthGroup.add(markerHitMesh);
		applyMarkerLayout();
		updateMarkerColors();
	}

	function getIntersection(event: MouseEvent) {
		if (!renderer || !camera || !markerHitMesh) {
			return null;
		}

		const bounds = renderer.domElement.getBoundingClientRect();
		pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
		pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
		raycaster.setFromCamera(pointer, camera);

		const hit = raycaster.intersectObject(markerHitMesh, false)[0];
		return typeof hit?.instanceId === 'number' ? hit.instanceId : null;
	}

	function clearHover() {
		if (hoveredIndex === -1 && hoveredClusterStations.length === 0) {
			return;
		}

		hoveredIndex = -1;
		hoveredClusterStations = [];
		onhover?.(null);
		updateMarkerColors();
	}

	function handleContextMenu(event: MouseEvent) {
		event.preventDefault();
		if (!(event.target instanceof HTMLCanvasElement)) {
			return;
		}
		const index = getIntersection(event);
		if (typeof index === 'number') {
			const clusterKey = clusterKeyByIndex[index];
			stickyClusterStations = visibleStations.filter((_, i) => clusterKeyByIndex[i] === clusterKey);
			isSticky = true;
		} else {
			stickyClusterStations = [];
			isSticky = false;
		}
	}

	function handlePointerMove(event: PointerEvent) {
		if (!(event.target instanceof HTMLCanvasElement)) {
			return;
		}

		// Skip hover updates for 300ms after dragging to avoid flickering from damping
		if (Date.now() - lastPointerUpTime < 300) {
			return;
		}

		const nextIndex = getIntersection(event);
		const nextHoveredIndex = nextIndex ?? -1;

		if (nextHoveredIndex === hoveredIndex) {
			return;
		}

		hoveredIndex = nextHoveredIndex;

		if (hoveredIndex >= 0) {
			const clusterKey = clusterKeyByIndex[hoveredIndex];
			hoveredClusterStations = visibleStations.filter(
				(_, i) => clusterKeyByIndex[i] === clusterKey
			);
			onhover?.(visibleStations[hoveredIndex]);
		} else {
			// Don't clear the panel — mouse is crossing empty space toward the list.
			// clearHover() on pointerleave handles the full reset.
			onhover?.(null);
		}

		updateMarkerColors();
	}

	function handlePointerDown(event: PointerEvent) {
		if (event.button !== 0) {
			return;
		}

		pointerDownX = event.clientX;
		pointerDownY = event.clientY;
		pointerIsActive = true;
	}

	function handlePointerUp(event: PointerEvent) {
		if (!pointerIsActive || event.button !== 0) {
			return;
		}

		pointerIsActive = false;
		lastPointerUpTime = Date.now();
		const movement = Math.hypot(event.clientX - pointerDownX, event.clientY - pointerDownY);
		if (movement > clickMovementThreshold) {
			return;
		}

		const index = getIntersection(event);
		if (typeof index !== 'number') {
			return;
		}

		onselect?.(visibleStations[index]);
	}

	function resetPointerState() {
		pointerIsActive = false;
	}

	function animate() {
		if (!renderer || !scene || !camera) {
			return;
		}

		frameCount++;
		const now = Date.now();
		if (now - lastFrameTime >= 1000) {
			debugStats.fps = frameCount;
			debugStats.visibleStations = visibleStations.length;
			frameCount = 0;
			lastFrameTime = now;
		}

		animationFrame = window.requestAnimationFrame(animate);
		controls?.update();

		const camDist = camera.position.length();
		const t = Math.max(0, Math.min(1, (camDist - 1.15) / (8 - 1.15)));
		currentCamDist = camDist;
		currentNormalizedZoom = t;
		currentZoomScale = 0.049 + 0.951 * t;
		if (Math.abs(currentZoomScale - lastZoomScale) > 0.005) {
			lastZoomScale = currentZoomScale;
			applyMarkerLayout();
			updateMarkerColors();
			if (controls) {
				controls.rotateSpeed = 0.3 + 0.7 * t;
			}
		}

		renderer.render(scene, camera);
	}

	onMount(() => {
		try {
			scene = new THREE.Scene();
			camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
			camera.position.set(0, 0.2, 4.9);

			renderer = new THREE.WebGLRenderer({
				antialias: true,
				alpha: true,
				canvas
			});
			renderer.outputColorSpace = THREE.SRGBColorSpace;
			renderer.setPixelRatio(Math.min(window.devicePixelRatio, 3));
			renderer.setClearColor(0x000000, 0);

			controls = new OrbitControls(camera, renderer.domElement);
			controls.enableDamping = false;
			controls.enablePan = false;
			controls.autoRotate = false;
			controls.minDistance = 1.15;
			controls.maxDistance = 8;
			controls.zoomSpeed = 1.2;

			createBackdrop();

			earthGroup = new THREE.Group();
			earthGroup.rotation.y = Math.PI / 2;
			scene.add(earthGroup);

			const earth = new THREE.Mesh(
				new THREE.SphereGeometry(radius, 96, 96),
				new THREE.MeshStandardMaterial({
					map: createEarthTexture(),
					color: '#0b0b0b',
					roughness: 0.95,
					metalness: 0.02,
					emissive: '#050505',
					emissiveIntensity: 0.08
				})
			);
			earthGroup.add(earth);

			const atmosphere = new THREE.Mesh(
				new THREE.SphereGeometry(radius * 1.04, 64, 64),
				new THREE.MeshBasicMaterial({
					color: '#f18c34',
					transparent: true,
					opacity: 0.02,
					side: THREE.BackSide
				})
			);
			earthGroup.add(atmosphere);
			earthGroup.add(createLatLonGrid());

			scene.add(new THREE.AmbientLight('#f2e6d2', 0.42));

			const keyLight = new THREE.DirectionalLight('#f2e6d2', 0.5);
			keyLight.position.set(4, 3, 6);
			scene.add(keyLight);

			const rimLight = new THREE.DirectionalLight('#f18c34', 0.18);
			rimLight.position.set(-4, -2, -6);
			scene.add(rimLight);

			resizeObserver = new ResizeObserver(updateRendererSize);
			resizeObserver.observe(container);
			container.addEventListener('pointerdown', handlePointerDown);
			container.addEventListener('pointermove', handlePointerMove);
			container.addEventListener('pointerup', handlePointerUp);
			container.addEventListener('pointercancel', resetPointerState);
			container.addEventListener('pointerleave', clearHover);
			container.addEventListener('contextmenu', handleContextMenu);
			updateRendererSize();
			rebuildMarkers();
			animate();
		} catch (error) {
			webglError =
				error instanceof Error ? error.message : 'WebGL could not be initialized in this browser.';
		}

		return () => {
			window.cancelAnimationFrame(animationFrame);
			resizeObserver?.disconnect();
			container?.removeEventListener('pointerdown', handlePointerDown);
			container?.removeEventListener('pointermove', handlePointerMove);
			container?.removeEventListener('pointerup', handlePointerUp);
			container?.removeEventListener('pointercancel', resetPointerState);
			container?.removeEventListener('pointerleave', clearHover);
			container?.removeEventListener('contextmenu', handleContextMenu);
			controls?.dispose();

			if (scene) {
				disposeObject(scene);
			}

			renderer?.dispose();
		};
	});

	$effect(() => {
		rebuildMarkers();
	});

	$effect(() => {
		updateMarkerColors();
	});
</script>

<div class="globe-shell">
	<div
		bind:this={container}
		class="globe-canvas"
		role="img"
		aria-label="Interactive 3D globe showing the coordinates of radio stations around the world"
	>
		<canvas bind:this={canvas}></canvas>

		{#if displayedClusterStations.length > 0}
			<div
				class="cluster-panel"
				class:is-sticky={isSticky}
				onpointerdown={(e) => e.stopPropagation()}
				onpointerup={(e) => e.stopPropagation()}
			>
				<div class="cluster-header">
					<span class="cluster-label">
						{displayedClusterStations.length}
						{displayedClusterStations.length === 1 ? 'station' : 'stations'}
						{#if isSticky}&nbsp;· pinned{/if}
					</span>
					{#if isSticky}
						<button
							type="button"
							class="cluster-close"
							aria-label="Unpin cluster"
							onclick={() => { isSticky = false; stickyClusterStations = []; }}
						>×</button>
					{/if}
				</div>
				<ul class="cluster-list">
					{#each displayedClusterStations as station (station.id)}
						<li>
							<button type="button" class="cluster-item" onclick={() => onselect?.(station)}>
								<span class="cluster-item-name">{station.name}</span>
								{#if station.country}
									<span class="cluster-item-country">{station.country}</span>
								{/if}
							</button>
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		<div class="debug-panel" class:open={debugOpen}>
			<button class="debug-toggle" type="button" onclick={() => (debugOpen = !debugOpen)}>
				{debugOpen ? '▾' : '▸'} {debugStats.fps} fps
			</button>
			{#if debugOpen}
				<div class="debug-info">
					<div class="debug-row">
						<span class="debug-label">stations:</span>
						<span class="debug-value">{debugStats.visibleStations}</span>
					</div>
					<div class="debug-row">
						<span class="debug-label">hovered:</span>
						<span class="debug-value">{hoveredClusterStations.length}</span>
					</div>
				</div>
			{/if}
		</div>
	</div>

	{#if webglError}
		<div class="fallback">
			<p>{webglError}</p>
			<p>Try a modern browser with WebGL enabled.</p>
		</div>
	{/if}

</div>

<style>
	.globe-shell {
		position: relative;
		width: 100vw;
		height: 100dvh;
		overflow: hidden;
		background: #050505;
	}

	.globe-canvas {
		height: 100%;
		width: 100%;
		cursor: grab;
	}

	canvas {
		display: block;
		width: 100%;
		height: 100%;
	}

	.globe-canvas:active {
		cursor: grabbing;
	}

	.cluster-panel {
		position: absolute;
		right: 1rem;
		top: 50%;
		transform: translateY(-50%);
		z-index: 4;
		width: min(18rem, calc(100vw - 2rem));
		max-height: 60dvh;
		display: flex;
		flex-direction: column;
		background: rgba(0, 0, 0, 0.82);
		backdrop-filter: blur(10px);
		pointer-events: auto;
		overflow: hidden;
	}

	.cluster-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.55rem 0.9rem 0.45rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.07);
		flex-shrink: 0;
	}

	.is-sticky .cluster-header {
		border-left: 2px solid #f18c34;
		padding-left: calc(0.9rem - 2px);
	}

	.cluster-label {
		margin: 0;
		color: #f18c34;
		font-size: 0.64rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.cluster-close {
		border: 0;
		background: none;
		color: rgba(242, 230, 210, 0.5);
		font: inherit;
		font-size: 1rem;
		line-height: 1;
		cursor: pointer;
		padding: 0 0 0 0.5rem;
		transition: color 0.1s;
	}

	.cluster-close:hover {
		color: #f18c34;
	}

	.cluster-list {
		margin: 0;
		padding: 0;
		list-style: none;
		overflow-y: auto;
		scrollbar-width: thin;
		scrollbar-color: rgba(241, 140, 52, 0.3) transparent;
	}

	.cluster-item {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		width: 100%;
		padding: 0.55rem 0.9rem;
		border: 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
		background: transparent;
		color: #ffffff;
		text-align: left;
		cursor: pointer;
		font: inherit;
		transition: background 0.1s;
	}

	.cluster-item:hover {
		background: rgba(241, 140, 52, 0.12);
	}

	.cluster-item:last-child {
		border-bottom: 0;
	}

	.cluster-item-name {
		font-size: 0.84rem;
		line-height: 1.3;
		text-transform: lowercase;
	}

	.cluster-item-country {
		font-size: 0.66rem;
		color: rgba(242, 230, 210, 0.56);
		text-transform: lowercase;
	}

	.fallback {
		position: absolute;
		inset: 1rem;
		display: grid;
		place-items: center;
		padding: 1.5rem;
		text-align: center;
		color: #f2e6d2;
		background: rgba(0, 0, 0, 0.9);
	}

	.fallback p {
		margin: 0.4rem 0;
	}

	.debug-panel {
		position: absolute;
		bottom: 1rem;
		right: 1rem;
		background: rgba(0, 0, 0, 0.75);
		backdrop-filter: blur(10px);
		border: 1px solid rgba(241, 140, 52, 0.3);
		border-radius: 2px;
		z-index: 10;
		pointer-events: auto;
	}

	.debug-toggle {
		display: block;
		width: 100%;
		padding: 0.5rem 0.75rem;
		border: 0;
		background: transparent;
		color: rgba(242, 230, 210, 0.7);
		font-size: 0.65rem;
		text-transform: lowercase;
		cursor: pointer;
		font: inherit;
		text-align: left;
		transition: color 0.1s;
	}

	.debug-toggle:hover {
		color: #f18c34;
	}

	.debug-info {
		padding: 0.5rem 0.75rem;
		border-top: 1px solid rgba(241, 140, 52, 0.2);
		font-size: 0.62rem;
		font-family: 'Courier New', monospace;
		color: rgba(242, 230, 210, 0.8);
	}

	.debug-row {
		display: flex;
		gap: 0.5rem;
		margin: 0.2rem 0;
		justify-content: space-between;
	}

	.debug-label {
		color: rgba(242, 230, 210, 0.6);
		min-width: 10rem;
	}

	.debug-value {
		color: #f18c34;
		font-weight: 500;
		text-align: right;
		min-width: 4rem;
	}

</style>
