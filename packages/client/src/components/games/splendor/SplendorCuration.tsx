import { useState, useCallback } from 'react'
import { LEVEL1_CARDS, LEVEL2_CARDS, LEVEL3_CARDS, NOBLES } from '@gamengine/shared'
import type { SplendorCard, SplendorNoble, GemType } from '@gamengine/shared'

const GEM_TYPES: GemType[] = ['diamond', 'sapphire', 'emerald', 'ruby', 'onyx']

const GEM_ABBR: Record<GemType, string> = {
  diamond: 'Di', sapphire: 'Za', emerald: 'Es', ruby: 'Ru', onyx: 'On',
}
const GEM_LABEL: Record<GemType, string> = {
  diamond: 'Diamante', sapphire: 'Zafiro', emerald: 'Esmeralda', ruby: 'Rubí', onyx: 'Ónice',
}
const GEM_COLOR: Record<GemType, string> = {
  diamond: '#c8d6e5', sapphire: '#1565c0', emerald: '#2e7d32', ruby: '#b71c1c', onyx: '#37474f',
}
const ATLAS_URLS: Record<1 | 2 | 3, string> = {
  1: '/splendor/atlases/32.jpg',
  2: '/splendor/atlases/30.jpg',
  3: '/splendor/atlases/31.jpg',
}
const COLS = 10
const ROWS = 7

// ── Card drafts ──────────────────────────────────────────────────────────────

type CardDraft = {
  id:             string
  level:          1 | 2 | 3
  spriteIndex:    number
  gemProduced:    GemType
  prestigePoints: number
  cost:           Record<GemType, number>
}

function toCardDraft(c: SplendorCard): CardDraft {
  return {
    ...c,
    cost: {
      diamond:  c.cost.diamond  ?? 0,
      sapphire: c.cost.sapphire ?? 0,
      emerald:  c.cost.emerald  ?? 0,
      ruby:     c.cost.ruby     ?? 0,
      onyx:     c.cost.onyx     ?? 0,
    },
  }
}

const STORAGE_KEY = 'splendor-curation-v1'
const ZERO_COST: Record<GemType, number> = { diamond: 0, sapphire: 0, emerald: 0, ruby: 0, onyx: 0 }

function isOldPlaceholder(cost: Record<GemType, number>, lvl: 2 | 3): boolean {
  const n = lvl === 2 ? 2 : 3
  return cost.emerald === n && cost.ruby === n &&
    cost.diamond === 0 && cost.sapphire === 0 && cost.onyx === 0
}

function initDrafts(): CardDraft[] {
  const base = [...LEVEL1_CARDS, ...LEVEL2_CARDS, ...LEVEL3_CARDS].map(toCardDraft)
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as CardDraft[]
      const migrated = parsed.map(c => {
        if (c.level === 2 && c.spriteIndex >= 2 && isOldPlaceholder(c.cost, 2))
          return { ...c, cost: { ...ZERO_COST } }
        if (c.level === 3 && isOldPlaceholder(c.cost, 3))
          return { ...c, cost: { ...ZERO_COST } }
        return c
      })
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated))
      return migrated
    }
  } catch { /* ignore */ }
  return base
}

// ── Noble drafts ─────────────────────────────────────────────────────────────

type NobleDraft = {
  id:             string
  prestigePoints: number
  requires:       Record<GemType, number>
}

function toNobleDraft(n: SplendorNoble): NobleDraft {
  return {
    id: n.id,
    prestigePoints: n.prestigePoints,
    requires: {
      diamond:  n.requires.diamond  ?? 0,
      sapphire: n.requires.sapphire ?? 0,
      emerald:  n.requires.emerald  ?? 0,
      ruby:     n.requires.ruby     ?? 0,
      onyx:     n.requires.onyx     ?? 0,
    },
  }
}

const NOBLES_STORAGE_KEY = 'splendor-curation-nobles-v1'

function initNobleDrafts(): NobleDraft[] {
  const base = NOBLES.map(toNobleDraft)
  try {
    const stored = localStorage.getItem(NOBLES_STORAGE_KEY)
    if (stored) return JSON.parse(stored) as NobleDraft[]
  } catch { /* ignore */ }
  return base
}

// ── Sprite component ─────────────────────────────────────────────────────────

function CardSprite({ card }: { card: CardDraft }) {
  const col  = card.spriteIndex % COLS
  const row  = Math.floor(card.spriteIndex / COLS)
  const posX = (col / (COLS - 1)) * 100
  const posY = (row / (ROWS - 1)) * 100
  return (
    <div style={{
      width:              72,
      height:             Math.round(72 * 1.4),
      flexShrink:         0,
      backgroundImage:    `url(${ATLAS_URLS[card.level]})`,
      backgroundSize:     '1000% 700%',
      backgroundPosition: `${posX}% ${posY}%`,
      borderRadius:       5,
      boxShadow:          '0 2px 8px rgba(0,0,0,0.6)',
    }} />
  )
}

// ── Main component ────────────────────────────────────────────────────────────

type ActiveTab = 1 | 2 | 3 | 'nobles'

export function SplendorCuration() {
  const [drafts,       setDrafts]       = useState<CardDraft[]>(initDrafts)
  const [nobleDrafts,  setNobleDrafts]  = useState<NobleDraft[]>(initNobleDrafts)
  const [activeTab,    setActiveTab]    = useState<ActiveTab>(1)
  const [status,       setStatus]       = useState<'idle' | 'saving' | 'ok' | 'err'>('idle')

  // ── Card callbacks ──────────────────────────────────────────────────────────

  const updateCard = useCallback((id: string, patch: Partial<CardDraft>) => {
    setDrafts(prev => {
      const next = prev.map(c => c.id === id ? { ...c, ...patch } : c)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const updateCost = useCallback((id: string, gem: GemType, val: number) => {
    setDrafts(prev => {
      const next = prev.map(c => c.id === id
        ? { ...c, cost: { ...c.cost, [gem]: Math.max(0, val) } }
        : c
      )
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  // ── Noble callbacks ─────────────────────────────────────────────────────────

  const updateNoble = useCallback((id: string, patch: Partial<NobleDraft>) => {
    setNobleDrafts(prev => {
      const next = prev.map(n => n.id === id ? { ...n, ...patch } : n)
      localStorage.setItem(NOBLES_STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const updateNobleRequires = useCallback((id: string, gem: GemType, val: number) => {
    setNobleDrafts(prev => {
      const next = prev.map(n => n.id === id
        ? { ...n, requires: { ...n.requires, [gem]: Math.max(0, val) } }
        : n
      )
      localStorage.setItem(NOBLES_STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  // ── Reset & save ────────────────────────────────────────────────────────────

  function reset() {
    const base = [...LEVEL1_CARDS, ...LEVEL2_CARDS, ...LEVEL3_CARDS].map(toCardDraft)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(base))
    setDrafts(base)
    const nobleBase = NOBLES.map(toNobleDraft)
    localStorage.setItem(NOBLES_STORAGE_KEY, JSON.stringify(nobleBase))
    setNobleDrafts(nobleBase)
  }

  async function save() {
    setStatus('saving')
    try {
      const r = await fetch('/dev/save-splendor-cards', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ cards: drafts, nobles: nobleDrafts }),
      })
      setStatus(r.ok ? 'ok' : 'err')
    } catch {
      setStatus('err')
    }
    setTimeout(() => setStatus('idle'), 3000)
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const levelCards = activeTab !== 'nobles' ? drafts.filter(c => c.level === activeTab) : []

  const saveBtnBg =
    status === 'ok'     ? '#2e7d32' :
    status === 'err'    ? '#b71c1c' :
    status === 'saving' ? '#555'    : '#e65100'

  const saveBtnLabel =
    status === 'saving' ? 'Guardando…'  :
    status === 'ok'     ? '✓ Guardado'  :
    status === 'err'    ? '✗ Error'     : '💾 Guardar splendorCards.ts'

  const isNobles = activeTab === 'nobles'

  return (
    <div style={{
      background: '#0d1620', minHeight: '100vh', color: '#fff',
      fontFamily: 'system-ui, sans-serif', padding: '14px 20px', boxSizing: 'border-box',
    }}>
      {/* ── Sticky header zone ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: '#0d1620',
        paddingBottom: 6,
        marginBottom: 4,
        borderBottom: '1px solid #1e2d3d',
      }}>
        {/* Title + tabs + actions */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, color: '#FFD700', fontSize: 18, fontWeight: 800 }}>
            🎴 Splendor Card Curation
          </h2>

          {([1, 2, 3] as const).map(lv => (
            <button key={lv} onClick={() => setActiveTab(lv)} style={{
              padding: '4px 14px', borderRadius: 6, cursor: 'pointer',
              fontWeight: 700, border: 'none', fontSize: 13,
              background: activeTab === lv ? '#1a73e8' : 'rgba(255,255,255,0.10)',
              color: '#fff',
            }}>
              Nivel {lv} <span style={{ opacity: 0.55 }}>({lv === 1 ? 40 : lv === 2 ? 30 : 20})</span>
            </button>
          ))}

          <button onClick={() => setActiveTab('nobles')} style={{
            padding: '4px 14px', borderRadius: 6, cursor: 'pointer',
            fontWeight: 700, border: 'none', fontSize: 13,
            background: activeTab === 'nobles' ? '#7b1fa2' : 'rgba(255,255,255,0.10)',
            color: '#fff',
          }}>
            Nobles <span style={{ opacity: 0.55 }}>(10)</span>
          </button>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#555' }}>
              {drafts.length} cartas · {nobleDrafts.length} nobles
            </span>
            <button onClick={reset} style={{
              padding: '4px 12px', background: 'rgba(255,255,255,0.07)',
              border: '1px solid #444', color: '#aaa', borderRadius: 6,
              cursor: 'pointer', fontSize: 12,
            }}>
              Resetear
            </button>
            <button onClick={save} disabled={status === 'saving'} style={{
              padding: '5px 18px', borderRadius: 8, fontWeight: 700,
              fontSize: 13, border: 'none', cursor: 'pointer',
              background: saveBtnBg, color: '#fff',
            }}>
              {saveBtnLabel}
            </button>
          </div>
        </div>

        {/* Column headers */}
        <div style={{
          display: 'flex', gap: 10, alignItems: 'center',
          padding: '0 8px', fontSize: 10, color: '#4a5568',
          textTransform: 'uppercase', letterSpacing: 1,
        }}>
          <span style={{ width: 24 }}>#</span>
          <span style={{ width: isNobles ? Math.round(72 * 1.4) : 72 }}>{isNobles ? 'Noble' : 'Carta'}</span>
          <span style={{ width: 38, textAlign: 'center' }}>Pts</span>
          {isNobles
            ? <span style={{ width: 104, color: '#7b1fa2' }}>Requisitos</span>
            : <span style={{ width: 104 }}>Produce</span>
          }
          {GEM_TYPES.map(g => (
            <span key={g} style={{ width: 40, textAlign: 'center', color: GEM_COLOR[g], fontWeight: 700 }}>
              {GEM_ABBR[g]}
            </span>
          ))}
        </div>
      </div>{/* end sticky zone */}

      {/* ── Noble rows ── */}
      {isNobles && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {nobleDrafts.map((noble, idx) => (
            <div key={noble.id} style={{
              display: 'flex', gap: 10, alignItems: 'center',
              background: 'rgba(123,31,162,0.08)', borderRadius: 6,
              padding: '4px 8px', border: '1px solid rgba(123,31,162,0.15)',
            }}>
              {/* Index */}
              <span style={{
                color: '#5a3a6a', fontSize: 10, width: 24,
                textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums',
              }}>
                {idx + 1}
              </span>

              {/* Noble image */}
              <img
                src={`/splendor/nobles/${noble.id}.jpg`}
                style={{
                  width: Math.round(72 * 1.4), height: Math.round(72 * 1.4),
                  borderRadius: 5, flexShrink: 0, objectFit: 'cover',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
                }}
              />

              {/* Prestige points */}
              <input
                type="number" min={0} max={9}
                value={noble.prestigePoints}
                onChange={e => updateNoble(noble.id, { prestigePoints: Math.max(0, Number(e.target.value)) })}
                style={{
                  width: 38, textAlign: 'center', borderRadius: 4,
                  background: '#111d2b', border: '1px solid #2a3a4a',
                  color: '#FFD700', padding: '4px 0', fontSize: 14,
                  fontWeight: 800, flexShrink: 0,
                }}
              />

              {/* Spacer for "Produce" column */}
              <div style={{ width: 104, flexShrink: 0 }} />

              {/* Requires inputs — one per gem */}
              {GEM_TYPES.map(gem => {
                const val = noble.requires[gem]
                return (
                  <input
                    key={gem}
                    type="number" min={0} max={9}
                    value={val}
                    onChange={e => updateNobleRequires(noble.id, gem, Number(e.target.value))}
                    style={{
                      width: 40, textAlign: 'center', borderRadius: 4,
                      padding: '4px 0', fontSize: 13, fontWeight: 700, flexShrink: 0,
                      background: val > 0 ? GEM_COLOR[gem] : '#111d2b',
                      border:     val > 0 ? 'none' : '1px solid #2a3a4a',
                      color: val > 0 && gem !== 'diamond' ? '#fff'
                           : val > 0                     ? '#111'
                           :                               '#3a4a5a',
                    }}
                  />
                )
              })}
            </div>
          ))}
        </div>
      )}

      {/* ── Card rows ── */}
      {!isNobles && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {levelCards.map(card => (
            <div key={card.id} style={{
              display: 'flex', gap: 10, alignItems: 'center',
              background: 'rgba(255,255,255,0.025)', borderRadius: 6,
              padding: '4px 8px', border: '1px solid rgba(255,255,255,0.04)',
            }}>
              {/* Index */}
              <span style={{
                color: '#3a4a5a', fontSize: 10, width: 24,
                textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums',
              }}>
                {card.spriteIndex}
              </span>

              {/* Card sprite */}
              <CardSprite card={card} />

              {/* Prestige points */}
              <input
                type="number" min={0} max={5}
                value={card.prestigePoints}
                onChange={e => updateCard(card.id, { prestigePoints: Math.max(0, Number(e.target.value)) })}
                style={{
                  width: 38, textAlign: 'center', borderRadius: 4,
                  background: '#111d2b', border: '1px solid #2a3a4a',
                  color: '#FFD700', padding: '4px 0', fontSize: 14,
                  fontWeight: 800, flexShrink: 0,
                }}
              />

              {/* Gem produced */}
              <select
                value={card.gemProduced}
                onChange={e => updateCard(card.id, { gemProduced: e.target.value as GemType })}
                style={{
                  width: 104, background: GEM_COLOR[card.gemProduced],
                  border: 'none',
                  color: card.gemProduced === 'diamond' ? '#111' : '#fff',
                  borderRadius: 4, padding: '4px 5px', fontSize: 12,
                  fontWeight: 700, cursor: 'pointer', flexShrink: 0,
                }}
              >
                {GEM_TYPES.map(g => (
                  <option key={g} value={g} style={{ background: '#1a2535', color: '#fff' }}>
                    {GEM_LABEL[g]}
                  </option>
                ))}
              </select>

              {/* Cost inputs — one per gem */}
              {GEM_TYPES.map(gem => {
                const val = card.cost[gem]
                return (
                  <input
                    key={gem}
                    type="number" min={0} max={9}
                    value={val}
                    onChange={e => updateCost(card.id, gem, Number(e.target.value))}
                    style={{
                      width: 40, textAlign: 'center', borderRadius: 4,
                      padding: '4px 0', fontSize: 13, fontWeight: 700, flexShrink: 0,
                      background: val > 0 ? GEM_COLOR[gem] : '#111d2b',
                      border:     val > 0 ? 'none' : '1px solid #2a3a4a',
                      color: val > 0 && gem !== 'diamond' ? '#fff'
                           : val > 0                     ? '#111'
                           :                               '#3a4a5a',
                    }}
                  />
                )
              })}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 16, fontSize: 11, color: '#3a4a5a', textAlign: 'center' }}>
        Los cambios se persisten en localStorage · Guardar escribe{' '}
        <code style={{ color: '#555' }}>packages/shared/splendorCards.ts</code>{' '}
        (requiere reiniciar el servidor compartido para que el servidor lo use)
      </div>
    </div>
  )
}
