import { appendEntry, formatTs, levelTag, LOG_CAP } from './consoleLog'
import type { LogEntry } from './consoleLog'

const entry = (n: number): LogEntry => ({ ts: n, level: 'app', text: `msg ${n}` })

test('appendEntry adds to the end and does not mutate the input', () => {
  const prev: LogEntry[] = [entry(1)]
  const next = appendEntry(prev, entry(2))
  expect(next).toHaveLength(2)
  expect(next[1].text).toBe('msg 2')
  expect(prev).toHaveLength(1)
})

test('appendEntry caps at LOG_CAP, dropping oldest and keeping newest', () => {
  let log: LogEntry[] = []
  for (let i = 0; i < LOG_CAP + 50; i++) log = appendEntry(log, entry(i))
  expect(log).toHaveLength(LOG_CAP)
  expect(log[log.length - 1].text).toBe(`msg ${LOG_CAP + 49}`)
})

test('formatTs zero-pads HH:MM:SS in local time', () => {
  expect(formatTs(new Date(2020, 0, 1, 3, 5, 9).getTime())).toBe('03:05:09')
})

test('levelTag maps all four levels', () => {
  expect(levelTag('sys')).toBe('[sys]')
  expect(levelTag('app')).toBe('[app]')
  expect(levelTag('error')).toBe('[err]')
  expect(levelTag('verbose')).toBe('[dbg]')
})
