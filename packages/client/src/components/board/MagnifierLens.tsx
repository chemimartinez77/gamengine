import type { RefObject } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// MagnifierLens — fixed zoom loupe that follows the cursor over a board stage.
//
// Renders a magnified slice of the board image centred on `lensPos`, with a
// crosshair. Game-agnostic: the caller passes its board image + aspect ratio.
// ─────────────────────────────────────────────────────────────────────────────

export function MagnifierLens({
  image, ratio, stageRef, stageW, lensPos,
  width = 260, height = 170, zoom = 2.5,
}: {
  image:    string
  ratio:    number
  stageRef: RefObject<HTMLElement | null>
  stageW:   number
  lensPos:  { cx: number; cy: number }
  width?:   number
  height?:  number
  zoom?:    number
}) {
  const stage = stageRef.current
  const r  = stage?.getBoundingClientRect() ?? null
  const sx = r ? lensPos.cx - r.left : 0
  const sy = r ? lensPos.cy - r.top  : 0
  const bgW = stageW * zoom
  const bgH = Math.round((stageW / ratio) * zoom)
  const bgX = width / 2  - sx * zoom
  const bgY = height / 2 - sy * zoom
  return (
    <div style={{
      position: 'fixed',
      left: lensPos.cx - width / 2,
      top:  lensPos.cy - height / 2,
      width, height,
      overflow: 'hidden', borderRadius: 10,
      border: '2px solid rgba(255,215,0,0.85)',
      boxShadow: '0 6px 24px rgba(0,0,0,0.75)',
      pointerEvents: 'none', zIndex: 500,
      background: '#140c03',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `url(${image})`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: `${bgW}px ${bgH}px`,
        backgroundPosition: `${bgX}px ${bgY}px`,
      }} />
      <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, marginTop: -0.5, background: 'rgba(255,255,100,0.55)' }} />
      <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, marginLeft: -0.5, background: 'rgba(255,255,100,0.55)' }} />
      <div style={{ position: 'absolute', bottom: 4, left: 0, right: 0, textAlign: 'center', fontSize: 9, color: 'rgba(255,215,0,0.7)', letterSpacing: 0.5 }}>
        {zoom}× · Z para cerrar
      </div>
    </div>
  )
}
