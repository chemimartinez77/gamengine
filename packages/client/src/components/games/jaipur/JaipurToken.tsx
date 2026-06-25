import type { GoodsType, BonusTier } from '@gamengine/shared'

export type TokenKind = GoodsType | BonusTier | 'camel'

// Spanish stem for each goods type (matches the /jaipur/fichas/ filenames).
const GOOD_ES: Record<GoodsType, string> = {
  diamonds: 'diamante',
  gold:     'oro',
  silver:   'plata',
  cloth:    'tela',
  spice:    'especias',
  leather:  'cuero',
}

// Token value images that actually exist on disk, per goods type.
const TOKEN_IMAGE_VALUES: Record<GoodsType, number[]> = {
  diamonds: [5, 7],
  gold:     [5, 6],
  silver:   [5],
  cloth:    [1, 2, 3, 5],
  spice:    [1, 2, 3, 5],
  leather:  [1, 2, 3, 4],
}

// Resolve a goods token image, falling back to the nearest available value.
function goodsTokenImage(good: GoodsType, value: number): string {
  const avail = TOKEN_IMAGE_VALUES[good]
  const pick  = avail.includes(value)
    ? value
    : avail.reduce((best, v) => (Math.abs(v - value) < Math.abs(best - value) ? v : best), avail[0])
  return `/jaipur/fichas/${GOOD_ES[good]}${pick}a.png`
}

export function tokenImageFor(type: TokenKind, value?: number): string {
  if (type === 'camel') return '/jaipur/fichas/camello5a.png'
  if (type === 'bonus3' || type === 'bonus4' || type === 'bonus5') {
    return `/jaipur/fichas/${type}a.png`
  }
  // Goods token — default to the lowest value image when none specified.
  const fallback = TOKEN_IMAGE_VALUES[type][0]
  return goodsTokenImage(type, value ?? fallback)
}

interface JaipurTokenProps {
  type:   TokenKind
  value?: number
  count?: number
  size?:  number
  dimmed?: boolean
}

export function JaipurToken({ type, value, count, size = 46, dimmed = false }: JaipurTokenProps) {
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <div style={{
        width: size, height: size,
        borderRadius: '50%',
        backgroundImage:    `url(${tokenImageFor(type, value)})`,
        backgroundSize:     'cover',
        backgroundPosition: 'center',
        opacity: dimmed ? 0.28 : 1,
        boxShadow: [
          'inset 0 -3px 6px rgba(0,0,0,0.40)',
          'inset 0 2px 5px rgba(255,255,255,0.25)',
          '0 3px 8px rgba(0,0,0,0.50)',
        ].join(', '),
      }} />
      {count !== undefined && count > 1 && (
        <span style={{
          position: 'absolute', bottom: -2, right: -2,
          minWidth: Math.round(size * 0.42), height: Math.round(size * 0.42),
          padding: '0 3px', boxSizing: 'border-box',
          borderRadius: '50%',
          background: 'rgba(0,0,0,0.82)', border: '1px solid rgba(255,255,255,0.40)',
          color: '#fff', fontWeight: 800, fontSize: Math.round(size * 0.26),
          display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
          userSelect: 'none',
        }}>
          {count}
        </span>
      )}
    </div>
  )
}
