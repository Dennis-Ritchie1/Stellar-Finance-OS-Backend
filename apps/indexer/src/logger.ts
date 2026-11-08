import pino from 'pino';

export function createLogger(level: string, pretty: boolean) {
  return pino({
    name: 'indexer',
    level,
    ...(pretty ? { transport: { target: 'pino-pretty', options: { singleLine: true } } } : {}),
  });
}

export type Logger = ReturnType<typeof createLogger>;
