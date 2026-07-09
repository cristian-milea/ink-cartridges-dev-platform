import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { LocalBridge, type LocalFiles, sameMtimes } from './LocalBridge'

// --- Mutable mock of the File System Access API -----------------------------
// A mock file whose lastModified + text() we can mutate between poll ticks.
class MockFile {
  name: string
  content: string
  lastModified: number
  kind = 'file' as const
  constructor(name: string, content: string, lastModified: number) {
    this.name = name
    this.content = content
    this.lastModified = lastModified
  }
  getFile() {
    // getFile() returns a fresh File-like snapshot each call, mirroring the real API.
    const { content, lastModified } = this
    return Promise.resolve({ lastModified, text: () => Promise.resolve(content) })
  }
}

class MockDir {
  name: string
  files: MockFile[]
  kind = 'directory' as const
  constructor(name: string, files: MockFile[]) {
    this.name = name
    this.files = files
  }
  async *values() {
    for (const f of this.files) yield f
  }
}

function installPicker(dir: MockDir | (() => MockDir | Promise<MockDir>)) {
  const fn = typeof dir === 'function' ? dir : () => dir
  window.showDirectoryPicker = vi.fn(() => Promise.resolve(fn() as unknown as FileSystemDirectoryHandle))
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
  cleanup()
  delete (window as { showDirectoryPicker?: unknown }).showDirectoryPicker
})

// --- sameMtimes -------------------------------------------------------------

test('sameMtimes: equal when unchanged, differs when lastModified changes', () => {
  expect(sameMtimes({ py: 1, manifest: 2, ui: 3 }, { py: 1, manifest: 2, ui: 3 })).toBe(true)
  expect(sameMtimes({ py: 1 }, { py: 2 })).toBe(false)
  expect(sameMtimes({ py: 1, manifest: 2 }, { py: 1, manifest: 9 })).toBe(false)
})

// --- component hot-reload / lifecycle --------------------------------------

test('fires onFiles on pick, and again only when a file changes (not on unchanged ticks)', async () => {
  const py = new MockFile('hello.py', 'print(1)', 100)
  installPicker(new MockDir('hello', [py]))
  const fired: LocalFiles[] = []
  render(<LocalBridge onFiles={(f) => fired.push(f)} />)

  await act(async () => {
    fireEvent.click(screen.getByText('Open local folder'))
  })
  expect(fired).toHaveLength(1) // initial pick
  expect(fired[0]).toMatchObject({ py: 'print(1)', stem: 'hello' })

  // Unchanged tick → no new fire.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000)
  })
  expect(fired).toHaveLength(1)

  // Change py content + mtime → next tick fires.
  py.content = 'print(2)'
  py.lastModified = 200
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000)
  })
  expect(fired).toHaveLength(2)
  expect(fired[1]).toMatchObject({ py: 'print(2)' })
})

test('unmount clears the poll interval (no fire after unmount)', async () => {
  const py = new MockFile('hello.py', 'print(1)', 100)
  installPicker(new MockDir('hello', [py]))
  const fired: LocalFiles[] = []
  const { unmount } = render(<LocalBridge onFiles={(f) => fired.push(f)} />)

  await act(async () => {
    fireEvent.click(screen.getByText('Open local folder'))
  })
  expect(fired).toHaveLength(1)

  unmount()
  py.content = 'print(2)'
  py.lastModified = 200
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000)
  })
  expect(fired).toHaveLength(1) // interval cleared → no post-unmount fire
})

test('re-pick does not leak a second interval and stale reads do not clobber the new folder', async () => {
  const first = new MockFile('first.py', 'first', 100)
  const second = new MockFile('second.py', 'second', 100)
  // First pick resolves immediately; second pick's dir resolves the same way.
  installPicker(() => new MockDir('first', [first]))
  const fired: LocalFiles[] = []
  render(<LocalBridge onFiles={(f) => fired.push(f)} />)

  await act(async () => {
    fireEvent.click(screen.getByText('Open local folder'))
  })
  expect(fired).toHaveLength(1)
  expect(fired[0]).toMatchObject({ stem: 'first' })

  // Re-pick a different folder.
  installPicker(() => new MockDir('second', [second]))
  await act(async () => {
    fireEvent.click(screen.getByText('Open local folder'))
  })
  expect(fired[fired.length - 1]).toMatchObject({ stem: 'second' })
  const countAfterRepick = fired.length

  // Advance one tick: only the SECOND folder's interval should be live. If the
  // first interval leaked we'd see extra fires; unchanged second folder → none.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000)
  })
  expect(fired).toHaveLength(countAfterRepick)

  // A change to the OLD folder must never fire (its interval is dead).
  first.content = 'first-edited'
  first.lastModified = 999
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000)
  })
  expect(fired).toHaveLength(countAfterRepick)
  expect(fired.every((f) => f.stem !== 'first' || f.py === 'first')).toBe(true)
})

test('generation guard: a pick whose read resolves after a re-pick does not fire stale onFiles', async () => {
  // First pick's scan/read is delayed; a second pick starts before it resolves.
  let releaseFirst!: () => void
  const firstGate = new Promise<void>((r) => {
    releaseFirst = r
  })
  const slowFirst = new MockDir('slow-first', [new MockFile('slow.py', 'slow', 100)])
  // Override values() to block until we release the gate.
  slowFirst.values = async function* () {
    await firstGate
    for (const f of [new MockFile('slow.py', 'slow', 100)]) yield f
  }

  installPicker(() => slowFirst)
  const fired: LocalFiles[] = []
  render(<LocalBridge onFiles={(f) => fired.push(f)} />)

  // Kick off the slow first pick (does not await completion).
  fireEvent.click(screen.getByText('Open local folder'))

  // Re-pick a fast second folder before the first resolves.
  installPicker(() => new MockDir('fast', [new MockFile('fast.py', 'fast', 100)]))
  await act(async () => {
    fireEvent.click(screen.getByText('Open local folder'))
  })
  expect(fired).toMatchObject([{ stem: 'fast' }])

  // Now release the stale first read — its generation is stale, so it must NOT fire.
  await act(async () => {
    releaseFirst()
    // Flush the chain of microtasks the released generator/read produces.
    for (let i = 0; i < 10; i++) await Promise.resolve()
  })
  expect(fired).toHaveLength(1)
  expect(fired[0]).toMatchObject({ stem: 'fast' })
})
