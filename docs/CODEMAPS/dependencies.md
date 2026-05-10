<!-- Generated: 2026-05-10 | Files scanned: 4 | Token estimate: ~400 -->

# External Dependencies

## Live services

| Service | Purpose | Status |
|---|---|---|
| [Neon](https://neon.tech) Postgres | primary data store | URL placeholder in `.env.example`, not yet provisioned |
| [Neon Auth](https://neon.com/docs/auth/overview) (Better-Auth-backed) | identity, JWT issuance, JWKS verification, `neon_auth."user"` schema | Phase 8 (8b-8f code-complete; 8a manual provisioning still pending — see `docs/setup/neon-auth.md`) |
| (future) Spotify Web API + Web Playback SDK | host-side playback engine | Phase 9; clean-room port from Festify reference |
| (future) PromptPay / Stripe TH | pay-per-track | Phase 11 |
| (future) Sentry / equivalent | error tracking | not yet wired; Festify uses raven-js (deprecated) |

## Frontend runtime libs (apps/web)

| Library | Version | Role |
|---|---|---|
| react / react-dom | 19.2.x | UI |
| zustand | 5.0.x | client state |
| @tanstack/react-router | 1.169.x | routing |
| @tanstack/react-query | 5.100.x | server state |
| @tailwindcss/vite + tailwindcss | 4.3.x | styling |
| @neondatabase/neon-js | 0.6.0-beta | Neon Auth client (Better-Auth-based) |
| @neondatabase/auth-ui | 0.2.0-beta | prebuilt sign-in/up React components |

## Frontend dev libs

| Library | Version | Role |
|---|---|---|
| vite | 8.0.x | bundler / dev server |
| typescript | 6.0.x | typecheck |
| vitest + @testing-library/* | 4.1.x / 16.x | unit tests |
| openapi-typescript | 7.13.x | TS client types from OpenAPI |
| @tanstack/router-plugin | 1.167.x | route codegen (when routes exist) |

## Backend runtime libs (apps/api)

| Library | Role |
|---|---|
| github.com/gin-gonic/gin | HTTP router |
| github.com/jackc/pgx/v5 + pgxpool | Postgres driver |
| github.com/golang-jwt/jwt/v5 | JWT parser + claim validators |
| github.com/MicahParks/keyfunc/v3 | cached, auto-refreshing remote JWKS resolver |
| github.com/oapi-codegen/runtime | runtime support for oapi-codegen output |
| github.com/caarlos0/env/v11 | env parsing |
| github.com/joho/godotenv | local dev env loader |
| github.com/pressly/goose/v3 | migration runtime |
| github.com/stretchr/testify | tests |
| log/slog (stdlib) | structured logging |

## Backend dev tools (binaries on PATH)

| Tool | Install |
|---|---|
| goose | `go install github.com/pressly/goose/v3/cmd/goose@latest` |
| oapi-codegen | `go install github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen@latest` |
| sqlc | Manual: <https://github.com/sqlc-dev/sqlc/releases> (Windows go-install fails on TDM-GCC) |
| air | optional, `go install github.com/air-verse/air@latest` |
| golangci-lint | <https://golangci-lint.run/welcome/install/> |

## AI tooling

| Tool | Role |
|---|---|
| [code-review-graph](https://github.com/tirth8205/code-review-graph) | MCP server, Tree-sitter index of the codebase, 28 review tools |
| ECC plugin agents | code-reviewer, typescript-reviewer, go-reviewer, security-reviewer, architect (loaded from global) |
| Project-local agents | festify-translator, react-component-author, gin-handler-author, goose-migration-author |
