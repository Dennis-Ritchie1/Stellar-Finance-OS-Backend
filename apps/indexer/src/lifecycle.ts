import type { Logger } from './logger.js';

/** Keep a long-running process alive and run cleanup on SIGINT/SIGTERM. */
export function runUntilSignal(log: Logger, onStop: () => Promise<void> = async () => {}): void {
  const keepAlive = setInterval(() => {}, 60_000);
  const stop = async (signal: string) => {
    log.info({ signal }, 'shutting down');
    clearInterval(keepAlive);
    await onStop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
