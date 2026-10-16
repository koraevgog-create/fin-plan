# Secure sync deployment (Cloudflare Worker)

The private data repository is `koraevgog-create/gpro-command-data`. The website is static GitHub Pages. **No secret belongs in the public repository or browser.**

## Deployment
1. Create a Cloudflare Worker and paste `worker/gpro-sync.js` as its source.
2. Set Worker **secrets** `GITHUB_TOKEN`, `GPRO_PASSWORD`, `SESSION_SECRET`. `GITHUB_TOKEN` must be a fine-grained token limited to the **private** `gpro-command-data` repository with Contents read/write. Use a long unique password and a 32+ character random session secret. Never share these secrets in chat or commit them.
3. Set `CORS_ORIGIN` to `https://koraevgog-create.github.io`.
4. The Worker provides `POST /auth`, `GET /state`, `PUT /state`. The last one uses the current GitHub blob SHA as an optimistic concurrency check and returns 409 on conflict.
5. Before enabling client sync, set the Worker URL in the site configuration. This stage does **not** automatically activate sync or expose secrets.
6. Turn on Cloudflare rate limiting / bot protection for `/auth` before production. Password-only auth is a starter solution; migrate to a managed identity provider / passkeys for production.

## Safety
- Token never goes to GitHub Pages. Worker keeps token server-side.
- A user password is exchanged for an 8-hour signed token; do not store it persistently in the browser.
- Do not use a publicly readable state JSON.
- Back up state JSON before migration; conflicts must never silently overwrite newer versions.
- The current site is **still local-only** until the Worker is deployed and client integration is configured.
