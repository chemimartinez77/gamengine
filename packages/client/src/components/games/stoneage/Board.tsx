import { useEffect, useRef, useState } from 'react'
import type {
  StoneAgeGameState, StoneAgePlayerState, StoneAgeHutTile,
  StoneAgeCivilizationCard, StoneAgeResourceType, StoneAgePlayerColor,
  StoneAgeGamePhase,
} from '@gamengine/shared'
import { useBoardLayoutEditor } from '../../../hooks/useBoardLayoutEditor'
import { useEditorMode } from '../../../hooks/useEditorMode'
import { Zone, LayoutEditorToolbar } from '../../board'
import {
  createStoneAgeLayout, fromStoneAgeShared, getStoneAgeAnchor, setStoneAgeAnchor,
  scaleStoneAgeElement, exportStoneAgeLayout, getStoneAgeElementScale,
  getStoneAgeChildren, STONEAGE_ROOT_ID, STONEAGE_LS_KEY, STONEAGE_MEEPLE_IDS,
  type StoneAgeBoardLayout,
} from './boardLayout'
// Dev sidecar (server-written); imported statically so Vite HMR re-ingests on save.
import localStoneAgeLayout from './layout.json'

// ─────────────────────────────────────────────────────────────────────────────
// Stone Age — main board UI (React + Tailwind).
//
// The play surface is the real artwork (`extras/board.jpg`) used as an
// absolute-positioned canvas. Hut piles and civilization cards are placed on it
// with the generic `Zone` primitive, driven by editable percentage anchors
// (boardLayout.ts). Run with `?edit=true` to drag them and Ctrl/⌘+S to persist.
//
// Props:
//   • stoneAgeState — the `StoneAgeGameState` from @gamengine/shared (streamed
//     from the server in live play, or produced by initStoneAgeGame in sandbox).
//   • myPlayerId / isMyTurn / gameOver / onLeave / onRematch / rematchVotes /
//     playerCount — standard multiplayer harness props.
//
// Assets are served from Vite's public root (`publicDir: 'assets'`), so URLs are
// `/stoneage/...` — NOT `/assets/...`.
// ─────────────────────────────────────────────────────────────────────────────

const BOARD_IMG       = '/stoneage/extras/board.jpg'
const BOARD_RATIO     = '3536 / 2464' // native board.jpg aspect ratio
const HUT_IMG_BASE    = '/stoneage/huts/'
const CARD_IMG_BASE   = '/stoneage/cards/'
const MEEPLE_IMG_BASE = '/stoneage/meeples/' // red.png | blue.png | yellow.png | green.png

const RESOURCE_ORDER: readonly StoneAgeResourceType[] = ['WOOD', 'CLAY', 'STONE', 'GOLD', 'FOOD']

/** Material → label + badge colours (custom hex evoking each physical resource). */
const RESOURCE_META: Record<StoneAgeResourceType, { label: string; bg: string; text: string }> = {
  WOOD:  { label: 'Madera',  bg: 'bg-[#7c4a21]', text: 'text-amber-50'   },
  CLAY:  { label: 'Arcilla', bg: 'bg-[#b5562f]', text: 'text-orange-50'  },
  STONE: { label: 'Piedra',  bg: 'bg-[#6b7280]', text: 'text-slate-50'   },
  GOLD:  { label: 'Oro',     bg: 'bg-[#d4af37]', text: 'text-yellow-950' },
  FOOD:  { label: 'Comida',  bg: 'bg-[#4d7c2f]', text: 'text-green-50'   },
}

const PLAYER_BOARD_IMG = '/stoneage/extras/player_board.jpg'

const PC_HEX: Record<StoneAgePlayerColor, string> = {
  RED:    '#ef4444',
  BLUE:   '#3b82f6',
  YELLOW: '#eab308',
  GREEN:  '#22c55e',
}

const RES_COLOR: Record<StoneAgeResourceType, string> = {
  FOOD:  '#4d7c2f',
  WOOD:  '#7c4a21',
  CLAY:  '#b5562f',
  STONE: '#6b7280',
  GOLD:  '#d4af37',
}

// Percentage center positions of each resource icon on player_board.jpg (4716×3201)
const RES_POS: Record<StoneAgeResourceType, { left: string; top: string }> = {
  FOOD:  { left: '21.6%', top: '40%'   },
  WOOD:  { left: '30.7%', top: '39.3%' },
  CLAY:  { left: '40%',   top: '39.3%' },
  STONE: { left: '49.3%', top: '38.6%' },
  GOLD:  { left: '58.3%', top: '37.8%' },
}

const PHASE_LABEL: Record<StoneAgeGamePhase, string> = {
  PLACEMENT:  'Colocación',
  RESOLUTION: 'Resolución',
  FEEDING:    'Alimentación',
}


// ── Props ─────────────────────────────────────────────────────────────────────

interface StoneAgeBoardProps {
  stoneAgeState: StoneAgeGameState
  myPlayerId:    string | undefined
  isMyTurn:      boolean
  gameOver:      boolean
  onLeave:       () => void
  onRematch:     () => void
  rematchVotes:  string[]
  playerCount:   number
}

// ── Layout hydration helpers (sidecar → editable state) ───────────────────────

function hydrateFromFile(): StoneAgeBoardLayout {
  return fromStoneAgeShared(localStoneAgeLayout as StoneAgeBoardLayout)
}

function loadStoneAgeLayout(): StoneAgeBoardLayout {
  const base = hydrateFromFile()
  try {
    const raw = localStorage.getItem(STONEAGE_LS_KEY)
    if (!raw) return base
    const p = JSON.parse(raw) as Partial<StoneAgeBoardLayout>
    return {
      scales:  { ...base.scales,  ...(p.scales  ?? {}) },
      anchors: { ...base.anchors, ...(p.anchors ?? {}) },
      parents: { ...base.parents, ...(p.parents ?? {}) },
    }
  } catch {}
  return base
}

// ── Small primitives ──────────────────────────────────────────────────────────

function EmptySlot({ label, width }: { label: string; width: number }) {
  return (
    <div
      style={{ width, height: Math.round(width * 1.26) }}
      className="box-border flex items-center justify-center rounded-md border-2 border-dashed border-white/40 bg-black/30 text-[10px] font-bold uppercase tracking-wider text-white/60"
    >
      {label}
    </div>
  )
}

function describeCost(tile: StoneAgeHutTile): string {
  if (tile.cost.variable) {
    const v = tile.cost.variable
    return `${v.resourceCount} rec. (≤${v.allowedTypes} tipos)`
  }
  if (tile.cost.fixed) {
    const parts = (RESOURCE_ORDER as StoneAgeResourceType[])
      .filter((r): r is 'WOOD' | 'CLAY' | 'STONE' | 'GOLD' => r in tile.cost.fixed!)
      .map(r => `${tile.cost.fixed![r]} ${RESOURCE_META[r].label}`)
    return parts.join(' + ')
  }
  return 'gratis'
}

// ── Canvas pieces (placed on the board image via Zone) ────────────────────────

function BoardHutPile({ pile, width }: { pile: StoneAgeHutTile[]; width: number }) {
  const top = pile[0]
  if (!top) return <EmptySlot label="Vacío" width={width} />

  const height = Math.round(width * 1.262)

  return (
    <div className="relative" style={{ width, height }} title={`${top.points} pts · ${describeCost(top)}`}>
      {/* Single opaque top tile — fills the slot, no peeking beneath */}
      <img
        src={`${HUT_IMG_BASE}${top.imageName}`}
        alt={`Cabaña ${top.id}`}
        style={{
          display: 'block',
          width,
          height,
          objectFit: 'cover',
          borderRadius: 6,
        }}
        className="shadow-lg ring-1 ring-black/60"
      />

      {/* Quantity badge — always on top, inset so the stage never clips it */}
      <span className="absolute right-0.5 top-0.5 z-10 flex h-6 min-w-6 items-center justify-center rounded-full border border-white/50 bg-black/90 px-1 text-[11px] font-extrabold text-white shadow-md">
        {pile.length}
      </span>
    </div>
  )
}

function BoardCivCard({ card, width }: { card: StoneAgeCivilizationCard | null; width: number }) {
  if (!card) return <EmptySlot label="Vacío" width={width} />
  return (
    <img
      src={`${CARD_IMG_BASE}${card.imageName}`}
      alt={`Carta ${card.id}`}
      style={{ width, height: Math.round(width * 1.4) }}
      className="rounded-md object-cover shadow-lg ring-1 ring-black/50"
    />
  )
}

// ── Player dashboard ──────────────────────────────────────────────────────────

// Below this scale the dashboard switches to a compact, high-legibility view.
const PLAYER_COMPACT_THRESHOLD = 0.5
// Never let overlay text render smaller than this (px) — keeps it readable even
// when the board is zoomed far out.
const MIN_OVERLAY_FONT = 9

function PlayerDashboard({
  player, isActive, scale = 1, containerW = 380,
}: {
  player:      StoneAgePlayerState
  isActive:    boolean
  scale?:      number
  containerW?: number
}) {
  const hex   = PC_HEX[player.color]
  const mpSrc = `${MEEPLE_IMG_BASE}${player.color.toLowerCase()}.png`
  const compact = scale < PLAYER_COMPACT_THRESHOLD

  // All overlay sizes are relative to the rendered container width so they
  // scale correctly at any zoom level without any separate scale multiplier.
  // `rw(pct)` → px, floored at MIN_OVERLAY_FONT for text.
  const rw  = (pct: number) => Math.max(MIN_OVERLAY_FONT, Math.round(containerW * pct))
  // Alias kept for short call sites below.
  const fs  = (basePct: number) => rw(basePct)

  // ── Compact view: just the essentials, sized for legibility ────────────────
  if (compact) {
    return (
      <div style={{
        position: 'relative', width: '100%', paddingBottom: `${(3201/4716)*100}%`,
        backgroundImage: `url(${PLAYER_BOARD_IMG})`, backgroundSize: '100% 100%',
        borderRadius: 10, overflow: 'hidden',
        boxShadow: isActive
          ? `0 0 0 3px ${hex}, 0 4px 20px rgba(0,0,0,0.65)`
          : '0 2px 10px rgba(0,0,0,0.5)',
      }}>
        {/* Single legible strip: colour dot · name · meeples · score */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          background: 'rgba(0,0,0,0.55)', padding: '0 8px',
        }}>
          <span style={{ width: fs(0.034), height: fs(0.034), borderRadius: '50%', background: hex, flexShrink: 0 }} />
          <span style={{ fontWeight: 800, fontSize: fs(0.034), color: '#fff',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {player.name}
          </span>
          <span style={{ fontWeight: 900, fontSize: fs(0.037), color: '#fff', flexShrink: 0,
            textShadow: '0 0 4px #000, 0 0 4px #000' }}>
            {player.meeples.available}<span style={{ opacity: 0.6 }}>/{player.meeples.total}</span>
          </span>
          <span style={{ fontSize: fs(0.034), fontWeight: 800, color: '#d4af37', flexShrink: 0 }}>
            {player.score}pts
          </span>
        </div>
      </div>
    )
  }

  // ── Full view ──────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'relative',
      width: '100%',
      paddingBottom: `${(3201/4716)*100}%`,
      backgroundImage: `url(${PLAYER_BOARD_IMG})`,
      backgroundSize: '100% 100%',
      borderRadius: 10,
      overflow: 'hidden',
      boxShadow: isActive
        ? `0 0 0 3px ${hex}, 0 4px 20px rgba(0,0,0,0.65)`
        : '0 2px 10px rgba(0,0,0,0.5)',
    }}>

      {/* Player name, active-turn badge, score */}
      <div style={{
        position: 'absolute', top: '3%', left: '9%', right: '27%',
        display: 'flex', alignItems: 'center', gap: 5,
        background: 'rgba(0,0,0,0.72)', borderRadius: 5, padding: '2px 7px',
      }}>
        <span style={{
          display: 'inline-block', width: fs(0.022), height: fs(0.022), borderRadius: '50%',
          background: hex, flexShrink: 0,
        }} />
        <span style={{ fontWeight: 800, fontSize: fs(0.029), color: '#fff', flex: 1,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {player.name}
        </span>
        {isActive && (
          <span style={{
            background: '#d4af37', color: '#1a0e06', fontWeight: 800,
            fontSize: fs(0.021), borderRadius: 3, padding: '1px 4px',
            textTransform: 'uppercase', flexShrink: 0,
          }}>Turno</span>
        )}
        <span style={{ fontSize: fs(0.029), fontWeight: 800, color: '#d4af37', flexShrink: 0 }}>
          {player.score}pts
        </span>
      </div>

      {/* Tools — top-right corner */}
      <div style={{
        position: 'absolute', top: '3%', right: '3%',
        background: 'rgba(0,0,0,0.72)', borderRadius: 5, padding: '2px 6px',
        display: 'flex', alignItems: 'center', gap: 3,
      }}>
        <span style={{ fontSize: fs(0.021) }}>🛠️</span>
        <span style={{ fontSize: fs(0.026), fontWeight: 700, color: '#fcd34d' }}>
          {player.tools.values.length > 0 ? player.tools.values.join('+') : '—'}
        </span>
      </div>

      {/* Agriculture — lower-left ladder area */}
      <div style={{
        position: 'absolute', left: '1.5%', top: '50%',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0,
      }}>
        <span style={{ fontSize: fs(0.032), lineHeight: 1.1 }}>🌾</span>
        <span style={{
          fontSize: fs(0.032), fontWeight: 900, color: '#86efac', lineHeight: 1,
          textShadow: '0 0 4px #000, 0 0 4px #000',
        }}>{player.agriculture}</span>
      </div>

      {/* Resource count badges — overlaid on the resource icons */}
      {(Object.entries(RES_POS) as Array<[StoneAgeResourceType, { left: string; top: string }]>).map(
        ([type, pos]) => {
          const badgeSize = Math.round(containerW * 0.055)
          return (
            <div key={type} style={{
              position: 'absolute',
              left: pos.left,
              top: pos.top,
              transform: 'translate(-50%, -50%)',
              width: badgeSize, height: badgeSize,
              borderRadius: '50%',
              background: RES_COLOR[type],
              border: '1.5px solid rgba(255,255,255,0.55)',
              boxShadow: '0 1px 5px rgba(0,0,0,0.85)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: Math.max(8, Math.round(badgeSize * 0.48)), fontWeight: 900, color: '#fff',
              textShadow: '0 1px 2px rgba(0,0,0,0.9)',
            }}>
              {player.resources[type]}
            </div>
          )
        }
      )}
    </div>
  )
}

// ── Game-over overlay ──────────────────────────────────────────────────────────

function GameOverOverlay({ state, myPlayerId, rematchVotes, playerCount, onLeave, onRematch }: {
  state:        StoneAgeGameState
  myPlayerId:   string | undefined
  rematchVotes: string[]
  playerCount:  number
  onLeave:      () => void
  onRematch:    () => void
}) {
  const winner   = state.players.find(p => p.id === state.winner)
  const isWinner = state.winner === myPlayerId
  const voted    = myPlayerId ? rematchVotes.includes(myPlayerId) : false
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(10,5,2,0.92)',
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'linear-gradient(160deg, #2a1a0e 0%, #1a0e06 100%)',
        borderRadius: 18, padding: '36px 44px', maxWidth: 420, width: '90%', textAlign: 'center',
        boxShadow: '0 24px 64px rgba(0,0,0,0.85), 0 0 0 1px rgba(212,175,55,0.3)' }}>
        <div style={{ fontSize: 64, lineHeight: 1, marginBottom: 10 }}>{isWinner ? '🏆' : '🪵'}</div>
        <h2 style={{ margin: '0 0 6px', fontSize: 26, fontWeight: 800,
          color: isWinner ? '#d4af37' : '#ccc' }}>
          {isWinner ? '¡Has ganado!' : `Ha ganado ${winner?.name ?? '…'}`}
        </h2>
        <p style={{ margin: '0 0 24px', color: '#7a6a5a', fontSize: 12,
          textTransform: 'uppercase', letterSpacing: 1 }}>
          Stone Age · La edad de la humanidad
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          {voted ? (
            <button style={{ padding: '9px 18px', background: '#5a3a1e', color: '#ccc',
              border: 'none', borderRadius: 8, cursor: 'not-allowed', fontWeight: 700, fontSize: 14 }} disabled>
              Esperando revancha… ({rematchVotes.length}/{playerCount})
            </button>
          ) : (
            <button style={{ padding: '9px 18px', background: '#d4af37', color: '#1a0e06',
              border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}
              onClick={onRematch}>
              Revancha
            </button>
          )}
          <button style={{ padding: '9px 18px', background: '#fff', color: '#8b4513',
            border: '1px solid #8b4513', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14 }}
            onClick={onLeave}>
            Salir
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main board ────────────────────────────────────────────────────────────────

export function StoneAgeBoard({
  stoneAgeState, myPlayerId, isMyTurn, gameOver,
  onLeave, onRematch, rematchVotes, playerCount,
}: StoneAgeBoardProps) {
  // Generic visual layout editor — positions for the 4 hut piles + 4 civ cards.
  const stageRef = useRef<HTMLDivElement>(null)
  const {
    layout, setLayout, layoutRef, editorFor, selection, clearSelection,
    stageSelectionProps, marqueeStyle, undo, redo, canUndo, canRedo,
  } = useBoardLayoutEditor<StoneAgeBoardLayout>({
    stageRef, lsKey: STONEAGE_LS_KEY, load: loadStoneAgeLayout, factory: createStoneAgeLayout,
    getAnchor: getStoneAgeAnchor, setAnchor: setStoneAgeAnchor,
    scaleSelected: scaleStoneAgeElement, onExport: exportStoneAgeLayout,
    getChildren: getStoneAgeChildren, rootId: STONEAGE_ROOT_ID,
  })
  // Server-persistence controller: Ctrl/⌘+S + floating "Guardar Layout" button.
  const layoutEditor = useEditorMode({
    gameId: 'stoneage', buildLayout: () => layoutRef.current,
  })
  // Re-ingest the sidecar on Vite HMR when the server rewrites layout.json.
  const skipFirstIngest = useRef(true)
  useEffect(() => {
    if (skipFirstIngest.current) { skipFirstIngest.current = false; return }
    setLayout(hydrateFromFile())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localStoneAgeLayout])

  // Track the stage width (px) so the board image can be sized as a fraction of
  // it and scaled independently. Measured via ResizeObserver, no per-frame DOM.
  const [stageW, setStageW] = useState(0)
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setStageW(el.clientWidth))
    ro.observe(el)
    setStageW(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  // Player boards have their own scale floor (35%) — below that the artwork and
  // overlays become illegible even with the compact view fallback.
  const PBOARD_SCALE_MIN = 0.35
  const pboardScale = (id: string) => Math.max(PBOARD_SCALE_MIN, getStoneAgeElementScale(layout, id))

  // Per-element base sizes (px) scaled by each element's own scale value.
  const hutW    = (id: string) => Math.round(86 * getStoneAgeElementScale(layout, id))
  const cardW   = (id: string) => Math.round(76 * getStoneAgeElementScale(layout, id))
  const pboardW = (id: string) => Math.round(380 * pboardScale(id))
  // Board image width = full stage width × its own scale (default fills stage).
  const boardW  = Math.round(stageW * getStoneAgeElementScale(layout, STONEAGE_ROOT_ID))
  const boardSelected = selection.includes(STONEAGE_ROOT_ID)

  const activeName = stoneAgeState.players[stoneAgeState.activePlayerIndex]?.name ?? '…'

  return (
    <div className="min-h-screen bg-[#2a1a0e] p-4 font-sans text-white">
      {gameOver && (
        <GameOverOverlay
          state={stoneAgeState}
          myPlayerId={myPlayerId}
          rematchVotes={rematchVotes}
          playerCount={playerCount}
          onLeave={onLeave}
          onRematch={onRematch}
        />
      )}

      {/* Layout editor save toolbar (only with ?edit=true) */}
      {layoutEditor.isEditing && (
        <LayoutEditorToolbar
          saveState={layoutEditor.saveState}
          errorMessage={layoutEditor.errorMessage}
          lastWrittenPath={layoutEditor.lastWrittenPath}
          onSave={layoutEditor.save}
          selectionCount={selection.length}
          onClearSelection={clearSelection}
          onUndo={undo}
          onRedo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
        />
      )}

      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-extrabold tracking-tight">🪵 Stone Age</h1>
          <span style={{ fontSize: 12, fontWeight: 700,
            color: isMyTurn ? '#d4af37' : '#aaa',
            background: 'rgba(0,0,0,0.3)', borderRadius: 6, padding: '2px 10px' }}>
            {isMyTurn ? '⭐ Tu turno' : `Turno de ${activeName}`}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-white/70">
            Ronda <span className="font-bold text-white tabular-nums">{stoneAgeState.currentTurn}</span>
            {' · '}
            <span className="font-bold text-amber-300">{PHASE_LABEL[stoneAgeState.currentPhase]}</span>
          </span>
          <button
            style={{ padding: '6px 14px', background: '#fff', color: '#8b4513',
              border: '1px solid #8b4513', borderRadius: 6, cursor: 'pointer',
              fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap' }}
            onClick={onLeave}
          >
            Salir
          </button>
        </div>
      </header>

      <main>
        {/* Stage = neutral viewport. The board artwork (board_root) is a
            pointer-inert image driven by the stage (click=select, drag-when-
            selected=move subtree, +/- = scale); every piece (incl. player
            boards) is a Zone stacked on top. */}
        <div
          ref={stageRef}
          {...(layoutEditor.isEditing ? stageSelectionProps : {})}
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: BOARD_RATIO,
          }}
          className="overflow-hidden rounded-xl shadow-2xl ring-1 ring-black/40 bg-[#1a0e06]"
        >
          {/* The main board image. It is NOT an interactive Zone (so it never
              blocks the stage's pointer handling); selection/move/scale of the
              board are driven by the stage: click selects it, drag-when-selected
              moves it + its subtree, +/- scales it. The image is pointer-inert
              and shows a selection outline when board_root is selected. */}
          {(() => {
            const a = getStoneAgeAnchor(layout, STONEAGE_ROOT_ID) ?? { topPct: 50, leftPct: 50 }
            const isSelected = boardSelected
            return (
              <div
                style={{
                  position: 'absolute',
                  top: `${a.topPct}%`, left: `${a.leftPct}%`,
                  transform: 'translate(-50%, -50%)',
                  width: boardW || '100%',
                  pointerEvents: 'none',
                  outline: isSelected ? '3px solid #3b82f6' : 'none',
                  outlineOffset: 2,
                  zIndex: 0,
                }}
              >
                <img
                  src={BOARD_IMG}
                  alt="Tablero Stone Age"
                  draggable={false}
                  style={{ display: 'block', width: '100%', aspectRatio: BOARD_RATIO, userSelect: 'none' }}
                />
              </div>
            )
          })()}

          {/* 4 hut piles */}
          {stoneAgeState.hutPiles.map((pile, i) => {
            const id = `hut_pile_${i}`
            return (
              <Zone
                key={id}
                anchor={getStoneAgeAnchor(layout, id) ?? { topPct: 25, leftPct: 25 + i * 17 }}
                editor={editorFor(id)}
              >
                <BoardHutPile pile={pile} width={hutW(id)} />
              </Zone>
            )
          })}

          {/* 4 civilization-card market spaces */}
          {stoneAgeState.activeCards.map((card, i) => {
            const id = `civ_card_${i}`
            return (
              <Zone
                key={id}
                anchor={getStoneAgeAnchor(layout, id) ?? { topPct: 66, leftPct: 57 + i * 11 }}
                editor={editorFor(id)}
              >
                <BoardCivCard card={card} width={cardW(id)} />
              </Zone>
            )
          })}

          {/* Player boards — one Zone per seat, clickable & transformable. */}
          {stoneAgeState.players.map((player, i) => {
            const id = `player_board_${i}`
            return (
              <Zone
                key={player.id}
                anchor={getStoneAgeAnchor(layout, id) ?? { topPct: 14 + i * 24, leftPct: 92 }}
                editor={editorFor(id)}
              >
                <div style={{ width: pboardW(id) }}>
                  <PlayerDashboard
                    player={player}
                    isActive={i === stoneAgeState.activePlayerIndex}
                    scale={pboardScale(id)}
                    containerW={pboardW(id)}
                  />
                </div>
              </Zone>
            )
          })}

          {/* Meeple counters — independent zones, children of their player board. */}
          {stoneAgeState.players.map((player, i) => {
            const id = STONEAGE_MEEPLE_IDS[i]
            if (!id) return null
            const meepleSize = Math.round(48 * getStoneAgeElementScale(layout, id))
            const mpSrc = `${MEEPLE_IMG_BASE}${player.color.toLowerCase()}.png`
            return (
              <Zone
                key={id}
                anchor={getStoneAgeAnchor(layout, id) ?? { topPct: 10 + i * 24, leftPct: 89 }}
                editor={editorFor(id)}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <img
                    src={mpSrc} alt={`meeple-${player.color}`} draggable={false}
                    style={{ width: meepleSize, height: 'auto', display: 'block',
                      filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.9))' }}
                  />
                  <span style={{
                    fontSize: Math.max(8, Math.round(meepleSize * 0.42)), fontWeight: 900,
                    color: '#fff', lineHeight: 1,
                    textShadow: '0 0 4px #000, 0 0 4px #000',
                    background: 'rgba(0,0,0,0.55)', borderRadius: 4, padding: '1px 4px',
                  }}>
                    {player.meeples.available}
                    <span style={{ opacity: 0.65 }}>/{player.meeples.total}</span>
                  </span>
                </div>
              </Zone>
            )
          })}

          {/* Marquee selection rectangle (only while drawing) */}
          {marqueeStyle && <div style={marqueeStyle} />}
        </div>

        <p className="mt-2 text-[11px] text-white/50">
          Mazo de civilización: <span className="font-bold tabular-nums">{stoneAgeState.civilizationCardsDeck.length}</span> cartas restantes
        </p>
      </main>
    </div>
  )
}
