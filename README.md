# webshow-core

System of record for [webshow](https://github.com/JahazielGuz/webshow-infra). Owns the
catalogue today; users, ratings, watch history and subscriptions arrive in later slices.

**Node.js 24 · Express 5 · TypeScript · Prisma · Postgres**

## Running locally

Start the database, then the server:

```bash
docker compose up -d
npm install
npm run dev
```

Serves on `:3001`. `GET /health` reports process status and is deliberately dependency-free —
it answers even when the database is unreachable, so a database blip never looks like a dead
service.

## Database

Postgres 17 with the pgvector extension available, run from `docker-compose.yml`.

Copy `.env.example` to `.env` **before the first start**. `POSTGRES_PASSWORD` is read only when
the data volume is first created; changing it afterwards has no effect on an existing database,
and the resulting failure looks like bad credentials with no explanation.

```bash
docker compose up -d      # start
docker compose ps         # wait for "healthy", not just "Up"
docker compose down       # stop, keeping data
docker compose down -v    # stop and DESTROY the volume
```

`down -v` deletes the database. It is the only command here that loses data.

The image is `pgvector/pgvector:pg17` — ordinary Postgres 17 with one extension's files added.
Nothing enables it yet; `CREATE EXTENSION vector` arrives with similarity search. Taking the
image now avoids swapping it later.

## Scripts

| Script                 | Purpose                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `npm run dev`          | Hot-reloading server via `tsx`. Does not typecheck — the editor and `build` do that. |
| `npm run build`        | Typecheck and emit JavaScript to `dist/`                                             |
| `npm start`            | Run the built output from `dist/`                                                    |
| `npm run typecheck`    | Typecheck without emitting                                                           |
| `npm run format`       | Format every file with Prettier                                                      |
| `npm run format:check` | Fail if any file is not formatted (CI runs this)                                     |

## Conventions

ESM throughout, with `module` and `moduleResolution` set to `nodenext`. Relative imports carry a
`.js` extension even in `.ts` files: TypeScript does not rewrite import specifiers, and Node's
ESM resolver does no extension guessing, so the specifier has to name the file that will exist
at runtime.
