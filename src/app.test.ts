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

  it('GET /users?limit=2 paginates the result', async () => {
    const res = await app.inject({ method: 'GET', url: '/users?limit=2' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(2);
  });

  it('GET /users sets X-Total-Count to the full filtered count, not the page size', async () => {
    const res = await app.inject({ method: 'GET', url: '/users?limit=2' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(2);
    expect(res.headers['x-total-count']).toBe('3');
  });

  it('GET /users sets an RFC-5988 Link header with next/last but no prev on the first page', async () => {
    const res = await app.inject({ method: 'GET', url: '/users?limit=2&offset=0' });
    expect(res.statusCode).toBe(200);
    const link = res.headers.link as string;
    expect(link).toContain('rel="first"');
    expect(link).toContain('offset=2>; rel="next"');
    expect(link).toContain('rel="last"');
    expect(link).not.toContain('rel="prev"');
  });

  it('GET /users Link header preserves the name filter across pages', async () => {
    const res = await app.inject({ method: 'GET', url: '/users?limit=1&offset=0&name=a' });
    expect(res.statusCode).toBe(200);
    expect(res.headers.link as string).toContain('name=a');
  });

  it('GET /users?name= reflects the filtered count in X-Total-Count', async () => {
    const res = await app.inject({ method: 'GET', url: '/users?name=alan' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-total-count']).toBe('1');
  });

  it('GET /users?offset=1 skips the first user', async () => {
    const res = await app.inject({ method: 'GET', url: '/users?offset=1&limit=10' });
    expect(res.statusCode).toBe(200);
    expect(res.json()[0].id).toBe(2);
  });

  it('GET /users?name= filters by partial name', async () => {
    const res = await app.inject({ method: 'GET', url: '/users?name=alan' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe('Alan Turing');
  });

  it('GET /users rejects an out-of-range limit with 400', async () => {
    const res = await app.inject({ method: 'GET', url: '/users?limit=0' });
    expect(res.statusCode).toBe(400);
  });

  it('GET /users?sort=name&order=desc returns users sorted by name descending', async () => {
    const res = await app.inject({ method: 'GET', url: '/users?sort=name&order=desc' });
    expect(res.statusCode).toBe(200);
    expect(res.json().map((u: { name: string }) => u.name)).toEqual([
      'Katherine Johnson',
      'Grace Hopper',
      'Alan Turing',
    ]);
  });

  it('GET /users rejects an unknown sort field with 400', async () => {
    const res = await app.inject({ method: 'GET', url: '/users?sort=ssn' });
    expect(res.statusCode).toBe(400);
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

  it('POST /users rejects a malformed email with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/users',
      payload: { name: 'Bad Email', email: 'not-an-email' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('PATCH /users/:id rejects a malformed email with 400', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/1',
      payload: { email: 'not-an-email' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /users rejects a duplicate email with 409', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/users',
      payload: { name: 'Grace Clone', email: 'grace@example.com' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ statusCode: 409, error: 'Conflict' });
  });

  it('PUT /users/:id rejects an email already used by another user with 409', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/users/2',
      payload: { name: 'Alan Turing', email: 'grace@example.com' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('PATCH /users/:id rejects an email already used by another user with 409', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/2',
      payload: { email: 'grace@example.com' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('PUT /users/:id succeeds when keeping the user\'s own email', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/users/1',
      payload: { name: 'Grace Renamed', email: 'grace@example.com' },
    });
    expect(res.statusCode).toBe(200);
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
