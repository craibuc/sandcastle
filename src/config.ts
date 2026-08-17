/**
 * Database connection configuration, wired from the environment.
 *
 * The shape mirrors the object a real `mssql` `ConnectionPool` is constructed
 * with (`server`/`port`/`user`/`password`/`database` plus `options` and `pool`
 * sub-objects), so swapping the dummy database for a genuine pool is a matter
 * of `new sql.ConnectionPool(loadDbConfig())` — no call-site changes.
 */
export interface DbConfig {
  server: string;
  port: number;
  user: string | undefined;
  password: string | undefined;
  database: string;
  options: {
    encrypt: boolean;
    trustServerCertificate: boolean;
  };
  pool: {
    max: number;
    min: number;
    idleTimeoutMillis: number;
  };
}

/** A subset of `process.env`: keys map to an optional string. */
type Env = Record<string, string | undefined>;

/** Parse a boolean env var; anything but a case-insensitive `false` is truthy for defaults. */
const parseBool = (value: string | undefined, fallback: boolean): boolean => {
  if (value == null) return fallback;
  return value.toLowerCase() !== 'false';
};

/**
 * Parse a non-negative integer env var within `[min, max]`, throwing a
 * descriptive error (naming the offending variable) so misconfiguration fails
 * fast at startup rather than surfacing as an opaque connection error later.
 */
const parseInteger = (
  name: string,
  value: string | undefined,
  fallback: number,
  { min, max }: { min: number; max: number },
): number => {
  if (value == null) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}, got "${value}"`);
  }
  return parsed;
};

/**
 * Build a {@link DbConfig} from environment variables, applying
 * production-shaped defaults for anything unset.
 *
 * | Variable                      | Default     |
 * | ----------------------------- | ----------- |
 * | `DB_SERVER`                   | `localhost` |
 * | `DB_PORT`                     | `1433`      |
 * | `DB_USER` / `DB_PASSWORD`     | —           |
 * | `DB_NAME`                     | `master`    |
 * | `DB_ENCRYPT`                  | `true`      |
 * | `DB_TRUST_SERVER_CERTIFICATE` | `false`     |
 * | `DB_POOL_MAX`                 | `10`        |
 * | `DB_POOL_MIN`                 | `0`         |
 * | `DB_POOL_IDLE_TIMEOUT_MS`     | `30000`     |
 */
export function loadDbConfig(env: Env = process.env): DbConfig {
  return {
    server: env.DB_SERVER ?? 'localhost',
    port: parseInteger('DB_PORT', env.DB_PORT, 1433, { min: 1, max: 65535 }),
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME ?? 'master',
    options: {
      encrypt: parseBool(env.DB_ENCRYPT, true),
      trustServerCertificate: parseBool(env.DB_TRUST_SERVER_CERTIFICATE, false),
    },
    pool: {
      max: parseInteger('DB_POOL_MAX', env.DB_POOL_MAX, 10, { min: 0, max: 1000 }),
      min: parseInteger('DB_POOL_MIN', env.DB_POOL_MIN, 0, { min: 0, max: 1000 }),
      idleTimeoutMillis: parseInteger(
        'DB_POOL_IDLE_TIMEOUT_MS',
        env.DB_POOL_IDLE_TIMEOUT_MS,
        30000,
        { min: 0, max: 3_600_000 },
      ),
    },
  };
}
