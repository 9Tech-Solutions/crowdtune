<!-- Generated: 2026-05-11 | Files scanned: 16 | Token estimate: ~700 -->

# Frontend (apps/web)

## Architecture: Feature-Sliced Design (FSD)

`apps/web/src/` is organized into FSD layers. Imports flow **down** only:
`app -> pages -> widgets -> features -> entities -> shared`. A layer never imports from a higher layer.

```
src/
├── app/                Composition root, providers, global styles
│   ├── providers/
│   │   └── NeonAuthProvider.tsx
│   └── styles/
│       └── index.css   single-line @import "@heroui/styles"
├── pages/              Route-level page components
│   ├── home/
│   │   ├── ui/HomePage.tsx + HomePage.test.tsx
│   │   └── index.ts
│   └── auth/
│       ├── ui/AuthPage.tsx
│       └── index.ts
├── widgets/            Reusable composite UI blocks (empty Phase 0)
├── features/           Discrete user-facing features (empty Phase 0)
├── entities/           Domain model components (empty Phase 0)
├── shared/             Cross-cutting utilities, no business logic
│   ├── api/            api() wrapper + ApiError class (bearer attach)
│   ├── auth/           authClient (Neon Auth singleton)
│   └── test/           Vitest setup
├── routes/             TanStack Router file-based routes (FSD exception)
│   ├── __root.tsx      thin: imports NeonAuthProvider from @/app/providers
│   ├── index.tsx       thin: imports HomePage from @/pages/home
│   └── auth/$.tsx      thin: imports AuthPage from @/pages/auth, passes _splat as pathname
├── main.tsx            entry: createRoot, RouterProvider, CSS imports
└── routeTree.gen.ts    auto-generated (gitignored)
```

## Path aliases

`tsconfig.app.json` and `vite.config.ts` agree on these aliases:

| Alias | Resolves to |
|---|---|
| `@/app/*` | `src/app/*` |
| `@/pages/*` | `src/pages/*` |
| `@/widgets/*` | `src/widgets/*` |
| `@/features/*` | `src/features/*` |
| `@/entities/*` | `src/entities/*` |
| `@/shared/*` | `src/shared/*` |

`tsconfig.app.json` uses relative path values (`["./src/app/*"]`) because `baseUrl` is omitted (TS 6+ deprecates `baseUrl`). `vite.config.ts` uses `fileURLToPath(new URL(...))` so the same resolution works at bundle time.

## UI library: HeroUI v3 (no Provider, CSS-themed)

Single import does it all: `@import "@heroui/styles";` in `app/styles/index.css` pulls in Tailwind v4, tw-animate-css, base, components, theme variables, utilities, variants. **No `<HeroUIProvider>`** in v3 - removed from `main.tsx`.

`<html class="dark">` in `index.html` enables dark theme.

Component API surprises vs HeroUI v2:
- `Card.Content` (or `CardContent`), **not** `CardBody`
- Button variant covers visual style: `primary | danger | danger-soft | ghost | outline | secondary | tertiary`. No separate `color` prop, no `solid` variant.
- Button does not accept `href` / `as`. For navigation CTAs, use `buttonVariants({ variant, size })` on a plain `<a>` element.

Runtime helpers: `buttonVariants`, `cardVariants`, `linkVariants` exported from `@heroui/react`.

## Auth UI: Neon Auth (Better-Auth-backed)

- `@/shared/auth` exports `authClient` from `createAuthClient(VITE_NEON_AUTH_URL)`
- `@/app/providers/NeonAuthProvider` wraps children in `NeonAuthUIProvider`, passes TanStack-aware `navigate` + `Link` adapters so SPA navigation works inside the auth UI
- `@/pages/auth/ui/AuthPage` renders `<AuthView pathname={pathname} />` inside a HeroUI Card. The pathname prop is **required** - AuthView does not read the URL itself

## State management lanes

| Concern | Tool | Pattern |
|---|---|---|
| Client UI state | Zustand 5 | `@/shared/stores/use<X>Store.ts` (none yet) |
| Server state | TanStack Query 5 + `api()` wrapper | one hook per resource in `@/shared/queries/` (none yet) |
| URL state | TanStack Router | file-based routes in `src/routes/` |

**Hard rules** (mirror `.claude/rules/project.md`):
- No `fetch` calls in components - go through `@/shared/api`'s `api()` wrapper
- No raw `<a>` for navigation inside the SPA - use TanStack Router `<Link>` (or HeroUI `Link` for styled cases)
- React 19 function components only

## Build pipeline

```
src/**/*.tsx -> tsr generate -> tsc -b -> vite build -> dist/
plugins: tanstackRouter (route codegen), react (JSX, Fast Refresh), tailwindcss (Tailwind 4)
```

Phase 9 production bundle: 1.19 MB JS / 346 KB gzipped, 32 KB CSS / ~5 KB gzipped. Bundle size is dominated by HeroUI + Better Auth UI; code-splitting deferred to a polish pass.

## Test pipeline

```
src/**/*.test.tsx -> vitest run -> jsdom env -> @testing-library/react
```

`src/shared/test/setup.ts` registers jest-dom matchers globally.

## Generated artifacts (gitignored)

- `src/routeTree.gen.ts` - regenerated via `pnpm routes:gen` (or chained inside typecheck/test/build)
- `src/api/types.ts` (planned) - generated from `apps/api/openapi.yaml` via `pnpm openapi:gen`
