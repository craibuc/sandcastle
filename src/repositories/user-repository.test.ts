import { describe, it, expect, beforeEach } from 'vitest';
import { DummyMssqlDatabase } from '../db/dummy-mssql.js';
import { UserRepository } from './user-repository.js';

describe('UserRepository', () => {
  let repo: UserRepository;

  beforeEach(() => {
    repo = new UserRepository(new DummyMssqlDatabase());
  });

  it('findAll returns all seeded users', async () => {
    const users = await repo.findAll();
    expect(users.length).toBeGreaterThanOrEqual(3);
    expect(users[0]).toHaveProperty('id');
    expect(users[0]).toHaveProperty('name');
    expect(users[0]).toHaveProperty('email');
  });

  it('findAll paginates with limit and offset', async () => {
    const firstTwo = await repo.findAll({ limit: 2 });
    expect(firstTwo).toHaveLength(2);
    expect(firstTwo[0].id).toBe(1);

    const skipFirst = await repo.findAll({ offset: 1, limit: 10 });
    expect(skipFirst[0].id).toBe(2);
  });

  it('findAll filters by partial, case-insensitive name', async () => {
    const users = await repo.findAll({ name: 'alan' });
    expect(users).toHaveLength(1);
    expect(users[0].name).toBe('Alan Turing');
  });

  it('findById returns a single user', async () => {
    const user = await repo.findById(1);
    expect(user).toMatchObject({ id: 1 });
  });

  it('findById returns null when not found', async () => {
    expect(await repo.findById(9999)).toBeNull();
  });

  it('create adds a user and returns it with a generated id', async () => {
    const created = await repo.create({ name: 'New Person', email: 'new@example.com' });
    expect(created).toMatchObject({ name: 'New Person', email: 'new@example.com' });
    expect(typeof created.id).toBe('number');
    expect(await repo.findById(created.id)).not.toBeNull();
  });

  it('update modifies an existing user and returns it', async () => {
    const updated = await repo.update(1, { name: 'Changed', email: 'changed@example.com' });
    expect(updated).toMatchObject({ id: 1, name: 'Changed', email: 'changed@example.com' });
  });

  it('update returns null for an unknown user', async () => {
    expect(await repo.update(9999, { name: 'x', email: 'x@example.com' })).toBeNull();
  });

  it('patch updates only the provided fields', async () => {
    const patched = await repo.patch(1, { name: 'Only Name' });
    expect(patched).toMatchObject({ id: 1, name: 'Only Name', email: 'grace@example.com' });
  });

  it('patch with an empty change set returns the user unchanged', async () => {
    const before = await repo.findById(1);
    expect(await repo.patch(1, {})).toEqual(before);
  });

  it('patch returns null for an unknown user', async () => {
    expect(await repo.patch(9999, { name: 'x' })).toBeNull();
  });

  it('remove deletes a user and returns true', async () => {
    expect(await repo.remove(1)).toBe(true);
    expect(await repo.findById(1)).toBeNull();
  });

  it('remove returns false for an unknown user', async () => {
    expect(await repo.remove(9999)).toBe(false);
  });
});
