import { describe, it, expect, beforeEach } from 'vitest';
import { DummyMssqlDatabase, MssqlRequestError, SQL } from './dummy-mssql.js';

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

  it('lists users with pagination (offset/limit) and name filter', async () => {
    const firstTwo = await db
      .request()
      .input('name', null)
      .input('offset', 0)
      .input('limit', 2)
      .query(SQL.listUsers('Id', 'ASC'));
    expect(firstTwo.recordset).toHaveLength(2);
    expect(firstTwo.recordset[0].Id).toBe(1);

    const skipFirst = await db
      .request()
      .input('name', null)
      .input('offset', 1)
      .input('limit', 10)
      .query(SQL.listUsers('Id', 'ASC'));
    expect(skipFirst.recordset[0].Id).toBe(2);

    const filtered = await db
      .request()
      .input('name', '%alan%')
      .input('offset', 0)
      .input('limit', 10)
      .query(SQL.listUsers('Id', 'ASC'));
    expect(filtered.recordset).toHaveLength(1);
    expect(filtered.recordset[0].Name).toBe('Alan Turing');
  });

  it('sorts users by a whitelisted column, ascending and descending', async () => {
    const asc = await db
      .request()
      .input('name', null)
      .input('offset', 0)
      .input('limit', 10)
      .query(SQL.listUsers('Name', 'ASC'));
    expect(asc.recordset.map((u) => u.Name)).toEqual([
      'Alan Turing',
      'Grace Hopper',
      'Katherine Johnson',
    ]);

    const desc = await db
      .request()
      .input('name', null)
      .input('offset', 0)
      .input('limit', 10)
      .query(SQL.listUsers('Name', 'DESC'));
    expect(desc.recordset.map((u) => u.Name)).toEqual([
      'Katherine Johnson',
      'Grace Hopper',
      'Alan Turing',
    ]);
  });

  it('counts users honouring the name filter, ignoring pagination', async () => {
    const all = await db.request().input('name', null).query<{ Total: number }>(SQL.countUsers);
    expect(all.recordset[0].Total).toBe(3);

    const filtered = await db.request().input('name', '%a%').query<{ Total: number }>(SQL.countUsers);
    expect(filtered.recordset[0].Total).toBe(3);

    const one = await db.request().input('name', '%alan%').query<{ Total: number }>(SQL.countUsers);
    expect(one.recordset[0].Total).toBe(1);
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

  it('rejects inserting a duplicate email with a unique-constraint error (2627)', async () => {
    const insert = db
      .request()
      .input('name', 'Grace Clone')
      .input('email', 'grace@example.com') // already used by the seeded Grace Hopper
      .query(SQL.insertUser);
    await expect(insert).rejects.toBeInstanceOf(MssqlRequestError);
    await expect(insert).rejects.toMatchObject({ number: 2627 });
  });

  it('treats email uniqueness as case-insensitive (SQL Server default collation)', async () => {
    const insert = db
      .request()
      .input('name', 'Grace Clone')
      .input('email', 'GRACE@EXAMPLE.COM')
      .query(SQL.insertUser);
    await expect(insert).rejects.toMatchObject({ number: 2627 });
  });

  it('rejects updating a user to an email used by another user', async () => {
    const update = db
      .request()
      .input('id', 2) // Alan Turing
      .input('name', 'Alan Turing')
      .input('email', 'grace@example.com') // belongs to user 1
      .query(SQL.updateUser);
    await expect(update).rejects.toMatchObject({ number: 2627 });
  });

  it('allows updating a user while keeping its own email', async () => {
    const { rowsAffected } = await db
      .request()
      .input('id', 1)
      .input('name', 'Grace Renamed')
      .input('email', 'grace@example.com') // its own email, unchanged
      .query(SQL.updateUser);
    expect(rowsAffected[0]).toBe(1);
  });
});
