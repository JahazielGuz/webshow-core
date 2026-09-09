# webshow-core

System of record for [webshow](https://github.com/JahazielGuz/webshow-infra) — owns users,
catalogue, subscriptions, ratings, and watch history.

**Node.js · Express 5 · TypeScript**

## Running locally

```bash
npm install
npm run dev
```

Serves on `:3001`. `GET /health` reports process status.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Typechecker and hot-reloading server, side by side |
| `npm run build` | Typecheck and emit to `dist/` |
| `npm start` | Run the built output (this is what the container runs) |
| `npm run typecheck` | Typecheck only — the command CI runs |
