import type { CSSProperties, PointerEvent, ReactNode } from 'react'
import type { Anchor } from '@gamengine/shared'

// ─────────────────────────────────────────────────────────────────────────────
// Zone — generic board placement primitive.
//
// Absolutely positions its children centred on a percentage `anchor` over a
// relative stage. When an `editor` handle is provided it becomes draggable and
// shows a selection outline. Pure and game-agnostic.
// ─────────────────────────────────────────────────────────────────────────────

/** Editor handle the layout-editor hook hands to a draggable Zone. */
export interface ZoneEditor {
  id: string
  selected: boolean
  onPointerDown: (e: PointerEvent) => void
}

export function Zone({ anchor, label, children, editor }: {
  anchor:    Anchor
  label?:    string
  children:  ReactNode
  editor?:   ZoneEditor
}) {
  return (
    <div
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
