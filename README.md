# AI Boardroom

Webová aplikace, kde uživatel zadá **1 prompt** a systém:

- spustí **interní debatu agentů**,
- čeká na **schválení**,
- následně vygeneruje **reálné soubory** (bundle) + **preview** + **ZIP**.

V repu jsou dvě běhové varianty:

- **Netlify-only (doporučeno pro start)**: API běží jako **Netlify Functions** (persist přes Netlify Blobs).
- **Node server**: `apps/api` (Express) pro běh mimo Netlify.

## Spuštění (dev)

```bash
npm install
npm install --prefix apps/web
npm install --prefix apps/api

npm run dev
```

- Web: `http://localhost:5173/`
- API: `http://localhost:8787/`

## Produkční build / start

```bash
npm run build
npm run start
```

API v produkci umí servovat i build webu (pokud existuje `apps/web/dist`).

## Docker

```bash
docker compose up --build
```

Aplikace poběží na `http://localhost:8787/`.

## API (rychlý přehled)

- `POST /api/runs` – vytvoří run (debata začne hned)
- `POST /api/runs/:id/approve` – schválí a vygeneruje soubory + zip
- `GET /api/runs/:id/download` – stáhne ZIP
- `GET /preview/:id/` – preview (preferuje `preview/index.html`, jinak `index.html`)

Netlify-only:

- `/api/*` routy obsluhuje `netlify/functions/api.js` (přes `netlify.toml` redirects)
- `GET /api/runs` – list runů (z Netlify Blobs)

Dokumenty:

- `POST /api/docs/summarize` (form-data `file`) – vrátí JSON summary
- `POST /api/docs/export?format=html|json|csv|xlsx` – export

