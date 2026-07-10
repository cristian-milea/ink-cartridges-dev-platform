import { clientToEinkPixel } from './pixelGeometry'

const rect = { left: 100, top: 50, width: 500, height: 244 }

test('top-left inside -> {0,0}', () => {
  expect(clientToEinkPixel(rect, 101, 51)).toEqual({ x: 0, y: 0 })
})
test('near bottom-right just inside -> clamped max index', () => {
  expect(clientToEinkPixel(rect, 100 + 499.9, 50 + 243.9)).toEqual({ x: 249, y: 121 })
})
test('outside the rect -> null on all four sides', () => {
  expect(clientToEinkPixel(rect, 99, 100)).toBeNull()   // left
  expect(clientToEinkPixel(rect, 200, 49)).toBeNull()   // above
  expect(clientToEinkPixel(rect, 600, 100)).toBeNull()  // right (fx === 1)
  expect(clientToEinkPixel(rect, 200, 294)).toBeNull()  // below (fy === 1)
})
test('center -> floor math', () => {
  expect(clientToEinkPixel(rect, 350, 172)).toEqual({ x: 125, y: 61 })
})
test('zero-width rect -> null', () => {
  expect(clientToEinkPixel({ left: 100, top: 50, width: 0, height: 244 }, 100, 100)).toBeNull()
})
