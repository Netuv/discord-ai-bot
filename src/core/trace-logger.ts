export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogSource = string;

export interface LogEntry {
  level: LogLevel;
  source: LogSource;
  message: string;
  traceId?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

let _traceId = '';

export function setTraceId(id: string) {
  _traceId = id;
}

export function getTraceId(): string {
  return _traceId;
}

export function traceLog(
  level: LogLevel,
  source: LogSource,
  message: string,
  metadata?: Record<string, unknown>
): void {
  const entry: LogEntry = {
    level,
    source,
    message,
    ...(_traceId ? { traceId: _traceId } : {}),
    ...(metadata ? { metadata } : {}),
    timestamp: new Date().toISOString(),
  };

  const prefix = `[${entry.timestamp}] [${level.toUpperCase()}] [${source}]${_traceId ? ` [${_traceId}]` : ''}`;
  const msg = `${prefix} ${message}`;

  switch (level) {
    case 'error':
      console.error(msg, metadata || '');
      break;
    case 'warn':
      console.warn(msg, metadata || '');
      break;
    default:
      console.log(msg, metadata || '');
      break;
  }
}
