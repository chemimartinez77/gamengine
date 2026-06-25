import type { TokenType } from '@gamengine/shared'

interface SplendorTokenProps {
  gem:    TokenType
  size?:  number
  count?: number
}

const TOKEN_IMAGES: Record<TokenType, string> = {
  ruby:     '/splendor/fichas/20.png',
  emerald:  '/splendor/fichas/21.png',
  sapphire: '/splendor/fichas/22.png',
  diamond:  '/splendor/fichas/23.png',
  gold:     '/splendor/fichas/24.png',
  onyx:     '/splendor/fichas/25.png',
}

export function SplendorToken({ gem, size = 56, count }: SplendorTokenProps) {
  return (
    <div style={{ position: 'relative', display: 'inline-block', width: size, height: size, flexShrink: 0 }}>
      <div style={{
        width: size, height: size,
        borderRadius: '50%',
        backgroundImage:    `url(${TOKEN_IMAGES[gem]})`,
        backgroundSize:     'cover',
        backgroundPosition: 'center',
        boxShadow: [
          'inset 0 -4px 8px rgba(0,0,0,0.45)',
          'inset 0 3px 6px rgba(255,255,255,0.30)',
          '0 4px 12px rgba(0,0,0,0.50)',
          '0 1px 3px rgba(0,0,0,0.30)',
        ].join(', '),
      }} />
      {count !== undefined && count > 0 && (
        <span style={{
          position:        'absolute',
          bottom:          0,
          right:           0,
          width:           Math.round(size * 0.38),
          height:          Math.round(size * 0.38),
          borderRadius:    '50%',
          background:      'rgba(0,0,0,0.78)',
          border:          '1px solid rgba(255,255,255,0.40)',
          color:           '#fff',
          fontWeight:      800,
          fontSize:        Math.round(size * 0.24),
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'center',
          lineHeight:      1,
          userSelect:      'none',
        }}>
          {count}
        </span>
      )}
    </div>
  )
}
