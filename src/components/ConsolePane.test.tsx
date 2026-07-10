import { render, screen, fireEvent } from '@testing-library/react'
import { ConsolePane } from './ConsolePane'
import type { LogEntry } from '../lib/consoleLog'

const ts = Date.parse('2026-07-10T12:34:56')
const entries: LogEntry[] = [
  { ts, level: 'sys', text: 'system message' },
  { ts, level: 'app', text: 'app message' },
  { ts, level: 'error', text: 'error message' },
  { ts, level: 'verbose', text: 'verbose message' },
]

test('sys/app/error entries are always visible; verbose is hidden by default', () => {
  render(<ConsolePane entries={entries} onClear={() => {}} />)
  expect(screen.getByText('system message')).toBeTruthy()
  expect(screen.getByText('app message')).toBeTruthy()
  expect(screen.getByText('error message')).toBeTruthy()
  expect(screen.queryByText('verbose message')).toBeNull()
})

test('verbose entry appears after enabling the verbose toggle', () => {
  render(<ConsolePane entries={entries} onClear={() => {}} />)
  fireEvent.click(screen.getByRole('checkbox'))
  expect(screen.getByText('verbose message')).toBeTruthy()
})

test('error entry row has console-line--error class', () => {
  const { container } = render(<ConsolePane entries={entries} onClear={() => {}} />)
  const row = screen.getByText('error message').closest('.console-line')
  expect(row).toBeTruthy()
  expect(row!.classList.contains('console-line--error')).toBe(true)
  expect(container.querySelector('.console-line--error')).toBeTruthy()
})

test('clicking Clear calls onClear', () => {
  let called = 0
  render(<ConsolePane entries={entries} onClear={() => { called++ }} />)
  fireEvent.click(screen.getByText('Clear'))
  expect(called).toBe(1)
})

test('scrollable container has console-pane class', () => {
  const { container } = render(<ConsolePane entries={entries} onClear={() => {}} />)
  const pane = container.querySelector('.console-pane')
  expect(pane).toBeTruthy()
  expect(pane!.textContent).toContain('system message')
})
