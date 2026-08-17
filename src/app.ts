import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { DummyMssqlDatabase } from './db/dummy-mssql.js';
import { userRoutes } from './routes/users.js';
import { userSchema, userInputSchema, errorSchema } from './routes/user-schemas.js';

export interface BuildAppOptions {
  /** Injectable data source. Defaults to a freshly seeded dummy mssql database. */
  database?: DummyMssqlDatabase;
  /** Passed through to Fastify (e.g. `{ logger: true }`). */
  fastify?: FastifyServerOptions;
}

/**
 * Builds a fully configured Fastify instance: shared schemas, Swagger docs,
 * a health check and the user CRUD routes. Kept synchronous and free of
 * side effects so tests can spin up isolated instances with an injected db.
 */
export function buildApp(opts: BuildAppOptions = {}): FastifyInstance {
  const database = opts.database ?? new DummyMssqlDatabase();
  const app = Fastify(opts.fastify ?? {});

  app.addSchema(userSchema);
  app.addSchema(userInputSchema);
  app.addSchema(errorSchema);

  app.register(swagger, {
    openapi: {
      info: {
        title: 'MSSQL REST API',
        description: 'A REST API built with Fastify backed by a dummy mssql database.',
        version: '1.0.0',
      },
      tags: [{ name: 'users', description: 'User management endpoints' }],
    },
  });

  app.register(swaggerUi, { routePrefix: '/docs' });

  app.get('/health', { schema: { tags: ['health'], summary: 'Health check' } }, async () => ({
    status: 'ok',
  }));

  app.register(userRoutes, { database });

  return app;
}
