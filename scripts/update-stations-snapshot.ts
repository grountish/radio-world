/**
 * Regenerates the committed offline station snapshot used as a fallback when
 * the live Radio Browser source is unreachable (see
 * `src/lib/server/radio-browser.ts`).
 *
 * Run manually whenever you want to refresh the cached data:
 *
 *   pnpm snapshot:update
 *
 * Then review and commit the updated `src/lib/server/data/stations-snapshot.json`.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadStationCatalog } from '../src/lib/server/station-source';

const here = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = resolve(here, '../src/lib/server/data/stations-snapshot.json');

async function main() {
	// Mirror the full live catalog so the offline fallback is indistinguishable
	// from normal operation. `loadStationCatalog` still supports a `maxStations`
	// cap if the committed file ever needs trimming.
	console.log('Fetching the full station catalog from Radio Browser…');
	const snapshot = await loadStationCatalog();

	await mkdir(dirname(OUTPUT_PATH), { recursive: true });
	await writeFile(OUTPUT_PATH, `${JSON.stringify(snapshot, null, '\t')}\n`, 'utf8');

	console.log(
		`Wrote ${snapshot.stations.length} stations to ${OUTPUT_PATH} (updatedAt ${snapshot.updatedAt}).`
	);
}

main().catch((error: unknown) => {
	console.error('Failed to update station snapshot:', error);
	process.exitCode = 1;
});
