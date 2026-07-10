import { SCREEN_W, SCREEN_H } from './constants'

export interface EinkPixel { x: number; y: number }

/**
 * Map a client-space mouse point to an e-ink pixel coord using the display
 * element's bounding rect. Returns null when the point is outside the rect.
 * x in [0, SCREEN_W-1], y in [0, SCREEN_H-1] (floored and clamped).
 * rect is a DOMRect-like { left, top, width, height }.
 */
export function clientToEinkPixel(
  rect: { left: number; top: number; width: number; height: number },
  clientX: number,
  clientY: number,
): EinkPixel | null {
  if (rect.width <= 0 || rect.height <= 0) return null
  const fx = (clientX - rect.left) / rect.width
  const fy = (clientY - rect.top) / rect.height
  if (fx < 0 || fx >= 1 || fy < 0 || fy >= 1) return null
  return {
    x: Math.min(SCREEN_W - 1, Math.floor(fx * SCREEN_W)),
    y: Math.min(SCREEN_H - 1, Math.floor(fy * SCREEN_H)),
  }
}
