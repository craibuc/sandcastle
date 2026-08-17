import { buildApp } from './app.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

const app = buildApp({ fastify: { logger: true } });

app
  .listen({ port, host })
  .then((address) => {
    app.log.info(`Swagger UI available at ${address}/docs`);
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
