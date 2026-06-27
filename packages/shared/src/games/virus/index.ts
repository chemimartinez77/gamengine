import type { GameState, Player } from '../../../core.js';

// ─────────────────────────────────────────────────────────────────────────────
// Virus! — type definitions
//
// 2-6 player card game. Goal: be first to build a complete, healthy body
// with 4 organs of different colors (ROJO, AZUL, VERDE, AMARILLO).
// A multicolor organ acts as a wildcard 5th slot; body is complete with
// any 4 healthy organs regardless of which 4.
//
// Asset mapping reference (under packages/client/public/assets/virus/):
//   Atlas sprite grid — 0-indexed flat row:
//     0  ORGANO   ROJO      |  5  VIRUS   ROJO      | 10  MEDICINA ROJO
//     1  ORGANO   AZUL      |  6  VIRUS   AZUL      | 11  MEDICINA AZUL
//     2  ORGANO   VERDE     |  7  VIRUS   VERDE     | 12  MEDICINA VERDE
//     3  ORGANO   AMARILLO  |  8  VIRUS   AMARILLO  | 13  MEDICINA AMARILLO
//     4  ORGANO   MULTICLR  |  9  VIRUS   MULTICLR  | 14  MEDICINA MULTICLR
//    15  TRANSPLANTE  | 16  LADRON  | 17  CONTAGIO  | 18  GUANTE  | 19  ERROR_MEDICO
//    20  Card back (reverso)
// ─────────────────────────────────────────────────────────────────────────────

// ── Card primitives ───────────────────────────────────────────────────────────

export type VirusCardType = 'ORGANO' | 'VIRUS' | 'MEDICINA' | 'TRATAMIENTO';

export type VirusColor = 'ROJO' | 'AZUL' | 'VERDE' | 'AMARILLO' | 'MULTICOLOR';

/** The five specific treatments (only meaningful when type === 'TRATAMIENTO'). */
export type TreatmentKind =
  | 'TRANSPLANTE'
  | 'LADRON'
  | 'CONTAGIO'
  | 'GUANTE'
  | 'ERROR_MEDICO';

/**
 * A single physical card in Virus!
 *
 * `atlasIndex` maps to the flat sprite-grid index above so the client can
 * render the card without hard-coding lookup tables.
 */
export interface VirusCard {
  id:          string;
  type:        VirusCardType;
  /** Dominant color. Treatment cards use 'MULTICOLOR' as placeholder. */
  color:       VirusColor;
  /** Populated only when type === 'TRATAMIENTO'. */
  treatment?:  TreatmentKind;
  atlasIndex:  number;
}

// ── Body (Cuerpo) ─────────────────────────────────────────────────────────────

/**
 * One organ slot in a player's body.
 * An organ is healthy when viruses.length === 0 (libre, vacunado, inmunizado).
 * A slot is destroyed when viruses.length reaches 2 — the server removes it
 * from the body immediately, discarding organ + both virus cards.
 */
export interface OrganSlot {
  organ:    VirusCard;
  /** 0 = libre/vacunado/inmunizado, 1 = infectado. Never stored at 2 (destroyed). */
  viruses:  VirusCard[];
  /** 0 = libre/infectado, 1 = vacunado, 2 = inmunizado. */
  medicines: VirusCard[];
}

/** Computed read-only status of a slot, never stored. */
export type OrganSlotStatus = 'LIBRE' | 'VACUNADO' | 'INMUNIZADO' | 'INFECTADO';

/** Derives a slot's status from its viruses/medicines arrays. */
export function organSlotStatus(slot: OrganSlot): OrganSlotStatus {
  if (slot.viruses.length > 0)      return 'INFECTADO';
  if (slot.medicines.length === 2)  return 'INMUNIZADO';
  if (slot.medicines.length === 1)  return 'VACUNADO';
  return 'LIBRE';
}

/** An organ is healthy (counts toward the win) when it has no viruses. */
export function isOrganHealthy(slot: OrganSlot): boolean {
  return slot.viruses.length === 0;
}

/** A player's body: at most one slot per color (including MULTICOLOR). */
export type VirusCuerpo = Partial<Record<VirusColor, OrganSlot>>;

/**
 * Two card colors "match" when either is MULTICOLOR, or they are identical.
 * Used to determine valid play targets for virus and medicine cards.
 */
export function colorsMatch(a: VirusColor, b: VirusColor): boolean {
  return a === b || a === 'MULTICOLOR' || b === 'MULTICOLOR';
}

// ── Player state ──────────────────────────────────────────────────────────────

export interface VirusPlayerState extends Player {
  /** Cards in hand. Always exactly 3 except mid-turn and in masked opponent views. */
  hand:         VirusCard[];
  /** Number of cards in hand — always equals hand.length on the server.
   *  Clients receive 0 for opponents' hands (masked) but can read handCount. */
  handCount:    number;
  /** The player's organ tableau. */
  cuerpo:       VirusCuerpo;
  /**
   * Set to true by GUANTE DE LÁTEX. On that player's next turn the server
   * ignores any PLAY_* action and only allows DISCARD (which then draws to 3).
   */
  mustSkipPlay: boolean;
}

// ── Game state ────────────────────────────────────────────────────────────────

export interface VirusGameState extends GameState {
  /** Overrides GameState.players with rich per-player payload. */
  players:     VirusPlayerState[];
  deck:        VirusCard[];
  discardPile: VirusCard[];
  phase:       'PLAYING' | 'GAME_OVER';
  /** null — VirusGameState is itself the leaf board; GameState.board holds it. */
  board:       null;
}

// ── Moves ─────────────────────────────────────────────────────────────────────

export type VirusMove =
  /** Place an organ from hand into own body. */
  | { type: 'PLAY_ORGAN';      cardId: string }
  /** Attack an opponent's organ with a virus from hand. */
  | { type: 'PLAY_VIRUS';      cardId: string; targetPlayerId: string; targetColor: VirusColor }
  /** Apply a medicine card to own organ (cure, vaccinate, or immunize). */
  | { type: 'PLAY_MEDICINA';   cardId: string; targetColor: VirusColor }
  /** Swap one organ between any two players (neither may be immunized). */
  | { type: 'PLAY_TRANSPLANTE'; cardId: string; player1Id: string; color1: VirusColor; player2Id: string; color2: VirusColor }
  /** Steal an organ from an opponent (cannot steal immune organs). */
  | { type: 'PLAY_LADRON';     cardId: string; targetPlayerId: string; targetColor: VirusColor }
  /** Auto-spread viruses from own infected organs to eligible opponents' free organs. */
  | { type: 'PLAY_CONTAGIO';   cardId: string }
  /** Force all other players to discard their hand; they lose their next play phase. */
  | { type: 'PLAY_GUANTE';     cardId: string }
  /** Swap entire body with a target player (including immune organs). */
  | { type: 'PLAY_ERROR_MEDICO'; cardId: string; targetPlayerId: string }
  /** Discard 0+ cards from hand, then draw back up to 3 (the non-play phase 1). */
  | { type: 'DISCARD';         cardIds: string[] };

// ── Deck composition ──────────────────────────────────────────────────────────

export const VIRUS_COLORS: readonly VirusColor[] = ['ROJO', 'AZUL', 'VERDE', 'AMARILLO'];
export const VIRUS_HAND_SIZE  = 3;
export const VIRUS_WIN_ORGANS = 4;

/** Cards per standard color for each type that uses colors. */
export const VIRUS_CARDS_PER_COLOR = 4;
/** Multicolor cards per card type (ORGANO, VIRUS, MEDICINA). */
export const VIRUS_MULTICOLOR_COUNT = 4;

/** Treatment card counts (total 8). */
export const VIRUS_TREATMENT_COUNTS: Record<TreatmentKind, number> = {
  TRANSPLANTE:  2,
  LADRON:       2,
  CONTAGIO:     2,
  GUANTE:       1,
  ERROR_MEDICO: 1,
};

// ── Atlas index helpers ───────────────────────────────────────────────────────

const COLOR_OFFSET: Record<VirusColor, number> = {
  ROJO:       0,
  AZUL:       1,
  VERDE:      2,
  AMARILLO:   3,
  MULTICOLOR: 4,
};

const TREATMENT_OFFSET: Record<TreatmentKind, number> = {
  TRANSPLANTE:  0,
  LADRON:       1,
  CONTAGIO:     2,
  GUANTE:       3,
  ERROR_MEDICO: 4,
};

/** Compute the flat sprite-grid atlas index for a card. */
export function virusAtlasIndex(
  type:       VirusCardType,
  color:      VirusColor,
  treatment?: TreatmentKind,
): number {
  if (type === 'ORGANO')      return 0  + COLOR_OFFSET[color];
  if (type === 'VIRUS')       return 5  + COLOR_OFFSET[color];
  if (type === 'MEDICINA')    return 10 + COLOR_OFFSET[color];
  // TRATAMIENTO
  return 15 + TREATMENT_OFFSET[treatment ?? 'TRANSPLANTE'];
}

/** Atlas index reserved for the card back. */
export const VIRUS_ATLAS_BACK = 20;
