import type {
  StoneAgeGameState,
  StoneAgeBoardLocation,
  StoneAgeBoardOccupancy,
  StoneAgePlaceFiguresPayload,
  StoneAgeMovePayload,
} from '@gamengine/shared';
import {
  STONEAGE_LIMITED_LOCATIONS,
  STONEAGE_RESOURCE_LOCATIONS,
  STONEAGE_RESOURCE_LOCATION_CAPACITY,
} from '@gamengine/shared';
import type { Move } from '@gamengine/shared';
import { GameError } from '@gamengine/shared';

// ─────────────────────────────────────────────────────────────────────────────
// Stone Age — Phase 1: Placing Figures
//
// Rulebook summary (pages 4-5, 8):
//
//   • Players alternate clockwise placing ≥1 figures per turn.
//   • A player CANNOT place on a location where they already have figures.
//   • A player cannot pass if they still have figures to place.
//   • Once all players have placed all their figures, Phase 2 begins.
//
// Location capacities:
//   HUNTING_GROUNDS           — unlimited, any number of players
//   FOREST / CLAY_MOUND /
//   QUARRY / RIVER            — max 7 figures total (all players combined)
//                               exclusivity: 4p=any, 3p=max 2 players, 2p=max 1 player
//   TOOL_MAKER / FIELD        — max 1 figure, only 1 player per round
//   HUT                       — exactly 2 figures, same player, placed together
//   CIV_CARD_0..3             — max 1 figure each
//   HUT_PILE_0..3             — max 1 figure each
//
// 2/3-player restriction:
//   Of {TOOL_MAKER, HUT, FIELD}, at most 2 may be occupied per round.
//   (3rd location must remain vacant.)
// ─────────────────────────────────────────────────────────────────────────────

// ── Capacity helpers ──────────────────────────────────────────────────────────

type OccEntry = { playerIndex: number; count: number };

/** Total figures currently placed at a location across all players. */
function totalFiguresAt(occ: StoneAgeBoardOccupancy, loc: StoneAgeBoardLocation): number {
  return (occ[loc] ?? []).reduce((sum: number, e: OccEntry) => sum + e.count, 0);
}

/** How many figures playerIndex has at the given location (0 if none). */
function playerFiguresAt(
  occ: StoneAgeBoardOccupancy, loc: StoneAgeBoardLocation, playerIndex: number,
): number {
  return (occ[loc] ?? []).find((e: OccEntry) => e.playerIndex === playerIndex)?.count ?? 0;
}

/** Number of distinct players currently occupying a location. */
function playerCountAt(occ: StoneAgeBoardOccupancy, loc: StoneAgeBoardLocation): number {
  return (occ[loc] ?? []).filter((e: OccEntry) => e.count > 0).length;
}

/** How many of the LIMITED_LOCATIONS (TOOL_MAKER, HUT, FIELD) are already occupied. */
function occupiedLimitedCount(occ: StoneAgeBoardOccupancy): number {
  return STONEAGE_LIMITED_LOCATIONS.filter((loc: StoneAgeBoardLocation) => totalFiguresAt(occ, loc) > 0).length;
}

// ── Max players per resource location by player count ─────────────────────────

function maxPlayersAtResource(totalPlayers: number): number {
  if (totalPlayers <= 2) return 1;
  if (totalPlayers === 3) return 2;
  return totalPlayers; // 4p: no restriction
}

// ── Single-slot locations (CIV cards and building piles) ──────────────────────

const SINGLE_FIGURE_LOCATIONS = new Set<StoneAgeBoardLocation>([
  'TOOL_MAKER', 'FIELD',
  'CIV_CARD_0', 'CIV_CARD_1', 'CIV_CARD_2', 'CIV_CARD_3',
  'HUT_PILE_0', 'HUT_PILE_1', 'HUT_PILE_2', 'HUT_PILE_3',
]);

// ── Core validation ───────────────────────────────────────────────────────────

function validatePlacement(
  state:       StoneAgeGameState,
  playerIndex: number,
  location:    StoneAgeBoardLocation,
  count:       number,
): void {
  const occ = state.boardOccupancy;
  const numPlayers = state.players.length;

  if (count < 1) throw new GameError('INVALID_COUNT');

  // A player cannot add figures where they already have some.
  if (playerFiguresAt(occ, location, playerIndex) > 0) {
    throw new GameError('ALREADY_PLACED_HERE');
  }

  // Check the player has enough available figures.
  const available = state.players[playerIndex]!.meeples.available;
  if (count > available) throw new GameError('NOT_ENOUGH_MEEPLES');

  // ── Location-specific rules ───────────────────────────────────────────────

  if (location === 'HUNTING_GROUNDS') {
    // Unlimited — only the "enough meeples" check above applies.
    return;
  }

  if (location === 'HUT') {
    // Must place exactly 2, the location must be unoccupied, and the
    // 2/3-player limited-slot rule applies.
    if (count !== 2) throw new GameError('HUT_REQUIRES_EXACTLY_2');
    if (totalFiguresAt(occ, location) > 0) throw new GameError('LOCATION_FULL');
    if (numPlayers <= 3 && occupiedLimitedCount(occ) >= 2) {
      throw new GameError('LIMITED_LOCATIONS_FULL');
    }
    return;
  }

  if (SINGLE_FIGURE_LOCATIONS.has(location)) {
    // Exactly 1 figure; location must be unoccupied.
    if (count !== 1) throw new GameError('SINGLE_FIGURE_LOCATION');
    if (totalFiguresAt(occ, location) > 0) throw new GameError('LOCATION_FULL');
    // TOOL_MAKER and FIELD also count against the limited-location cap.
    const isLimited = (STONEAGE_LIMITED_LOCATIONS as readonly string[]).includes(location);
    if (isLimited && numPlayers <= 3 && occupiedLimitedCount(occ) >= 2) {
      throw new GameError('LIMITED_LOCATIONS_FULL');
    }
    return;
  }

  if ((STONEAGE_RESOURCE_LOCATIONS as readonly string[]).includes(location)) {
    const currentTotal = totalFiguresAt(occ, location);
    if (currentTotal + count > STONEAGE_RESOURCE_LOCATION_CAPACITY) {
      throw new GameError('RESOURCE_LOCATION_FULL');
    }
    // Per-player-count exclusivity: only N distinct players may occupy this spot.
    const maxPlayers = maxPlayersAtResource(numPlayers);
    if (playerCountAt(occ, location) >= maxPlayers) {
      throw new GameError('RESOURCE_LOCATION_PLAYER_LIMIT');
    }
    return;
  }

  throw new GameError('UNKNOWN_LOCATION');
}

// ── Occupancy mutation (immutable update) ─────────────────────────────────────

function addFiguresToLocation(
  occ:         StoneAgeBoardOccupancy,
  location:    StoneAgeBoardLocation,
  playerIndex: number,
  count:       number,
): StoneAgeBoardOccupancy {
  const existing = occ[location] ?? [];
  const hasEntry = existing.some((e: OccEntry) => e.playerIndex === playerIndex);
  const updated  = hasEntry
    ? existing.map((e: OccEntry) => e.playerIndex === playerIndex ? { ...e, count: e.count + count } : e)
    : [...existing, { playerIndex, count }];
  return { ...occ, [location]: updated };
}

// ── Turn advancement ──────────────────────────────────────────────────────────

/**
 * Advance `placementTurnIndex` clockwise, skipping players who have no
 * available meeples. Returns the new index, or -1 if all players are done.
 */
function nextPlacementTurn(state: StoneAgeGameState): number {
  const { turnOrder, players } = state;
  const n = turnOrder.length;
  let idx = (state.placementTurnIndex + 1) % n;
  // Walk at most a full circle to find someone with meeples.
  for (let steps = 0; steps < n; steps++) {
    const pi = turnOrder[idx]!;
    if (players[pi]!.meeples.available > 0) return idx;
    idx = (idx + 1) % n;
  }
  return -1; // all placed
}

// ── Phase transition: PLACEMENT → RESOLUTION ──────────────────────────────────

function transitionToResolution(state: StoneAgeGameState): StoneAgeGameState {
  // Resolution starts from the first player in turn order.
  return {
    ...state,
    currentPhase:       'RESOLUTION',
    activePlayerIndex:  state.turnOrder[0]!,
    placementTurnIndex: 0,
  };
}

// ── PLACE_FIGURES handler ─────────────────────────────────────────────────────

function handlePlaceFigures(
  state:   StoneAgeGameState,
  payload: StoneAgePlaceFiguresPayload,
): StoneAgeGameState {
  if (state.currentPhase !== 'PLACEMENT') {
    throw new GameError('NOT_PLACEMENT_PHASE');
  }

  const playerIndex = state.turnOrder[state.placementTurnIndex]!;

  // Validate it is this player's turn.
  if (playerIndex !== state.activePlayerIndex) {
    throw new GameError('NOT_YOUR_TURN');
  }

  const { location, count } = payload;
  validatePlacement(state, playerIndex, location, count);

  // Apply the placement.
  const newOccupancy = addFiguresToLocation(state.boardOccupancy, location, playerIndex, count);

  // Update the player's meeple counts.
  const newPlayers = state.players.map((p, i) => {
    if (i !== playerIndex) return p;
    return {
      ...p,
      meeples: {
        ...p.meeples,
        available: p.meeples.available - count,
        placed:    p.meeples.placed    + count,
      },
    };
  });

  const stateAfterPlacement: StoneAgeGameState = {
    ...state,
    players:        newPlayers,
    boardOccupancy: newOccupancy,
  };

  // Advance to the next player who still has meeples to place.
  const nextIdx = nextPlacementTurn(stateAfterPlacement);

  if (nextIdx === -1) {
    // All figures placed → transition to Phase 2.
    return transitionToResolution(stateAfterPlacement);
  }

  const nextPlayerIndex = stateAfterPlacement.turnOrder[nextIdx]!;
  return {
    ...stateAfterPlacement,
    placementTurnIndex: nextIdx,
    activePlayerIndex:  nextPlayerIndex,
  };
}

// ── Public entry point ────────────────────────────────────────────────────────

export function handleStoneAgeMove(
  state: StoneAgeGameState,
  move:  Move,
): StoneAgeGameState {
  const payload = move.data as StoneAgeMovePayload | undefined;
  if (!payload?.type) throw new GameError('INVALID_MOVE_PAYLOAD');

  switch (payload.type) {
    case 'PLACE_FIGURES':
      return handlePlaceFigures(state, payload);
    default:
      throw new GameError('UNKNOWN_MOVE_TYPE');
  }
}
