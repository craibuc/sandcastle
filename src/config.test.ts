import { describe, it, expect } from 'vitest';
import { loadDbConfig } from './config.js';

describe('loadDbConfig', () => {
  it('applies production-shaped defaults when no env vars are set', () => {
    const config = loadDbConfig({});
    expect(config).toEqual({
      server: 'localhost',
      port: 1433,
      user: undefined,
      password: undefined,
      database: 'master',
      options: { encrypt: true, trustServerCertificate: false },
      pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
    });
  });

  it('reads server, port, credentials and database from the environment', () => {
    const config = loadDbConfig({
      DB_SERVER: 'sql.internal',
      DB_PORT: '1500',
      DB_USER: 'svc_api',
      DB_PASSWORD: 's3cret',
      DB_NAME: 'AppDb',
    });
    expect(config).toMatchObject({
      server: 'sql.internal',
      port: 1500,
      user: 'svc_api',
      password: 's3cret',
      database: 'AppDb',
    });
  });

  it('parses encrypt / trustServerCertificate booleans case-insensitively', () => {
    expect(loadDbConfig({ DB_ENCRYPT: 'false' }).options.encrypt).toBe(false);
    expect(loadDbConfig({ DB_ENCRYPT: 'FALSE' }).options.encrypt).toBe(false);
    expect(loadDbConfig({ DB_ENCRYPT: 'true' }).options.encrypt).toBe(true);
    expect(
      loadDbConfig({ DB_TRUST_SERVER_CERTIFICATE: 'true' }).options.trustServerCertificate,
    ).toBe(true);
  });

  it('reads pool sizing overrides', () => {
    const { pool } = loadDbConfig({
      DB_POOL_MAX: '25',
      DB_POOL_MIN: '2',
      DB_POOL_IDLE_TIMEOUT_MS: '60000',
    });
    expect(pool).toEqual({ max: 25, min: 2, idleTimeoutMillis: 60000 });
  });

  it('throws when the port is not a valid TCP port number', () => {
    expect(() => loadDbConfig({ DB_PORT: 'not-a-number' })).toThrow(/DB_PORT/);
    expect(() => loadDbConfig({ DB_PORT: '0' })).toThrow(/DB_PORT/);
    expect(() => loadDbConfig({ DB_PORT: '70000' })).toThrow(/DB_PORT/);
  });

  it('throws when a pool size is negative or non-integer', () => {
    expect(() => loadDbConfig({ DB_POOL_MAX: '-1' })).toThrow(/DB_POOL_MAX/);
    expect(() => loadDbConfig({ DB_POOL_MIN: '1.5' })).toThrow(/DB_POOL_MIN/);
  });
});
