import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { DummyMssqlDatabase } from './db/dummy-mssql.js';

describe('User REST API', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = buildApp({ database: new DummyMssqlDatabase() });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /health returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('GET /users returns the list of users', async () => {
    const res = await app.inject({ method: 'GET', url: '/users' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(3);
  });

  it('GET /users/:id returns a single user', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/1' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: 1 });
  });

  it('GET /users/:id returns 404 for an unknown user', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/9999' });
    expect(res.statusCode).toBe(404);
  });

  it('POST /users creates a user and returns 201 with Location', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/users',
      payload: { name: 'Ada Lovelace', email: 'ada@example.com' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toMatchObject({ name: 'Ada Lovelace', email: 'ada@example.com' });
    expect(res.headers.location).toBe(`/users/${body.id}`);
  });

  it('POST /users rejects an invalid payload with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/users',
      payload: { name: 'No Email' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('PUT /users/:id updates an existing user', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/users/1',
      payload: { name: 'Changed', email: 'changed@example.com' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: 1, name: 'Changed', email: 'changed@example.com' });
  });

  it('PUT /users/:id returns 404 for an unknown user', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/users/9999',
      payload: { name: 'x', email: 'x@example.com' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('PATCH /users/:id partially updates an existing user', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/1',
      payload: { name: 'Patched' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: 1, name: 'Patched', email: 'grace@example.com' });
  });

  it('PATCH /users/:id returns 404 for an unknown user', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/9999',
      payload: { name: 'x' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('PATCH /users/:id rejects an invalid payload with 400', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/1',
      payload: { name: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('DELETE /users/:id removes a user and returns 204', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/users/2' });
    expect(res.statusCode).toBe(204);
    const check = await app.inject({ method: 'GET', url: '/users/2' });
    expect(check.statusCode).toBe(404);
  });

  it('DELETE /users/:id returns 404 for an unknown user', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/users/9999' });
    expect(res.statusCode).toBe(404);
  });

  it('exposes an OpenAPI/Swagger document at /docs/json', async () => {
    const res = await app.inject({ method: 'GET', url: '/docs/json' });
    expect(res.statusCode).toBe(200);
    const spec = res.json();
    expect(spec.openapi).toBeDefined();
    expect(spec.paths['/users']).toBeDefined();
    expect(spec.paths['/users/{id}']).toBeDefined();
  });
});
