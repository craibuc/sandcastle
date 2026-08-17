import { describe, it, expect, beforeEach } from 'vitest';
import { DummyMssqlDatabase } from '../db/dummy-mssql.js';
import { ProductRepository } from './product-repository.js';

describe('ProductRepository', () => {
  let repo: ProductRepository;

  beforeEach(() => {
    repo = new ProductRepository(new DummyMssqlDatabase());
  });

  it('findAll returns all seeded products', async () => {
    const products = await repo.findAll();
    expect(products.length).toBeGreaterThanOrEqual(3);
    expect(products[0]).toHaveProperty('id');
    expect(products[0]).toHaveProperty('name');
    expect(products[0]).toHaveProperty('price');
    expect(products[0]).toHaveProperty('description');
  });

  it('findAll paginates with limit and offset', async () => {
    const firstTwo = await repo.findAll({ limit: 2 });
    expect(firstTwo).toHaveLength(2);
    expect(firstTwo[0].id).toBe(1);

    const skipFirst = await repo.findAll({ offset: 1, limit: 10 });
    expect(skipFirst[0].id).toBe(2);
  });

  it('findAll filters by partial, case-insensitive name', async () => {
    const products = await repo.findAll({ name: 'widget' });
    expect(products).toHaveLength(1);
    expect(products[0].name).toBe('Widget');
  });

  it('findAll defaults to sorting by id ascending', async () => {
    const products = await repo.findAll();
    expect(products.map((p) => p.id)).toEqual([1, 2, 3]);
  });

  it('findAll sorts by price ascending and descending', async () => {
    const asc = await repo.findAll({ sort: 'price', order: 'asc' });
    expect(asc.map((p) => p.price)).toEqual([4.5, 9.99, 19.99]);

    const desc = await repo.findAll({ sort: 'price', order: 'desc' });
    expect(desc.map((p) => p.price)).toEqual([19.99, 9.99, 4.5]);
  });

  it('count returns the total number of products, honouring the name filter', async () => {
    expect(await repo.count()).toBe(3);
    expect(await repo.count({ name: 'widget' })).toBe(1);
  });

  it('count ignores pagination options', async () => {
    expect(await repo.count({ limit: 1, offset: 2 })).toBe(3);
  });

  it('findById returns a single product', async () => {
    const product = await repo.findById(1);
    expect(product).toMatchObject({ id: 1 });
  });

  it('findById returns null when not found', async () => {
    expect(await repo.findById(9999)).toBeNull();
  });

  it('create adds a product and returns it with a generated id', async () => {
    const created = await repo.create({ name: 'Sprocket', price: 3.25, description: 'A sprocket' });
    expect(created).toMatchObject({ name: 'Sprocket', price: 3.25, description: 'A sprocket' });
    expect(typeof created.id).toBe('number');
    expect(await repo.findById(created.id)).not.toBeNull();
  });

  it('update modifies an existing product and returns it', async () => {
    const updated = await repo.update(1, { name: 'Changed', price: 7.77, description: 'Changed desc' });
    expect(updated).toMatchObject({ id: 1, name: 'Changed', price: 7.77, description: 'Changed desc' });
  });

  it('update returns null for an unknown product', async () => {
    expect(await repo.update(9999, { name: 'x', price: 1, description: 'x' })).toBeNull();
  });

  it('patch updates only the provided fields', async () => {
    const patched = await repo.patch(1, { price: 99.99 });
    expect(patched).toMatchObject({ id: 1, name: 'Widget', price: 99.99, description: 'A basic widget' });
  });

  it('patch with an empty change set returns the product unchanged', async () => {
    const before = await repo.findById(1);
    expect(await repo.patch(1, {})).toEqual(before);
  });

  it('patch returns null for an unknown product', async () => {
    expect(await repo.patch(9999, { name: 'x' })).toBeNull();
  });

  it('remove deletes a product and returns true', async () => {
    expect(await repo.remove(1)).toBe(true);
    expect(await repo.findById(1)).toBeNull();
  });

  it('remove returns false for an unknown product', async () => {
    expect(await repo.remove(9999)).toBe(false);
  });
});
