# Contributing to CrowdTune

CrowdTune is in development. Read [LICENSE.md](../LICENSE.md) before using, modifying, or distributing
the source; this repository uses the Sustainable Use License, including branch-specific restrictions.

Discuss larger changes in a GitHub issue first. Keep pull requests focused and describe the problem,
the resulting behavior, and the checks you ran. Use Conventional Commit messages.

## Development

Follow the [root README](../README.md) to install dependencies and configure the services. Run Bun
commands from the repository root; run Go commands from `apps/api`.

Web changes should pass `bun run check:web`, `bun run test:web`, and `bun run build:web`.
API changes should pass `go vet ./...`, `go build ./...`, and `go test ./... -race -count=1`.
Add or update tests when behavior changes.

## Code conventions

- Keep web imports flowing from app/pages through widgets/entities to shared code. Route files bind
  pages to TanStack Router; put behavior in the appropriate page, widget, or shared module.
- Reuse HeroUI components. Use the shared API client for authenticated requests and keep bearer-token
  validation in the API's `internal/auth` package.
- API handlers own HTTP behavior; SQL lives in `internal/db/queries`, and schema changes live in
  `infra/migrations`. Add a new migration instead of editing one applied to a shared environment.
- Update `apps/api/openapi.yaml` when API behavior or payloads change.
- Keep secrets, internal planning material, and local AI configuration out of commits.
- Preserve copyright notices and third-party licenses. Do not copy source from local reference clones
  into CrowdTune. Behavior ports must use independently written specifications and implementation.

## Generated files

Commit `bun.lock` and Go module files when dependencies change. Use `bun run openapi:gen` for web API
types. Route types regenerate before web checks, tests, and builds; generated web files are ignored.
Regenerate the committed Go API and SQL code with `make generate` from `apps/api`; install the
`oapi-codegen` and `sqlc` tools listed in that app's README first.

Internal `docs/`, local AI tooling, reference clones, and reports are private maintainer files and are
not part of the public checkout.
