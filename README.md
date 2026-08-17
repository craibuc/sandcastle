# MSSQL REST API

A REST API built with [Fastify](https://fastify.dev/) and TypeScript, backed by a
**dummy mssql database** — an in-memory stand-in that emulates the `mssql`
driver's `request().input().query()` interface so the data-access code is written
exactly as it would be against a real SQL Server.

## Features

- **Fastify** HTTP server with JSON-schema request/response validation
- **Dummy mssql database** returning `{ recordset, rowsAffected }` result shapes
- **Swagger / OpenAPI** documentation served at `/docs`
- **Full TypeScript** with strict typechecking (`npm run typecheck`)
- **Vitest** unit tests written red → green → refactor

## Getting started

```bash
npm install
npm run dev      # start with hot reload (tsx)
# or
npm run build && npm start
```

The server listens on `http://localhost:3000` (override with `PORT` / `HOST`).

- Swagger UI: `http://localhost:3000/docs`
- OpenAPI JSON: `http://localhost:3000/docs/json`

### Database configuration

Connection settings are resolved from the environment by `loadDbConfig()` into
an `mssql`-shaped config object, so swapping the dummy database for a real
`ConnectionPool` is `new sql.ConnectionPool(loadDbConfig())` with no call-site
changes. Bad values (e.g. an out-of-range port or negative pool size) throw at
startup rather than failing later as an opaque connection error.

| Variable                      | Default     | Notes                                   |
| ----------------------------- | ----------- | --------------------------------------- |
| `DB_SERVER`                   | `localhost` | SQL Server host                         |
| `DB_PORT`                     | `1433`      | TCP port (1–65535)                      |
| `DB_USER` / `DB_PASSWORD`     | —           | SQL auth credentials                    |
| `DB_NAME`                     | `master`    | Database name                           |
| `DB_ENCRYPT`                  | `true`      | TLS encryption (`false` to disable)     |
| `DB_TRUST_SERVER_CERTIFICATE` | `false`     | Trust a self-signed server cert         |
| `DB_POOL_MAX`                 | `10`        | Max pooled connections                  |
| `DB_POOL_MIN`                 | `0`         | Min pooled connections                  |
| `DB_POOL_IDLE_TIMEOUT_MS`     | `30000`     | Idle connection eviction (ms)           |

## Endpoints

| Method | Path          | Description        |
| ------ | ------------- | ------------------ |
| GET    | `/health`     | Liveness/readiness probe (checks DB connectivity) |
| GET    | `/users`      | List users (paginated, filterable) |
| GET    | `/users/:id`  | Get a user by id   |
| POST   | `/users`      | Create a user      |
| PUT    | `/users/:id`  | Replace a user     |
| PATCH  | `/users/:id`  | Partially update a user |
| DELETE | `/users/:id`  | Delete a user      |

### Health probe

`GET /health` runs a trivial `SELECT 1` against the database. It returns `200`
with `{ "status": "ok", "database": "up" }` when the query succeeds, or `503`
with `{ "status": "error", "database": "down" }` when the database is
unreachable — suitable as a container/orchestrator readiness check.

### Pool lifecycle & graceful shutdown

The database exposes an `mssql`-shaped pool lifecycle: `connect()` opens the
pool (resolving to the pool itself) and `close()` releases it — after which
`request()` throws, so no further queries are served. `server.ts` calls
`connect()` before it starts listening, and wires `SIGINT`/`SIGTERM` to a
graceful shutdown that calls `app.close()`. Fastify's `onClose` hook closes the
pool as part of that shutdown, so an orderly stop exits `0` and a failed close
exits `1`.

### Listing, pagination & filtering

`GET /users` accepts optional query parameters (validated via JSON schema and
documented in Swagger):

| Param    | Type    | Default | Notes                                        |
| -------- | ------- | ------- | -------------------------------------------- |
| `limit`  | integer | `20`    | 1–100; maximum rows to return                |
| `offset` | integer | `0`     | rows to skip (for paging)                    |
| `name`   | string  | —       | partial, case-insensitive name filter        |
| `sort`   | string  | `id`    | field to sort by: `id`, `name` or `email`    |
| `order`  | string  | `asc`   | sort direction: `asc` or `desc`              |

`sort`/`order` are whitelisted and interpolated into the `ORDER BY` clause,
since SQL Server cannot bind an `ORDER BY` target as a query parameter.

The response carries an **`X-Total-Count`** header with the total number of
users matching the filter, independent of the pagination window — so clients
can render "showing 1–20 of _N_" without an extra request.

It also returns an **RFC 5988 `Link`** header with `first`/`prev`/`next`/`last`
URLs (`prev`/`next` present only when such a page exists), preserving the active
`name`/`sort`/`order` filters so clients can walk pages without rebuilding URLs:

```
Link: </users?limit=2&offset=0>; rel="first", </users?limit=2&offset=2>; rel="next", </users?limit=2&offset=2>; rel="last"
```

```bash
curl -i 'http://localhost:3000/users?limit=2&offset=1'   # X-Total-Count: 3
curl 'http://localhost:3000/users?name=alan'
curl 'http://localhost:3000/users?sort=name&order=desc'
```

### Unique email constraint

`Email` is unique. The dummy database emulates SQL Server's `UNIQUE KEY`
constraint (case-insensitive, error `2627`), so a `POST`, `PUT` or `PATCH`
that would duplicate another user's email is rejected with **`409 Conflict`**:

```bash
curl -i -X POST http://localhost:3000/users \
  -H 'content-type: application/json' \
  -d '{"name":"Clone","email":"grace@example.com"}'   # 409 Conflict
```

An update that keeps the user's _own_ email still succeeds.

## Scripts

| Script              | Description                     |
| ------------------- | ------------------------------- |
| `npm run dev`       | Start with hot reload           |
| `npm run build`     | Compile TypeScript to `dist/`   |
| `npm start`         | Run the compiled server         |
| `npm run typecheck` | Type-check without emitting      |
| `npm test`          | Run the Vitest suite            |

## Project layout

```
src/
  db/dummy-mssql.ts          # in-memory mssql-shaped database
  repositories/              # data access using the dummy db
  routes/                    # Fastify route plugins + JSON schemas
  app.ts                     # buildApp(): wires swagger + routes
  shutdown.ts                # SIGINT/SIGTERM → graceful app.close()
  server.ts                  # entrypoint
```

## Swapping in a real SQL Server

The repository talks to the injected database via the same
`request().input().query()` calls the real `mssql` `ConnectionPool` exposes.
To go live, install `mssql`, create a real pool, and pass it into `buildApp`
in place of `DummyMssqlDatabase`.
