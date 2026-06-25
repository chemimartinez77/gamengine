export type GemType   = 'diamond' | 'sapphire' | 'emerald' | 'ruby' | 'onyx'
export type TokenType = GemType | 'gold'

export interface SplendorPlayer {
  id:               string
  name:             string
  tokens:           Record<TokenType, number>
  bonusGems:        Record<GemType, number>
  developmentCards: string[]
  reservedCards:    string[]
  nobles:           string[]
  prestigePoints:   number
}

export interface SplendorGameState {
  gameId:          string
  status:          'LOBBY' | 'PLAYING' | 'FINISHED'
  players:         SplendorPlayer[]
  activePlayerId:  string
  bankTokens:      Record<TokenType, number>
  availableNobles: string[]
  decks:           Record<1 | 2 | 3, string[]>
  market:          Record<1 | 2 | 3, string[]>
  winnerId:        string | null
}

export type SplendorAction =
  | { type: 'TAKE_THREE_DIFFERENT_TOKENS'; gems: GemType[] }
  | { type: 'TAKE_TWO_SAME_TOKENS';        gem: GemType }
  | { type: 'BUY_CARD';                    cardId: string; goldUsed: number }
  | { type: 'RESERVE_CARD';               cardId: string }
  | { type: 'DISCARD_TOKENS';             gems: TokenType[] }

export interface SplendorNoble {
  id:             string   // '01'–'10', matches /assets/splendor/nobles/<id>.jpg
  prestigePoints: number
  requires:       Partial<Record<GemType, number>>
}


export interface SplendorCard {
  id:             string
  level:          1 | 2 | 3
  spriteIndex:    number   // 0–69; slot 69 = reverso del mazo en ese atlas
  gemProduced:    GemType
  prestigePoints: number
  cost:           Partial<Record<GemType, number>>
}

