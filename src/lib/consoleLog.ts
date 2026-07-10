export type LogLevel = 'sys' | 'app' | 'error' | 'verbose'
export interface LogEntry { ts: number; level: LogLevel; text: string }
export const LOG_CAP = 500

// Append entry, keeping at most LOG_CAP entries (drop oldest). Pure — returns a new array.
export function appendEntry(prev: LogEntry[], entry: LogEntry): LogEntry[] {
  const next = [...prev, entry]
  return next.length > LOG_CAP ? next.slice(next.length - LOG_CAP) : next
}

const pad2 = (n: number) => String(n).padStart(2, '0')

// Format a timestamp (ms epoch) as HH:MM:SS (24h, zero-padded), for the console UI.
export function formatTs(ts: number): string {
  const d = new Date(ts)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

const TAGS: Record<LogLevel, string> = {
  sys: '[sys]',
  app: '[app]',
  error: '[err]',
  verbose: '[dbg]',
}

// Short bracket tag per level for display.
export function levelTag(level: LogLevel): string {
  return TAGS[level]
}
