import { useRef, useState } from 'react'
import { classifySwipe, type DpadDirection } from '../lib/dpadGeometry'

type Node = Record<string, unknown>

const ARROWS: Record<DpadDirection, string> = {
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  up_left: '↖',
  up_right: '↗',
  down_left: '↙',
  down_right: '↘',
}

export interface DpadProps {
  node: Node
  onAction: (action: unknown) => void
}

export function Dpad({ node, onAction }: DpadProps) {
  const axes = {
    vertical: Boolean(node.vertical),
    horizontal: Boolean(node.horizontal),
    diagonal: Boolean(node.diagonal),
  }
  const actions = (node.actions && typeof node.actions === 'object' ? node.actions : {}) as Record<string, unknown>
  const center = node.center

  const originRef = useRef<{ x: number; y: number } | null>(null)
  const [lastDirection, setLastDirection] = useState<DpadDirection | null>(null)

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    originRef.current = { x: e.clientX, y: e.clientY }
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const origin = originRef.current
    originRef.current = null
    if (!origin) return
    const dx = e.clientX - origin.x
    const dy = e.clientY - origin.y
    const result = classifySwipe(dx, dy, axes)
    if (result === 'tap') {
      if (center) onAction(center)
      return
    }
    if (result === null) return
    setLastDirection(result)
    const action = actions[result]
    if (action) onAction(action)
  }

  return (
    <div
      className="dpad"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      style={{
        width: 160,
        height: 160,
        margin: '0 auto',
        border: '2px solid currentColor',
        borderRadius: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 48,
        userSelect: 'none',
        touchAction: 'none',
      }}
    >
      {lastDirection ? ARROWS[lastDirection] : '+'}
    </div>
  )
}
