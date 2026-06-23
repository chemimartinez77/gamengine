// Board layout (14 slots):
//   [0..5]  → pits of player 0 (left→right)
//   [6]     → store of player 0
//   [7..12] → pits of player 1 (left→right from player 1's perspective)
//   [13]    → store of player 1

import { useState, useEffect, useRef, useCallback } from 'react'
import type { MancalaEvent } from '@gamengine/shared'

const STORE_P0 = 6
const STORE_P1 = 13

interface FlyingSeed {
  id:      number
  startX:  number
  startY:  number
  endX:    number
  endY:    number
  arcH:    number
  delay:   number
  destPit: number
  dur:     number
}

interface MancalaBoardProps {
  board:          number[]
  isMyTurn:       boolean
  gameOver:       boolean
  myIndex:        number
  winnerId:       string | null
  myPlayerId:     string | undefined
  onMove:         (relativePit: number) => void
  playerNames?:   [string, string]
  onLeave:        () => void
  onRematch:      () => void
  rematchVotes:   string[]
  playerCount:    number
  lastEvents?:    MancalaEvent[]
}

// ── Seed renderer ──────────────────────────────────────────────────────────────
// 0    → faint placeholder
// 1–15 → physical dot grid; when flashKey > 0 dots remount → starburst glow
// 16+  → number fallback (rare in practice)
function Seeds({ count, flashKey = 0 }: { count: number; flashKey?: number }) {
  if (count === 0) return <span style={seedStyles.empty}>·</span>
  if (count > 15)  return <span style={seedStyles.bigNumber}>{count}</span>
  const animating = flashKey > 0
  return (
    <span style={seedStyles.grid}>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={animating ? `${flashKey}-${i}` : i}
          className={animating ? 'mancala-seed-flash' : undefined}
          style={seedStyles.dot}
        />
      ))}
    </span>
  )
}

const seedStyles: Record<string, React.CSSProperties> = {
  empty:     { color: 'rgba(240,210,120,0.18)', fontSize: 18 },
  bigNumber: {
    fontSize: 26, fontWeight: 900, color: '#f0d880',
    textShadow: '0 1px 6px rgba(0,0,0,0.95), 0 0 14px rgba(0,0,0,0.7)',
    lineHeight: 1,
  },
  grid: {
    display: 'flex', flexWrap: 'wrap', gap: 3,
    justifyContent: 'center', alignItems: 'center', width: '100%',
  },
  dot: {
    width: 8, height: 8, borderRadius: '50%', display: 'inline-block', flexShrink: 0,
    background: 'radial-gradient(circle at 35% 30%, #fdeea0, #c8a030)',
    boxShadow: '0 1px 3px rgba(0,0,0,0.7), inset 0 -1px 2px rgba(0,0,0,0.3)',
  },
}

// ── Event log helpers ──────────────────────────────────────────────────────────
const LOG_ICONS: Record<string, string> = {
  EXTRA_TURN: '↩',
  CAPTURE:    '⚡',
  SWEEP:      '🌀',
}
const LOG_COLORS: Record<string, React.CSSProperties> = {
  EXTRA_TURN: { background: 'rgba(59,130,246,0.18)',  borderColor: 'rgba(59,130,246,0.35)', color: '#93c5fd' },
  CAPTURE:    { background: 'rgba(251,191,36,0.20)',  borderColor: 'rgba(251,191,36,0.45)', color: '#fcd34d' },
  SWEEP:      { background: 'rgba(167,139,250,0.18)', borderColor: 'rgba(167,139,250,0.35)', color: '#c4b5fd' },
}
function formatEvent(ev: MancalaEvent, myIndex: number, playerNames: [string, string]): string {
  const isMe = ev.playerIndex === myIndex
  const name = playerNames[ev.playerIndex]
  if (ev.type === 'EXTRA_TURN') return isMe ? '¡Turno extra! Tu última semilla cayó en tu almacén.' : `¡Turno extra para ${name}!`
  if (ev.type === 'CAPTURE')    return isMe ? `¡Gran captura! Te llevas tu semilla y las ${ev.seeds} semillas del hoyo opuesto.` : `${name} captura ${ev.seeds} semillas del hoyo opuesto.`
  return `Limpieza final: ${ev.seeds} semillas al almacén de ${name}.`
}

// ── Visual constants ───────────────────────────────────────────────────────────
const BOARD_GRADIENT = 'linear-gradient(160deg, #d49450 0%, #b06820 35%, #c27830 65%, #96571e 100%)'
const WOOD_FRAME     = '0 10px 36px rgba(0,0,0,0.4), 0 2px 10px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(0,0,0,0.25)'
const PIT_BG         = '#170900'
const PIT_SHADOW     = 'inset 0 5px 18px rgba(0,0,0,0.88), inset 0 2px 8px rgba(0,0,0,0.6), inset 0 -1px 3px rgba(255,170,60,0.07)'
const PIT_GLOW       = `${PIT_SHADOW}, 0 0 0 3px #ffb347, 0 0 16px rgba(255,152,0,0.5)`
const STORE_BG       = '#120700'
const STORE_SHADOW   = 'inset 0 8px 28px rgba(0,0,0,0.92), inset 0 3px 12px rgba(0,0,0,0.6), inset 0 -2px 5px rgba(255,170,60,0.05)'
const STORE_GLOW     = `${STORE_SHADOW}, 0 0 0 3px #ffb347, 0 0 20px rgba(255,152,0,0.45)`
const MAX_LOG = 6

// ── Sowing sequence ────────────────────────────────────────────────────────────
function sowingSequence(origin: number, seedCount: number): number[] {
  // Skip the enemy's store: P0 skips 13, P1 skips 6
  const enemyStore = origin <= STORE_P0 ? STORE_P1 : STORE_P0
  const seq: number[] = []
  let cur = origin
  let n = seedCount
  while (n > 0) {
    cur = (cur + 1) % 14
    if (cur === enemyStore) continue
    seq.push(cur)
    n--
  }
  return seq
}

// ── Component ──────────────────────────────────────────────────────────────────
export function MancalaBoard({
  board, isMyTurn, gameOver, myIndex, winnerId, myPlayerId,
  onMove, onLeave, onRematch, rematchVotes, playerCount,
  lastEvents,
  playerNames = ['Jugador 1', 'Jugador 2'],
}: MancalaBoardProps) {

  // displayBoard: visually rendered board, lags behind `board` prop during animation
  const [displayBoard, setDisplayBoard] = useState<number[]>([...board])

  // Flying seeds
  const [flyingSeeds, setFlyingSeeds] = useState<FlyingSeed[]>([])
  const isAnimatingRef  = useRef(false)
  const pendingOriginRef = useRef<number | null>(null)
  const boardRef        = useRef<HTMLDivElement | null>(null)
  const pitRefs         = useRef<(HTMLButtonElement | null)[]>(new Array(14).fill(null))
  const storeRefs       = useRef<(HTMLDivElement | null)[]>([null, null])
  const flyIdRef        = useRef(0)
  const pendingFinalRef = useRef<number[]>([...board])

  // Stable reference to board prop (used inside effects/callbacks without adding to deps)
  const boardPropRef    = useRef(board)
  boardPropRef.current  = board

  // isAnimating is derived from flyingSeeds length so renders stay in sync
  const isAnimating = flyingSeeds.length > 0

  // ── Event log ─────────────────────────────────────────────────────────────────
  type LogEntry = { id: number; text: string; type: string }
  const [log, setLog]    = useState<LogEntry[]>([])
  const logIdRef         = useRef(0)
  const playerNamesRef   = useRef(playerNames)
  playerNamesRef.current = playerNames
  const prevGameOverRef  = useRef(gameOver)

  useEffect(() => {
    if (prevGameOverRef.current && !gameOver) {
      // Rematch: reset everything
      setLog([])
      setFlyingSeeds([])
      isAnimatingRef.current = false
      setDisplayBoard([...boardPropRef.current])
    }
    prevGameOverRef.current = gameOver
  }, [gameOver])

  useEffect(() => {
    if (!lastEvents || lastEvents.length === 0) return
    const names = playerNamesRef.current
    setLog(prev => {
      const entries: LogEntry[] = lastEvents.map(ev => ({
        id: ++logIdRef.current, text: formatEvent(ev, myIndex, names), type: ev.type,
      }))
      return [...entries, ...prev].slice(0, MAX_LOG)
    })
  }, [lastEvents, myIndex])

  // ── Pit-change flash (tracks displayBoard increases only) ─────────────────────
  const [flashKeys, setFlashKeys] = useState<Record<number, number>>({})
  const prevDisplayRef = useRef<number[]>([...board])

  useEffect(() => {
    const prev = prevDisplayRef.current
    const changed: number[] = []
    for (let i = 0; i < displayBoard.length; i++) {
      if (i === STORE_P0 || i === STORE_P1) continue
      if (displayBoard[i] > prev[i]) changed.push(i)
    }
    if (changed.length > 0) {
      setFlashKeys(fk => {
        const next = { ...fk }
        changed.forEach(i => { next[i] = (next[i] ?? 0) + 1 })
        return next
      })
    }
    prevDisplayRef.current = [...displayBoard]
  }, [displayBoard])

  // ── Board-prop change → sow animation ─────────────────────────────────────────
  const prevPropRef = useRef<number[]>([...board])

  useEffect(() => {
    const prev = prevPropRef.current
    if (!board.some((v, i) => v !== prev[i])) return

    pendingFinalRef.current = [...board]

    if (isAnimatingRef.current) {
      // Mid-animation: update the snap target only; current animation will snap to it
      prevPropRef.current = [...board]
      return
    }

    // Determine origin pit
    let origin = pendingOriginRef.current
    pendingOriginRef.current = null

    if (origin === null) {
      // Opponent move: find their pit that went from >0 to 0
      const oppPits = myIndex === 0 ? [7, 8, 9, 10, 11, 12] : [0, 1, 2, 3, 4, 5]
      const found = oppPits.find(i => prev[i] > 0 && board[i] === 0)
      origin = found !== undefined ? found : null
    }

    const snap = () => { setDisplayBoard([...board]); prevPropRef.current = [...board] }

    if (origin === null || !boardRef.current) { snap(); return }

    const seedCount = prev[origin]
    if (seedCount <= 0) { snap(); return }

    const sequence = sowingSequence(origin, seedCount)
    const boardEl  = boardRef.current
    const boardRect = boardEl.getBoundingClientRect()

    function getCenter(idx: number): { x: number; y: number } | null {
      const el: Element | null | undefined =
        idx === STORE_P0 ? storeRefs.current[0]
      : idx === STORE_P1 ? storeRefs.current[1]
      : pitRefs.current[idx]
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: r.left - boardRect.left + r.width / 2, y: r.top - boardRect.top + r.height / 2 }
    }

    const originCenter = getCenter(origin)
    if (!originCenter) { snap(); return }

    const SEED_DUR = 360
    const STAGGER  = 95
    const newFlying: FlyingSeed[] = []

    sequence.forEach((destPit, idx) => {
      const dc = getCenter(destPit)
      if (!dc) return
      const dist = Math.hypot(dc.x - originCenter.x, dc.y - originCenter.y)
      const arcH = Math.min(70, Math.max(22, dist * 0.36))
      newFlying.push({
        id: ++flyIdRef.current,
        startX: originCenter.x, startY: originCenter.y,
        endX: dc.x, endY: dc.y,
        arcH, delay: idx * STAGGER, destPit, dur: SEED_DUR,
      })
    })

    if (newFlying.length === 0) { snap(); return }

    // Immediately empty the origin pit; seeds are now "in flight"
    setDisplayBoard(d => { const n = [...d]; n[origin!] = 0; return n })
    isAnimatingRef.current = true
    setFlyingSeeds(newFlying)
    prevPropRef.current = [...board]
  }, [board, myIndex])

  // ── Seed landing ───────────────────────────────────────────────────────────────
  const handleSeedLand = useCallback((seed: FlyingSeed) => {
    // Increment destination pit (triggers starburst flash detection)
    setDisplayBoard(d => { const n = [...d]; n[seed.destPit]++; return n })

    setFlyingSeeds(prev => {
      const remaining = prev.filter(s => s.id !== seed.id)
      if (remaining.length === 0) {
        isAnimatingRef.current = false
        // Small delay so the last starburst has started before the snap
        setTimeout(() => setDisplayBoard([...pendingFinalRef.current]), 160)
      }
      return remaining
    })
  }, [])

  // ── Render helpers (called as functions, not JSX, to avoid remount on re-render)
  const p0Pits = displayBoard.slice(0, 6)
  const store0 = displayBoard[6]
  const p1Pits = displayBoard.slice(7, 13)
  const store1 = displayBoard[13]

  function renderPit(relativePit: number, playerIndex: number) {
    const absIdx   = playerIndex === 0 ? relativePit : relativePit + 7
    const flashKey = flashKeys[absIdx] ?? 0
    const seeds    = playerIndex === 0 ? p0Pits[relativePit] : p1Pits[relativePit]
    const isOwner  = playerIndex === myIndex
    const canClick = isMyTurn && !gameOver && isOwner && seeds > 0 && !isAnimating
    return (
      <button
        key={absIdx}
        ref={(el) => { pitRefs.current[absIdx] = el }}
        style={{
          ...styles.pit,
          background:  PIT_BG,
          boxShadow:   canClick ? PIT_GLOW : PIT_SHADOW,
          cursor:      canClick ? 'pointer' : 'default',
          opacity:     !isOwner && !gameOver ? 0.72 : 1,
          transform:   canClick ? 'translateY(-1px)' : 'none',
          transition:  'box-shadow 0.2s ease, transform 0.1s ease, opacity 0.2s ease',
          position:    'relative',
        }}
        disabled={!canClick}
        onClick={() => { pendingOriginRef.current = absIdx; onMove(relativePit) }}
        title={canClick ? `Hoyo ${relativePit + 1} — ${seeds} semillas` : undefined}
      >
        {flashKey > 0 && <span key={flashKey} style={styles.pitFlashOverlay} />}
        <Seeds count={seeds} flashKey={flashKey} />
      </button>
    )
  }

  function renderStore(playerIndex: number, count: number) {
    const isActive = playerIndex === myIndex && isMyTurn && !gameOver
    return (
      <div
        ref={(el) => { storeRefs.current[playerIndex] = el }}
        style={{
          ...styles.store,
          background: STORE_BG,
          boxShadow:  isActive ? STORE_GLOW : STORE_SHADOW,
          transition: 'box-shadow 0.3s ease',
        }}
      >
        <span style={styles.storeLabel}>{playerNames[playerIndex]}</span>
        <span style={styles.storeCount}>{count}</span>
        <span style={styles.storeSubLabel}>almacén</span>
      </div>
    )
  }

  function renderFlyingSeed(seed: FlyingSeed) {
    const dx = seed.endX - seed.startX
    const dy = seed.endY - seed.startY
    const outerStyle = {
      position: 'absolute',
      left:  seed.startX - 4,
      top:   seed.startY - 4,
      width: 8, height: 8,
      pointerEvents: 'none',
      zIndex: 100,
      '--dx':    `${dx}px`,
      '--arc':   `${-seed.arcH}px`,
      '--dy':    `${dy}px`,
      '--dur':   `${seed.dur}ms`,
      '--delay': `${seed.delay}ms`,
    } as React.CSSProperties
    return (
      <div
        key={seed.id}
        className="seed-fly-x"
        style={outerStyle}
        onAnimationEnd={(e) => { if (e.animationName === 'seedFlyX') handleSeedLand(seed) }}
      >
        <span className="seed-fly-y" style={{ display: 'block', width: 8, height: 8 }}>
          <span style={styles.flyDot} />
        </span>
      </div>
    )
  }

  // ── End-game derived values ────────────────────────────────────────────────────
  const isDraw      = winnerId === 'DRAW'
  const iWon        = !isDraw && winnerId !== null && winnerId === myPlayerId
  const iLost       = !isDraw && winnerId !== null && winnerId !== myPlayerId
  const winnerName  = isDraw ? null : winnerId === myPlayerId ? playerNames[myIndex] : playerNames[1 - myIndex]
  const hasVoted    = myPlayerId !== undefined && rematchVotes.includes(myPlayerId)
  const winnerIndex = isDraw ? -1 : iWon ? myIndex : 1 - myIndex

  return (
    <>
      <style>{`
        @keyframes mancalaLogIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .mancala-log-new { animation: mancalaLogIn 0.3s ease; }

        @keyframes mancalaPitFlash {
          0%   { box-shadow: 0 0 0 0px  rgba(103,232,249,0.00); opacity: 0; }
          18%  { box-shadow: 0 0 0 5px  rgba(103,232,249,0.90), 0 0 22px rgba(103,232,249,0.55); opacity: 1; }
          100% { box-shadow: 0 0 0 2px  rgba(103,232,249,0.06); opacity: 0; }
        }

        @keyframes mancalaSeedStarburst {
          0%   { box-shadow: 0 1px 3px rgba(0,0,0,0.70), inset 0 -1px 2px rgba(0,0,0,0.30); }
          22%  { box-shadow: 0 0 0 2.5px rgba(253,238,160,0.88), 0 0 7px rgba(253,238,160,0.52),
                             0 1px 3px rgba(0,0,0,0.50), inset 0 -1px 2px rgba(0,0,0,0.20); }
          100% { box-shadow: 0 1px 3px rgba(0,0,0,0.70), inset 0 -1px 2px rgba(0,0,0,0.30); }
        }
        .mancala-seed-flash { animation: mancalaSeedStarburst 1.5s ease forwards; }

        @keyframes seedFlyX {
          from { transform: translateX(0); }
          to   { transform: translateX(var(--dx)); }
        }
        @keyframes seedFlyY {
          0%   { transform: translateY(0);          animation-timing-function: ease-out; }
          50%  { transform: translateY(var(--arc)); animation-timing-function: ease-in; }
          100% { transform: translateY(var(--dy)); }
        }
        .seed-fly-x { animation: seedFlyX var(--dur) linear    var(--delay) both; }
        .seed-fly-y { animation: seedFlyY var(--dur) linear    var(--delay) both; }
      `}</style>

      <div style={styles.wrapper}>
        {/* Turn indicator */}
        <div style={{
          ...styles.turnStrip,
          background: gameOver ? 'rgba(100,100,100,0.07)' : isMyTurn
            ? 'linear-gradient(90deg, rgba(255,152,0,0.14) 0%, rgba(255,152,0,0.04) 100%)'
            : 'rgba(0,0,0,0.04)',
          borderColor: gameOver ? '#d0d0d0' : isMyTurn ? '#ff9800' : '#ddd',
        }}>
          <span style={{
            ...styles.turnDot,
            background: gameOver ? '#bbb' : isMyTurn ? '#ff9800' : '#90a4ae',
            boxShadow: !gameOver && isMyTurn ? '0 0 8px rgba(255,152,0,0.75)' : 'none',
          }} />
          <span style={styles.turnText}>
            {gameOver ? 'Juego terminado' : isMyTurn ? 'Tu turno — elige un hoyo' : `Turno de ${playerNames[1 - myIndex]}`}
          </span>
        </div>

        {/* Wooden board */}
        <div ref={boardRef} style={{ ...styles.boardCanvas, background: BOARD_GRADIENT, boxShadow: WOOD_FRAME }}>
          {flyingSeeds.map(renderFlyingSeed)}

          {renderStore(1, store1)}

          <div style={styles.pitsArea}>
            <div style={{ ...styles.flowGuide, justifyContent: 'flex-start' }}>← Flujo del juego</div>

            <div style={styles.row}>
              {[5, 4, 3, 2, 1, 0].map((i) => renderPit(i, 1))}
            </div>

            <div style={styles.indexRow}>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <span key={n} style={styles.indexLabel}>{n}</span>
              ))}
            </div>

            <div style={styles.row}>
              {[0, 1, 2, 3, 4, 5].map((i) => renderPit(i, 0))}
            </div>

            <div style={{ ...styles.flowGuide, justifyContent: 'flex-end' }}>Flujo del juego →</div>
          </div>

          {renderStore(0, store0)}
        </div>

        {/* Player chips */}
        <div style={styles.playerLabels}>
          <span style={{ ...styles.playerChip, ...(myIndex === 1 ? styles.playerChipMe : {}) }}>
            ↑ {playerNames[1]}{myIndex === 1 ? ' (tú)' : ''}
          </span>
          <span style={{ ...styles.playerChip, ...(myIndex === 0 ? styles.playerChipMe : {}) }}>
            ↓ {playerNames[0]}{myIndex === 0 ? ' (tú)' : ''}
          </span>
        </div>

        {/* Event log */}
        {log.length > 0 && (
          <div style={styles.logWidget}>
            <div style={styles.logHeader}>
              <span style={styles.logHeaderIcon}>📋</span>
              <span>Registro de jugadas</span>
            </div>
            <ul style={styles.logList}>
              {log.map((entry, idx) => (
                <li
                  key={entry.id}
                  className={idx === 0 ? 'mancala-log-new' : undefined}
                  style={{ ...styles.logEntry, ...LOG_COLORS[entry.type] }}
                >
                  <span style={styles.logIcon}>{LOG_ICONS[entry.type]}</span>
                  <span style={styles.logText}>{entry.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* End-game overlay */}
        {gameOver && (
          <div style={styles.overlay}>
            <div style={{
              ...styles.resultBadge,
              background: isDraw
                ? 'linear-gradient(135deg, #607d8b 0%, #37474f 100%)'
                : iWon
                  ? 'linear-gradient(135deg, #43a047 0%, #1b5e20 100%)'
                  : 'linear-gradient(135deg, #e53935 0%, #7f0000 100%)',
            }}>
              <span style={styles.resultEmoji}>{isDraw ? '🤝' : iWon ? '🏆' : '😔'}</span>
              <span style={styles.resultTitle}>
                {isDraw ? '¡Empate!' : iWon ? '¡Ganaste!' : iLost ? 'Perdiste' : `¡${winnerName} gana!`}
              </span>
              {!isDraw && winnerName && (
                <span style={styles.resultSub}>
                  {iWon ? `¡Bien jugado, ${playerNames[myIndex]}!` : `${winnerName} gana esta ronda.`}
                </span>
              )}
            </div>

            <div style={styles.scoreRow}>
              {([0, 1] as const).map((pi) => (
                <div key={pi} style={{
                  ...styles.scoreCard,
                  background: pi === myIndex
                    ? 'linear-gradient(145deg, #1565c0 0%, #0d47a1 100%)'
                    : 'linear-gradient(145deg, #3a3a3a 0%, #1e1e1e 100%)',
                  boxShadow: pi === winnerIndex
                    ? '0 0 0 3px #ffd600, 0 4px 16px rgba(255,214,0,0.3)'
                    : '0 2px 8px rgba(0,0,0,0.3)',
                }}>
                  <span style={styles.scoreName}>{playerNames[pi]}{pi === myIndex ? ' (tú)' : ''}</span>
                  <span style={styles.scoreValue}>{pi === 0 ? store0 : store1}</span>
                  <span style={styles.scoreLabel}>semillas</span>
                </div>
              ))}
            </div>

            <div style={styles.actionRow}>
              {hasVoted ? (
                <button style={styles.btnWaiting} disabled>
                  Esperando rival… ({rematchVotes.length}/{playerCount})
                </button>
              ) : (
                <button style={styles.btnRematch} onClick={onRematch}>Revancha</button>
              )}
              <button style={styles.btnLeave} onClick={onLeave}>Volver al lobby</button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrapper:    { marginTop: 16, fontFamily: "'Segoe UI', system-ui, sans-serif" },

  turnStrip:  {
    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
    padding: '8px 14px', borderRadius: 24, border: '1px solid',
    transition: 'background 0.3s ease, border-color 0.3s ease',
  },
  turnDot:    { width: 10, height: 10, borderRadius: '50%', flexShrink: 0, transition: 'background 0.3s, box-shadow 0.3s' },
  turnText:   { fontSize: 13, fontWeight: 600, color: '#444', letterSpacing: 0.3 },

  boardCanvas: {
    display: 'flex', alignItems: 'stretch', gap: 12,
    padding: '20px 14px', borderRadius: 22,
    border: '2.5px solid rgba(0,0,0,0.28)',
    position: 'relative', overflow: 'visible',
  },

  store: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    width: 68, minHeight: 160, borderRadius: 42, padding: '14px 6px', gap: 5,
    border: '2px solid rgba(0,0,0,0.45)',
  },
  storeLabel:    { fontSize: 10, fontWeight: 700, color: 'rgba(240,210,120,0.65)', textAlign: 'center', maxWidth: 58, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: 1 },
  storeCount:    { fontSize: 34, fontWeight: 800, lineHeight: 1, color: '#f0d880', textShadow: '0 2px 8px rgba(0,0,0,0.9)' },
  storeSubLabel: { fontSize: 9, color: 'rgba(240,210,120,0.35)', textTransform: 'uppercase', letterSpacing: 1.5 },

  pitsArea:   { flex: 1, display: 'flex', flexDirection: 'column', gap: 4 },
  row:        { display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 },
  indexRow:   { display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 },
  indexLabel: {
    textAlign: 'center', fontSize: 14, color: 'rgba(255,255,255,0.60)',
    userSelect: 'none', fontWeight: 800, letterSpacing: 0.5,
    textShadow: '0 1px 4px rgba(0,0,0,0.8)',
  },

  flowGuide: {
    display: 'flex', alignItems: 'center',
    fontSize: 8, fontWeight: 700, letterSpacing: 1.8, textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.2)', padding: '0 2px', userSelect: 'none',
  },

  pit: {
    aspectRatio: '1', borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 6, minWidth: 0,
    border: '2px solid rgba(0,0,0,0.48)',
    overflow: 'visible',
  },

  pitFlashOverlay: {
    position: 'absolute', inset: '-4px', borderRadius: '50%',
    pointerEvents: 'none', zIndex: 2,
    animation: 'mancalaPitFlash 0.85s ease forwards',
  },

  // Flying seed dot — slightly brighter glow so it reads while in flight
  flyDot: {
    width: 8, height: 8, borderRadius: '50%', display: 'block',
    background: 'radial-gradient(circle at 35% 30%, #fdeea0, #c8a030)',
    boxShadow: '0 2px 6px rgba(0,0,0,0.8), 0 0 10px rgba(253,238,160,0.45)',
  },

  playerLabels: { display: 'flex', justifyContent: 'space-between', marginTop: 10, padding: '0 82px' },
  playerChip:   { fontSize: 11, fontWeight: 600, color: '#888', letterSpacing: 0.3 },
  playerChipMe: { color: '#e65100', fontWeight: 700 },

  logWidget: {
    marginTop: 14, borderRadius: 12,
    background: 'rgba(17,24,39,0.92)',
    border: '1px solid rgba(255,255,255,0.07)',
    overflow: 'hidden',
  },
  logHeader: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '8px 12px', fontSize: 11, fontWeight: 700, letterSpacing: 0.8,
    color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  logHeaderIcon: { fontSize: 12 },
  logList:  { listStyle: 'none', margin: 0, padding: '4px 0' },
  logEntry: {
    display: 'flex', alignItems: 'flex-start', gap: 8,
    padding: '6px 12px', fontSize: 12, fontWeight: 500,
    borderLeft: '3px solid transparent', lineHeight: 1.4,
  },
  logIcon:  { fontSize: 13, flexShrink: 0, marginTop: 1 },
  logText:  { flex: 1 },

  overlay: {
    marginTop: 22, borderRadius: 18, padding: '24px 20px',
    background: '#111827',
    boxShadow: '0 16px 48px rgba(0,0,0,0.5), 0 4px 16px rgba(0,0,0,0.35)',
    display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'stretch',
    border: '1px solid rgba(255,255,255,0.07)',
  },
  resultBadge: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
    borderRadius: 14, padding: '22px 18px',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.16), 0 4px 20px rgba(0,0,0,0.4)',
  },
  resultEmoji: { fontSize: 46, lineHeight: 1 },
  resultTitle: { fontSize: 30, fontWeight: 900, lineHeight: 1.1, textAlign: 'center', color: '#fff', textShadow: '0 2px 10px rgba(0,0,0,0.5)' },
  resultSub:   { fontSize: 14, color: 'rgba(255,255,255,0.72)', textAlign: 'center', marginTop: 2 },
  scoreRow:    { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  scoreCard:   {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
    borderRadius: 12, padding: '16px 10px',
    border: '1px solid rgba(255,255,255,0.07)',
  },
  scoreName:  { fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.65)', textAlign: 'center', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: 1 },
  scoreValue: { fontSize: 42, fontWeight: 900, lineHeight: 1, color: '#fff' },
  scoreLabel: { fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 1.5 },
  actionRow:  { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  btnRematch: {
    padding: '12px 0', border: 'none', borderRadius: 10, cursor: 'pointer',
    fontWeight: 800, fontSize: 14, letterSpacing: 0.5,
    background: 'linear-gradient(135deg, #ff9800 0%, #e65100 100%)',
    color: '#fff', boxShadow: '0 4px 14px rgba(230,81,0,0.45)',
  },
  btnWaiting: {
    padding: '12px 0', border: 'none', borderRadius: 10, cursor: 'not-allowed',
    fontWeight: 700, fontSize: 13, opacity: 0.55,
    background: '#374151', color: 'rgba(255,255,255,0.6)',
  },
  btnLeave: {
    padding: '12px 0', borderRadius: 10, cursor: 'pointer',
    fontWeight: 700, fontSize: 14,
    background: 'transparent', color: 'rgba(255,255,255,0.45)',
    border: '1px solid rgba(255,255,255,0.18)',
  },
}
