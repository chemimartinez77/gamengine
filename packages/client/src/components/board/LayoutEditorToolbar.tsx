import type { CSSProperties } from 'react'
import type { LayoutSaveState } from '../../hooks/useEditorMode'

// ─────────────────────────────────────────────────────────────────────────────
// LayoutEditorToolbar — floating dev-only overlay for the visual layout editor.
//
// Rendered only while the editor is active. Surfaces a "Guardar Layout" action
// (with loading/success states), the Ctrl/⌘+S shortcut hint, and any Spanish
// error message returned by the server acknowledgment.
//
// NOTE: this client has no Tailwind setup (no config / PostCSS / deps); the whole
// codebase styles with inline `style` objects, so this component follows that
// established convention instead of Tailwind utility classes.
// ─────────────────────────────────────────────────────────────────────────────

interface LayoutEditorToolbarProps {
  saveState:        LayoutSaveState
  errorMessage:     string | null
  lastWrittenPath?: string | null
  onSave:           () => void
}

export function LayoutEditorToolbar({
  saveState, errorMessage, lastWrittenPath, onSave,
}: LayoutEditorToolbarProps) {
  const saving  = saveState === 'saving'
  const success = saveState === 'success'
  const error   = saveState === 'error'

  const label = saving ? 'Guardando…' : success ? '✓ Guardado' : '💾 Guardar Layout'

  const btnStyle: CSSProperties = {
    ...styles.btn,
    ...(saving  ? styles.btnBusy : null),
    ...(success ? styles.btnOk   : null),
    ...(error   ? styles.btnErr  : null),
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.row}>
        <button type="button" onClick={onSave} disabled={saving} style={btnStyle}>
          {label}
        </button>
        <span style={styles.legend}>
          <kbd style={styles.kbd}>Ctrl/⌘ + S</kbd> para guardar
        </span>
      </div>

      {success && lastWrittenPath && (
        <div style={styles.okText}>Guardado en {lastWrittenPath}</div>
      )}
      {error && (
        <div style={styles.errText}>⚠ {errorMessage ?? 'No se pudo guardar la maquetación.'}</div>
      )}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    position: 'fixed', left: 12, bottom: 12, zIndex: 450,
    display: 'flex', flexDirection: 'column', gap: 6,
    background: 'rgba(10,16,24,0.92)',
    border: '1px solid rgba(59,130,246,0.6)', borderRadius: 10,
    padding: '10px 12px', maxWidth: 320,
    color: '#fff', fontFamily: 'system-ui, sans-serif',
    boxShadow: '0 8px 24px rgba(0,0,0,0.55)',
  },
  row: { display: 'flex', alignItems: 'center', gap: 10 },
  btn: {
    padding: '8px 16px', borderRadius: 8, border: 'none',
    background: '#2563eb', color: '#fff',
    fontWeight: 700, fontSize: 13, cursor: 'pointer',
    transition: 'background 0.15s, opacity 0.15s', whiteSpace: 'nowrap',
  },
  btnBusy: { background: '#475569', cursor: 'wait', opacity: 0.85 },
  btnOk:   { background: '#16a34a' },
  btnErr:  { background: '#b3331f' },
  legend:  { fontSize: 11, color: '#9fb4d4', whiteSpace: 'nowrap' },
  kbd: {
    fontFamily: 'ui-monospace, monospace', fontSize: 10, fontWeight: 700,
    background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)',
    borderRadius: 4, padding: '1px 5px', color: '#cfe0ff',
  },
  okText:  { fontSize: 11, color: '#86efac', wordBreak: 'break-all' },
  errText: { fontSize: 12, color: '#fca5a5', fontWeight: 600 },
}
