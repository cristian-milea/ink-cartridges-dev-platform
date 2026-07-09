export type DpadDirection = 'up'|'down'|'left'|'right'|'up_left'|'up_right'|'down_left'|'down_right'

const ANGLES: [DpadDirection, number][] = [
  ['right', 0], ['down_right', 45], ['down', 90], ['down_left', 135],
  ['left', 180], ['up_left', 225], ['up', 270], ['up_right', 315],
]
const isDiagonal = (d: DpadDirection) => d.includes('_')
const isVertical = (d: DpadDirection) => d === 'up' || d === 'down'
const isHorizontal = (d: DpadDirection) => d === 'left' || d === 'right'

export function classifySwipe(dx: number, dy: number,
    opts: { vertical: boolean; horizontal: boolean; diagonal: boolean },
    minDistance = 24): DpadDirection | 'tap' | null {
  if (Math.hypot(dx, dy) < minDistance) return 'tap'
  const enabled = ANGLES.filter(([d]) =>
    (isDiagonal(d) && opts.diagonal) || (isVertical(d) && opts.vertical) || (isHorizontal(d) && opts.horizontal),
  )
  if (!enabled.length) return null
  const angle = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360
  let best: DpadDirection = enabled[0][0]
  let bestDelta = 361
  for (const [d, a] of enabled) {
    const delta = Math.min(Math.abs(angle - a), 360 - Math.abs(angle - a))
    if (delta < bestDelta) { bestDelta = delta; best = d }
  }
  return best
}
