import { describe, it, expect, vi } from 'vitest';
import { installShutdownHandlers, SHUTDOWN_SIGNALS } from './shutdown.js';

/** A minimal stand-in for the pieces of `process` the handlers touch. */
function fakeProcess() {
  const listeners = new Map<string, () => void>();
  return {
    on(signal: string, listener: () => void) {
      listeners.set(signal, listener);
    },
    exit: vi.fn(),
    emit(signal: string) {
      listeners.get(signal)?.();
    },
    listeners,
  };
}

function fakeApp(close: () => Promise<void>) {
  return {
    close: vi.fn(close),
    log: { info: vi.fn(), error: vi.fn() },
  };
}

describe('installShutdownHandlers', () => {
  it('registers a handler for each shutdown signal', () => {
    const proc = fakeProcess();
    installShutdownHandlers(fakeApp(async () => {}), proc);
    for (const signal of SHUTDOWN_SIGNALS) {
      expect(proc.listeners.has(signal)).toBe(true);
    }
  });

  it('closes the app and exits 0 on a shutdown signal', async () => {
    const proc = fakeProcess();
    const app = fakeApp(async () => {});
    installShutdownHandlers(app, proc);
    proc.emit('SIGTERM');
    await vi.waitFor(() => expect(proc.exit).toHaveBeenCalledWith(0));
    expect(app.close).toHaveBeenCalledOnce();
  });

  it('exits 1 when closing the app fails', async () => {
    const proc = fakeProcess();
    const app = fakeApp(async () => {
      throw new Error('close failed');
    });
    installShutdownHandlers(app, proc);
    proc.emit('SIGINT');
    await vi.waitFor(() => expect(proc.exit).toHaveBeenCalledWith(1));
    expect(app.log.error).toHaveBeenCalled();
  });
});
