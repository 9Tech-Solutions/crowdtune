# Neon Auth setup runbook (Phase 8a)

This is a one-time manual step. After it, paste the values into `.env` at the workspace root and tell the dev
loop to apply migration `20260510145536_grant_neon_auth_users_sync`.

## 1. Enable Neon Auth in the console

1. Open [console.neon.tech](https://console.neon.tech) and select the CrowdTune project.
2. In the left sidebar, click **Auth**.
3. Click **Enable Neon Auth**. (If the button is missing, the feature may not be GA yet in your region; ask
   support to flag your project.)
4. After enable completes the dashboard shows the **Auth URL**.

## 2. Configure providers

In **Auth -> Providers**, enable:

- **Email + Password** (or Email OTP - either works with `@neondatabase/auth-ui`)
- **Google** (paste a Google OAuth client ID + secret from `console.cloud.google.com -> APIs & Services -> Credentials`)
- **Spotify** (paste a Spotify OAuth client ID + secret from `developer.spotify.com/dashboard`)
  - Add the Neon Auth callback URL Neon shows you to the Spotify app's allowed redirect URIs

If Spotify is not listed as a built-in provider in Neon Auth, leave it for Phase 9 and use only Email + Google
for now. Phase 9 will wire Spotify OAuth ourselves and link it to the Neon Auth user.

## 3. Capture the four values into `.env`

| Var | Value | Where to find |
|---|---|---|
| `NEON_AUTH_URL` | the full Auth URL shown on the dashboard | Auth -> Configuration -> Auth URL |
| `NEON_AUTH_JWKS_URL` | `${NEON_AUTH_URL}/.well-known/jwks.json` | append the `/.well-known/jwks.json` path |
| `NEON_AUTH_ISSUER` | the **origin** of `NEON_AUTH_URL` (scheme + host, no path) | parse from `NEON_AUTH_URL` |
| `VITE_NEON_AUTH_URL` | identical to `NEON_AUTH_URL` | Vite needs the `VITE_` prefix to expose it to the bundle |

`NEON_AUTH_AUDIENCE` stays at the default `crowdtune` unless Neon Auth's console exposes an explicit
audience setting.

If you are unsure about the issuer, leave `NEON_AUTH_ISSUER` blank for the first boot and watch the API logs.
The first failed JWT validation will print the actual `iss` claim from the rejected token (the middleware
returns it in the error message). Paste that exact string into `.env` and restart.

## 4. Apply the migration

After Neon Auth is enabled, the `neon_auth` schema and `neon_auth.users_sync` table become available.
Apply the granting migration:

```bash
cd infra/migrations
URL=$(grep '^DATABASE_URL_DIRECT=' ../../.env | cut -d= -f2-)
goose -dir . postgres "$URL" up
```

If it errors with `neon_auth schema is missing` you have not yet finished step 1 above.

## 5. Restart the API

```bash
cd apps/api
go build -o bin/api ./cmd/api && ./bin/api
```

The startup log should now read `auth middleware live` with your issuer and audience. Without `JWKS_URL`
the API logs `Neon Auth JWKS_URL not set; protected /api/* endpoints disabled`.

## 6. Smoke test

Sign up via the React app at <http://localhost:5173/sign-up>, copy the bearer token from devtools network tab
of any signed-in request, and:

```bash
curl -H "Authorization: Bearer <token>" http://localhost:8080/api/me
# -> {"user_id":"...","email":"...","role":"authenticated"}
```

A 401 with `code: invalid_token` and a `message` containing `iss not satisfied` means `NEON_AUTH_ISSUER` is
wrong; look at the message for the expected value and update `.env`.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| API logs `Neon Auth JWKS_URL not set` | `NEON_AUTH_JWKS_URL` empty in `.env` | Paste the JWKS URL and restart |
| 401 `code: invalid_token`, message mentions issuer | wrong origin pasted | Copy the `iss` claim from the rejected token and update |
| 401 `code: invalid_token`, message mentions audience | Neon Auth issues tokens with a different `aud` | Set `NEON_AUTH_AUDIENCE` to whatever Neon emits, or leave blank to skip aud check |
| 401 `code: missing_bearer` | frontend not attaching token | Confirm the user is signed in; check `apps/web/src/api/client.ts` is used in the call site |
| Migration errors `neon_auth schema is missing` | Phase 8a step 1 not completed | Enable Neon Auth in the console, then re-run goose |
| `pgxpool: SSL is not enabled` | `DATABASE_URL` missing `?sslmode=require` | Re-copy from Neon dashboard, the URLs there always include sslmode |
