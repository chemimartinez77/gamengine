import type { ReactNode } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// TokenStack — generic 3D pile geometry.
//
// Stacks already-rendered nodes so deeper items peek upward by `offset` px.
// `items[0]` is the front/top (fully visible). The caller supplies the actual
// piece nodes, so this primitive is game-agnostic.
// ─────────────────────────────────────────────────────────────────────────────

export function TokenStack({ items, size, offset }: {
  items:  ReactNode[]
  size:   number
  offset: number
}) {
  const n = items.length
  const peek = Math.max(0, offset)
  const extra = Math.max(0, n - 1) * peek
  return (
    <div style={{ position: 'relative', width: size, height: size + extra }}>
      {items.map((node, i) => {
        const depth = n - 1 - i // 0 = front token, larger = further back/up
        return (
          <div key={i} style={{ position: 'absolute', left: 0, bottom: depth * peek, zIndex: n - depth }}>
            {node}
          </div>
        )
      })}
    </div>
  )
}
