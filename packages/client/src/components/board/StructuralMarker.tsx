// ─────────────────────────────────────────────────────────────────────────────
// StructuralMarker — editor-only ghost placeholder for a named structural zone.
// Pure and game-agnostic.
// ─────────────────────────────────────────────────────────────────────────────

export function StructuralMarker() {
  return (
    <div style={{
      width: 28, height: 28, borderRadius: '50%',
      background: 'rgba(99,179,255,0.18)',
      border: '1.5px dashed rgba(99,179,255,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 12, color: 'rgba(99,179,255,0.9)',
      pointerEvents: 'none',
    }}>+</div>
  )
}
