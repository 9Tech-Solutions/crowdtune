<!-- Generated: 2026-05-10 | Files scanned: 5 | Token estimate: ~450 -->

# Frontend (apps/web)

## Page tree (current)

Phase 0 skeleton: a single root component renders a heading. No routes wired yet. TanStack Router is installed but not configured; will be added when the first real route lands.

```
src/main.tsx           ReactDOM.createRoot, StrictMode wrapper
  └── src/App.tsx      placeholder heading + paragraph in Tailwind classes
```

## State management

Three layers, each with a clear lane:

| Concern | Tool | Pattern |
|---|---|---|
| Client UI state | Zustand 5 | one store slice per concern in `src/stores/` |
| Server state | TanStack Query 5 | one hook per resource in `src/queries/` |
| URL state | TanStack Router | file-based routes in `src/routes/` (when added) |

No Redux. No useContext for global state. No `fetch` calls outside TanStack Query hooks.

## Build pipeline

```
src/*.tsx ── tsc -b ── (typecheck only) ── vite build ── dist/
                                            │
                                            ├── @vitejs/plugin-react        JSX, fast refresh
                                            └── @tailwindcss/vite           Tailwind 4 inline
```

Production bundle (Phase 0): 191 KB JS / 60 KB gzipped, 6.7 KB CSS / 2 KB gzipped.

## Test pipeline

```
src/**/*.test.tsx ── vitest run ── jsdom env ── @testing-library/react
```

`src/test/setup.ts` registers jest-dom matchers globally.

## Generated code

`src/api/types.ts` is generated from `apps/api/openapi.yaml` via:

```bash
pnpm openapi:gen
```

It is gitignored. Always regenerate after editing the OpenAPI spec.

## Dev proxy

`vite.config.ts` proxies `/api/*` to `http://localhost:8080`, so the React app calls `fetch('/api/healthz')` and Vite forwards to the Gin server in dev.

## Convention checklist

- React 19 function components only.
- Type all public callback props explicitly. Never `any`.
- Tailwind utility classes in JSX. No inline `style` except for genuinely dynamic values.
- One file per public component, kebab-case file names for non-components, PascalCase for components.
