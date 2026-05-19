# Radio World

Radio World is a SvelteKit app that pulls geo-tagged internet radio stations from the Radio Browser directory and projects them onto an interactive 3D globe.

## Stack

- SvelteKit with TypeScript
- `pnpm` for dependency management
- Three.js for the globe and marker rendering
- Vitest, ESLint, and Prettier for verification

## Data pipeline

The app requests all geo-tagged, non-broken stations from the Radio Browser API, normalizes the fields server-side, and caches the result in memory for 30 minutes. Only safe `http` and `https` URLs are forwarded to the client.

## Scripts

```bash
pnpm dev
pnpm check
pnpm lint
pnpm test
pnpm build
pnpm audit
```
