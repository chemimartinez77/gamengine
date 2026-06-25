// CSS sprite component for Splendor development cards.
// Atlases are 10-column × 7-row sheets; spriteIndex 69 = deck reverso.

interface SplendorCardProps {
  level:       1 | 2 | 3
  spriteIndex: number   // 0–68 face-up; ignored when isFaceUp=false (renders slot 69)
  isFaceUp:    boolean
  width?:      number
}

const ATLAS_URLS: Record<1 | 2 | 3, string> = {
  1: '/splendor/atlases/32.jpg',
  2: '/splendor/atlases/30.jpg',
  3: '/splendor/atlases/31.jpg',
}

const COLS        = 10
const ROWS        = 7
const BACK_INDEX  = 69
const CARD_ASPECT = 1.4   // height / width (portrait ~5:7)

export function SplendorCard({ level, spriteIndex, isFaceUp, width = 80 }: SplendorCardProps) {
  const idx  = isFaceUp ? spriteIndex : BACK_INDEX
  const col  = idx % COLS
  const row  = Math.floor(idx / COLS)
  const posX = (col / (COLS - 1)) * 100
  const posY = (row / (ROWS - 1)) * 100

  return (
    <div style={{
      width,
      height:             Math.round(width * CARD_ASPECT),
      backgroundImage:    `url(${ATLAS_URLS[level]})`,
      backgroundSize:     '1000% 700%',
      backgroundPosition: `${posX}% ${posY}%`,
      borderRadius:       6,
      boxShadow:          '0 4px 12px rgba(0,0,0,0.45), 0 1px 3px rgba(0,0,0,0.30)',
      flexShrink:         0,
    }} />
  )
}
