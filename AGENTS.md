# Working on CrowdTune

Read [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md) for shared development conventions.

- Use Bun workspace commands and the existing Vite+ configuration. Run web checks, tests, and builds from the repository root; run Go checks from apps/api.
- Keep route files thin, reuse HeroUI components, and use the shared API client for authenticated requests.
- Keep JWT validation in internal/auth and preserve the OpenAPI contract when changing endpoints.
- Regenerate committed Go artifacts with the documented tools; do not edit generated code directly.
- Use code-review-graph before source searches when connected; otherwise use bounded source inspection. AI tooling is optional for contributors.
- Keep docs/, .claude/, .mcp.json, reference clones, reports, and secrets local and untracked. Preserve these local files when cleaning the public repository.
- Never copy source from .reference/ into the application. Port behavior through independently written specifications and implementation.
