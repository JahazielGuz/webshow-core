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

## Deployment

| Piece    | Where                        |
| -------- | ---------------------------- |
| API      | Fly.io, region `iad`         |
| Database | Neon, region `us-east-2`     |
| Live     | https://webshow-core.fly.dev |

Deploying is one command, run from this directory:

```bash
fly deploy
```

It reads the `Dockerfile`, builds on Fly's own builder, pushes the image and rolls the machines.
A local `docker build` is for testing on your machine only and never ships. If you ever pass
`--local-only`, add `--platform linux/amd64`: an Apple Silicon Mac builds arm64 images and Fly's
machines are amd64, so the deploy would be rejected.

`fly status` shows the machines, `fly logs` shows what they are saying.

### Migrations

Run them against Neon **before** deploying, so the schema is ahead of the code rather than
behind it. The connection string is pasted inline and never written to `.env`, which stays
pointed at the local Docker Postgres:

```bash
DATABASE_URL="<neon connection string>" npx prisma migrate deploy --config prisma7.config.ts
```

That ordering holds for additive changes, which is all of them so far. Dropping or renaming a
column reverses it: deploy code that tolerates both shapes first, then migrate.

Never `migrate dev` against a hosted database. It can reset it and it prompts interactively.

### Secrets

Two, and neither is in this repository:

| Secret             | What it is                                              |
| ------------------ | ------------------------------------------------------- |
| `DATABASE_URL`     | The Neon connection string, direct rather than pooled   |
| `AUTH_PRIVATE_JWK` | The Ed25519 signing key, generated fresh for production |

Set them by piping a file so the values stay out of shell history, then delete the file:

```bash
fly secrets import < .env.fly
```

Do not quote the values in that file. Everything after the first `=` is stored literally, so a
wrapping quote becomes part of the secret and the value silently fails to parse.

Changing a secret triggers its own redeploy, so it is not followed by `fly deploy`.

The production signing key is separate from the development one on purpose. A key that has
appeared in a terminal is not a production key. If it ever leaks, mint a new one and set it:
every existing access token stops verifying at once and everyone signs in again.

### Rolling back

`fly releases` lists what has shipped, and `fly deploy --image <ref>` redeploys an earlier one.

### Health checks

Fly polls `GET /health` on the interval in `fly.toml`. It stays dependency-free for the reason
above: a health check that queries the database turns a database blip into a restart loop.

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
