/**
 * A dummy in-memory stand-in for the `mssql` package.
 *
 * It emulates the shape of the real driver's API — `db.request()`, chainable
 * `.input(name, value)`, and `.query(sql)` resolving to
 * `{ recordset, rowsAffected }` — so the repository layer can be written exactly
 * as it would be against a real SQL Server, then swapped for a genuine
 * `ConnectionPool` in production without touching the calling code.
 *
 * Queries are recognised by matching against the whitelisted statements in
 * {@link SQL}; the store models a single `Users` table seeded with dummy rows.
 */

export interface UserRow {
  Id: number;
  Name: string;
  Email: string;
}

/**
 * Mimics the real `mssql` driver's `RequestError`, which carries a SQL Server
 * error `number`. A `UNIQUE KEY` violation surfaces as number 2627, letting
 * callers detect constraint breaches exactly as they would in production.
 */
export class MssqlRequestError extends Error {
  constructor(
    message: string,
    readonly number: number,
  ) {
    super(message);
    this.name = 'RequestError';
  }
}

/** SQL Server error number for a UNIQUE KEY / PRIMARY KEY constraint violation. */
const UNIQUE_VIOLATION = 2627;

/**
 * DB columns clients may sort on, keyed by the API's lower-case sort field.
 * ORDER BY columns cannot be bound as query parameters in SQL Server, so the
 * repository interpolates the value — this whitelist is what keeps that safe.
 */
export const SORTABLE_COLUMNS = {
  id: 'Id',
  name: 'Name',
  email: 'Email',
} as const;

export type SortColumn = (typeof SORTABLE_COLUMNS)[keyof typeof SORTABLE_COLUMNS];
export type SortDirection = 'ASC' | 'DESC';

/** Whitelisted SQL statements understood by the dummy database. */
export const SQL = {
  /** Trivial round-trip used to verify database connectivity (a readiness probe). */
  ping: 'SELECT 1 AS Ok',
  selectAllUsers: 'SELECT Id, Name, Email FROM Users ORDER BY Id',
  /**
   * Paginated, name-filtered list. `column`/`direction` are interpolated from
   * the {@link SORTABLE_COLUMNS} whitelist because SQL Server does not allow
   * `ORDER BY` targets to be bound parameters.
   */
  listUsers: (column: SortColumn, direction: SortDirection): string =>
    `SELECT Id, Name, Email FROM Users WHERE (@name IS NULL OR Name LIKE @name) ORDER BY ${column} ${direction} OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
  countUsers:
    'SELECT COUNT(*) AS Total FROM Users WHERE (@name IS NULL OR Name LIKE @name)',
  selectUserById: 'SELECT Id, Name, Email FROM Users WHERE Id = @id',
  insertUser:
    'INSERT INTO Users (Name, Email) OUTPUT INSERTED.Id, INSERTED.Name, INSERTED.Email VALUES (@name, @email)',
  updateUser:
    'UPDATE Users SET Name = @name, Email = @email OUTPUT INSERTED.Id, INSERTED.Name, INSERTED.Email WHERE Id = @id',
  deleteUser: 'DELETE FROM Users WHERE Id = @id',
} as const;

export interface QueryResult<T> {
  recordset: T[];
  rowsAffected: number[];
}

const normalise = (sql: string): string => sql.replace(/\s+/g, ' ').trim();

/** Apply the `@name` LIKE filter in memory; a null parameter matches all rows. */
const filterByName = (rows: UserRow[], nameParam: unknown): UserRow[] => {
  if (nameParam == null) return rows;
  const needle = String(nameParam).replace(/%/g, '').toLowerCase();
  return rows.filter((u) => u.Name.toLowerCase().includes(needle));
};

/**
 * Every statement {@link SQL.listUsers} can produce, mapped back to the column
 * and direction it sorts by. Built from {@link SQL.listUsers} itself so the
 * recognised statements can never drift from the SQL the repository emits.
 */
const LIST_USERS_STATEMENTS = new Map<string, { column: SortColumn; direction: SortDirection }>();
for (const column of Object.values(SORTABLE_COLUMNS)) {
  for (const direction of ['ASC', 'DESC'] as const) {
    LIST_USERS_STATEMENTS.set(normalise(SQL.listUsers(column, direction)), { column, direction });
  }
}

/**
 * Orders rows by a whitelisted column and direction. `Id` sorts numerically;
 * text columns sort case-insensitively, matching SQL Server's default collation.
 */
const compareBy =
  (column: SortColumn, direction: SortDirection) =>
  (a: UserRow, b: UserRow): number => {
    const sign = direction === 'DESC' ? -1 : 1;
    if (column === 'Id') return sign * (a.Id - b.Id);
    return sign * a[column].toLowerCase().localeCompare(b[column].toLowerCase());
  };

const SEED_USERS: UserRow[] = [
  { Id: 1, Name: 'Grace Hopper', Email: 'grace@example.com' },
  { Id: 2, Name: 'Alan Turing', Email: 'alan@example.com' },
  { Id: 3, Name: 'Katherine Johnson', Email: 'katherine@example.com' },
];

export class DummyRequest {
  private readonly params = new Map<string, unknown>();

  constructor(private readonly db: DummyMssqlDatabase) {}

  /** Bind a named parameter, mirroring `mssql`'s `request.input()`. */
  input(name: string, value: unknown): this {
    this.params.set(name, value);
    return this;
  }

  /**
   * Execute a whitelisted statement against the in-memory store. Errors
   * (e.g. a unique-constraint violation) surface as a rejected promise, just
   * as the real `mssql` driver reports them.
   */
  async query<T = UserRow>(sql: string): Promise<QueryResult<T>> {
    return this.db.execute<T>(normalise(sql), this.params);
  }
}

export class DummyMssqlDatabase {
  private users: UserRow[];
  private nextId: number;
  private open = true;

  constructor(seed: UserRow[] = SEED_USERS) {
    this.users = seed.map((u) => ({ ...u }));
    this.nextId = this.users.reduce((max, u) => Math.max(max, u.Id), 0) + 1;
  }

  /** Whether the pool is open for requests, mirroring `ConnectionPool.connected`. */
  get connected(): boolean {
    return this.open;
  }

  /**
   * Opens the pool, mirroring `mssql`'s `ConnectionPool.connect()` (which
   * resolves to the pool itself). The dummy has nothing to dial, so this just
   * marks the pool open; a real pool would establish its TCP connections here.
   */
  async connect(): Promise<this> {
    this.open = true;
    return this;
  }

  /**
   * Closes the pool, mirroring `ConnectionPool.close()`. Once closed, further
   * {@link request} calls throw, letting graceful shutdown stop serving new
   * queries. Calling {@link connect} again reopens it.
   */
  async close(): Promise<void> {
    this.open = false;
  }

  request(): DummyRequest {
    if (!this.open) {
      throw new Error('Connection is closed.');
    }
    return new DummyRequest(this);
  }

  /**
   * Emulates the `UNIQUE` constraint on `Users.Email` (case-insensitive, as
   * under SQL Server's default collation). Throws the same error the real
   * driver would when a duplicate is written; `exceptId` lets an UPDATE keep
   * a row's own email.
   */
  private assertEmailAvailable(email: string, exceptId?: number): void {
    const needle = email.toLowerCase();
    const clash = this.users.some(
      (u) => u.Id !== exceptId && u.Email.toLowerCase() === needle,
    );
    if (clash) {
      throw new MssqlRequestError(
        `Violation of UNIQUE KEY constraint 'UQ_Users_Email'. Cannot insert duplicate key in object 'dbo.Users'. The duplicate key value is (${email}).`,
        UNIQUE_VIOLATION,
      );
    }
  }

  /** @internal Dispatch a normalised statement. Called by {@link DummyRequest}. */
  execute<T>(sql: string, params: Map<string, unknown>): QueryResult<T> {
    const listStatement = LIST_USERS_STATEMENTS.get(sql);
    if (listStatement) {
      const { column, direction } = listStatement;
      const offset = Number(params.get('offset')) || 0;
      const limitParam = params.get('limit');
      const limit = limitParam == null ? this.users.length : Number(limitParam);
      const rows = [...filterByName(this.users, params.get('name'))].sort(
        compareBy(column, direction),
      );
      const page = rows.slice(offset, offset + limit);
      return this.wrap(page.map((u) => ({ ...u })));
    }

    switch (sql) {
      case normalise(SQL.ping):
        return this.wrap([{ Ok: 1 }], 1);

      case normalise(SQL.selectAllUsers):
        return this.wrap(this.users.map((u) => ({ ...u })));

      case normalise(SQL.countUsers): {
        const rows = filterByName(this.users, params.get('name'));
        return this.wrap([{ Total: rows.length }], rows.length);
      }

      case normalise(SQL.selectUserById): {
        const id = Number(params.get('id'));
        return this.wrap(this.users.filter((u) => u.Id === id).map((u) => ({ ...u })));
      }

      case normalise(SQL.insertUser): {
        const email = String(params.get('email'));
        this.assertEmailAvailable(email);
        const row: UserRow = {
          Id: this.nextId++,
          Name: String(params.get('name')),
          Email: email,
        };
        this.users.push(row);
        return this.wrap([{ ...row }], 1);
      }

      case normalise(SQL.updateUser): {
        const id = Number(params.get('id'));
        const existing = this.users.find((u) => u.Id === id);
        if (!existing) return this.wrap([], 0);
        const email = String(params.get('email'));
        this.assertEmailAvailable(email, id);
        existing.Name = String(params.get('name'));
        existing.Email = email;
        return this.wrap([{ ...existing }], 1);
      }

      case normalise(SQL.deleteUser): {
        const id = Number(params.get('id'));
        const before = this.users.length;
        this.users = this.users.filter((u) => u.Id !== id);
        return this.wrap([], before - this.users.length);
      }

      default:
        throw new Error(`Unrecognised SQL statement: ${sql}`);
    }
  }

  private wrap<T>(recordset: unknown[], rowsAffected = recordset.length): QueryResult<T> {
    return { recordset: recordset as T[], rowsAffected: [rowsAffected] };
  }
}
