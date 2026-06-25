import type { JaipurCard as JaipurCardModel, CardType } from '@gamengine/shared'

// card.type → face image under /jaipur/cartas/
const CARD_IMAGE: Record<CardType, string> = {
  diamonds: '/jaipur/cartas/diamante.png',
  gold:     '/jaipur/cartas/oro.png',
  silver:   '/jaipur/cartas/plata.png',
  cloth:    '/jaipur/cartas/tela.png',
  spice:    '/jaipur/cartas/especias.png',
  leather:  '/jaipur/cartas/cuero.png',
  camel:    '/jaipur/cartas/camello.png',
}

const CARD_BACK = '/jaipur/cartas/reverso.png'

interface JaipurCardProps {
  card:        JaipurCardModel
  isSelected?: boolean
  onClick?:    () => void
  isFaceUp?:   boolean
  width?:      number
}

export function JaipurCard({
  card, isSelected = false, onClick, isFaceUp = true, width = 64,
}: JaipurCardProps) {
  const height = Math.round(width * 1.4)
  const src    = isFaceUp ? CARD_IMAGE[card.type] : CARD_BACK

  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative',
        width, height, flexShrink: 0,
        borderRadius: 8,
        cursor: onClick ? 'pointer' : 'default',
        backgroundImage:    `url(${src})`,
        backgroundSize:     'cover',
        backgroundPosition: 'center',
        boxShadow: isSelected
          ? '0 0 0 3px #FFD700, 0 8px 18px rgba(0,0,0,0.6)'
          : '0 3px 8px rgba(0,0,0,0.5)',
        transform:  isSelected ? 'translateY(-8px) scale(1.04)' : 'none',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
      }}
    />
  )
}
