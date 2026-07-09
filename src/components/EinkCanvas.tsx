import { useEffect, useRef } from 'react'
import { SCREEN_W, SCREEN_H } from '../lib/constants'

export function EinkCanvas({ png, scale = 3 }: { png: Uint8Array | null; scale?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!png?.length || !ref.current) return
    const ctx = ref.current.getContext('2d')
    if (!ctx) return
    const img = new Image()
    // Uint8Array's generic ArrayBufferLike prevents structural match to BlobPart's
    // ArrayBuffer-only ArrayBufferView; ours is always a plain ArrayBuffer at runtime.
    const blob = new Blob([png as BlobPart], { type: 'image/png' })
    const url = URL.createObjectURL(blob)
    img.onload = () => {
      ctx.imageSmoothingEnabled = false
      ctx.clearRect(0, 0, SCREEN_W * scale, SCREEN_H * scale)
      ctx.drawImage(img, 0, 0, SCREEN_W * scale, SCREEN_H * scale)
      URL.revokeObjectURL(url)
    }
    img.src = url
    return () => URL.revokeObjectURL(url)
  }, [png, scale])

  return (
    <canvas
      ref={ref}
      width={SCREEN_W * scale}
      height={SCREEN_H * scale}
      className="eink"
      data-testid="eink-canvas"
    />
  )
}
