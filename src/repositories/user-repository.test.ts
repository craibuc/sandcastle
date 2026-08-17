import { describe, it, expect, beforeEach } from 'vitest';
import { DummyMssqlDatabase } from '../db/dummy-mssql.js';
import { DuplicateEmailError, UserRepository } from './user-repository.js';

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

  it('findAll defaults to sorting by id ascending', async () => {
    const users = await repo.findAll();
    expect(users.map((u) => u.id)).toEqual([1, 2, 3]);
  });

  it('findAll sorts by name ascending and descending', async () => {
    const asc = await repo.findAll({ sort: 'name', order: 'asc' });
    expect(asc.map((u) => u.name)).toEqual(['Alan Turing', 'Grace Hopper', 'Katherine Johnson']);

    const desc = await repo.findAll({ sort: 'name', order: 'desc' });
    expect(desc.map((u) => u.name)).toEqual(['Katherine Johnson', 'Grace Hopper', 'Alan Turing']);
  });

  it('count returns the total number of users, honouring the name filter', async () => {
    expect(await repo.count()).toBe(3);
    expect(await repo.count({ name: 'alan' })).toBe(1);
  });

  it('count ignores pagination options', async () => {
    expect(await repo.count({ limit: 1, offset: 2 })).toBe(3);
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

  it('create throws DuplicateEmailError when the email already exists', async () => {
    await expect(
      repo.create({ name: 'Grace Clone', email: 'grace@example.com' }),
    ).rejects.toBeInstanceOf(DuplicateEmailError);
  });

  it('update throws DuplicateEmailError when the email belongs to another user', async () => {
    await expect(
      repo.update(2, { name: 'Alan Turing', email: 'grace@example.com' }),
    ).rejects.toBeInstanceOf(DuplicateEmailError);
  });

  it('patch throws DuplicateEmailError when moving to another user\'s email', async () => {
    await expect(repo.patch(2, { email: 'grace@example.com' })).rejects.toBeInstanceOf(
      DuplicateEmailError,
    );
  });

  it('update keeps succeeding when the email is unchanged for the same user', async () => {
    const updated = await repo.update(1, { name: 'Grace Renamed', email: 'grace@example.com' });
    expect(updated).toMatchObject({ id: 1, name: 'Grace Renamed', email: 'grace@example.com' });
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
