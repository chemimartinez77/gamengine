import type { VirusGameState, VirusMove } from '@gamengine/shared'
import { enumerateLegalVirusMoves, describeVirusMove } from '@gamengine/shared'

// ─────────────────────────────────────────────────────────────────────────────
// Virus! debug console stream.
//
// Reads legal moves through the SHARED matrix (`enumerateLegalVirusMoves`) — the
// same code the bots use — so the console dump reflects exactly what the engine
// and bots see. Active only in dev / sandbox mode or with `?debug=true`.
//
// Note: the client only ever holds *its own* unmasked hand; opponents' (and
// bots') hands arrive masked, so move enumeration is only meaningful for the
// local player. The shared matrix still guarantees parity with the bot's rules.
// ─────────────────────────────────────────────────────────────────────────────

export function isVirusDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  if (params.get('debug') === 'true') return true
  if (params.get('debug') === 'false') return false
  const host = window.location.hostname
  return host === 'localhost' || host === '127.0.0.1'
}

const TITLE_CSS = 'color:#7CFC00;font-weight:bold;font-size:12px'
const SUB_CSS   = 'color:#9fb4d4'

/** Group-log the full legal-move table for `playerId` when their turn begins. */
export function logVirusTurn(state: VirusGameState, playerId: string): void {
  if (!isVirusDebugEnabled()) return
  const player = state.players.find(p => p.id === playerId)
  const name = player?.name ?? playerId
  const handVisible = !!player && Array.isArray(player.hand) && player.hand.length > 0

  // eslint-disable-next-line no-console
  console.group(`%c🧫 Virus DEBUG · turno de ${name}`, TITLE_CSS)

  if (!handVisible) {
    // eslint-disable-next-line no-console
    console.log('%cMano oculta (jugador remoto / bot enmascarado) — sin acciones visibles.', SUB_CSS)
    // eslint-disable-next-line no-console
    console.groupEnd()
    return
  }

  const moves = enumerateLegalVirusMoves(state, playerId)
  const rows = moves.map(m => {
    const d = describeVirusMove(state, playerId, m)
    return { Acción: d.action, Consecuencia: d.consequence, Impacto: d.impact }
  })

  // eslint-disable-next-line no-console
  console.log(`%c${moves.length} acción(es) legal(es)`, SUB_CSS)
  if (rows.length > 0) {
    // eslint-disable-next-line no-console
    console.table(rows)
  }
  // Raw state slice requested for the debug stream.
  // eslint-disable-next-line no-console
  console.log({
    availableActions: moves,
    targetedPlayer:   playerId,
    structuralChange: moves.map(m => describeVirusMove(state, playerId, m).structuralChange),
  })
  // eslint-disable-next-line no-console
  console.groupEnd()
}

/** Dump the raw state slice for a single move (on hover / select in the panel). */
export function logVirusMoveFocus(state: VirusGameState, playerId: string, move: VirusMove): void {
  if (!isVirusDebugEnabled()) return
  const d = describeVirusMove(state, playerId, move)
  // eslint-disable-next-line no-console
  console.log(`%c▶ ${d.action}`, TITLE_CSS, {
    availableActions: [move],
    targetedPlayer:   d.targetPlayerId,
    structuralChange: d.structuralChange,
    consecuencia:     d.consequence,
    impacto:          d.impact,
  })
}
