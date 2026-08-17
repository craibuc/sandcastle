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

## Endpoints

| Method | Path          | Description        |
| ------ | ------------- | ------------------ |
| GET    | `/health`     | Health check       |
| GET    | `/users`      | List users (paginated, filterable) |
| GET    | `/users/:id`  | Get a user by id   |
| POST   | `/users`      | Create a user      |
| PUT    | `/users/:id`  | Replace a user     |
| PATCH  | `/users/:id`  | Partially update a user |
| DELETE | `/users/:id`  | Delete a user      |

### Listing, pagination & filtering

`GET /users` accepts optional query parameters (validated via JSON schema and
documented in Swagger):

| Param    | Type    | Default | Notes                                        |
| -------- | ------- | ------- | -------------------------------------------- |
| `limit`  | integer | `20`    | 1–100; maximum rows to return                |
| `offset` | integer | `0`     | rows to skip (for paging)                    |
| `name`   | string  | —       | partial, case-insensitive name filter        |

```bash
curl 'http://localhost:3000/users?limit=2&offset=1'
curl 'http://localhost:3000/users?name=alan'
```

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
  server.ts                  # entrypoint
```

## Swapping in a real SQL Server

The repository talks to the injected database via the same
`request().input().query()` calls the real `mssql` `ConnectionPool` exposes.
To go live, install `mssql`, create a real pool, and pass it into `buildApp`
in place of `DummyMssqlDatabase`.
