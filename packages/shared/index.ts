import type { GameType, BotDifficulty, Player, GameState, Move } from './core.js';
import type { BoardLayoutSavePayload, BoardLayoutSaveResult } from './src/board-layout/index.js';

export type { GameType, BotDifficulty, Player, MancalaEventType, MancalaEvent, GameState, Move, GameMove } from './core.js';
export { type GameEngine, GameError } from './engine.js';
export { ticTacToeEngine } from './src/games/tictactoe/index.js';
export { mancalaEngine }   from './src/games/mancala/index.js';
export type { SplendorCard, SplendorNoble, GemType, TokenType, SplendorPlayer, SplendorGameState, SplendorAction } from './src/games/splendor/index.js';
export { LEVEL1_CARDS, LEVEL2_CARDS, LEVEL3_CARDS, NOBLES } from './src/games/splendor/cards.js';
export type {
  LuxuryGood, CommonGood, GoodsType, CardType, JaipurCard,
  BonusTier, JaipurTokensState, JaipurEarnedToken,
  JaipurPlayerState, JaipurGameState, JaipurMove,
} from './src/games/jaipur/index.js';
export {
  JAIPUR_MAX_HAND, JAIPUR_MARKET_SIZE, JAIPUR_STARTING_MARKET_CAMELS,
  JAIPUR_STARTING_HAND, JAIPUR_CAMEL_TOKEN_VALUE, JAIPUR_SEALS_TO_WIN,
  LUXURY_GOODS, COMMON_GOODS, ALL_GOODS, JAIPUR_MIN_SALE,
  JAIPUR_DECK_COMPOSITION, JAIPUR_GOODS_TOKEN_VALUES, JAIPUR_BONUS_TOKEN_VALUES,
  bonusTierForCount,
} from './src/games/jaipur/index.js';

export type {
  VirusCardType, VirusColor, TreatmentKind,
  VirusCard, OrganSlot, OrganSlotStatus, VirusCuerpo,
  VirusPlayerState, VirusGameState, VirusMove,
} from './src/games/virus/index.js';
export {
  VIRUS_COLORS, VIRUS_HAND_SIZE, VIRUS_WIN_ORGANS,
  VIRUS_CARDS_PER_COLOR, VIRUS_MULTICOLOR_COUNT,
  VIRUS_TREATMENT_COUNTS, VIRUS_ATLAS_BACK,
  virusAtlasIndex, colorsMatch, organSlotStatus, isOrganHealthy,
} from './src/games/virus/index.js';
// Virus! shared legal-move matrix (used by the server bot AND the client debug panel)
export type { VirusMoveDescription, VirusStructuralChange } from './src/games/virus/moves.js';
export {
  enumerateLegalVirusMoves, describeVirusMove, describeVirusDiscard,
} from './src/games/virus/moves.js';

export type {
  StoneAgeResourceType, StoneAgePlayerColor, StoneAgeGamePhase,
  StoneAgeBoardLocation, StoneAgeBoardOccupancy,
  StoneAgePlaceFiguresPayload, StoneAgeMovePayload,
  StoneAgeMeepleState, StoneAgeToolState,
  StoneAgeFixedCost, StoneAgeVariableCost,
  StoneAgeHutTile, StoneAgeCivilizationCard,
  StoneAgePlayerState, StoneAgeGameState,
} from './src/games/stoneage/index.js';
export {
  STONEAGE_LIMITED_LOCATIONS, STONEAGE_RESOURCE_LOCATIONS,
  STONEAGE_RESOURCE_LOCATION_CAPACITY,
} from './src/games/stoneage/index.js';

// Generic visual layout editor — shared placement contracts & save event payloads
export type {
  Anchor, LayoutItemKind, BoardLayoutItem, BoardLayout,
  BoardLayoutSavePayload, BoardLayoutSaveResult,
} from './src/board-layout/index.js';
export {
  GAME_ID_PATTERN, GAME_ID_MAX_LENGTH,
  isValidGameId, isAnchor, isBoardLayout, isBoardLayoutSavePayload,
} from './src/board-layout/index.js';

// Socket.IO event contracts — shared between server and client
export interface ServerToClientEvents {
  room_joined:        (roomId: string, gameState: GameState | null, gameType: GameType) => void;
  player_joined:      (player: Player) => void;
  player_left:        (playerId: string) => void;
  host_changed:       (newHostId: string) => void;
  game_started:       (gameState: GameState) => void;
  state_updated:      (gameState: GameState) => void;
  rooms_updated:      (rooms: RoomSummary[]) => void;
  rematch_requested:  (playerId: string) => void;
  error:              (message: string) => void;
}

export interface ClientToServerEvents {
  create_room: (
    roomName:  string,
    gameType:  GameType,
    player:    Player,
    callback:  (roomId: string) => void
  ) => void;
  create_bot_room: (
    gameType:   GameType,
    difficulty: BotDifficulty,
    player:     Player,
    callback:   (roomId: string) => void
  ) => void;
  join_room: (
    roomId:   string,
    player:   Player,
    callback: (ok: boolean, error?: string) => void
  ) => void;
  leave_room: (
    callback: (ok: boolean) => void
  ) => void;
  start_game: (
    callback: (ok: boolean, error?: string) => void
  ) => void;
  send_move: (
    move:     Move,
    callback: (ok: boolean, error?: string) => void
  ) => void;
  request_rematch: (
    callback: (ok: boolean, error?: string) => void
  ) => void;
  // Dev-only: persist a dragged board layout to the local development disk.
  'board:layout:save': (
    payload:  BoardLayoutSavePayload,
    callback: (result: BoardLayoutSaveResult) => void
  ) => void;
}

export interface SocketData {
  playerId: string | null;
  roomId:   string | null;
}

export interface RoomSummary {
  roomId:          string;
  roomName:        string;
  playerCount:     number;
  maxPlayers:      number;
  hostId:          string;
  status:          'LOBBY' | 'PLAYING' | 'FINISHED';
  currentGameType: GameType;
}
