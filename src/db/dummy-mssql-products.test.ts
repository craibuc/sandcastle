import { describe, it, expect, beforeEach } from 'vitest';
import { DummyMssqlDatabase, SQL, type ProductRow } from './dummy-mssql.js';

describe('DummyMssqlDatabase (products)', () => {
  let db: DummyMssqlDatabase;

  beforeEach(() => {
    db = new DummyMssqlDatabase();
  });

  it('selects all products with the expected columns', async () => {
    const { recordset } = await db.request().query(SQL.selectAllProducts);
    expect(recordset.length).toBeGreaterThan(0);
    expect(recordset[0]).toHaveProperty('Id');
    expect(recordset[0]).toHaveProperty('Name');
    expect(recordset[0]).toHaveProperty('Price');
    expect(recordset[0]).toHaveProperty('Description');
  });

  it('lists products with pagination (offset/limit) and name filter', async () => {
    const firstTwo = await db
      .request()
      .input('name', null)
      .input('offset', 0)
      .input('limit', 2)
      .query(SQL.listProducts('Id', 'ASC'));
    expect(firstTwo.recordset).toHaveLength(2);
    expect(firstTwo.recordset[0].Id).toBe(1);

    const skipFirst = await db
      .request()
      .input('name', null)
      .input('offset', 1)
      .input('limit', 10)
      .query(SQL.listProducts('Id', 'ASC'));
    expect(skipFirst.recordset[0].Id).toBe(2);

    const filtered = await db
      .request()
      .input('name', '%widget%')
      .input('offset', 0)
      .input('limit', 10)
      .query(SQL.listProducts('Id', 'ASC'));
    expect(filtered.recordset).toHaveLength(1);
    expect(filtered.recordset[0].Name).toBe('Widget');
  });

  it('sorts products by price ascending and descending', async () => {
    const asc = await db
      .request()
      .input('name', null)
      .input('offset', 0)
      .input('limit', 10)
      .query<ProductRow>(SQL.listProducts('Price', 'ASC'));
    expect(asc.recordset.map((p) => p.Price)).toEqual([4.5, 9.99, 19.99]);

    const desc = await db
      .request()
      .input('name', null)
      .input('offset', 0)
      .input('limit', 10)
      .query<ProductRow>(SQL.listProducts('Price', 'DESC'));
    expect(desc.recordset.map((p) => p.Price)).toEqual([19.99, 9.99, 4.5]);
  });

  it('counts products honouring the name filter, ignoring pagination', async () => {
    const all = await db.request().input('name', null).query<{ Total: number }>(SQL.countProducts);
    expect(all.recordset[0].Total).toBe(3);

    const filtered = await db
      .request()
      .input('name', '%get%')
      .query<{ Total: number }>(SQL.countProducts);
    expect(filtered.recordset[0].Total).toBe(2);
  });

  it('selects a single product by parameterised id', async () => {
    const { recordset } = await db.request().input('id', 1).query(SQL.selectProductById);
    expect(recordset).toHaveLength(1);
    expect(recordset[0].Id).toBe(1);
  });

  it('returns an empty recordset for an unknown id', async () => {
    const { recordset } = await db.request().input('id', 9999).query(SQL.selectProductById);
    expect(recordset).toHaveLength(0);
  });

  it('inserts a product and returns the inserted row via OUTPUT', async () => {
    const { recordset } = await db
      .request()
      .input('name', 'Doohickey')
      .input('price', 12.5)
      .input('description', 'A useful doohickey')
      .query(SQL.insertProduct);
    expect(recordset[0]).toMatchObject({
      Name: 'Doohickey',
      Price: 12.5,
      Description: 'A useful doohickey',
    });
    expect(typeof recordset[0].Id).toBe('number');
  });

  it('updates an existing product and reports rowsAffected', async () => {
    const { recordset, rowsAffected } = await db
      .request()
      .input('id', 1)
      .input('name', 'Renamed')
      .input('price', 1.23)
      .input('description', 'Updated')
      .query(SQL.updateProduct);
    expect(rowsAffected[0]).toBe(1);
    expect(recordset[0]).toMatchObject({ Id: 1, Name: 'Renamed', Price: 1.23, Description: 'Updated' });
  });

  it('reports zero rowsAffected when updating an unknown product', async () => {
    const { rowsAffected } = await db
      .request()
      .input('id', 9999)
      .input('name', 'x')
      .input('price', 1)
      .input('description', 'x')
      .query(SQL.updateProduct);
    expect(rowsAffected[0]).toBe(0);
  });

  it('deletes a product and reports rowsAffected', async () => {
    const { rowsAffected } = await db.request().input('id', 1).query(SQL.deleteProduct);
    expect(rowsAffected[0]).toBe(1);
    const after = await db.request().input('id', 1).query(SQL.selectProductById);
    expect(after.recordset).toHaveLength(0);
  });

  it('reports zero rowsAffected when deleting an unknown id', async () => {
    const { rowsAffected } = await db.request().input('id', 9999).query(SQL.deleteProduct);
    expect(rowsAffected[0]).toBe(0);
  });
});
