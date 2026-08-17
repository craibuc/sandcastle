import {
  DummyMssqlDatabase,
  MssqlRequestError,
  SORTABLE_COLUMNS,
  SQL,
  type SortDirection,
  type UserRow,
} from '../db/dummy-mssql.js';
import type { ListUsersOptions, User, UserInput, UserPatch } from '../types.js';

const toUser = (row: UserRow): User => ({
  id: row.Id,
  name: row.Name,
  email: row.Email,
});

/** SQL Server error number raised by a UNIQUE KEY constraint violation. */
const UNIQUE_VIOLATION = 2627;

/**
 * Raised when a write would violate the unique-email constraint. Lets the
 * route layer translate a persistence-level clash into a `409 Conflict`
 * without leaking driver-specific error shapes.
 */
export class DuplicateEmailError extends Error {
  constructor(readonly email: string) {
    super(`A user with email "${email}" already exists`);
    this.name = 'DuplicateEmailError';
  }
}

/** Detects the driver's unique-constraint error so it can be re-thrown as a domain error. */
const isUniqueViolation = (err: unknown): boolean =>
  err instanceof MssqlRequestError && err.number === UNIQUE_VIOLATION;

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
    const column = SORTABLE_COLUMNS[options.sort ?? 'id'];
    const direction: SortDirection = options.order === 'desc' ? 'DESC' : 'ASC';
    const { recordset } = await this.db
      .request()
      .input('name', name)
      .input('offset', offset)
      .input('limit', limit)
      .query<UserRow>(SQL.listUsers(column, direction));
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
    try {
      const { recordset } = await this.db
        .request()
        .input('name', input.name)
        .input('email', input.email)
        .query<UserRow>(SQL.insertUser);
      return toUser(recordset[0]);
    } catch (err) {
      if (isUniqueViolation(err)) throw new DuplicateEmailError(input.email);
      throw err;
    }
  }

  async update(id: number, input: UserInput): Promise<User | null> {
    try {
      const { recordset, rowsAffected } = await this.db
        .request()
        .input('id', id)
        .input('name', input.name)
        .input('email', input.email)
        .query<UserRow>(SQL.updateUser);
      return rowsAffected[0] > 0 ? toUser(recordset[0]) : null;
    } catch (err) {
      if (isUniqueViolation(err)) throw new DuplicateEmailError(input.email);
      throw err;
    }
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
