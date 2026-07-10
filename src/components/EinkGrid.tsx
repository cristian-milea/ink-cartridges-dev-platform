import { useEffect, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { SCREEN_W, SCREEN_H } from '../lib/constants'
import { clientToEinkPixel, type EinkPixel } from '../lib/pixelGeometry'

/**
 * Pixel-grid + coordinate readout, overlaid on the e-ink display. This is a
 * SIBLING layer over the .eink canvas — it never draws into that canvas, so the
 * e-ink fidelity test (which reads the canvas backing store) is unaffected.
 * Default OFF (`active` false renders nothing) so the smoke test's canvas
 * screenshots see no overlay.
 */
export function EinkGrid({ active }: { active: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hover, setHover] = useState<EinkPixel | null>(null)

  useEffect(() => {
    if (!active) return
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return

    const draw = () => {
      const rect = wrap.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.max(1, Math.round(rect.width * dpr))
      canvas.height = Math.max(1, Math.round(rect.height * dpr))
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const cw = canvas.width / SCREEN_W
      const ch = canvas.height / SCREEN_H
      ctx.lineWidth = 1
      for (let x = 0; x <= SCREEN_W; x++) {
        ctx.strokeStyle = x % 10 === 0 ? 'rgba(127,127,127,0.75)' : 'rgba(127,127,127,0.4)'
        const px = Math.round(x * cw) + 0.5
        ctx.beginPath()
        ctx.moveTo(px, 0)
        ctx.lineTo(px, canvas.height)
        ctx.stroke()
      }
      for (let y = 0; y <= SCREEN_H; y++) {
        ctx.strokeStyle = y % 10 === 0 ? 'rgba(127,127,127,0.75)' : 'rgba(127,127,127,0.4)'
        const py = Math.round(y * ch) + 0.5
        ctx.beginPath()
        ctx.moveTo(0, py)
        ctx.lineTo(canvas.width, py)
        ctx.stroke()
      }
    }

    draw()
    window.addEventListener('resize', draw)
    return () => window.removeEventListener('resize', draw)
  }, [active])

  if (!active) return null

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect) return
    setHover(clientToEinkPixel(rect, e.clientX, e.clientY))
  }

  // Pixel-centre positions as percentages so crosshair/tooltip track the grid exactly.
  const leftPct = hover ? ((hover.x + 0.5) / SCREEN_W) * 100 : 0
  const topPct = hover ? ((hover.y + 0.5) / SCREEN_H) * 100 : 0
  // Flip the tooltip to the opposite side near the right/bottom edges so it stays visible.
  const flipX = hover ? hover.x > SCREEN_W - 60 : false
  const flipY = hover ? hover.y > SCREEN_H - 24 : false

  return (
    <div ref={wrapRef} className="eink-grid" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <canvas ref={canvasRef} className="eink-grid-canvas" />
      {hover && (
        <>
          <div className="eink-grid-crosshair-v" style={{ left: `${leftPct}%` }} />
          <div className="eink-grid-crosshair-h" style={{ top: `${topPct}%` }} />
          <div
            className={`eink-grid-tooltip${flipX ? ' eink-grid-tooltip--flip-x' : ''}${flipY ? ' eink-grid-tooltip--flip-y' : ''}`}
            style={{ left: `${leftPct}%`, top: `${topPct}%` }}
          >
            {hover.x}, {hover.y}
          </div>
        </>
      )}
    </div>
  )
}
