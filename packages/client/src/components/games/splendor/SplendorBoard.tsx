import { useState, useEffect } from 'react'
import type { SplendorGameState, SplendorAction, GemType, TokenType, SplendorPlayer } from '@gamengine/shared'
import { LEVEL1_CARDS, LEVEL2_CARDS, LEVEL3_CARDS, NOBLES } from '@gamengine/shared'
import { SplendorCard as CardSprite } from './SplendorCard'
import { SplendorToken as TokenChip } from './SplendorToken'

interface SplendorBoardProps {
  splendorState: SplendorGameState
  myPlayerId:    string | undefined
  isMyTurn:      boolean
  gameOver:      boolean
  onAction:      (action: SplendorAction) => void
  onLeave:       () => void
  onRematch:     () => void
  rematchVotes:  string[]
  playerCount:   number
}

const ALL_GEMS: GemType[]     = ['diamond', 'sapphire', 'emerald', 'ruby', 'onyx']
const ALL_TOKENS: TokenType[] = [...ALL_GEMS, 'gold']

const GEM_LABEL: Record<GemType, string> = {
  diamond:  'Diamante',
  sapphire: 'Zafiro',
  emerald:  'Esmeralda',
  ruby:     'Rubí',
  onyx:     'Ónice',
}

const GEM_COLOR: Record<GemType, string> = {
  diamond:  '#c8d6e5',
  sapphire: '#1565c0',
  emerald:  '#2e7d32',
  ruby:     '#b71c1c',
  onyx:     '#37474f',
}

const CARD_MAP = new Map(
  [...LEVEL1_CARDS, ...LEVEL2_CARDS, ...LEVEL3_CARDS].map(c => [c.id, c])
)
const NOBLE_MAP = new Map(NOBLES.map(n => [n.id, n]))

function totalTokens(p: SplendorPlayer): number {
  return ALL_TOKENS.reduce((s, t) => s + (p.tokens[t] ?? 0), 0)
}

function canAfford(card: ReturnType<typeof CARD_MAP.get>, player: SplendorPlayer): boolean {
  if (!card) return false
  let gold = 0
  for (const gem of ALL_GEMS) {
    const net  = Math.max(0, (card.cost[gem] ?? 0) - (player.bonusGems[gem] ?? 0))
    const from = Math.min(net, player.tokens[gem] ?? 0)
    gold += net - from
  }
  return gold <= (player.tokens.gold ?? 0)
}

export function SplendorBoard({
  splendorState, myPlayerId, gameOver,
  onAction, onLeave, onRematch, rematchVotes, playerCount,
}: SplendorBoardProps) {
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [tokenDraft,     setTokenDraft]     = useState<GemType[]>([])
  const [discardDraft,   setDiscardDraft]   = useState<TokenType[]>([])

  // Reset draft on active-player change
  useEffect(() => {
    setTokenDraft([])
    setSelectedCardId(null)
    setDiscardDraft([])
  }, [splendorState.activePlayerId])

  const myPlayer     = splendorState.players.find(p => p.id === myPlayerId)
  const opponents    = splendorState.players.filter(p => p.id !== myPlayerId)
  const isActive     = splendorState.activePlayerId === myPlayerId
  const myTokens     = myPlayer ? totalTokens(myPlayer) : 0
  const needsDiscard = myTokens > 10
  const discardCount = Math.max(0, myTokens - 10)
  const activePName  = splendorState.players.find(p => p.id === splendorState.activePlayerId)?.name ?? '…'

  // ── Token draft ─────────────────────────────────────────────────────────────

  function handleBankClick(token: TokenType) {
    if (!isActive || needsDiscard || token === 'gold') return
    const gem       = token as GemType
    const bankCount = splendorState.bankTokens[gem] ?? 0
    if (bankCount < 1) return
    const draftHas = tokenDraft.filter(g => g === gem).length
    const total    = tokenDraft.length
    if (total === 2 && tokenDraft[0] === tokenDraft[1]) return   // already pair
    if (total >= 3) return
    if (draftHas === 1) {
      if (total === 1 && bankCount >= 4) setTokenDraft([gem, gem]) // 2-same
      return
    }
    if (total === 2 && tokenDraft[0] === tokenDraft[1]) return    // don't mix pair
    setTokenDraft(prev => [...prev, gem])
  }

  function draftValid(): boolean {
    const n = tokenDraft.length
    if (n === 2 && tokenDraft[0] === tokenDraft[1]) {
      return (splendorState.bankTokens[tokenDraft[0]] ?? 0) >= 4
    }
    if (n === 3 && new Set(tokenDraft).size === 3) {
      return tokenDraft.every(g => (splendorState.bankTokens[g] ?? 0) > 0)
    }
    return false
  }

  function submitDraft() {
    if (!draftValid()) return
    if (tokenDraft.length === 2 && tokenDraft[0] === tokenDraft[1]) {
      onAction({ type: 'TAKE_TWO_SAME_TOKENS', gem: tokenDraft[0]! })
    } else {
      onAction({ type: 'TAKE_THREE_DIFFERENT_TOKENS', gems: tokenDraft })
    }
    setTokenDraft([])
  }

  // ── Card actions ─────────────────────────────────────────────────────────────

  function submitBuy(cardId: string) {
    onAction({ type: 'BUY_CARD', cardId, goldUsed: 0 })
    setSelectedCardId(null)
  }

  function submitReserve(cardId: string) {
    onAction({ type: 'RESERVE_CARD', cardId })
    setSelectedCardId(null)
  }

  // ── Discard ──────────────────────────────────────────────────────────────────

  function addDiscard(token: TokenType) {
    if (!myPlayer) return
    const have     = myPlayer.tokens[token] ?? 0
    const selected = discardDraft.filter(t => t === token).length
    if (selected < have) setDiscardDraft(prev => [...prev, token])
  }

  function removeDiscard(token: TokenType) {
    setDiscardDraft(prev => {
      const idx  = prev.lastIndexOf(token)
      if (idx < 0) return prev
      const next = [...prev]
      next.splice(idx, 1)
      return next
    })
  }

  function submitDiscard() {
    if (discardDraft.length !== discardCount) return
    onAction({ type: 'DISCARD_TOKENS', gems: discardDraft })
    setDiscardDraft([])
  }

  // ── Sub-renders ──────────────────────────────────────────────────────────────

  function renderNobles() {
    // Build the full set of nobles for this game: available + any already claimed by players.
    // Sorting by ID keeps the row order stable as nobles get claimed.
    const claimedIds   = new Set(splendorState.players.flatMap(p => p.nobles))
    const allNobleIds  = [
      ...new Set([...splendorState.availableNobles, ...claimedIds]),
    ].sort()
    if (allNobleIds.length === 0) return null

    return (
      <div style={{ marginBottom: 14 }}>
        <div style={st.sectionLabel}>Nobles</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {allNobleIds.map(id => {
            const noble   = NOBLE_MAP.get(id)
            if (!noble) return null
            const claimed = !splendorState.availableNobles.includes(id)
            return (
              <div key={id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                {/* Image + badge wrapper — position:relative to anchor the badge */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <img
                    src={`/splendor/nobles/${id}.jpg`}
                    style={{
                      width: 62, height: 62, borderRadius: 7, objectFit: 'cover',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.55)', display: 'block',
                      opacity: claimed ? 0.38 : 1,
                      filter:  claimed ? 'grayscale(75%)' : 'none',
                      transition: 'opacity 0.4s, filter 0.4s',
                    }}
                    alt={`Noble ${id}`}
                  />
                  {claimed && (
                    <div style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0,
                      background: 'rgba(0,0,0,0.74)',
                      borderBottomLeftRadius: 7, borderBottomRightRadius: 7,
                      textAlign: 'center', padding: '3px 0',
                      fontSize: 8, fontWeight: 800,
                      color: '#66bb6a', letterSpacing: 0.8,
                    }}>
                      RECLAMADO
                    </div>
                  )}
                </div>
                {/* Gem requirement chips — hide once claimed to avoid clutter */}
                {!claimed && (
                  <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'center' }}>
                    {(Object.entries(noble.requires) as [GemType, number][])
                      .filter(([, n]) => n > 0)
                      .map(([gem, n]) => (
                        <span key={gem} style={{
                          background: GEM_COLOR[gem], borderRadius: 3,
                          padding: '1px 4px', fontSize: 9, fontWeight: 800,
                          color: gem === 'diamond' ? '#1a1a1a' : '#fff',
                        }}>
                          {n}
                        </span>
                      ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  function renderBankAndDraft() {
    return (
      <div style={{ width: 200, flexShrink: 0 }}>
        <div style={st.sectionLabel}>Banco</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
          {ALL_TOKENS.map(token => {
            const count    = splendorState.bankTokens[token] ?? 0
            const isGold   = token === 'gold'
            const inDraft  = isGold ? 0 : tokenDraft.filter(g => g === token).length
            const clickable = isActive && !needsDiscard && !isGold && count > 0
            return (
              <div key={token} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <div
                  style={{ cursor: clickable ? 'pointer' : 'default', opacity: count === 0 ? 0.3 : 1,
                           outline: inDraft > 0 ? '2px solid #FFD700' : 'none', borderRadius: '50%' }}
                  onClick={() => clickable && handleBankClick(token)}
                >
                  <TokenChip gem={token} size={44} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: count === 0 ? '#555' : '#ccc' }}>{count}</span>
                {inDraft > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#FFD700' }}>−{inDraft}</span>
                )}
              </div>
            )
          })}
        </div>

        {/* Draft preview + actions */}
        {isActive && !needsDiscard && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {tokenDraft.length > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {tokenDraft.map((gem, i) => (
                  <span key={i} style={{
                    background: GEM_COLOR[gem], borderRadius: 4,
                    padding: '2px 7px', fontSize: 11, fontWeight: 700,
                    color: gem === 'diamond' ? '#222' : '#fff',
                  }}>
                    {GEM_LABEL[gem]}
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              {tokenDraft.length > 0 && (
                <button style={{ ...st.btnSm, ...st.btnSec }} onClick={() => setTokenDraft([])}>
                  Limpiar
                </button>
              )}
              {draftValid() && (
                <button style={{ ...st.btnSm, ...st.btnPri }} onClick={submitDraft}>
                  Tomar fichas
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  function renderMarketRow(level: 1 | 2 | 3) {
    const deckSize = splendorState.decks[level].length
    const cards    = splendorState.market[level]
    const cardW    = 64

    return (
      <div key={level} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        {/* Deck back */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <CardSprite level={level} spriteIndex={0} isFaceUp={false} width={cardW} />
          {deckSize > 0 && (
            <span style={{
              position: 'absolute', bottom: 4, left: 0, right: 0, textAlign: 'center',
              fontSize: 11, fontWeight: 800, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,1)',
              pointerEvents: 'none',
            }}>
              {deckSize}
            </span>
          )}
        </div>

        {/* Face-up slots */}
        {Array.from({ length: 4 }).map((_, i) => {
          const cardId = cards[i]
          if (!cardId) {
            return (
              <div key={`empty-${i}`} style={{
                width: cardW, height: Math.round(cardW * 1.4),
                borderRadius: 6, border: '1px dashed rgba(255,255,255,0.15)',
                background: 'rgba(255,255,255,0.04)', flexShrink: 0,
              }} />
            )
          }
          const card       = CARD_MAP.get(cardId)
          const isSelected = selectedCardId === cardId
          return (
            <div
              key={cardId}
              style={{ position: 'relative', flexShrink: 0, cursor: isActive ? 'pointer' : 'default' }}
              onClick={() => isActive && setSelectedCardId(isSelected ? null : cardId)}
            >
              {card && <CardSprite level={card.level} spriteIndex={card.spriteIndex} isFaceUp={true} width={cardW} />}
              {isSelected && (
                <div style={{
                  position: 'absolute', inset: 0, borderRadius: 6,
                  border: '2px solid #FFD700',
                  boxShadow: '0 0 10px rgba(255,215,0,0.6)',
                  pointerEvents: 'none',
                }} />
              )}
            </div>
          )
        })}
      </div>
    )
  }

  function renderMyHUD() {
    if (!myPlayer) return null
    return (
      <div style={{
        marginTop: 14,
        background: isActive ? 'rgba(255,215,0,0.07)' : 'rgba(255,255,255,0.05)',
        border: `1px solid ${isActive ? 'rgba(255,215,0,0.45)' : 'rgba(255,255,255,0.10)'}`,
        borderRadius: 10, padding: '12px 16px',
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>

          {/* Name + prestige */}
          <div style={{ minWidth: 90 }}>
            <div style={{ fontWeight: 700, color: '#fff', fontSize: 14 }}>
              {isActive && '⭐ '}{myPlayer.name}
            </div>
            <div style={{ color: '#FFD700', fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>
              {myPlayer.prestigePoints}<span style={{ fontSize: 12, fontWeight: 400, color: '#aaa' }}> pts</span>
            </div>
            {myPlayer.nobles.length > 0 && (
              <div style={{ fontSize: 11, color: '#FFD700', marginTop: 2 }}>
                {myPlayer.nobles.length} noble{myPlayer.nobles.length > 1 ? 's' : ''}
              </div>
            )}
          </div>

          {/* Tokens */}
          <div>
            <div style={{ ...st.sectionLabel, marginBottom: 4 }}>Fichas ({myTokens}/10)</div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {ALL_TOKENS.map(token => {
                const count = myPlayer.tokens[token] ?? 0
                if (count === 0) return null
                return <TokenChip key={token} gem={token} size={32} count={count} />
              })}
              {myTokens === 0 && <span style={{ color: '#555', fontSize: 12 }}>—</span>}
            </div>
          </div>

          {/* Bonus gems (development card bonuses) */}
          <div>
            <div style={{ ...st.sectionLabel, marginBottom: 4 }}>Descuentos</div>
            <div style={{ display: 'flex', gap: 5 }}>
              {ALL_GEMS.map(gem => {
                const count = myPlayer.bonusGems[gem] ?? 0
                return (
                  <div key={gem} style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: GEM_COLOR[gem],
                    border: '1px solid rgba(255,255,255,0.18)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 800,
                    color: gem === 'diamond' ? '#1a1a1a' : '#fff',
                    opacity: count === 0 ? 0.22 : 1,
                  }}>
                    {count}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Reserved cards */}
          {myPlayer.reservedCards.length > 0 && (
            <div>
              <div style={{ ...st.sectionLabel, marginBottom: 4 }}>
                Reservadas ({myPlayer.reservedCards.length}/3)
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {myPlayer.reservedCards.map(cardId => {
                  const card       = CARD_MAP.get(cardId)
                  const isSelected = selectedCardId === cardId
                  if (!card) return null
                  return (
                    <div
                      key={cardId}
                      style={{ position: 'relative', cursor: isActive ? 'pointer' : 'default', flexShrink: 0 }}
                      onClick={() => isActive && setSelectedCardId(isSelected ? null : cardId)}
                    >
                      <CardSprite level={card.level} spriteIndex={card.spriteIndex} isFaceUp={true} width={50} />
                      {isSelected && (
                        <div style={{
                          position: 'absolute', inset: 0, borderRadius: 6,
                          border: '2px solid #FFD700',
                          boxShadow: '0 0 8px rgba(255,215,0,0.5)',
                          pointerEvents: 'none',
                        }} />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  function renderOpponents() {
    if (opponents.length === 0) return null
    return (
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, overflowX: 'auto' }}>
        {opponents.map(opp => {
          const isOppActive = opp.id === splendorState.activePlayerId
          return (
            <div key={opp.id} style={{
              background: isOppActive ? 'rgba(255,215,0,0.10)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${isOppActive ? 'rgba(255,215,0,0.45)' : 'rgba(255,255,255,0.09)'}`,
              borderRadius: 8, padding: '8px 12px', minWidth: 180, flexShrink: 0,
            }}>
              <div style={{ fontWeight: 700, color: '#fff', fontSize: 13, marginBottom: 2 }}>
                {isOppActive && '⭐ '}{opp.name}
              </div>
              <div style={{ color: '#FFD700', fontSize: 18, fontWeight: 800, lineHeight: 1 }}>
                {opp.prestigePoints} pts
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: 11, color: '#888' }}>
                <span>🃏 {opp.developmentCards.length}</span>
                <span>🔒 {opp.reservedCards.length}</span>
                <span>🪙 {totalTokens(opp)}</span>
                {opp.nobles.length > 0 && <span>🏅 {opp.nobles.length}</span>}
              </div>
              <div style={{ display: 'flex', gap: 4, marginTop: 5, flexWrap: 'wrap' }}>
                {ALL_GEMS.map(gem => {
                  const n = opp.bonusGems[gem] ?? 0
                  if (n === 0) return null
                  return (
                    <span key={gem} style={{
                      background: GEM_COLOR[gem], borderRadius: 3,
                      padding: '1px 5px', fontSize: 10, fontWeight: 700,
                      color: gem === 'diamond' ? '#1a1a1a' : '#fff',
                    }}>
                      {n}
                    </span>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ── Game over overlay ─────────────────────────────────────────────────────────

  const medals = ['🥇', '🥈', '🥉', '4️⃣']

  const gameOverOverlay = gameOver ? (() => {
    const winner       = splendorState.players.find(p => p.id === splendorState.winnerId)
    const isWinner     = splendorState.winnerId === myPlayerId
    const alreadyVoted = myPlayerId ? rematchVotes.includes(myPlayerId) : false
    const sorted       = [...splendorState.players].sort((a, b) =>
      b.prestigePoints !== a.prestigePoints
        ? b.prestigePoints - a.prestigePoints
        : a.developmentCards.length - b.developmentCards.length
    )
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(5,10,18,0.93)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          background: 'linear-gradient(160deg, #1a2535 0%, #0f1c2e 100%)',
          borderRadius: 18, padding: '36px 44px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,215,0,0.18)',
          maxWidth: 480, width: '90%', textAlign: 'center',
        }}>
          <div style={{ fontSize: 58, marginBottom: 10, lineHeight: 1 }}>
            {isWinner ? '🏆' : '🎖️'}
          </div>
          <h2 style={{ margin: '0 0 4px', fontSize: 26, color: isWinner ? '#FFD700' : '#ccc', fontWeight: 800 }}>
            {isWinner ? '¡Has ganado!' : `Ha ganado ${winner?.name ?? '…'}`}
          </h2>
          <p style={{ margin: '0 0 24px', color: '#556', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' }}>
            Splendor · Fin de partida
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 28 }}>
            {sorted.map((p, i) => {
              const isWinnerRow = p.id === splendorState.winnerId
              return (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: isWinnerRow ? 'rgba(255,215,0,0.09)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${isWinnerRow ? 'rgba(255,215,0,0.28)' : 'rgba(255,255,255,0.06)'}`,
                  borderRadius: 8, padding: '9px 14px',
                }}>
                  <span style={{ fontSize: 18, width: 26 }}>{medals[i] ?? '—'}</span>
                  <span style={{ flex: 1, textAlign: 'left', fontSize: 14, fontWeight: isWinnerRow ? 700 : 400, color: '#fff' }}>
                    {p.name}
                  </span>
                  <span style={{ color: '#FFD700', fontWeight: 800, fontSize: 20, lineHeight: 1 }}>
                    {p.prestigePoints}
                  </span>
                  <span style={{ color: '#666', fontSize: 11 }}>pts</span>
                  <span style={{ color: '#555', fontSize: 11, marginLeft: 4 }}>
                    · {p.developmentCards.length} cartas
                  </span>
                </div>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            {alreadyVoted ? (
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

  // ── Discard overlay ──────────────────────────────────────────────────────────

  const discardOverlay = myPlayer && needsDiscard ? (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.82)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18,
    }}>
      <h2 style={{ color: '#ff6b6b', margin: 0 }}>Demasiadas fichas</h2>
      <p style={{ color: '#ccc', margin: 0, textAlign: 'center' }}>
        Tienes {myTokens} fichas. Descarta {discardCount} para continuar.
      </p>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
        {ALL_TOKENS.map(token => {
          const have     = myPlayer.tokens[token] ?? 0
          const selected = discardDraft.filter(t => t === token).length
          if (have === 0) return null
          return (
            <div key={token} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
              <div
                style={{ cursor: 'pointer', outline: selected > 0 ? '2px solid #ff6b6b' : 'none', borderRadius: '50%' }}
                onClick={() => addDiscard(token)}
              >
                <TokenChip gem={token} size={52} count={have} />
              </div>
              {selected > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ color: '#ff6b6b', fontSize: 12, fontWeight: 700 }}>−{selected}</span>
                  <button
                    style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 13, padding: 0 }}
                    onClick={() => removeDiscard(token)}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div style={{ color: '#777', fontSize: 13 }}>
        Seleccionadas: {discardDraft.length} / {discardCount}
      </div>
      <button
        style={{
          ...st.btnPri,
          background: '#d32f2f',
          opacity: discardDraft.length === discardCount ? 1 : 0.4,
          cursor: discardDraft.length === discardCount ? 'pointer' : 'not-allowed',
        }}
        disabled={discardDraft.length !== discardCount}
        onClick={submitDiscard}
      >
        Confirmar descarte
      </button>
    </div>
  ) : null

  // ── Card action popup ────────────────────────────────────────────────────────

  const cardPopup = selectedCardId && isActive ? (() => {
    const card     = CARD_MAP.get(selectedCardId)
    if (!card || !myPlayer) return null
    const isReserved   = myPlayer.reservedCards.includes(selectedCardId)
    const affordable   = canAfford(card, myPlayer)
    const canReserve   = !isReserved && myPlayer.reservedCards.length < 3
    const costLines    = (Object.entries(card.cost) as [GemType, number][])
      .filter(([, n]) => n > 0)
      .map(([gem, n]) => {
        const bonus  = myPlayer.bonusGems[gem] ?? 0
        const net    = Math.max(0, n - bonus)
        const hasEnough = (myPlayer.tokens[gem] ?? 0) + (myPlayer.tokens.gold ?? 0) >= net
        return (
          <span key={gem} style={{
            padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 700,
            background: GEM_COLOR[gem],
            color: gem === 'diamond' ? '#1a1a1a' : '#fff',
            opacity: hasEnough ? 1 : 0.5,
          }}>
            {net > 0 ? `${net} ${GEM_LABEL[gem]}` : <s>{`${n} ${GEM_LABEL[gem]}`}</s>}
          </span>
        )
      })

    return (
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 150,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.60)',
        }}
        onClick={() => setSelectedCardId(null)}
      >
        <div
          style={{
            background: '#1a2535', borderRadius: 12, padding: '20px 24px',
            display: 'flex', flexDirection: 'column', gap: 14, minWidth: 220,
            boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
          }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <CardSprite level={card.level} spriteIndex={card.spriteIndex} isFaceUp={true} width={90} />
          </div>
          {costLines.length > 0 && (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'center' }}>
              {costLines}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              style={{
                ...st.btnPri, flex: 1, fontSize: 13,
                opacity: affordable ? 1 : 0.35,
                cursor: affordable ? 'pointer' : 'not-allowed',
              }}
              onClick={() => affordable && submitBuy(selectedCardId)}
            >
              Comprar
            </button>
            {!isReserved && (
              <button
                style={{
                  ...st.btnSec, flex: 1, fontSize: 13,
                  opacity: canReserve ? 1 : 0.35,
                  cursor: canReserve ? 'pointer' : 'not-allowed',
                }}
                onClick={() => canReserve && submitReserve(selectedCardId)}
              >
                Reservar
              </button>
            )}
          </div>
          <button
            style={{ background: 'none', border: 'none', color: '#777', cursor: 'pointer', fontSize: 12, padding: 0 }}
            onClick={() => setSelectedCardId(null)}
          >
            Cancelar
          </button>
        </div>
      </div>
    )
  })() : null

  // ── Main layout ──────────────────────────────────────────────────────────────

  return (
    <div style={st.page}>
      {discardOverlay}
      {cardPopup}
      {gameOverOverlay}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: 0.5 }}>Splendor</span>
          <span style={{
            fontSize: 12, fontWeight: 700,
            color: isActive ? '#FFD700' : '#999',
            background: 'rgba(0,0,0,0.35)', borderRadius: 6, padding: '2px 8px',
          }}>
            {isActive ? '⭐ Tu turno' : `Turno de ${activePName}`}
          </span>
        </div>
        <button style={st.btnLeave} onClick={onLeave}>Salir</button>
      </div>

      {renderOpponents()}
      {renderNobles()}

      {/* Market + bank side-by-side */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={st.sectionLabel}>Mercado</div>
          {([3, 2, 1] as const).map(lvl => renderMarketRow(lvl))}
        </div>
        {renderBankAndDraft()}
      </div>

      {renderMyHUD()}
    </div>
  )
}

const st: Record<string, React.CSSProperties> = {
  page:         { maxWidth: 980, margin: '20px auto', padding: '0 16px', fontFamily: 'system-ui, sans-serif', color: '#fff', background: '#0d1620', minHeight: '100vh', boxSizing: 'border-box' },
  sectionLabel: { fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  btnPri:       { padding: '8px 16px', background: '#1a73e8', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 14 },
  btnSec:       { padding: '8px 16px', background: 'rgba(255,255,255,0.10)', color: '#fff', border: '1px solid rgba(255,255,255,0.20)', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14 },
  btnSm:        { padding: '5px 10px', borderRadius: 6, fontWeight: 600 },
  btnLeave:     { padding: '5px 12px', background: '#fff', color: '#d32f2f', border: '1px solid #d32f2f', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap' as const },
}
