import { classifySwipe } from './dpadGeometry'
const all = { vertical: true, horizontal: true, diagonal: true }

test('cardinal swipes', () => {
  expect(classifySwipe(0, -80, all)).toBe('up')
  expect(classifySwipe(80, 0, all)).toBe('right')
})
test('diagonals only when enabled; else snap to nearest enabled cardinal', () => {
  expect(classifySwipe(60, -60, all)).toBe('up_right')
  expect(classifySwipe(60, -60, { vertical: true, horizontal: true, diagonal: false })).toMatch(/^(up|right)$/)
})
test('axis disabled -> snap to enabled axis', () => {
  expect(classifySwipe(80, -10, { vertical: true, horizontal: false, diagonal: false })).toBe('up')
})
test('sub-threshold drag is a tap; nothing enabled -> null', () => {
  expect(classifySwipe(3, 4, all)).toBe('tap')
  expect(classifySwipe(80, 0, { vertical: false, horizontal: false, diagonal: false })).toBeNull()
})
