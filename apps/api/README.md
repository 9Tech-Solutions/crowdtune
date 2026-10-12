# CrowdTune API

Go, Gin, pgx, and sqlc backend. The [root README](../../README.md) covers environment setup, database
migrations, and starting the application.

## Layout

- `cmd/api`: server startup and route registration.
- `cmd/probe`: API probe utility.
- `internal/auth`: JWT validation and identity helpers.
- `internal/config`: environment configuration.
- `internal/handlers`: HTTP handlers and their tests.
- `internal/db/queries`: SQL query definitions.
- `internal/db/sqlc`: committed generated database code.
- `internal/oapi`: committed generated API code.
- `internal/spotify` and `internal/tokencrypto`: Spotify credentials and token encryption.
- `internal/music`: provider catalog clients and metadata mapping.
- `openapi.yaml`: API contract.

## Development

Run these commands from `apps/api`:

```sh
go run ./cmd/api
go vet ./...
go build ./...
go test ./... -race -count=1
```

`go run` starts the server; it does not watch files. The Makefile provides equivalent build, test,
generation, and migration helpers when Make is installed.

## Adding an endpoint

Follow the [contribution guide](../../.github/CONTRIBUTING.md):

1. Update `openapi.yaml`.
2. Regenerate server stubs with `make openapi`.
3. Create schema changes with `goose -dir ../../infra/migrations create <name> sql`.
4. Add SQL queries under `internal/db/queries` and run `make sqlc-gen`.
5. Implement and register the handler, then add tests and run the checks above.

Generation requires `oapi-codegen` and `sqlc` on PATH. Install the former with
`go install github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen@latest`; obtain sqlc from its
[official releases](https://github.com/sqlc-dev/sqlc/releases). Generated Go files are committed.
