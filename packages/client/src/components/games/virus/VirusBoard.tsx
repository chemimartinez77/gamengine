import { useState, useEffect, useRef } from 'react'
import type {
  VirusGameState, VirusPlayerState, VirusCard,
  OrganSlot, VirusColor, TreatmentKind, VirusMove,
} from '@gamengine/shared'
import {
  VIRUS_COLORS, colorsMatch, organSlotStatus, isOrganHealthy, VIRUS_WIN_ORGANS,
} from '@gamengine/shared'
import { VirusDebugPanel } from './VirusDebugPanel'
import { isVirusDebugEnabled, logVirusTurn } from './virusDebug'

// ─── CSS keyframe injection (once at module load) ─────────────────────────────
;(function injectStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById('virus-board-styles')) return
  const el = document.createElement('style')
  el.id = 'virus-board-styles'
  el.textContent = `
    @keyframes immuneGlow {
      0%,100% { box-shadow: 0 0 8px rgba(234,179,8,0.45), 0 0 3px rgba(234,179,8,0.3); }
      50%      { box-shadow: 0 0 20px rgba(234,179,8,0.8), 0 0 10px rgba(234,179,8,0.5), 0 0 32px rgba(234,179,8,0.15); }
    }
    @keyframes infectShake {
      0%,100% { transform: translateX(0) rotate(0deg); }
      15%     { transform: translateX(-7px) rotate(-2.5deg); }
      30%     { transform: translateX(7px)  rotate(2.5deg); }
      45%     { transform: translateX(-5px) rotate(-1deg); }
      60%     { transform: translateX(5px)  rotate(1deg); }
      75%     { transform: translateX(-3px); }
      90%     { transform: translateX(3px); }
    }
    @keyframes feedSlideIn {
      from { opacity: 0; transform: translateY(-6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
  `
  document.head.appendChild(el)
})()

// ─── Props ────────────────────────────────────────────────────────────────────

interface VirusBoardProps {
  virusState:   VirusGameState
  myPlayerId:   string | undefined
  isMyTurn:     boolean
  gameOver:     boolean
  onAction:     (move: VirusMove) => void
  onLeave:      () => void
  onRematch:    () => void
  rematchVotes: string[]
  playerCount:  number
}

// ─── Atlas & colour constants ─────────────────────────────────────────────────

// Vite serves packages/client/assets/ at the root URL (publicDir:'assets'),
// so atlas.png at assets/virus/atlas.png is reachable as /virus/atlas.png.
const ATLAS_PATH = '/virus/atlas.png'
const ATLAS_COLS = 5
const ATLAS_ROWS = 5
const ATLAS_BACK = 20

const ALL_BODY_COLORS: VirusColor[] = [...VIRUS_COLORS, 'MULTICOLOR']

const COLOR_HEX: Record<VirusColor, string> = {
  ROJO:       '#ef5350',
  AZUL:       '#42a5f5',
  VERDE:      '#66bb6a',
  AMARILLO:   '#ffd54f',
  MULTICOLOR: '#ce93d8',
}
const COLOR_LABEL: Record<VirusColor, string> = {
  ROJO:       '❤️ Rojo',
  AZUL:       '💙 Azul',
  VERDE:      '💚 Verde',
  AMARILLO:   '💛 Amarillo',
  MULTICOLOR: '🌈 Multicolor',
}
const COLOR_ES: Record<VirusColor, string> = {
  ROJO:       'rojo',
  AZUL:       'azul',
  VERDE:      'verde',
  AMARILLO:   'amarillo',
  MULTICOLOR: 'multicolor',
}
const TREATMENT_LABEL: Record<TreatmentKind, string> = {
  TRANSPLANTE:  'Transplante',
  LADRON:       'Ladrón de Órganos',
  CONTAGIO:     'Contagio',
  GUANTE:       'Guante de Látex',
  ERROR_MEDICO: 'Error Médico',
}

// ─── Activity feed ────────────────────────────────────────────────────────────

interface FeedEntry {
  id:       string
  icon:     string
  text:     string
  severity: 'danger' | 'warning' | 'info'
}

function buildFeedEntry(
  prev:       VirusGameState,
  curr:       VirusGameState,
  actor:      VirusPlayerState,
  myPlayerId: string,
): FeedEntry | null {
  const uid  = `${Date.now()}_${Math.random()}`
  const name = actor.name

  const prevMe = prev.players.find(p => p.id === myPlayerId)
  const currMe = curr.players.find(p => p.id === myPlayerId)
  if (!prevMe || !currMe) return null

  // ── Actions that target MY body ───────────────────────────────────────────

  // GUANTE: my hand was emptied and I must skip next play phase
  if (prevMe.hand.length >= 2 && currMe.hand.length === 0 && currMe.mustSkipPlay) {
    return { id: uid, icon: '🧤', severity: 'danger',
      text: `${name} usó el Guante de Látex — ¡tu mano fue vaciada!` }
  }

  // Collect organ-level changes on my body
  const disappeared: { color: VirusColor; slot: OrganSlot }[] = []
  const newlyInfected: { color: VirusColor; slot: OrganSlot; wasVaccinated: boolean }[] = []

  for (const color of ALL_BODY_COLORS) {
    const ps = prevMe.cuerpo[color]
    const cs = currMe.cuerpo[color]

    if (ps && !cs) disappeared.push({ color, slot: ps })

    if (ps && cs && ps.viruses.length === 0 && cs.viruses.length > 0) {
      newlyInfected.push({ color, slot: cs, wasVaccinated: organSlotStatus(ps) === 'VACUNADO' })
    }
  }

  // ERROR_MEDICO: 2+ organs disappeared (entire body swap)
  if (disappeared.length >= 2) {
    return { id: uid, icon: '🔀', severity: 'danger',
      text: `${name} te aplicó un Error Médico — ¡habéis intercambiado los cuerpos!` }
  }

  // Single organ removed (LADRÓN / extirpación / TRANSPLANTE)
  if (disappeared.length === 1) {
    const { slot } = disappeared[0]
    if (slot.viruses.length > 0) {
      return { id: uid, icon: '☣️', severity: 'danger',
        text: `${name} extirpó tu órgano ${COLOR_ES[slot.organ.color]} infectado` }
    }
    return { id: uid, icon: '🦷', severity: 'danger',
      text: `${name} robó tu órgano ${COLOR_ES[slot.organ.color]}` }
  }

  // Infection or vaccine destruction
  if (newlyInfected.length > 0) {
    const { slot, wasVaccinated } = newlyInfected[0]
    if (wasVaccinated) {
      return { id: uid, icon: '💥', severity: 'warning',
        text: `${name} destruyó la vacuna de tu órgano ${COLOR_ES[slot.organ.color]}` }
    }
    return { id: uid, icon: '🦠', severity: 'danger',
      text: `${name} infectó tu órgano ${COLOR_ES[slot.organ.color]}` }
  }

  // ── Bot self-actions (did not directly target me) ─────────────────────────

  const actorPrev = prev.players.find(p => p.id === actor.id)
  const actorCurr = curr.players.find(p => p.id === actor.id)

  if (actorPrev && actorCurr) {
    // Bot placed a new organ
    for (const color of ALL_BODY_COLORS) {
      if (!actorPrev.cuerpo[color] && actorCurr.cuerpo[color]) {
        const newSlot = actorCurr.cuerpo[color]!
        return { id: uid, icon: '🧬', severity: 'info',
          text: `${name} implantó un nuevo órgano ${COLOR_ES[newSlot.organ.color]}` }
      }
    }

    // Bot organ status improvements / CONTAGIO self-cure detection
    for (const color of ALL_BODY_COLORS) {
      const ps2 = actorPrev.cuerpo[color]
      const cs2 = actorCurr.cuerpo[color]
      if (!ps2 || !cs2) continue
      const prevStatus = organSlotStatus(ps2)
      const currStatus = organSlotStatus(cs2)

      if (currStatus === 'INMUNIZADO' && prevStatus !== 'INMUNIZADO') {
        return { id: uid, icon: '✦', severity: 'info',
          text: `${name} inmunizó su órgano ${COLOR_ES[cs2.organ.color]}` }
      }
      if (currStatus === 'VACUNADO' && prevStatus === 'LIBRE') {
        return { id: uid, icon: '💉', severity: 'info',
          text: `${name} se vacunó el órgano ${COLOR_ES[cs2.organ.color]}` }
      }

      // Infection cleared — check if CONTAGIO spread to another player
      if (prevStatus === 'INFECTADO' && currStatus === 'LIBRE') {
        const someOppGotVirus = curr.players.some(p => {
          if (p.id === actor.id || p.id === myPlayerId) return false
          const oppPrev = prev.players.find(op => op.id === p.id)
          return ALL_BODY_COLORS.some(c => {
            const os = oppPrev?.cuerpo[c]
            const oc = p.cuerpo[c]
            return os && oc && os.viruses.length === 0 && oc.viruses.length > 0
          })
        })
        if (someOppGotVirus) {
          return { id: uid, icon: '☣️', severity: 'warning',
            text: `¡Alerta! ${name} propagó el Contagio` }
        }
        return { id: uid, icon: '🔬', severity: 'info',
          text: `${name} curó su infección en ${COLOR_ES[cs2.organ.color]}` }
      }
    }

    // Bot stole from another opponent (not me)
    for (const opp of curr.players) {
      if (opp.id === actor.id || opp.id === myPlayerId) continue
      const oppPrev = prev.players.find(p => p.id === opp.id)
      if (!oppPrev) continue
      for (const color of ALL_BODY_COLORS) {
        if (oppPrev.cuerpo[color] && !opp.cuerpo[color]) {
          return { id: uid, icon: '🦷', severity: 'info',
            text: `${name} robó un órgano de ${opp.name}` }
        }
      }
    }
  }

  // Generic fallback
  return { id: uid, icon: '🤖', severity: 'info',
    text: `${name} realizó una acción` }
}

// ─── Atlas card renderer ──────────────────────────────────────────────────────

function atlasStyle(atlasIndex: number, size: number): React.CSSProperties {
  const col    = atlasIndex % ATLAS_COLS
  const row    = Math.floor(atlasIndex / ATLAS_ROWS)
  const height = Math.round(size * 1.4)
  return {
    width: size, height,
    flexShrink: 0,
    borderRadius: 8,
    backgroundImage:    `url(${ATLAS_PATH})`,
    backgroundSize:     `${ATLAS_COLS * 100}% ${ATLAS_ROWS * 100}%`,
    backgroundPosition: `${(col / (ATLAS_COLS - 1)) * 100}% ${(row / (ATLAS_ROWS - 1)) * 100}%`,
    backgroundRepeat: 'no-repeat',
  }
}

function cardTitle(card: VirusCard): string {
  if (card.type === 'TRATAMIENTO' && card.treatment) return TREATMENT_LABEL[card.treatment]
  const typeLabel = card.type === 'ORGANO' ? 'Órgano' : card.type === 'VIRUS' ? 'Virus' : 'Medicina'
  return `${typeLabel} ${card.color.charAt(0) + card.color.slice(1).toLowerCase()}`
}

interface CardViewProps {
  card:           VirusCard
  size?:          number
  isSelected?:    boolean
  isHighlighted?: boolean
  isDimmed?:      boolean
  onClick?:       () => void
}
function VirusCardView({ card, size = 72, isSelected, isHighlighted, isDimmed, onClick }: CardViewProps) {
  const height = Math.round(size * 1.4)
  return (
    <div
      onClick={onClick}
      title={cardTitle(card)}
      style={{
        ...atlasStyle(card.atlasIndex, size),
        position: 'relative',
        backgroundColor: COLOR_HEX[card.color],
        cursor:     onClick ? 'pointer' : 'default',
        boxShadow:  isSelected
          ? '0 0 0 3px #FFD700, 0 8px 20px rgba(0,0,0,0.7)'
          : isHighlighted
            ? '0 0 0 2px #00e676, 0 4px 12px rgba(0,0,0,0.5)'
            : '0 2px 6px rgba(0,0,0,0.5)',
        transform:   isSelected ? 'translateY(-10px) scale(1.06)' : 'none',
        transition: 'transform 0.15s, box-shadow 0.15s',
        opacity:    isDimmed ? 0.38 : 1,
      }}
    >
      {/* Fallback label visible when atlas is absent */}
      <div style={{
        position: 'absolute', bottom: 4, left: 0, right: 0, textAlign: 'center',
        fontSize: Math.max(7, Math.round(size * 0.12)),
        fontWeight: 800, color: '#fff',
        textShadow: '0 1px 2px rgba(0,0,0,0.9)',
        pointerEvents: 'none',
      }}>
        {card.type === 'TRATAMIENTO' && card.treatment
          ? card.treatment.slice(0, 4)
          : card.type === 'ORGANO' ? 'ORG'
          : card.type === 'VIRUS'  ? 'VIR'
          : 'MED'}
      </div>
    </div>
  )
}

function CardBack({ size = 72 }: { size?: number }) {
  const height = Math.round(size * 1.4)
  return (
    <div style={{
      ...atlasStyle(ATLAS_BACK, size),
      backgroundColor: '#4a148c',
      boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
    }}>
      <div style={{
        height, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: Math.round(size * 0.22), color: 'rgba(255,255,255,0.5)',
      }}>🧫</div>
    </div>
  )
}

// ─── Organ slot ───────────────────────────────────────────────────────────────

const STATUS_HEX: Record<string, string> = {
  LIBRE:      '#9e9e9e',
  VACUNADO:   '#81c784',
  INMUNIZADO: '#ffd54f',
  INFECTADO:  '#ef5350',
}
const STATUS_LABEL: Record<string, string> = {
  LIBRE:      'Libre',
  VACUNADO:   'Vacunado',
  INMUNIZADO: 'Inmune ✦',
  INFECTADO:  'Infectado',
}

interface SlotProps {
  playerId:    string
  color:       VirusColor
  slot:        OrganSlot | undefined
  eligible:    Set<string>
  goldenRing?: boolean
  isShaking?:  boolean
  compact?:    boolean
  onSlotClick: (playerId: string, color: VirusColor) => void
}

function OrganSlotView({ playerId, color, slot, eligible, goldenRing, isShaking, compact, onSlotClick }: SlotProps) {
  const key        = `${playerId}:${color}`
  const isEligible = eligible.has(key)
  const size       = compact ? 44 : 68
  const height     = Math.round(size * 1.4)

  if (!slot) {
    if (compact) {
      return <div style={{
        width: size, height, borderRadius: 6,
        border: `1.5px dashed ${COLOR_HEX[color]}33`,
        opacity: 0.3,
      }} />
    }
    return (
      <div
        onClick={isEligible ? () => onSlotClick(playerId, color) : undefined}
        title={`Colocar órgano ${color.toLowerCase()} aquí`}
        style={{
          width: size, height, borderRadius: 8, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          border: `2px dashed ${isEligible ? '#00e676' : COLOR_HEX[color] + '55'}`,
          background: isEligible ? 'rgba(0,230,118,0.06)' : 'rgba(255,255,255,0.02)',
          cursor: isEligible ? 'pointer' : 'default',
          boxShadow: isEligible ? '0 0 14px rgba(0,230,118,0.3)' : 'none',
          transition: 'box-shadow 0.2s',
        }}
      >
        <span style={{ color: COLOR_HEX[color], fontSize: 22, opacity: 0.55 }}>+</span>
      </div>
    )
  }

  const status   = organSlotStatus(slot)
  const isImmune = status === 'INMUNIZADO'
  // Immune glow only when not overridden by eligibility or transplante highlight.
  const showImmuneGlow = isImmune && !isEligible && !goldenRing

  return (
    <div
      onClick={isEligible ? () => onSlotClick(playerId, color) : undefined}
      style={{
        position: 'relative',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
        cursor: isEligible ? 'pointer' : 'default',
        outline: goldenRing ? '2.5px solid #FFD700'
               : isEligible ? '2px solid #00e676' : 'none',
        outlineOffset: 3, borderRadius: 10, padding: 2,
        // Immune golden border (static, animation adds the glow)
        border: showImmuneGlow ? '1.5px solid rgba(234,179,8,0.55)' : undefined,
        // Box-shadow: eligibility states take priority over immune glow (animation handles it)
        boxShadow: goldenRing
          ? '0 0 0 2.5px #FFD700'
          : isEligible
            ? '0 0 14px rgba(0,230,118,0.35)'
            : 'none',
        // Animation priority: shake > immune glow > none
        animation: isShaking
          ? 'infectShake 0.58s ease-in-out'
          : showImmuneGlow
            ? 'immuneGlow 2.5s ease-in-out infinite'
            : 'none',
        transition: 'box-shadow 0.2s',
      }}
    >
      <VirusCardView card={slot.organ} size={size} />

      {/* Virus badges (top-right) */}
      {!compact && slot.viruses.length > 0 && (
        <div style={{ position: 'absolute', top: 6, right: -6,
          display: 'flex', flexDirection: 'column', gap: 2 }}>
          {slot.viruses.map((v, i) => (
            <div key={i} title={`Virus ${v.color}`} style={{
              width: 18, height: 18, borderRadius: '50%',
              background: COLOR_HEX[v.color],
              border: '1.5px solid rgba(255,255,255,0.7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.6)',
            }}>🦠</div>
          ))}
        </div>
      )}

      {/* Medicine badges (top-left) */}
      {!compact && slot.medicines.length > 0 && (
        <div style={{ position: 'absolute', top: 6, left: -6,
          display: 'flex', flexDirection: 'column', gap: 2 }}>
          {slot.medicines.map((m, i) => (
            <div key={i} title={`Medicina ${m.color}`} style={{
              width: 18, height: 18, borderRadius: '50%',
              background: COLOR_HEX[m.color],
              border: '1.5px solid rgba(255,255,255,0.7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.6)',
            }}>💊</div>
          ))}
        </div>
      )}

      {/* Status label */}
      {!compact && (
        <span style={{
          fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: 0.5,
          color: STATUS_HEX[status] ?? '#aaa',
          textShadow: isImmune ? '0 0 6px rgba(234,179,8,0.55)' : 'none',
        }}>
          {STATUS_LABEL[status]}
        </span>
      )}

      {/* Compact dot indicator */}
      {compact && status !== 'LIBRE' && (
        <div style={{
          position: 'absolute', bottom: 3, right: 3,
          width:  isImmune ? 10 : 7,
          height: isImmune ? 10 : 7,
          borderRadius: '50%',
          background: STATUS_HEX[status] ?? '#aaa',
          border: isImmune ? '1.5px solid rgba(234,179,8,0.8)' : '1px solid rgba(0,0,0,0.3)',
          boxShadow: isImmune ? '0 0 5px rgba(234,179,8,0.65)' : 'none',
        }} />
      )}
    </div>
  )
}

// ─── Hand card with discard toggle ───────────────────────────────────────────

function HandCard({ card, isSelected, isDiscarded, onSelect, onToggleDiscard, canInteract }: {
  card:            VirusCard
  isSelected:      boolean
  isDiscarded:     boolean
  onSelect:        () => void
  onToggleDiscard: () => void
  canInteract:     boolean
}) {
  return (
    <div style={{ position: 'relative' }}>
      <VirusCardView
        card={card}
        size={82}
        isSelected={isSelected && !isDiscarded}
        isDimmed={isDiscarded}
        onClick={canInteract && !isDiscarded ? onSelect : undefined}
      />
      {canInteract && (
        <button
          onClick={e => { e.stopPropagation(); onToggleDiscard() }}
          title={isDiscarded ? 'Desmarcar' : 'Marcar para descartar'}
          style={{
            position: 'absolute', top: -7, right: -7,
            width: 20, height: 20, borderRadius: '50%', padding: 0,
            background: isDiscarded ? '#ef5350' : 'rgba(0,0,0,0.55)',
            border: '1.5px solid rgba(255,255,255,0.35)',
            color: '#fff', fontWeight: 900, fontSize: 11,
            cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            lineHeight: 1,
          }}
        >×</button>
      )}
    </div>
  )
}

// ─── Opponent panel ───────────────────────────────────────────────────────────

function OpponentPanel({ player, eligible, transplanteHighlight, onSlotClick, onPlayerClick }: {
  player:               VirusPlayerState
  eligible:             Set<string>
  transplanteHighlight?: string
  onSlotClick:          (playerId: string, color: VirusColor) => void
  onPlayerClick:        (playerId: string) => void
}) {
  const slots        = ALL_BODY_COLORS.map(c => player.cuerpo[c]).filter((s): s is OrganSlot => s !== undefined)
  const healthyCount = slots.filter(s => isOrganHealthy(s)).length
  const isPlayerTarget = eligible.has(`player:${player.id}`)

  return (
    <div
      onClick={isPlayerTarget ? () => onPlayerClick(player.id) : undefined}
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: isPlayerTarget
          ? '2px solid #00e676'
          : '1px solid rgba(255,255,255,0.10)',
        borderRadius: 10, padding: '10px 14px',
        cursor: isPlayerTarget ? 'pointer' : 'default',
        boxShadow: isPlayerTarget ? '0 0 16px rgba(0,230,118,0.25)' : 'none',
        transition: 'box-shadow 0.2s',
        minWidth: 130,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 700, color: '#fff', fontSize: 13 }}>
          {player.isBot && (
            <span title="Jugador controlado por la IA" aria-label="Bot" style={{ fontSize: 11, opacity: 0.8, lineHeight: 1 }}>🤖</span>
          )}
          {player.name}
        </span>
        <span style={{
          fontSize: 11, fontWeight: 800,
          color: healthyCount >= VIRUS_WIN_ORGANS ? '#00e676' : '#e8c074',
        }}>{healthyCount}/{VIRUS_WIN_ORGANS}</span>
      </div>

      {/* Compact organ slots — only occupied colors */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {ALL_BODY_COLORS.filter(c => player.cuerpo[c] !== undefined).map(color => (
          <OrganSlotView
            key={color}
            playerId={player.id}
            color={color}
            slot={player.cuerpo[color]}
            eligible={eligible}
            goldenRing={transplanteHighlight === `${player.id}:${color}`}
            compact
            onSlotClick={onSlotClick}
          />
        ))}
        {slots.length === 0 && (
          <span style={{ color: '#5a6b7a', fontSize: 12 }}>Sin órganos</span>
        )}
      </div>

      <div style={{ marginTop: 6, fontSize: 10, color: '#5a6b7a' }}>
        Mano: {player.handCount} carta{player.handCount !== 1 ? 's' : ''}
      </div>
    </div>
  )
}

// ─── Hint text ────────────────────────────────────────────────────────────────

function getHint(
  playCard: VirusCard | null,
  step2: { player1Id: string; color1: VirusColor } | null,
  mustSkipPlay: boolean,
  isMyTurn: boolean,
): string {
  if (!isMyTurn) return ''
  if (mustSkipPlay) return '¡El Guante de Látex te afectó! Solo puedes descartar y robar este turno.'
  if (!playCard) return 'Selecciona una carta para jugarla, o marca cartas con × para descartarlas.'
  if (playCard.type === 'ORGANO')   return 'Haz clic en el hueco vacío de tu cuerpo del color correspondiente.'
  if (playCard.type === 'VIRUS')    return 'Haz clic en un órgano rival para infectarlo, extirparlo o destruir su vacuna.'
  if (playCard.type === 'MEDICINA') return 'Haz clic en uno de tus órganos para curar, vacunar o inmunizar.'
  if (playCard.treatment === 'TRANSPLANTE')
    return step2 ? 'Selecciona el segundo órgano (de un jugador diferente).' : 'Selecciona el primer órgano a intercambiar.'
  if (playCard.treatment === 'LADRON')       return 'Haz clic en un órgano rival para robarlo.'
  if (playCard.treatment === 'CONTAGIO')     return 'Pulsa "Propagar" para extender tus infecciones a órganos libres rivales.'
  if (playCard.treatment === 'GUANTE')       return 'Pulsa "Usar Guante" para forzar a todos a descartar su mano.'
  if (playCard.treatment === 'ERROR_MEDICO') return 'Haz clic en el panel de un rival para intercambiar vuestros cuerpos completos.'
  return ''
}

// ─── Activity feed panel ──────────────────────────────────────────────────────

const SEVERITY_BORDER: Record<FeedEntry['severity'], string> = {
  danger:  '#ef5350',
  warning: '#ffd54f',
  info:    '#42a5f5',
}

function ActivityFeed({ entries }: { entries: FeedEntry[] }) {
  if (entries.length === 0) return null
  return (
    <div style={st.feedPanel}>
      <div style={st.feedLabel}>⚡ Historial de sabotajes</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 148, overflowY: 'auto' }}>
        {[...entries].reverse().map(entry => (
          <div key={entry.id} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '4px 8px', borderRadius: '0 5px 5px 0',
            borderLeft: `3px solid ${SEVERITY_BORDER[entry.severity]}`,
            background: 'rgba(255,255,255,0.03)',
            animation: 'feedSlideIn 0.3s ease-out',
          }}>
            <span style={{ fontSize: 13, flexShrink: 0 }}>{entry.icon}</span>
            <span style={{ fontSize: 11.5, color: '#dce8f0', lineHeight: 1.35 }}>{entry.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main board component ─────────────────────────────────────────────────────

export function VirusBoard({
  virusState, myPlayerId, isMyTurn, gameOver,
  onAction, onLeave, onRematch, rematchVotes, playerCount,
}: VirusBoardProps) {
  const [playCard,        setPlayCard]        = useState<VirusCard | null>(null)
  const [discardSet,      setDiscardSet]      = useState<Set<string>>(new Set())
  const [transplanteStep, setTransplanteStep] = useState<{ player1Id: string; color1: VirusColor } | null>(null)
  const [feedEntries,     setFeedEntries]     = useState<FeedEntry[]>([])
  const [shakingSlots,    setShakingSlots]    = useState<Set<string>>(new Set())

  const prevStateRef = useRef<VirusGameState | null>(null)

  const me        = virusState.players.find(p => p.id === myPlayerId)
  const opponents = virusState.players.filter(p => p.id !== myPlayerId)
  const activeId  = virusState.players[virusState.turn]?.id
  const activeName = virusState.players.find(p => p.id === activeId)?.name ?? '…'

  // ── State-diff: activity feed + shake detection ─────────────────────────────

  useEffect(() => {
    const prev = prevStateRef.current
    prevStateRef.current = virusState

    if (!prev || !myPlayerId) return

    // Who just acted? The player whose turn it WAS (prev.turn).
    const actor = prev.players[prev.turn]
    if (actor && actor.id !== myPlayerId) {
      const entry = buildFeedEntry(prev, virusState, actor, myPlayerId)
      if (entry) {
        setFeedEntries(prevEntries => [...prevEntries.slice(-8), entry])
      }
    }

    // Shake: detect my organs that just became infected
    const prevMe = prev.players.find(p => p.id === myPlayerId)
    const currMe = virusState.players.find(p => p.id === myPlayerId)
    if (prevMe && currMe) {
      const newShakes = new Set<string>()
      for (const color of ALL_BODY_COLORS) {
        const ps = prevMe.cuerpo[color]
        const cs = currMe.cuerpo[color]
        if (ps && cs && ps.viruses.length === 0 && cs.viruses.length > 0) {
          newShakes.add(color)
        }
      }
      if (newShakes.size > 0) setShakingSlots(newShakes)
    }
  }, [virusState, myPlayerId])

  // Clear shake after animation duration.
  useEffect(() => {
    if (shakingSlots.size === 0) return
    const t = setTimeout(() => setShakingSlots(new Set()), 680)
    return () => clearTimeout(t)
  }, [shakingSlots])

  // Reset play selection on turn change.
  useEffect(() => {
    setPlayCard(null)
    setDiscardSet(new Set())
    setTransplanteStep(null)
  }, [virusState.turn])

  // Dev debug stream: dump the active player's legal-move matrix on every turn.
  const debugEnabled = isVirusDebugEnabled()
  useEffect(() => {
    if (!debugEnabled) return
    const active = virusState.players[virusState.turn]
    if (active) logVirusTurn(virusState, active.id)
  }, [debugEnabled, virusState])

  // ── Eligible target computation ─────────────────────────────────────────────

  const eligible: Set<string> = (() => {
    const s = new Set<string>()
    if (!playCard || !isMyTurn || !myPlayerId) return s

    if (playCard.type === 'ORGANO') {
      if (me && !me.cuerpo[playCard.color]) s.add(`${myPlayerId}:${playCard.color}`)

    } else if (playCard.type === 'VIRUS') {
      for (const opp of opponents) {
        for (const color of ALL_BODY_COLORS) {
          const slot = opp.cuerpo[color]
          if (!slot) continue
          if (colorsMatch(playCard.color, slot.organ.color) && organSlotStatus(slot) !== 'INMUNIZADO')
            s.add(`${opp.id}:${color}`)
        }
      }

    } else if (playCard.type === 'MEDICINA') {
      if (me) {
        for (const color of ALL_BODY_COLORS) {
          const slot = me.cuerpo[color]
          if (!slot) continue
          if (colorsMatch(playCard.color, slot.organ.color) && organSlotStatus(slot) !== 'INMUNIZADO')
            s.add(`${myPlayerId}:${color}`)
        }
      }

    } else if (playCard.type === 'TRATAMIENTO') {
      if (playCard.treatment === 'LADRON') {
        for (const opp of opponents) {
          for (const color of ALL_BODY_COLORS) {
            const slot = opp.cuerpo[color]
            if (!slot || organSlotStatus(slot) === 'INMUNIZADO') continue
            if (!me?.cuerpo[slot.organ.color]) s.add(`${opp.id}:${color}`)
          }
        }
      } else if (playCard.treatment === 'TRANSPLANTE') {
        if (!transplanteStep) {
          for (const player of virusState.players) {
            for (const color of ALL_BODY_COLORS) {
              const slot = player.cuerpo[color]
              if (slot && organSlotStatus(slot) !== 'INMUNIZADO') s.add(`${player.id}:${color}`)
            }
          }
        } else {
          for (const player of virusState.players) {
            if (player.id === transplanteStep.player1Id) continue
            for (const color of ALL_BODY_COLORS) {
              const slot = player.cuerpo[color]
              if (slot && organSlotStatus(slot) !== 'INMUNIZADO') s.add(`${player.id}:${color}`)
            }
          }
        }
      } else if (playCard.treatment === 'ERROR_MEDICO') {
        for (const opp of opponents) s.add(`player:${opp.id}`)
      }
      // CONTAGIO + GUANTE: auto-dispatch, no target needed.
    }
    return s
  })()

  // ── Action handlers ─────────────────────────────────────────────────────────

  function handleSlotClick(playerId: string, color: VirusColor) {
    if (!playCard || !isMyTurn) return
    const key = `${playerId}:${color}`
    if (!eligible.has(key)) return

    if (playCard.type === 'ORGANO') {
      onAction({ type: 'PLAY_ORGAN', cardId: playCard.id })
    } else if (playCard.type === 'VIRUS') {
      onAction({ type: 'PLAY_VIRUS', cardId: playCard.id, targetPlayerId: playerId, targetColor: color })
    } else if (playCard.type === 'MEDICINA') {
      onAction({ type: 'PLAY_MEDICINA', cardId: playCard.id, targetColor: color })
    } else if (playCard.treatment === 'LADRON') {
      onAction({ type: 'PLAY_LADRON', cardId: playCard.id, targetPlayerId: playerId, targetColor: color })
    } else if (playCard.treatment === 'TRANSPLANTE') {
      if (!transplanteStep) {
        setTransplanteStep({ player1Id: playerId, color1: color })
        return
      }
      onAction({
        type: 'PLAY_TRANSPLANTE',
        cardId: playCard.id,
        player1Id: transplanteStep.player1Id,
        color1: transplanteStep.color1,
        player2Id: playerId,
        color2: color,
      })
    }
    clearSelection()
  }

  function handlePlayerClick(targetId: string) {
    if (!playCard || !isMyTurn) return
    if (!eligible.has(`player:${targetId}`)) return
    if (playCard.treatment === 'ERROR_MEDICO') {
      onAction({ type: 'PLAY_ERROR_MEDICO', cardId: playCard.id, targetPlayerId: targetId })
      clearSelection()
    }
  }

  function handleAutoDispatch() {
    if (!playCard || !isMyTurn) return
    if (playCard.treatment === 'CONTAGIO') onAction({ type: 'PLAY_CONTAGIO', cardId: playCard.id })
    if (playCard.treatment === 'GUANTE')   onAction({ type: 'PLAY_GUANTE',   cardId: playCard.id })
    clearSelection()
  }

  function handleDiscard() {
    onAction({ type: 'DISCARD', cardIds: [...discardSet] })
    clearSelection()
  }

  function clearSelection() {
    setPlayCard(null)
    setDiscardSet(new Set())
    setTransplanteStep(null)
  }

  function toggleDiscard(cardId: string) {
    setPlayCard(null)
    setDiscardSet(prev => {
      const next = new Set(prev)
      next.has(cardId) ? next.delete(cardId) : next.add(cardId)
      return next
    })
  }

  // ── Derived UI booleans ─────────────────────────────────────────────────────

  const needsConfirm = playCard?.type === 'TRATAMIENTO' &&
    (playCard.treatment === 'CONTAGIO' || playCard.treatment === 'GUANTE')

  const mustSkip    = me?.mustSkipPlay ?? false
  const canInteract = isMyTurn && !gameOver
  const topCard     = virusState.discardPile[virusState.discardPile.length - 1]

  const transplanteHL = transplanteStep
    ? `${transplanteStep.player1Id}:${transplanteStep.color1}`
    : undefined

  // ── Game-over overlay ───────────────────────────────────────────────────────

  const gameOverOverlay = gameOver ? (() => {
    const winner   = virusState.players.find(p => p.id === virusState.winner)
    const isWinner = virusState.winner === myPlayerId
    const voted    = myPlayerId ? rematchVotes.includes(myPlayerId) : false
    return (
      <div style={st.overlay}>
        <div style={st.overlayPanel}>
          <div style={{ fontSize: 64, lineHeight: 1, marginBottom: 10 }}>{isWinner ? '🏆' : '🎖️'}</div>
          <h2 style={{ margin: '0 0 6px', fontSize: 26, fontWeight: 800, color: isWinner ? '#FFD700' : '#ccc' }}>
            {isWinner ? '¡Has ganado!' : `Ha ganado ${winner?.name ?? '…'}`}
          </h2>
          <p style={{ margin: '0 0 24px', color: '#7a8a99', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
            Virus! · El juego de cartas más contagioso
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            {voted ? (
              <button style={{ ...st.btnPri, opacity: 0.6 }} disabled>
                Esperando revancha… ({rematchVotes.length}/{playerCount})
              </button>
            ) : (
              <button style={st.btnPri} onClick={onRematch}>Revancha</button>
            )}
            <button style={st.btnLeave} onClick={onLeave}>Salir</button>
          </div>
        </div>
      </div>
    )
  })() : null

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={st.page}>
      {gameOverOverlay}

      {/* Dev-only dual debug: visual legal-move panel (console stream handled in effect above) */}
      {debugEnabled && myPlayerId && (
        <VirusDebugPanel state={virusState} playerId={myPlayerId} />
      )}

      {/* Header */}
      <div style={st.header}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>🧫 Virus!</span>
          <span style={{
            fontSize: 12, fontWeight: 700,
            color: isMyTurn ? '#FFD700' : '#aaa',
            background: 'rgba(0,0,0,0.3)', borderRadius: 6, padding: '2px 10px',
          }}>
            {isMyTurn ? '⭐ Tu turno' : `Turno de ${activeName}`}
          </span>
          <span style={{ fontSize: 11, color: '#8aa' }}>
            Mazo: {virusState.deck.length} cartas
          </span>
        </div>
        <button style={st.btnLeave} onClick={onLeave}>Salir</button>
      </div>

      {/* Guante warning */}
      {mustSkip && isMyTurn && (
        <div style={st.guanteWarning}>
          🧤 El Guante de Látex te afectó. Descarta cartas y roba para pasar turno.
        </div>
      )}

      {/* Activity feed — bot action history */}
      <ActivityFeed entries={feedEntries} />

      {/* Opponents */}
      {opponents.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={st.sectionLabel}>Laboratorios rivales</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {opponents.map(opp => (
              <OpponentPanel
                key={opp.id}
                player={opp}
                eligible={eligible}
                transplanteHighlight={transplanteHL}
                onSlotClick={handleSlotClick}
                onPlayerClick={handlePlayerClick}
              />
            ))}
          </div>
        </div>
      )}

      {/* Central table zone */}
      <div style={st.centralZone}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <span style={st.miniLabel}>Mazo</span>
          <div style={{ position: 'relative' }}>
            <CardBack size={56} />
            <span style={st.deckBadge}>{virusState.deck.length}</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <span style={st.miniLabel}>Descartes</span>
          {topCard
            ? <VirusCardView card={topCard} size={56} />
            : <div style={{ width: 56, height: 78, borderRadius: 8, border: '1.5px dashed rgba(255,255,255,0.15)' }} />}
        </div>
      </div>

      {/* My body */}
      {me && (
        <div style={st.panel}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={st.sectionLabel}>Mi cuerpo — {me.name}</span>
            <span style={{
              fontSize: 13, fontWeight: 800,
              color: (() => {
                const n = ALL_BODY_COLORS.map(c => me.cuerpo[c])
                  .filter((s): s is OrganSlot => s !== undefined && isOrganHealthy(s)).length
                return n >= VIRUS_WIN_ORGANS ? '#00e676' : '#e8c074'
              })(),
            }}>
              {ALL_BODY_COLORS.map(c => me.cuerpo[c])
                .filter((s): s is OrganSlot => s !== undefined && isOrganHealthy(s)).length
              }/{VIRUS_WIN_ORGANS} órganos sanos
            </span>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {ALL_BODY_COLORS.map(color => (
              <div key={color} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 9, color: COLOR_HEX[color], fontWeight: 700 }}>
                  {COLOR_LABEL[color]}
                </span>
                <OrganSlotView
                  playerId={me.id}
                  color={color}
                  slot={me.cuerpo[color]}
                  eligible={eligible}
                  goldenRing={transplanteHL === `${me.id}:${color}`}
                  isShaking={shakingSlots.has(color)}
                  onSlotClick={handleSlotClick}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* My hand */}
      {me && (
        <div style={st.panel}>
          <div style={st.sectionLabel}>Mi mano</div>

          {isMyTurn && (
            <div style={st.hint}>
              {getHint(playCard, transplanteStep, mustSkip, isMyTurn)}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', minHeight: 116, alignItems: 'flex-end', marginTop: 10 }}>
            {me.hand.length === 0
              ? <span style={{ color: '#5a6b7a', fontSize: 13 }}>Sin cartas en mano</span>
              : me.hand.map(card => (
                <HandCard
                  key={card.id}
                  card={card}
                  isSelected={playCard?.id === card.id}
                  isDiscarded={discardSet.has(card.id)}
                  onSelect={() => {
                    setDiscardSet(new Set())
                    setTransplanteStep(null)
                    setPlayCard(prev => prev?.id === card.id ? null : card)
                  }}
                  onToggleDiscard={() => toggleDiscard(card.id)}
                  canInteract={canInteract && !mustSkip}
                />
              ))}
          </div>

          {isMyTurn && (
            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              {needsConfirm && (
                <button style={st.btnAction} onClick={handleAutoDispatch}>
                  {playCard?.treatment === 'CONTAGIO' ? '🦠 Propagar' : '🧤 Usar Guante'}
                </button>
              )}
              {(playCard || transplanteStep) && (
                <button style={st.btnCancel} onClick={clearSelection}>
                  Cancelar
                </button>
              )}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                {discardSet.size > 0 && (
                  <span style={{ fontSize: 12, color: '#9aa' }}>
                    Descartando {discardSet.size} carta{discardSet.size > 1 ? 's' : ''}
                  </span>
                )}
                <button
                  style={{ ...st.btnDiscard, opacity: (!mustSkip && discardSet.size === 0) ? 0.75 : 1 }}
                  onClick={handleDiscard}
                >
                  {discardSet.size > 0
                    ? `Descartar seleccionadas (${discardSet.size})`
                    : mustSkip
                      ? 'Robar y pasar turno'
                      : 'Pasar turno (robar)'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 1100, margin: '0 auto', minHeight: '100vh',
    padding: '20px 16px', boxSizing: 'border-box',
    fontFamily: 'system-ui, sans-serif', color: '#fff',
    backgroundColor: '#1a0a2e',
  },
  header: {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 11, color: '#9a8aaa', textTransform: 'uppercase',
    letterSpacing: 1, marginBottom: 8, fontWeight: 700,
  },
  miniLabel: {
    fontSize: 10, color: '#9a8aaa', textTransform: 'uppercase', letterSpacing: 0.6,
  },
  panel: {
    borderRadius: 12, padding: '12px 16px', marginBottom: 12,
    border: '1px solid rgba(255,255,255,0.10)',
    background: 'rgba(255,255,255,0.04)',
    backdropFilter: 'blur(2px)',
  },
  feedPanel: {
    borderRadius: 8, padding: '8px 12px', marginBottom: 12,
    background: 'rgba(0,0,0,0.28)',
    border: '1px solid rgba(255,255,255,0.07)',
  },
  feedLabel: {
    fontSize: 10, color: '#7a8a99', textTransform: 'uppercase',
    letterSpacing: 1, marginBottom: 6, fontWeight: 700,
  },
  centralZone: {
    display: 'flex', gap: 24, alignItems: 'center',
    justifyContent: 'center', marginBottom: 14,
    padding: '12px 24px', borderRadius: 10,
    background: 'rgba(0,0,0,0.3)',
    border: '1px solid rgba(255,255,255,0.08)',
  },
  hint: {
    fontSize: 12, color: '#adf', background: 'rgba(99,179,255,0.08)',
    border: '1px solid rgba(99,179,255,0.2)',
    borderRadius: 6, padding: '6px 10px',
  },
  deckBadge: {
    position: 'absolute', bottom: -4, right: -4,
    minWidth: 20, height: 20,
    background: 'rgba(0,0,0,0.85)', border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: 10, color: '#fff', fontWeight: 800, fontSize: 11,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '0 4px', boxSizing: 'border-box',
  } as React.CSSProperties,
  guanteWarning: {
    background: 'rgba(239,83,80,0.15)', border: '1px solid rgba(239,83,80,0.4)',
    borderRadius: 8, padding: '8px 14px', marginBottom: 12,
    fontSize: 13, color: '#ffcdd2',
  },
  btnLeave: {
    padding: '6px 14px', background: '#fff', color: '#b3331f',
    border: '1px solid #b3331f', borderRadius: 6, cursor: 'pointer',
    fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap',
  },
  btnPri: {
    padding: '9px 18px', background: '#7b1fa2', color: '#fff',
    border: 'none', borderRadius: 8, cursor: 'pointer',
    fontWeight: 700, fontSize: 14,
  },
  btnAction: {
    padding: '8px 16px', background: '#ce93d8', color: '#1a0a2e',
    border: 'none', borderRadius: 8, cursor: 'pointer',
    fontWeight: 800, fontSize: 13,
  },
  btnCancel: {
    padding: '8px 14px', background: 'rgba(255,255,255,0.10)', color: '#fff',
    border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8,
    cursor: 'pointer', fontWeight: 600, fontSize: 13,
  },
  btnDiscard: {
    padding: '8px 16px', background: 'rgba(239,83,80,0.2)', color: '#ffcdd2',
    border: '1px solid rgba(239,83,80,0.4)', borderRadius: 8,
    cursor: 'pointer', fontWeight: 700, fontSize: 13,
  },
  overlay: {
    position: 'fixed', inset: 0, zIndex: 300,
    background: 'rgba(10,3,20,0.93)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  overlayPanel: {
    background: 'linear-gradient(160deg, #2a0a3e 0%, #1a0a2e 100%)',
    borderRadius: 18, padding: '36px 44px',
    maxWidth: 420, width: '90%', textAlign: 'center',
    boxShadow: '0 24px 64px rgba(0,0,0,0.85), 0 0 0 1px rgba(206,147,216,0.3)',
  },
}
