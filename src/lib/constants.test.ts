import { RAW_BASE, SCREEN_W } from './constants'
test('constants sane', () => {
  expect(RAW_BASE.endsWith('/')).toBe(true)
  expect(SCREEN_W).toBe(250)
})
