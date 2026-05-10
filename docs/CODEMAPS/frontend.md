<!-- Generated: 2026-05-10 | Files scanned: 11 | Token estimate: ~600 -->

# Frontend (apps/web)

## Page tree (current)

TanStack Router file-based routing. The plugin generates `src/routeTree.gen.ts` (gitignored) from
`src/routes/`. `pnpm routes:gen` triggers it manually; `pnpm build` chains it.

```
src/main.tsx                 RouterProvider, module augmentation for typed router
src/routes/__root.tsx        wraps Outlet in NeonAuthProvider
  ├── /                      src/routes/index.tsx -> renders <App />
  ├── /sign-in               src/routes/sign-in.tsx -> <AuthView /> in a Tailwind card
  └── /sign-up               src/routes/sign-up.tsx -> <AuthView /> in a Tailwind card
```

## Auth (Phase 8)

- `src/lib/auth-client.ts`: `createAuthClient(VITE_NEON_AUTH_URL)` from `@neondatabase/neon-js/auth`. Logs a warning at module load if the env is empty.
- `src/providers/NeonAuthProvider.tsx`: wraps children in `NeonAuthUIProvider` with email-OTP + Google + Spotify social providers.
- `src/api/client.ts`: typed `api<T>()` wrapper around `fetch`. Pulls `data.session.token` from `authClient.getSession()` and attaches `Authorization: Bearer <jwt>` to every API call. Throws a typed `ApiError` on 4xx/5xx.

Rule: **no raw `fetch` calls in components** - always go through `api()` so the bearer is attached and `ApiError` lands consistently.

## State management

Three layers, each with a clear lane:

| Concern | Tool | Pattern |
|---|---|---|
| Client UI state | Zustand 5 | one store slice per concern in `src/stores/` |
| Server state | TanStack Query 5 + `api()` wrapper | one hook per resource in `src/queries/` |
| URL state | TanStack Router | file-based routes in `src/routes/` |

No Redux. No useContext for global state. No `fetch` calls outside TanStack Query hooks. Auth session is read directly from `authClient.getSession()` inside the api wrapper, not stored in Zustand.

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
