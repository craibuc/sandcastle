import { buildApp } from './app.js';
import { loadDbConfig } from './config.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

// Resolve DB connection settings from the environment up-front so any
// misconfiguration (bad port, negative pool size) fails fast at boot. The
// dummy database ignores these today; a real ConnectionPool would consume them.
const dbConfig = loadDbConfig();

const app = buildApp({ fastify: { logger: true } });

app
  .listen({ port, host })
  .then((address) => {
    app.log.info(
      { server: dbConfig.server, port: dbConfig.port, database: dbConfig.database },
      'database target resolved from environment',
    );
    app.log.info(`Swagger UI available at ${address}/docs`);
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
