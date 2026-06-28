import { useState, useEffect, useRef } from 'react'
import type {
  JaipurGameState, JaipurMove, JaipurPlayerState,
  JaipurCard as JaipurCardModel, GoodsType, BonusTier,
  BoardLayout as SharedBoardLayout,
} from '@gamengine/shared'
import {
  ALL_GOODS, JAIPUR_MAX_HAND, JAIPUR_MIN_SALE, JAIPUR_SEALS_TO_WIN,
} from '@gamengine/shared'
import { JaipurCard as CardView } from './JaipurCard'
import { JaipurToken } from './JaipurToken'
import {
  BOARD_IMAGE, BOARD_RATIO,
  createBoardLayout, useBoardSize, type Anchor, type BoardLayout, type StructuralAnchors,
} from './boardLayout'
import { useEditorMode } from '../../../hooks/useEditorMode'
import { useBoardLayoutEditor } from '../../../hooks/useBoardLayoutEditor'
import { Zone, TokenStack, StructuralMarker, MagnifierLens, LayoutEditorToolbar } from '../../board'
// Dev sidecar written by the server on save. Imported statically so Vite triggers
// HMR when the server rewrites it, closing the drag → save → re-ingest loop.
import localLayout from './layout.json'

/** This game's stable slug, used as the layout payload `gameId`. */
const GAME_ID = 'jaipur'

/**
 * Flatten the structured Jaipur layout into the generic shared `BoardLayout`
 * (`scales` + `anchors`), reusing the same id scheme as `getAnchor`/`updateAnchor`
 * so the persisted JSON round-trips. Anchor shapes are identical across packages.
 */
function toSharedLayout(L: BoardLayout): SharedBoardLayout {
  const anchors: Record<string, Anchor | Anchor[]> = {
    deck:   L.deck,
    market: L.market,
    camel:  L.camel,
  }
  for (const [good, a]  of Object.entries(L.goods))      anchors[`goods-${good}`]      = a
  for (const [tier, a]  of Object.entries(L.bonus))      anchors[`bonus-${tier}`]      = a
  for (const [key, a]   of Object.entries(L.structural)) anchors[`structural-${key}`] = a
  return {
    scales: {
      cardWPct:         L.cardWPct,
      tokenWPct:        L.tokenWPct,
      tokenStackOffset: L.tokenStackOffset,
    },
    anchors,
  }
}

/**
 * Rebuild the structured Jaipur layout from the generic shared `BoardLayout`
 * (inverse of {@link toSharedLayout}). Every field deep-merges over the hardcoded
 * factory defaults, so a partial or stale `layout.json` (e.g. missing a newly
 * added anchor) degrades gracefully instead of breaking the board.
 */
function fromSharedLayout(shared: SharedBoardLayout): BoardLayout {
  const d = createBoardLayout()
  const A = shared.anchors ?? {}
  const S = shared.scales ?? {}
  const num = (v: unknown, fallback: number): number => typeof v === 'number' ? v : fallback
  const one = (key: string, fallback: Anchor): Anchor => {
    const v = A[key]
    return v && !Array.isArray(v) ? v : fallback
  }
  const market = Array.isArray(A['market']) && A['market'].length === 5
    ? (A['market'] as Anchor[])
    : d.market
  return {
    cardWPct:         num(S['cardWPct'],         d.cardWPct),
    tokenWPct:        num(S['tokenWPct'],        d.tokenWPct),
    tokenStackOffset: num(S['tokenStackOffset'], d.tokenStackOffset),
    deck:   one('deck', d.deck),
    market,
    camel:  one('camel', d.camel),
    goods: {
      diamonds: one('goods-diamonds', d.goods.diamonds),
      gold:     one('goods-gold',     d.goods.gold),
      silver:   one('goods-silver',   d.goods.silver),
      cloth:    one('goods-cloth',    d.goods.cloth),
      spice:    one('goods-spice',    d.goods.spice),
      leather:  one('goods-leather',  d.goods.leather),
    },
    bonus: {
      bonus3: one('bonus-bonus3', d.bonus.bonus3),
      bonus4: one('bonus-bonus4', d.bonus.bonus4),
      bonus5: one('bonus-bonus5', d.bonus.bonus5),
    },
    structural: {
      deckDrawSlot:     one('structural-deckDrawSlot',     d.structural.deckDrawSlot),
      deckDiscardSlot:  one('structural-deckDiscardSlot',  d.structural.deckDiscardSlot),
      botCamelPen:      one('structural-botCamelPen',      d.structural.botCamelPen),
      playerCamelPen:   one('structural-playerCamelPen',   d.structural.playerCamelPen),
      botScoreSeals:    one('structural-botScoreSeals',    d.structural.botScoreSeals),
      playerScoreSeals: one('structural-playerScoreSeals', d.structural.playerScoreSeals),
    },
  }
}

/** Build the file-backed baseline layout (server sidecar over factory defaults). */
function hydrateFromFile(): BoardLayout {
  return fromSharedLayout(localLayout as SharedBoardLayout)
}

// ── localStorage persistence key + lens constants ─────────────────────────────
const LS_KEY    = 'jaipur-board-layout'
const LENS_W    = 260
const LENS_H    = 170
const LENS_ZOOM = 2.5

function loadLayout(): BoardLayout {
  // Baseline = the server-persisted sidecar (layout.json) over factory defaults.
  // localStorage, when present, is an in-progress editing scratchpad layered on top.
  const base = hydrateFromFile()
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return base
    const p = JSON.parse(raw) as Partial<BoardLayout>
    // Deep-merge: stored values win; any missing field (e.g. newly added
    // structural anchors in a fresh session) falls back to the file baseline.
    return {
      ...base,
      ...p,
      market:     Array.isArray(p.market) && p.market.length === 5 ? p.market : base.market,
      goods:      p.goods  ?? base.goods,
      bonus:      p.bonus  ?? base.bonus,
      structural: { ...base.structural, ...(p.structural ?? {}) } as StructuralAnchors,
    }
  } catch {}
  return base
}

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

  // Measure the board stage so percentage zones scale into pixel piece sizes.
  const { ref: stageRef, width: stageW } = useBoardSize<HTMLDivElement>()

  // ── Visual Layout Editor: all generic drag/nudge/keyboard mechanics live in
  // the reusable hook; Jaipur only supplies thin adapters over its structured layout.
  const {
    isEditorMode, layout, setLayout, layoutRef,
    selectedEl, isMagnifier, lensPos, setLensPos, editorFor,
  } = useBoardLayoutEditor<BoardLayout>({
    stageRef, lsKey: LS_KEY, load: loadLayout, factory: createBoardLayout,
    getAnchor, setAnchor: updateAnchor,
    scaleSelected: scaleJaipurElement,
    adjustStackOffset: (L, dir) => ({ ...L, tokenStackOffset: Math.max(0, L.tokenStackOffset + dir) }),
    onExport: exportLayout,
  })

  const cardW  = Math.max(1, Math.round((layout.cardWPct  / 100) * stageW))
  const tokenW = Math.max(1, Math.round((layout.tokenWPct / 100) * stageW))

  // Server-persistence controller: Ctrl/⌘+S + floating "Guardar Layout" button.
  const editor = useEditorMode({
    gameId: GAME_ID,
    enabled: isEditorMode,
    buildLayout: () => toSharedLayout(layoutRef.current),
  })

  // Re-ingest the sidecar when the server rewrites layout.json: Vite HMR swaps the
  // imported module, changing `localLayout`'s reference, and we re-hydrate from it.
  // The first run (initial mount) is skipped so it never clobbers the localStorage
  // scratchpad that loadLayout() already layered on top.
  const skipFirstIngest = useRef(true)
  useEffect(() => {
    if (skipFirstIngest.current) { skipFirstIngest.current = false; return }
    setLayout(hydrateFromFile())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localLayout])

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

  // ── Board stage: shared central zone anchored on the printed board image ──
  // Pieces are centred on their anchor (% of the stage), see ./boardLayout.ts.
  function renderBoardStage() {
    return (
      <div
        ref={stageRef}
        style={st.stage}
        title="Mercado de Jaipur"
        onMouseMove={(e) => { if (isMagnifier) setLensPos({ cx: e.clientX, cy: e.clientY }) }}
      >
        {/* Deck (face-down draw pile) */}
        <Zone anchor={layout.deck} editor={editorFor('deck')}>
          <div style={{ position: 'relative' }}>
            <CardView card={{ id: 'deck', type: 'camel' }} isFaceUp={false} width={cardW} />
            <span style={st.deckCount}>{jaipurState.deck.length}</span>
          </div>
        </Zone>

        {/* 5 market cards */}
        {market.map((card, i) => (
          <Zone key={card.id} anchor={layout.market[i]} editor={editorFor(`market-${i}`)}>
            <CardView
              card={card}
              width={cardW}
              isSelected={selectedMarket.has(card.id)}
              onClick={isActive && !isEditorMode ? () => toggle(selectedMarket, setSelectedMarket, card.id) : undefined}
            />
          </Zone>
        ))}

        {/* Goods token piles — rendered as physical 3D stacks */}
        {ALL_GOODS.map(good => {
          const pile = jaipurState.tokens.goods[good]
          return (
            <Zone key={good} anchor={layout.goods[good]} label={GOOD_LABEL[good]} editor={editorFor(`goods-${good}`)}>
              {pile.length > 0
                ? <TokenStack
                    items={pile.map((v, i) => <JaipurToken key={i} type={good} value={v} size={tokenW} />)}
                    size={tokenW} offset={layout.tokenStackOffset} />
                : <JaipurToken type={good} value={0} size={tokenW} dimmed />}
            </Zone>
          )
        })}

        {/* Bonus token stacks */}
        {BONUS_TIERS.map(tier => {
          const pile = jaipurState.tokens.bonus[tier]
          return (
            <Zone key={tier} anchor={layout.bonus[tier]} label={BONUS_LABEL[tier]} editor={editorFor(`bonus-${tier}`)}>
              {pile.length > 0
                ? <TokenStack
                    items={pile.map((_, i) => <JaipurToken key={i} type={tier} size={tokenW} />)}
                    size={tokenW} offset={layout.tokenStackOffset} />
                : <JaipurToken type={tier} size={tokenW} dimmed />}
            </Zone>
          )
        })}

        {/* Camel (5-rupee) token */}
        <Zone anchor={layout.camel} label="Camello" editor={editorFor('camel')}>
          <JaipurToken type="camel" size={tokenW} dimmed={!jaipurState.tokens.camelTokenAvailable} />
        </Zone>

        {/* Structural zones — editor-only ghost markers; invisible in normal play */}
        {isEditorMode && (
          <>
            <Zone anchor={layout.structural.deckDrawSlot}    label="Mazo robar"   editor={editorFor('structural-deckDrawSlot')}><StructuralMarker /></Zone>
            <Zone anchor={layout.structural.deckDiscardSlot} label="Mazo descartes" editor={editorFor('structural-deckDiscardSlot')}><StructuralMarker /></Zone>
            <Zone anchor={layout.structural.botCamelPen}     label="Manada Bot"   editor={editorFor('structural-botCamelPen')}><StructuralMarker /></Zone>
            <Zone anchor={layout.structural.playerCamelPen}  label="Mi manada"    editor={editorFor('structural-playerCamelPen')}><StructuralMarker /></Zone>
            <Zone anchor={layout.structural.botScoreSeals}   label="Sellos Bot"   editor={editorFor('structural-botScoreSeals')}><StructuralMarker /></Zone>
            <Zone anchor={layout.structural.playerScoreSeals} label="Mis sellos"  editor={editorFor('structural-playerScoreSeals')}><StructuralMarker /></Zone>
          </>
        )}
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

  // ── Editor HUD (only while editing) ───────────────────────────────────────
  const editorHud = isEditorMode ? (() => {
    const a = selectedEl ? getAnchor(layout, selectedEl) : undefined
    return (
      <div style={st.editorHud}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>🛠️ Editor de tablero</div>
        <div>{selectedEl ? `Pieza: ${selectedEl}` : 'Arrastra o pulsa una pieza'}</div>
        {a && <div style={{ color: '#9fd' }}>top {round1(a.topPct)}% · left {round1(a.leftPct)}%</div>}
        <div style={{ color: '#fc9', marginTop: 2 }}>
          carta {round1(layout.cardWPct)}% · ficha {round1(layout.tokenWPct)}%
        </div>
        <div style={{ marginTop: 4, fontSize: 10, color: '#adf' }}>💾 Auto-guardado en localStorage</div>
        <div style={{ marginTop: 8, fontSize: 11, opacity: 0.85, lineHeight: 1.6 }}>
          Arrastrar = mover · Flechas = 1px (Shift = 10px)<br />
          - / + = reducir / ampliar tamaño<br />
          u / d = solape de pilas ({layout.tokenStackOffset}px)<br />
          Ctrl/⌘+S = guardar en servidor · S = exportar JSON (consola)<br />
          R = reiniciar<br />
          Esc = deseleccionar · Z = lupa<br />
          ` (acento grave) = salir del editor
        </div>
      </div>
    )
  })() : null

  return (
    <div style={st.page}>
      {gameOverOverlay}
      {editorHud}
      {isMagnifier && (
        <MagnifierLens
          image={BOARD_IMAGE} ratio={BOARD_RATIO}
          stageRef={stageRef} stageW={stageW} lensPos={lensPos}
          width={LENS_W} height={LENS_H} zoom={LENS_ZOOM}
        />
      )}
      {editor.isEditing && (
        <LayoutEditorToolbar
          saveState={editor.saveState}
          errorMessage={editor.errorMessage}
          lastWrittenPath={editor.lastWrittenPath}
          onSave={editor.save}
        />
      )}

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
      <div style={st.stageWrap}>{renderBoardStage()}</div>
      {renderMyArea()}
    </div>
  )
}

// ── Editor math helpers ───────────────────────────────────────────────────────
const clamp  = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const round1 = (v: number) => Math.round(v * 10) / 10
const round2 = (v: number) => Math.round(v * 100) / 100

// ── Jaipur editor adapters (passed to the generic useBoardLayoutEditor hook) ──

/** Grow/shrink the selected element: deck/market scale the card knob, else token. */
function scaleJaipurElement(L: BoardLayout, id: string, dir: 1 | -1): BoardLayout {
  const delta = dir * 0.2
  const isCard = id === 'deck' || id.startsWith('market-')
  return isCard
    ? { ...L, cardWPct:  round2(clamp(L.cardWPct  + delta, 1, 30)) }
    : { ...L, tokenWPct: round2(clamp(L.tokenWPct + delta, 1, 30)) }
}

/** Legacy console export in copy-paste-ready boardLayout.ts constant form (plain S). */
function exportLayout(L: BoardLayout): void {
  const r = (a: Anchor) => ({ topPct: round1(a.topPct), leftPct: round1(a.leftPct) })
  const out = {
    CARD_W_PCT: L.cardWPct,
    TOKEN_W_PCT: L.tokenWPct,
    TOKEN_STACK_OFFSET: L.tokenStackOffset,
    DECK_ANCHOR: r(L.deck),
    MARKET_ANCHORS: L.market.map(r),
    GOODS_ANCHORS: Object.fromEntries(Object.entries(L.goods).map(([k, v]) => [k, r(v)])),
    BONUS_ANCHORS: Object.fromEntries(Object.entries(L.bonus).map(([k, v]) => [k, r(v)])),
    CAMEL_ANCHOR: r(L.camel),
    STRUCTURAL_ANCHORS: Object.fromEntries(
      Object.entries(L.structural).map(([k, v]) => [k, r(v as Anchor)]),
    ),
  }
  try { localStorage.setItem(LS_KEY, JSON.stringify(L)) } catch {}
  // eslint-disable-next-line no-console
  console.log('[Jaipur boardLayout]\n' + JSON.stringify(out, null, 2))
}

const STRUCTURAL_KEYS: (keyof StructuralAnchors)[] = [
  'deckDrawSlot', 'deckDiscardSlot',
  'botCamelPen', 'playerCamelPen',
  'botScoreSeals', 'playerScoreSeals',
]

function getAnchor(L: BoardLayout, id: string): Anchor | undefined {
  if (id === 'deck')  return L.deck
  if (id === 'camel') return L.camel
  if (id.startsWith('market-'))    return L.market[Number(id.slice(7))]
  if (id.startsWith('goods-'))     return L.goods[id.slice(6) as GoodsType]
  if (id.startsWith('bonus-'))     return L.bonus[id.slice(6) as BonusTier]
  if (id.startsWith('structural-')) {
    const key = id.slice(11) as keyof StructuralAnchors
    return STRUCTURAL_KEYS.includes(key) ? L.structural[key] : undefined
  }
  return undefined
}

function updateAnchor(L: BoardLayout, id: string, a: Anchor): BoardLayout {
  if (id === 'deck')  return { ...L, deck: a }
  if (id === 'camel') return { ...L, camel: a }
  if (id.startsWith('market-')) {
    const market = L.market.slice()
    market[Number(id.slice(7))] = a
    return { ...L, market }
  }
  if (id.startsWith('goods-')) return { ...L, goods: { ...L.goods, [id.slice(6) as GoodsType]: a } }
  if (id.startsWith('bonus-')) return { ...L, bonus: { ...L.bonus, [id.slice(6) as BonusTier]: a } }
  if (id.startsWith('structural-')) {
    const key = id.slice(11) as keyof StructuralAnchors
    if (STRUCTURAL_KEYS.includes(key)) return { ...L, structural: { ...L.structural, [key]: a } }
  }
  return L
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
  },
  // Wrapper centres the aspect-locked board stage between the player panels.
  stageWrap: { margin: '12px auto', width: '100%' },
  // The board image itself; children are absolutely positioned over its zones.
  stage: {
    position: 'relative', width: '100%', aspectRatio: `${BOARD_RATIO}`,
    backgroundImage: `url(${BOARD_IMAGE})`,
    backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat',
    borderRadius: 12, boxShadow: '0 8px 28px rgba(0,0,0,0.55)',
  },
  zoneLabel: {
    fontSize: 9, fontWeight: 700, color: '#fff',
    textShadow: '0 1px 3px rgba(0,0,0,0.95)', whiteSpace: 'nowrap', pointerEvents: 'none',
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
  editorHud: {
    position: 'fixed', top: 12, right: 12, zIndex: 400,
    background: 'rgba(10,16,24,0.92)', border: '1px solid rgba(59,130,246,0.6)',
    borderRadius: 10, padding: '12px 14px', maxWidth: 280,
    color: '#fff', fontSize: 13, lineHeight: 1.4,
    boxShadow: '0 8px 24px rgba(0,0,0,0.55)', pointerEvents: 'none',
  },
  overlay:  { position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(8,5,2,0.93)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  overlayPanel: {
    background: 'linear-gradient(160deg, #2a1d0c 0%, #1a1208 100%)',
    borderRadius: 18, padding: '36px 44px', maxWidth: 460, width: '90%', textAlign: 'center',
    boxShadow: '0 24px 64px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,215,0,0.18)',
  },
}
