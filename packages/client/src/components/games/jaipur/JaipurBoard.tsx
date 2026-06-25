import { useState, useEffect } from 'react'
import type {
  JaipurGameState, JaipurMove, JaipurPlayerState,
  JaipurCard as JaipurCardModel, GoodsType, BonusTier,
} from '@gamengine/shared'
import {
  ALL_GOODS, JAIPUR_MAX_HAND, JAIPUR_MIN_SALE, JAIPUR_SEALS_TO_WIN,
} from '@gamengine/shared'
import { JaipurCard as CardView } from './JaipurCard'
import { JaipurToken } from './JaipurToken'

interface JaipurBoardProps {
  jaipurState:  JaipurGameState
  myPlayerId:   string | undefined
  isMyTurn:     boolean
  gameOver:     boolean
  onAction:     (move: JaipurMove) => void
  onLeave:      () => void
  onRematch:    () => void
  rematchVotes: string[]
  playerCount:  number
}

const GOOD_LABEL: Record<GoodsType, string> = {
  diamonds: 'Diamantes',
  gold:     'Oro',
  silver:   'Plata',
  cloth:    'Telas',
  spice:    'Especias',
  leather:  'Pieles',
}

const BONUS_TIERS: BonusTier[] = ['bonus3', 'bonus4', 'bonus5']
const BONUS_LABEL: Record<BonusTier, string> = {
  bonus3: '3 cartas',
  bonus4: '4 cartas',
  bonus5: '5+ cartas',
}

export function JaipurBoard({
  jaipurState, myPlayerId, gameOver,
  onAction, onLeave, onRematch, rematchVotes, playerCount,
}: JaipurBoardProps) {
  const [selectedMarket, setSelectedMarket] = useState<Set<string>>(new Set())
  const [selectedMine,   setSelectedMine]   = useState<Set<string>>(new Set())

  // Clear local selection whenever the turn (or round) changes.
  useEffect(() => {
    setSelectedMarket(new Set())
    setSelectedMine(new Set())
  }, [jaipurState.turn, jaipurState.round])

  const me       = jaipurState.players.find(p => p.id === myPlayerId)
  const opponent = jaipurState.players.find(p => p.id !== myPlayerId)
  const activeId = jaipurState.players[jaipurState.turn]?.id
  const isActive = activeId === myPlayerId
  const activeName = jaipurState.players.find(p => p.id === activeId)?.name ?? '…'

  // ── Lookup helpers ────────────────────────────────────────────────────────
  const market      = jaipurState.market
  const marketById  = new Map(market.map(c => [c.id, c]))
  const myHand      = me?.hand ?? []
  const myCorral    = me?.corral ?? []
  const mineById    = new Map([...myHand, ...myCorral].map(c => [c.id, c]))

  function toggle(set: Set<string>, setter: (s: Set<string>) => void, id: string) {
    const next = new Set(set)
    next.has(id) ? next.delete(id) : next.add(id)
    setter(next)
  }
  function clearSelection() {
    setSelectedMarket(new Set())
    setSelectedMine(new Set())
  }

  // ── Action validity (derived from current selection) ──────────────────────
  const give = [...selectedMine]
  const take = [...selectedMarket]
  const marketCamels = market.filter(c => c.type === 'camel').length

  const single        = take.length === 1 ? take[0] : null
  const canTakeSingle = isActive && single !== null && give.length === 0
    && marketById.get(single!)?.type !== 'camel'
    && myHand.length + 1 <= JAIPUR_MAX_HAND

  const canTakeCamels = isActive && marketCamels > 0

  let canTrade = isActive && give.length >= 2 && give.length === take.length
  if (canTrade && take.some(id => marketById.get(id)?.type === 'camel')) canTrade = false
  if (canTrade) {
    const takenTypes = new Set(take.map(id => marketById.get(id)!.type))
    for (const id of give) {
      const t = mineById.get(id)?.type
      if (t && t !== 'camel' && takenTypes.has(t)) { canTrade = false; break }
    }
  }
  if (canTrade) {
    const fromHand = give.filter(id => myHand.some(c => c.id === id)).length
    if (myHand.length - fromHand + take.length > JAIPUR_MAX_HAND) canTrade = false
  }

  let sellGood: GoodsType | null = null
  let canSell = isActive && take.length === 0 && give.length >= 1
    && give.every(id => myHand.some(c => c.id === id))
  if (canSell) {
    const types = new Set(give.map(id => mineById.get(id)!.type))
    const t = [...types][0]
    if (types.size !== 1 || t === 'camel') {
      canSell = false
    } else {
      sellGood = t as GoodsType
      if (give.length < JAIPUR_MIN_SALE[sellGood]) canSell = false
    }
  }

  // ── Action emitters ───────────────────────────────────────────────────────
  function doTakeSingle() { if (canTakeSingle && single) { onAction({ type: 'TAKE_SINGLE', cardId: single }); clearSelection() } }
  function doTakeCamels() { if (canTakeCamels) { onAction({ type: 'TAKE_CAMELS' }); clearSelection() } }
  function doTrade()      { if (canTrade) { onAction({ type: 'TRADE', give, take }); clearSelection() } }
  function doSell()       { if (canSell && sellGood) { onAction({ type: 'SELL', good: sellGood, cardIds: give }); clearSelection() } }

  // ── Small reusable renders ────────────────────────────────────────────────
  function renderSeals(n: number, size = 26) {
    if (n <= 0) return <span style={{ color: '#5a6b7a', fontSize: 12 }}>—</span>
    return (
      <div style={{ display: 'flex', gap: 3 }}>
        {Array.from({ length: n }).map((_, i) => (
          <img
            key={i}
            src={`/jaipur/fichas/selloexcelencia${i === 0 ? 'a' : 'b'}.png`}
            alt="Sello de Excelencia"
            style={{ width: size, height: size, borderRadius: '50%', boxShadow: '0 2px 6px rgba(0,0,0,0.5)' }}
          />
        ))}
      </div>
    )
  }

  function renderEarnedTokens(player: JaipurPlayerState, size = 26) {
    if (player.tokens.length === 0) return <span style={{ color: '#5a6b7a', fontSize: 12 }}>Sin fichas</span>
    return (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: 360 }}>
        {player.tokens.map((t, i) => {
          if (t.kind === 'goods') return <JaipurToken key={i} type={t.good} value={t.value} size={size} />
          if (t.kind === 'bonus') return <JaipurToken key={i} type={t.tier} size={size} />
          return <JaipurToken key={i} type="camel" size={size} />
        })}
      </div>
    )
  }

  function renderCamelPile(camels: JaipurCardModel[], interactive: boolean) {
    if (camels.length === 0) return <span style={{ color: '#5a6b7a', fontSize: 12 }}>0 camellos</span>
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ display: 'flex' }}>
          {camels.map((c, i) => (
            <div key={c.id} style={{ marginLeft: i === 0 ? 0 : -26 }}>
              <CardView
                card={c}
                width={36}
                isSelected={interactive && selectedMine.has(c.id)}
                onClick={interactive ? () => toggle(selectedMine, setSelectedMine, c.id) : undefined}
              />
            </div>
          ))}
        </div>
        <span style={{ fontWeight: 800, color: '#e8c074', fontSize: 15 }}>×{camels.length}</span>
      </div>
    )
  }

  // ── Opponent (top) ────────────────────────────────────────────────────────
  function renderOpponent() {
    if (!opponent) return null
    const oppActive = opponent.id === activeId
    return (
      <div style={{
        ...st.panel,
        borderColor: oppActive ? 'rgba(255,215,0,0.5)' : 'rgba(255,255,255,0.10)',
        background: oppActive ? 'rgba(255,215,0,0.07)' : 'rgba(255,255,255,0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 120 }}>
            <div style={{ fontWeight: 700, color: '#fff', fontSize: 15 }}>
              {oppActive && '⭐ '}{opponent.name}
            </div>
            <div style={{ color: '#e8c074', fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>
              {opponent.score}<span style={st.rupee}> rupias</span>
            </div>
          </div>
          <div style={st.miniCol}>
            <span style={st.miniLabel}>Mano</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <CardView card={{ id: 'opp-back', type: 'camel' }} isFaceUp={false} width={28} />
              <span style={{ fontWeight: 800, color: '#fff', fontSize: 15 }}>{opponent.hand.length}/{JAIPUR_MAX_HAND}</span>
            </div>
          </div>
          <div style={st.miniCol}>
            <span style={st.miniLabel}>Manada</span>
            {renderCamelPile(opponent.corral, false)}
          </div>
          <div style={st.miniCol}>
            <span style={st.miniLabel}>Sellos</span>
            {renderSeals(opponent.sealsWon, 24)}
          </div>
          <div style={st.miniCol}>
            <span style={st.miniLabel}>Fichas</span>
            {renderEarnedTokens(opponent, 22)}
          </div>
        </div>
      </div>
    )
  }

  // ── Market + piles (middle) ───────────────────────────────────────────────
  function renderMarket() {
    return (
      <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Deck + market row */}
        <div style={{ flex: 1, minWidth: 320 }}>
          <div style={st.sectionLabel}>Mercado</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Deck back */}
            <div style={{ position: 'relative' }}>
              <CardView card={{ id: 'deck', type: 'camel' }} isFaceUp={false} width={64} />
              <span style={st.deckCount}>{jaipurState.deck.length}</span>
            </div>
            {/* 5 market cards */}
            {market.map(card => (
              <CardView
                key={card.id}
                card={card}
                width={64}
                isSelected={selectedMarket.has(card.id)}
                onClick={isActive ? () => toggle(selectedMarket, setSelectedMarket, card.id) : undefined}
              />
            ))}
          </div>
        </div>

        {/* Token piles */}
        <div style={{ minWidth: 260 }}>
          <div style={st.sectionLabel}>Fichas de producto</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
            {ALL_GOODS.map(good => {
              const pile = jaipurState.tokens.goods[good]
              const top  = pile[0]
              return (
                <div key={good} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                  {pile.length > 0
                    ? <JaipurToken type={good} value={top} count={pile.length} size={42} />
                    : <JaipurToken type={good} value={0} size={42} dimmed />}
                  <span style={{ fontSize: 9, color: '#8aa', textAlign: 'center' }}>{GOOD_LABEL[good]}</span>
                </div>
              )
            })}
          </div>

          <div style={st.sectionLabel}>Bonificación</div>
          <div style={{ display: 'flex', gap: 12 }}>
            {BONUS_TIERS.map(tier => {
              const pile = jaipurState.tokens.bonus[tier]
              return (
                <div key={tier} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                  <JaipurToken type={tier} count={pile.length} size={42} dimmed={pile.length === 0} />
                  <span style={{ fontSize: 9, color: '#8aa' }}>{BONUS_LABEL[tier]}</span>
                </div>
              )
            })}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
              <JaipurToken type="camel" size={42} dimmed={!jaipurState.tokens.camelTokenAvailable} />
              <span style={{ fontSize: 9, color: '#8aa' }}>Camello</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── My area (bottom) ──────────────────────────────────────────────────────
  function renderMyArea() {
    if (!me) return null
    return (
      <div style={{
        ...st.panel,
        borderColor: isActive ? 'rgba(255,215,0,0.5)' : 'rgba(255,255,255,0.10)',
        background: isActive ? 'rgba(255,215,0,0.07)' : 'rgba(255,255,255,0.04)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 700, color: '#fff', fontSize: 15 }}>{isActive && '⭐ '}{me.name} (Tú)</div>
              <div style={{ color: '#e8c074', fontSize: 24, fontWeight: 800, lineHeight: 1.1 }}>
                {me.score}<span style={st.rupee}> rupias</span>
              </div>
            </div>
            <div style={st.miniCol}>
              <span style={st.miniLabel}>Sellos</span>
              {renderSeals(me.sealsWon, 26)}
            </div>
            <div style={st.miniCol}>
              <span style={st.miniLabel}>Fichas ganadas</span>
              {renderEarnedTokens(me, 26)}
            </div>
          </div>
        </div>

        {/* Corral (camels) */}
        <div style={{ marginBottom: 10 }}>
          <div style={st.sectionLabel}>Mi manada (camellos)</div>
          {renderCamelPile(myCorral, isActive)}
        </div>

        {/* Hand */}
        <div>
          <div style={st.sectionLabel}>Mi mano ({myHand.length}/{JAIPUR_MAX_HAND})</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', minHeight: 92 }}>
            {myHand.length === 0
              ? <span style={{ color: '#5a6b7a', fontSize: 13 }}>Sin cartas en la mano</span>
              : myHand.map(card => (
                <CardView
                  key={card.id}
                  card={card}
                  width={62}
                  isSelected={selectedMine.has(card.id)}
                  onClick={isActive ? () => toggle(selectedMine, setSelectedMine, card.id) : undefined}
                />
              ))}
          </div>
        </div>

        {/* Action bar */}
        <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <ActionButton label="Coger 1 producto" hint="1 carta del mercado" enabled={canTakeSingle} onClick={doTakeSingle} />
          <ActionButton label={`Coger camellos${marketCamels ? ` (${marketCamels})` : ''}`} hint="todos los camellos" enabled={canTakeCamels} onClick={doTakeCamels} />
          <ActionButton label="Intercambiar" hint="≥2 ↔ ≥2" enabled={canTrade} onClick={doTrade} />
          <ActionButton label={sellGood ? `Vender ${GOOD_LABEL[sellGood]}` : 'Vender'} hint="1 tipo de producto" enabled={canSell} onClick={doSell} />
          {(selectedMarket.size > 0 || selectedMine.size > 0) && (
            <button style={st.btnClear} onClick={clearSelection}>Limpiar selección</button>
          )}
          {!isActive && <span style={{ color: '#8aa', fontSize: 13 }}>Esperando a {activeName}…</span>}
        </div>
      </div>
    )
  }

  // ── Game over overlay ─────────────────────────────────────────────────────
  const gameOverOverlay = gameOver ? (() => {
    const winner   = jaipurState.players.find(p => p.id === jaipurState.winner)
    const isWinner = jaipurState.winner === myPlayerId
    const voted    = myPlayerId ? rematchVotes.includes(myPlayerId) : false
    return (
      <div style={st.overlay}>
        <div style={st.overlayPanel}>
          <div style={{ fontSize: 58, lineHeight: 1, marginBottom: 8 }}>{isWinner ? '🏆' : '🎖️'}</div>
          <h2 style={{ margin: '0 0 4px', fontSize: 26, fontWeight: 800, color: isWinner ? '#FFD700' : '#ccc' }}>
            {isWinner ? '¡Has ganado!' : `Ha ganado ${winner?.name ?? '…'}`}
          </h2>
          <p style={{ margin: '0 0 22px', color: '#7a8a99', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' }}>
            Jaipur · Mercader del Maharajá
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 26 }}>
            {jaipurState.players.map(p => (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: p.id === jaipurState.winner ? 'rgba(255,215,0,0.10)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${p.id === jaipurState.winner ? 'rgba(255,215,0,0.3)' : 'rgba(255,255,255,0.06)'}`,
                borderRadius: 8, padding: '9px 14px',
              }}>
                <span style={{ flex: 1, textAlign: 'left', color: '#fff', fontWeight: 700 }}>{p.name}</span>
                {renderSeals(p.sealsWon, 22)}
                <span style={{ color: '#e8c074', fontWeight: 800, fontSize: 16 }}>{p.sealsWon}/{JAIPUR_SEALS_TO_WIN}</span>
              </div>
            ))}
          </div>
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

  // ── Layout ────────────────────────────────────────────────────────────────
  return (
    <div style={st.page}>
      {gameOverOverlay}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: 0.5 }}>Jaipur</span>
          <span style={{ fontSize: 12, color: '#8aa' }}>Ronda {jaipurState.round}</span>
          <span style={{
            fontSize: 12, fontWeight: 700,
            color: isActive ? '#FFD700' : '#aaa',
            background: 'rgba(0,0,0,0.35)', borderRadius: 6, padding: '2px 10px',
          }}>
            {isActive ? '⭐ Tu turno' : `Turno de ${activeName}`}
          </span>
        </div>
        <button style={st.btnLeave} onClick={onLeave}>Salir</button>
      </div>

      {renderOpponent()}
      <div style={{ ...st.panel, marginTop: 12, marginBottom: 12 }}>{renderMarket()}</div>
      {renderMyArea()}
    </div>
  )
}

// ── Action button ────────────────────────────────────────────────────────────
function ActionButton({ label, hint, enabled, onClick }: {
  label: string; hint: string; enabled: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={enabled ? onClick : undefined}
      disabled={!enabled}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
        padding: '7px 14px', borderRadius: 8, border: 'none',
        background: enabled ? '#c8821e' : 'rgba(255,255,255,0.07)',
        color: enabled ? '#fff' : '#667',
        cursor: enabled ? 'pointer' : 'not-allowed',
        fontWeight: 700, fontSize: 13, lineHeight: 1.2,
        transition: 'background 0.15s',
      }}
    >
      {label}
      <span style={{ fontSize: 9, fontWeight: 500, opacity: 0.8 }}>{hint}</span>
    </button>
  )
}

const st: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 1040, margin: '0 auto', minHeight: '100vh',
    padding: '20px 16px', boxSizing: 'border-box',
    fontFamily: 'system-ui, sans-serif', color: '#fff',
    backgroundColor: '#1a1208',
    backgroundImage: 'linear-gradient(rgba(20,12,4,0.86), rgba(20,12,4,0.92)), url(/jaipur/board/mesa-base.png)',
    backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed',
  },
  panel: {
    borderRadius: 12, padding: '12px 16px',
    border: '1px solid rgba(255,255,255,0.10)',
    background: 'rgba(255,255,255,0.04)',
    backdropFilter: 'blur(2px)',
  },
  sectionLabel: { fontSize: 11, color: '#9a8a6a', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  miniCol:      { display: 'flex', flexDirection: 'column', gap: 4 },
  miniLabel:    { fontSize: 10, color: '#9a8a6a', textTransform: 'uppercase', letterSpacing: 0.6 },
  rupee:        { fontSize: 12, fontWeight: 400, color: '#9aa' },
  deckCount: {
    position: 'absolute', bottom: 5, left: 0, right: 0, textAlign: 'center',
    fontSize: 13, fontWeight: 800, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,1)',
    pointerEvents: 'none',
  },
  btnClear: {
    padding: '7px 14px', borderRadius: 8, fontWeight: 600, fontSize: 13,
    background: 'rgba(255,255,255,0.10)', color: '#fff',
    border: '1px solid rgba(255,255,255,0.20)', cursor: 'pointer',
  },
  btnPri:   { padding: '9px 18px', background: '#c8821e', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 14 },
  btnLeave: { padding: '6px 14px', background: '#fff', color: '#b3331f', border: '1px solid #b3331f', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap' },
  overlay:  { position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(8,5,2,0.93)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  overlayPanel: {
    background: 'linear-gradient(160deg, #2a1d0c 0%, #1a1208 100%)',
    borderRadius: 18, padding: '36px 44px', maxWidth: 460, width: '90%', textAlign: 'center',
    boxShadow: '0 24px 64px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,215,0,0.18)',
  },
}
