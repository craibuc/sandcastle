import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { DummyMssqlDatabase } from '../db/dummy-mssql.js';

describe('Product REST API', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = buildApp({ database: new DummyMssqlDatabase() });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /products returns the list of products', async () => {
    const res = await app.inject({ method: 'GET', url: '/products' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(3);
  });

  it('GET /products?limit=2 paginates the result', async () => {
    const res = await app.inject({ method: 'GET', url: '/products?limit=2' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(2);
  });

  it('GET /products sets X-Total-Count to the full filtered count, not the page size', async () => {
    const res = await app.inject({ method: 'GET', url: '/products?limit=2' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(2);
    expect(res.headers['x-total-count']).toBe('3');
  });

  it('GET /products sets an RFC-5988 Link header with next/last but no prev on the first page', async () => {
    const res = await app.inject({ method: 'GET', url: '/products?limit=2&offset=0' });
    expect(res.statusCode).toBe(200);
    const link = res.headers.link as string;
    expect(link).toContain('rel="first"');
    expect(link).toContain('offset=2>; rel="next"');
    expect(link).toContain('rel="last"');
    expect(link).not.toContain('rel="prev"');
  });

  it('GET /products?name= reflects the filtered count in X-Total-Count', async () => {
    const res = await app.inject({ method: 'GET', url: '/products?name=widget' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-total-count']).toBe('1');
  });

  it('GET /products?sort=price&order=desc returns products sorted by price descending', async () => {
    const res = await app.inject({ method: 'GET', url: '/products?sort=price&order=desc' });
    expect(res.statusCode).toBe(200);
    expect(res.json().map((p: { price: number }) => p.price)).toEqual([19.99, 9.99, 4.5]);
  });

  it('GET /products rejects an out-of-range limit with 400', async () => {
    const res = await app.inject({ method: 'GET', url: '/products?limit=0' });
    expect(res.statusCode).toBe(400);
  });

  it('GET /products rejects an unknown sort field with 400', async () => {
    const res = await app.inject({ method: 'GET', url: '/products?sort=color' });
    expect(res.statusCode).toBe(400);
  });

  it('GET /products/:id returns a single product', async () => {
    const res = await app.inject({ method: 'GET', url: '/products/1' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: 1 });
  });

  it('GET /products/:id returns 404 for an unknown product', async () => {
    const res = await app.inject({ method: 'GET', url: '/products/9999' });
    expect(res.statusCode).toBe(404);
  });

  it('POST /products creates a product and returns 201 with Location', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/products',
      payload: { name: 'Sprocket', price: 3.25, description: 'A sprocket' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toMatchObject({ name: 'Sprocket', price: 3.25, description: 'A sprocket' });
    expect(res.headers.location).toBe(`/products/${body.id}`);
  });

  it('POST /products rejects a payload missing required fields with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/products',
      payload: { name: 'No Price' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /products rejects a negative price with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/products',
      payload: { name: 'Bad Price', price: -1, description: 'nope' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('PUT /products/:id updates an existing product', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/products/1',
      payload: { name: 'Changed', price: 7.77, description: 'Changed desc' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: 1, name: 'Changed', price: 7.77, description: 'Changed desc' });
  });

  it('PUT /products/:id returns 404 for an unknown product', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/products/9999',
      payload: { name: 'x', price: 1, description: 'x' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('PATCH /products/:id partially updates an existing product', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/products/1',
      payload: { price: 42 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: 1, name: 'Widget', price: 42 });
  });

  it('PATCH /products/:id returns 404 for an unknown product', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/products/9999',
      payload: { price: 1 },
    });
    expect(res.statusCode).toBe(404);
  });

  it('PATCH /products/:id rejects an invalid payload with 400', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/products/1',
      payload: { name: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('DELETE /products/:id removes a product and returns 204', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/products/2' });
    expect(res.statusCode).toBe(204);
    const check = await app.inject({ method: 'GET', url: '/products/2' });
    expect(check.statusCode).toBe(404);
  });

  it('DELETE /products/:id returns 404 for an unknown product', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/products/9999' });
    expect(res.statusCode).toBe(404);
  });

  it('exposes the product paths in the OpenAPI/Swagger document', async () => {
    const res = await app.inject({ method: 'GET', url: '/docs/json' });
    expect(res.statusCode).toBe(200);
    const spec = res.json();
    expect(spec.paths['/products']).toBeDefined();
    expect(spec.paths['/products/{id}']).toBeDefined();
  });
});
