import { useLayoutEffect, useRef } from 'react'
import type { CSSProperties, PointerEvent, ReactNode } from 'react'
import type { Anchor } from '@gamengine/shared'

// ─────────────────────────────────────────────────────────────────────────────
// Zone — generic board placement primitive.
//
// Absolutely positions its children centred on a percentage `anchor` over a
// relative stage. When an `editor` handle is provided it becomes draggable and
// shows a selection outline. While editing it also reports its on-screen box
// (stage-local px) so the editor's marquee can hit-test it. Pure & game-agnostic.
// ─────────────────────────────────────────────────────────────────────────────

/** A zone's box relative to the stage origin, in px. */
export interface ZoneBox { left: number; top: number; right: number; bottom: number }

/** Editor handle the layout-editor hook hands to a draggable Zone. */
export interface ZoneEditor {
  id: string
  selected: boolean
  onPointerDown: (e: PointerEvent) => void
  /** Report (or clear, with null) this zone's stage-local bounds for marquee hit-testing. */
  registerBounds?: (box: ZoneBox | null) => void
}

export function Zone({ anchor, label, children, editor }: {
  anchor:    Anchor
  label?:    string
  children:  ReactNode
  editor?:   ZoneEditor
}) {
  const ref = useRef<HTMLDivElement>(null)
  const register = editor?.registerBounds

  // Report bounds (relative to the offset parent = the relative stage) whenever
  // the anchor or content geometry changes; clear them on unmount.
  useLayoutEffect(() => {
    if (!register) return
    const el = ref.current
    if (!el) return
    register({
      left:   el.offsetLeft,
      top:    el.offsetTop,
      right:  el.offsetLeft + el.offsetWidth,
      bottom: el.offsetTop + el.offsetHeight,
    })
    return () => register(null)
  })

  return (
    <div
      ref={ref}
      onPointerDown={editor?.onPointerDown}
      style={{
        position: 'absolute',
        top: `${anchor.topPct}%`, left: `${anchor.leftPct}%`,
        transform: 'translate(-50%, -50%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
        ...(editor ? {
          cursor: 'move',
          outline: editor.selected ? '2px solid #3b82f6' : '1px dashed rgba(255,255,255,0.45)',
          outlineOffset: 3,
          borderRadius: 4,
          zIndex: editor.selected ? 50 : 10,
        } : null),
      }}
    >
      {children}
      {label && <span style={labelStyle}>{label}</span>}
    </div>
  )
}

const labelStyle: CSSProperties = {
  fontSize: 9, fontWeight: 700, color: '#fff',
  textShadow: '0 1px 3px rgba(0,0,0,0.95)', whiteSpace: 'nowrap', pointerEvents: 'none',
}
