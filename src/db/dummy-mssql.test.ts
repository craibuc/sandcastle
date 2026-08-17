import { describe, it, expect, beforeEach } from 'vitest';
import { DummyMssqlDatabase, SQL } from './dummy-mssql.js';

describe('DummyMssqlDatabase', () => {
  let db: DummyMssqlDatabase;

  beforeEach(() => {
    db = new DummyMssqlDatabase();
  });

  it('emulates the mssql request/input/query interface and returns a recordset', async () => {
    const result = await db.request().query(SQL.selectAllUsers);
    expect(Array.isArray(result.recordset)).toBe(true);
    expect(result.recordset.length).toBeGreaterThan(0);
    expect(result.recordset[0]).toHaveProperty('Id');
    expect(result.recordset[0]).toHaveProperty('Name');
    expect(result.recordset[0]).toHaveProperty('Email');
  });

  it('selects a single user by parameterised id', async () => {
    const { recordset } = await db
      .request()
      .input('id', 1)
      .query(SQL.selectUserById);
    expect(recordset).toHaveLength(1);
    expect(recordset[0].Id).toBe(1);
  });

  it('returns an empty recordset for an unknown id', async () => {
    const { recordset } = await db
      .request()
      .input('id', 9999)
      .query(SQL.selectUserById);
    expect(recordset).toHaveLength(0);
  });

  it('inserts a user and returns the inserted row via OUTPUT', async () => {
    const { recordset } = await db
      .request()
      .input('name', 'Ada Lovelace')
      .input('email', 'ada@example.com')
      .query(SQL.insertUser);
    expect(recordset[0]).toMatchObject({ Name: 'Ada Lovelace', Email: 'ada@example.com' });
    expect(typeof recordset[0].Id).toBe('number');
  });

  it('updates an existing user and reports rowsAffected', async () => {
    const { recordset, rowsAffected } = await db
      .request()
      .input('id', 1)
      .input('name', 'Renamed')
      .input('email', 'renamed@example.com')
      .query(SQL.updateUser);
    expect(rowsAffected[0]).toBe(1);
    expect(recordset[0]).toMatchObject({ Id: 1, Name: 'Renamed', Email: 'renamed@example.com' });
  });

  it('deletes a user and reports rowsAffected', async () => {
    const { rowsAffected } = await db.request().input('id', 1).query(SQL.deleteUser);
    expect(rowsAffected[0]).toBe(1);
    const after = await db.request().input('id', 1).query(SQL.selectUserById);
    expect(after.recordset).toHaveLength(0);
  });

  it('reports zero rowsAffected when deleting an unknown id', async () => {
    const { rowsAffected } = await db.request().input('id', 9999).query(SQL.deleteUser);
    expect(rowsAffected[0]).toBe(0);
  });
});
