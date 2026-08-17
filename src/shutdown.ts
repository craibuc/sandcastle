import type { FastifyInstance } from 'fastify';

/** OS signals that should trigger a graceful shutdown. */
export const SHUTDOWN_SIGNALS = ['SIGINT', 'SIGTERM'] as const;

/** The subset of the Fastify instance the shutdown handlers depend on. */
interface ClosableApp {
  close(): Promise<unknown>;
  log: Pick<FastifyInstance['log'], 'info' | 'error'>;
}

/** The subset of `process` the handlers depend on (injectable for testing). */
export interface ProcessLike {
  on(signal: string, listener: () => void): void;
  exit(code: number): void;
}

/**
 * Wires SIGINT/SIGTERM to a graceful shutdown: closing the Fastify instance
 * (which runs its `onClose` hooks, including closing the database pool) before
 * exiting. A clean close exits 0; a failed close exits 1 so orchestrators can
 * distinguish an orderly stop from a stuck one.
 */
export function installShutdownHandlers(app: ClosableApp, proc: ProcessLike): void {
  for (const signal of SHUTDOWN_SIGNALS) {
    proc.on(signal, () => {
      void shutdown(app, proc, signal);
    });
  }
}

async function shutdown(app: ClosableApp, proc: ProcessLike, signal: string): Promise<void> {
  app.log.info(`Received ${signal}, shutting down gracefully`);
  try {
    await app.close();
    proc.exit(0);
  } catch (err) {
    app.log.error(err);
    proc.exit(1);
  }
}
