import type { StoneAgeGameState } from '@gamengine/shared';
import type { Move } from '@gamengine/shared';
import { GameError } from '@gamengine/shared';

// ─────────────────────────────────────────────────────────────────────────────
// Stone Age — move processor (stub)
//
// The game engine is initialized and the lobby/room plumbing is live, but the
// actual move rules have not yet been implemented. Any `send_move` call will
// be rejected with a clear error so callers know the feature is pending rather
// than silently failing.
// ─────────────────────────────────────────────────────────────────────────────

export function handleStoneAgeMove(
  _state: StoneAgeGameState,
  _move:  Move,
): StoneAgeGameState {
  throw new GameError('STONE_AGE_MOVES_NOT_IMPLEMENTED');
}
