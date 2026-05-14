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
	const worldUp = new THREE.Vector3(0, 1, 0);
	const fallbackUp = new THREE.Vector3(1, 0, 0);
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
	let clusterLocalIndexByIndex: number[] = [];
	let clusterSizeByKey = new Map<string, number>();
	let baseMarkerPositions: THREE.Vector3[] = [];
	let activeExpandedClusterKey: string | null = null;
	let pointerDownX = 0;
	let pointerDownY = 0;
	let pointerIsActive = false;
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

		for (let index = 0; index < visibleStations.length; index += 1) {
			const station = visibleStations[index];
			const isSelected = selectedStation?.id === station.id;
			const isHovered = hoveredIndex === index;
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

	function getClusterOffset(localIndex: number) {
		if (localIndex === 0) {
			return { angle: 0, distance: 0 };
		}

		let ring = 1;
		let remaining = localIndex - 1;

		while (remaining >= ring * 6) {
			remaining -= ring * 6;
			ring += 1;
		}

		const slots = ring * 6;
		const angle = (remaining / slots) * Math.PI * 2 + ((ring + 1) % 2) * (Math.PI / slots);
		return { angle, distance: ring * 0.018 };
	}

	function getMarkerPosition(station: RadioStation, localClusterIndex: number) {
		const basePoint = latLonToCartesian(station.lat, station.lon, radius, 0.04);
		const origin = new THREE.Vector3(basePoint.x, basePoint.y, basePoint.z);
		const normal = origin.clone().normalize();
		const tangent = new THREE.Vector3().crossVectors(worldUp, normal);

		if (tangent.lengthSq() < 1e-6) {
			tangent.crossVectors(fallbackUp, normal);
		}

		tangent.normalize();
		const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();
		const { angle, distance } = getClusterOffset(localClusterIndex);

		if (distance === 0) {
			return origin;
		}

		return origin
			.clone()
			.addScaledVector(tangent, Math.cos(angle) * distance)
			.addScaledVector(bitangent, Math.sin(angle) * distance)
			.addScaledVector(normal, 0.004 + distance * 0.12);
	}

	function getSelectedClusterKey() {
		if (!selectedStation) {
			return null;
		}

		return toClusterKey(selectedStation.lat, selectedStation.lon);
	}

	function getExpandedClusterKey(hoverIndex = hoveredIndex) {
		if (hoverIndex >= 0) {
			return clusterKeyByIndex[hoverIndex] ?? null;
		}

		return getSelectedClusterKey();
	}

	function applyMarkerLayout(expandedClusterKey: string | null) {
		if (!markerMesh || !markerHitMesh) {
			return;
		}

		for (let index = 0; index < visibleStations.length; index += 1) {
			const station = visibleStations[index];
			const clusterKey = clusterKeyByIndex[index];
			const localClusterIndex = clusterLocalIndexByIndex[index];
			const clusterSize = clusterSizeByKey.get(clusterKey) ?? 1;
			const point =
				expandedClusterKey && clusterKey === expandedClusterKey && clusterSize > 1
					? getMarkerPosition(station, localClusterIndex)
					: baseMarkerPositions[index];
			const voteWeight = Math.min(station.votes / 600, 1);
			const markerScale = 0.4 + voteWeight * 0.28;
			const hitScale = 0.95 + voteWeight * 0.38;

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
		activeExpandedClusterKey = expandedClusterKey;
	}

	function rebuildMarkers() {
		if (!earthGroup) {
			return;
		}

		visibleStations = stations.slice();
		clusterKeyByIndex = [];
		clusterLocalIndexByIndex = [];
		clusterSizeByKey = new Map<string, number>();
		baseMarkerPositions = [];
		hoveredIndex = -1;
		activeExpandedClusterKey = null;
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
			const clusterKey = toClusterKey(station.lat, station.lon);
			const localClusterIndex = clusterSizeByKey.get(clusterKey) ?? 0;
			clusterKeyByIndex[index] = clusterKey;
			clusterLocalIndexByIndex[index] = localClusterIndex;
			clusterSizeByKey.set(clusterKey, localClusterIndex + 1);
			const basePoint = latLonToCartesian(station.lat, station.lon, radius, 0.04);
			baseMarkerPositions[index] = new THREE.Vector3(basePoint.x, basePoint.y, basePoint.z);
		}

		earthGroup.add(markerMesh);
		earthGroup.add(markerHitMesh);
		applyMarkerLayout(getExpandedClusterKey(-1));
		updateMarkerColors();
	}

	function getIntersection(event: PointerEvent) {
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
		if (hoveredIndex === -1) {
			return;
		}

		hoveredIndex = -1;
		onhover?.(null);
		applyMarkerLayout(getSelectedClusterKey());
		updateMarkerColors();
	}

	function handlePointerMove(event: PointerEvent) {
		const nextIndex = getIntersection(event);
		const nextExpandedClusterKey =
			typeof nextIndex === 'number' ? clusterKeyByIndex[nextIndex] : getSelectedClusterKey();

		if (nextExpandedClusterKey !== activeExpandedClusterKey) {
			applyMarkerLayout(nextExpandedClusterKey);
		}

		if (nextIndex === hoveredIndex) {
			return;
		}

		hoveredIndex = nextIndex ?? -1;
		onhover?.(hoveredIndex >= 0 ? visibleStations[hoveredIndex] : null);
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

		animationFrame = window.requestAnimationFrame(animate);
		controls?.update();
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
			controls.enableDamping = true;
			controls.enablePan = false;
			controls.autoRotate = true;
			controls.autoRotateSpeed = 0.004;
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
		const nextExpandedClusterKey = getExpandedClusterKey();
		if (nextExpandedClusterKey !== activeExpandedClusterKey) {
			applyMarkerLayout(nextExpandedClusterKey);
		}
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
	</div>

	{#if webglError}
		<div class="fallback">
			<p>{webglError}</p>
			<p>Try a modern browser with WebGL enabled.</p>
		</div>
	{/if}

	<div class="legend">Drag to orbit, scroll to zoom, click a marker to inspect a station.</div>
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

	.legend {
		position: absolute;
		left: 1.25rem;
		bottom: 1.25rem;
		padding: 0;
		border-radius: 0;
		background: transparent;
		border: 0;
		color: rgba(242, 230, 210, 0.56);
		font-size: 0.72rem;
		letter-spacing: 0;
		font-family:
			ui-monospace, 'SFMono-Regular', 'SF Mono', Menlo, Monaco, Consolas, 'Liberation Mono',
			monospace;
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

	@media (max-width: 50rem) {
		.legend {
			left: 1rem;
			right: 1rem;
			bottom: 1rem;
			border-radius: 1rem;
		}
	}
</style>
