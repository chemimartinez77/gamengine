import {
  type VirusGameState, type VirusPlayerState, type VirusCard,
  type VirusCardType, type VirusColor, type TreatmentKind,
  VIRUS_COLORS, VIRUS_HAND_SIZE,
  VIRUS_CARDS_PER_COLOR, VIRUS_MULTICOLOR_COUNT,
  VIRUS_TREATMENT_COUNTS,
  virusAtlasIndex,
} from '@gamengine/shared';

// Fisher–Yates shuffle (non-mutating).
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeCard(
  seq: { n: number },
  type: VirusCardType,
  color: VirusColor,
  treatment?: TreatmentKind,
): VirusCard {
  const id = `${type}-${color}${treatment ? `-${treatment}` : ''}-${seq.n++}`;
  return { id, type, color, treatment, atlasIndex: virusAtlasIndex(type, color, treatment) };
}

/**
 * Builds the standard 68-card Virus! deck:
 *   Órganos   20 = 4 × 4 standard colors + 4 multicolor
 *   Virus     20 = 4 × 4 standard colors + 4 multicolor
 *   Medicinas 20 = 4 × 4 standard colors + 4 multicolor
 *   Tratamientos 8 = Transplante×2 + Ladrón×2 + Contagio×2 + Guante×1 + Error Médico×1
 */
function buildDeck(): VirusCard[] {
  const seq = { n: 0 };
  const cards: VirusCard[] = [];

  for (const cardType of ['ORGANO', 'VIRUS', 'MEDICINA'] as VirusCardType[]) {
    for (const color of VIRUS_COLORS) {
      for (let i = 0; i < VIRUS_CARDS_PER_COLOR; i++) {
        cards.push(makeCard(seq, cardType, color));
      }
    }
    for (let i = 0; i < VIRUS_MULTICOLOR_COUNT; i++) {
      cards.push(makeCard(seq, cardType, 'MULTICOLOR'));
    }
  }

  for (const [treatment, count] of Object.entries(VIRUS_TREATMENT_COUNTS) as [TreatmentKind, number][]) {
    for (let i = 0; i < count; i++) {
      cards.push(makeCard(seq, 'TRATAMIENTO', 'MULTICOLOR', treatment));
    }
  }

  return cards; // 68 cards
}

/**
 * Initialise a fresh Virus! game for the given player ids.
 * Names default to the id — the GameEngine adapter patches in display names.
 */
export function initVirusGame(playerIds: string[]): VirusGameState {
  const deck = shuffle(buildDeck());

  const players: VirusPlayerState[] = playerIds.map(id => ({
    id,
    name:         id,
    hand:         [],
    handCount:    0,
    cuerpo:       {},
    mustSkipPlay: false,
  }));

  // Deal 3 cards to each player (round-robin).
  for (let r = 0; r < VIRUS_HAND_SIZE; r++) {
    for (const p of players) {
      const card = deck.shift();
      if (card) { p.hand.push(card); }
    }
  }
  for (const p of players) p.handCount = p.hand.length;

  return {
    players,
    turn:        0,
    board:       null,
    winner:      null,
    deck,
    discardPile: [],
    phase:       'PLAYING',
  };
}
