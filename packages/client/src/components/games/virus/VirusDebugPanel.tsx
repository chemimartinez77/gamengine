import { useMemo, useState, type CSSProperties } from 'react'
import type { VirusGameState, VirusCard } from '@gamengine/shared'
import { enumerateLegalVirusMoves, describeVirusMove, describeVirusDiscard } from '@gamengine/shared'
import { logVirusMoveFocus } from './virusDebug'

// ─────────────────────────────────────────────────────────────────────────────
// VirusDebugPanel — dev-only sidebar that lists every strictly legal move for a
// player, with its immediate consequence and strategic impact. Legal moves come
// from the SHARED matrix (`enumerateLegalVirusMoves`) — the exact same rule
// evaluation the bots use — so a wrong consequence here means the bot is wrong too.
//
// Styled with inline `style` objects (this client has no Tailwind). Text is Spanish
// per the project's UI-language rule.
// ─────────────────────────────────────────────────────────────────────────────

function cardLabel(c: VirusCard): string {
  if (c.type === 'TRATAMIENTO') return c.treatment ?? 'TRATAMIENTO'
  return `${c.type} ${c.color}`
}

export function VirusDebugPanel({ state, playerId }: {
  state:    VirusGameState
  playerId: string
}) {
  const [collapsed, setCollapsed] = useState(false)

  const me        = state.players.find(p => p.id === playerId)
  const isMyTurn  = state.players[state.turn]?.id === playerId
  const handHidden = !me || !Array.isArray(me.hand)

  const rows = useMemo(() => {
    if (!me) return []
    return enumerateLegalVirusMoves(state, playerId).map(move => ({
      move,
      ...describeVirusMove(state, playerId, move),
    }))
  }, [state, playerId, me])

  if (collapsed) {
    return (
      <button style={{ ...styles.fab }} onClick={() => setCollapsed(false)} title="Abrir panel de depuración">
        🐞 Debug
      </button>
    )
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <span style={{ fontWeight: 800 }}>🐞 Virus Debug</span>
        <button style={styles.closeBtn} onClick={() => setCollapsed(true)} title="Colapsar">×</button>
      </div>

      <div style={styles.sub}>
        Jugador: <b style={{ color: '#cfe0ff' }}>{me?.name ?? playerId}</b>
        {' · '}
        {isMyTurn
          ? <span style={{ color: '#86efac' }}>su turno</span>
          : <span style={{ color: '#fca5a5' }}>esperando turno</span>}
      </div>

      {me?.mustSkipPlay && (
        <div style={styles.note}>🧤 Bajo Guante de Látex: solo puede descartar este turno.</div>
      )}

      {/* ── Legal plays ──────────────────────────────────────────────────── */}
      <div style={styles.sectionTitle}>Jugadas legales ({rows.length})</div>
      {handHidden ? (
        <div style={styles.note}>Mano oculta (jugador remoto).</div>
      ) : rows.length === 0 ? (
        <div style={styles.note}>Sin jugadas legales — toca reciclar (descartar).</div>
      ) : (
        rows.map((r, i) => (
          <div
            key={i}
            style={styles.moveCard}
            onMouseEnter={() => logVirusMoveFocus(state, playerId, r.move)}
          >
            <div style={styles.moveAction}>{r.action}</div>
            <div style={styles.moveLine}><span style={styles.tag}>Consecuencia</span> {r.consequence}</div>
            <div style={styles.moveLine}><span style={{ ...styles.tag, ...styles.tagImpact }}>Impacto</span> {r.impact}</div>
          </div>
        ))
      )}

      {/* ── Discard / recycle ────────────────────────────────────────────── */}
      {!handHidden && me && me.hand.length > 0 && (
        <>
          <div style={styles.sectionTitle}>Reciclar (descartar 1–3)</div>
          {me.hand.map(card => (
            <div
              key={card.id}
              style={styles.discardRow}
              onMouseEnter={() => logVirusMoveFocus(state, playerId, { type: 'DISCARD', cardIds: [card.id] })}
            >
              <span style={styles.discardName}>{cardLabel(card)}</span>
              <span style={styles.discardCons}>
                {describeVirusDiscard(state, playerId, [card.id]).consequence}
              </span>
            </div>
          ))}
          {me.hand.length > 1 && (
            <div style={styles.discardRow}>
              <span style={styles.discardName}>Toda la mano ({me.hand.length})</span>
              <span style={styles.discardCons}>
                {describeVirusDiscard(state, playerId, me.hand.map(c => c.id)).consequence}
              </span>
            </div>
          )}
        </>
      )}

      <div style={styles.footer}>Reglas compartidas con el bot · pasa el cursor para volcar al console</div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    position: 'fixed', top: 64, right: 8, bottom: 8, width: 320, zIndex: 200,
    display: 'flex', flexDirection: 'column', gap: 6,
    background: 'rgba(10,16,24,0.94)', border: '1px solid rgba(124,252,0,0.4)',
    borderRadius: 10, padding: '10px 12px', overflowY: 'auto',
    color: '#e5edf6', fontFamily: 'system-ui, sans-serif', fontSize: 12,
    boxShadow: '0 8px 28px rgba(0,0,0,0.6)',
  },
  fab: {
    position: 'fixed', top: 64, right: 8, zIndex: 200,
    background: 'rgba(10,16,24,0.94)', border: '1px solid rgba(124,252,0,0.4)',
    borderRadius: 8, padding: '6px 10px', color: '#7CFC00',
    fontWeight: 700, fontSize: 12, cursor: 'pointer',
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  closeBtn: {
    background: 'transparent', border: 'none', color: '#9fb4d4',
    fontSize: 18, lineHeight: 1, cursor: 'pointer', padding: 0,
  },
  sub: { fontSize: 11, color: '#9fb4d4', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 6 },
  sectionTitle: {
    fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8,
    color: '#7CFC00', fontWeight: 700, marginTop: 6,
  },
  moveCard: {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8, padding: '7px 9px', display: 'flex', flexDirection: 'column', gap: 3,
  },
  moveAction: { fontWeight: 700, color: '#fff', fontSize: 12 },
  moveLine: { fontSize: 11, color: '#cdd8e4', lineHeight: 1.35 },
  tag: {
    display: 'inline-block', fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
    background: 'rgba(99,179,255,0.18)', color: '#9fd', borderRadius: 4,
    padding: '0 5px', marginRight: 5,
  },
  tagImpact: { background: 'rgba(234,179,8,0.18)', color: '#ffd86b' },
  discardRow: {
    display: 'flex', flexDirection: 'column', gap: 1,
    borderLeft: '2px solid rgba(255,255,255,0.12)', paddingLeft: 8, marginBottom: 2,
  },
  discardName: { fontSize: 11, fontWeight: 700, color: '#fff' },
  discardCons: { fontSize: 10.5, color: '#9fb4d4' },
  note: { fontSize: 11, color: '#9fb4d4', fontStyle: 'italic' },
  footer: { marginTop: 'auto', fontSize: 9.5, color: '#6b7d92', paddingTop: 6 },
}
