import { DummyMssqlDatabase, SQL, type UserRow } from '../db/dummy-mssql.js';
import type { ListUsersOptions, User, UserInput, UserPatch } from '../types.js';

const toUser = (row: UserRow): User => ({
  id: row.Id,
  name: row.Name,
  email: row.Email,
});

/**
 * Data access for users. Talks to a {@link DummyMssqlDatabase} using the same
 * `request().input().query()` calls the real `mssql` driver exposes, so the
 * only change needed to hit a real SQL Server is the injected database.
 */
export class UserRepository {
  constructor(private readonly db: DummyMssqlDatabase) {}

  /**
   * Lists users, newest-id last, with an optional name filter and a
   * pagination window. Defaults to the first 20 rows.
   */
  async findAll(options: ListUsersOptions = {}): Promise<User[]> {
    const limit = options.limit ?? 20;
    const offset = options.offset ?? 0;
    const name = options.name ? `%${options.name}%` : null;
    const { recordset } = await this.db
      .request()
      .input('name', name)
      .input('offset', offset)
      .input('limit', limit)
      .query<UserRow>(SQL.listUsers);
    return recordset.map(toUser);
  }

  /**
   * Counts users matching an optional name filter, ignoring any pagination
   * options. Lets callers report the full result size (e.g. an
   * `X-Total-Count` header) independently of the returned page.
   */
  async count(options: ListUsersOptions = {}): Promise<number> {
    const name = options.name ? `%${options.name}%` : null;
    const { recordset } = await this.db
      .request()
      .input('name', name)
      .query<{ Total: number }>(SQL.countUsers);
    return recordset[0].Total;
  }

  async findById(id: number): Promise<User | null> {
    const { recordset } = await this.db
      .request()
      .input('id', id)
      .query<UserRow>(SQL.selectUserById);
    return recordset.length > 0 ? toUser(recordset[0]) : null;
  }

  async create(input: UserInput): Promise<User> {
    const { recordset } = await this.db
      .request()
      .input('name', input.name)
      .input('email', input.email)
      .query<UserRow>(SQL.insertUser);
    return toUser(recordset[0]);
  }

  async update(id: number, input: UserInput): Promise<User | null> {
    const { recordset, rowsAffected } = await this.db
      .request()
      .input('id', id)
      .input('name', input.name)
      .input('email', input.email)
      .query<UserRow>(SQL.updateUser);
    return rowsAffected[0] > 0 ? toUser(recordset[0]) : null;
  }

  /**
   * Applies a partial update: reads the current row, merges the provided
   * fields over it, then reuses {@link update}. Returns `null` if no user
   * with `id` exists.
   */
  async patch(id: number, changes: UserPatch): Promise<User | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    return this.update(id, {
      name: changes.name ?? existing.name,
      email: changes.email ?? existing.email,
    });
  }

  async remove(id: number): Promise<boolean> {
    const { rowsAffected } = await this.db.request().input('id', id).query(SQL.deleteUser);
    return rowsAffected[0] > 0;
  }
}
