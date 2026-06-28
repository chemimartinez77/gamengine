import type {
  VirusGameState, VirusPlayerState, VirusMove, VirusColor, BotDifficulty,
} from '@gamengine/shared';
import {
  VIRUS_COLORS, VIRUS_WIN_ORGANS,
  colorsMatch, organSlotStatus, isOrganHealthy,
  enumerateLegalVirusMoves,
} from '@gamengine/shared';
import { logVirusBotDecision, type ScoredMove } from './botDebug.js';

// ─────────────────────────────────────────────────────────────────────────────
// Virus! heuristic bot — weight-based utility selection.
//
// The set of legal moves comes from the SHARED `enumerateLegalVirusMoves` matrix
// (the exact same one the client debug panel reads). The bot only adds the
// strategic layer: it scores each legal move and picks the best (with random
// noise at lower difficulties). Keeping enumeration shared guarantees the human
// debug view and the bot evaluate identical options.
// ─────────────────────────────────────────────────────────────────────────────

const ALL_COLORS = [...VIRUS_COLORS, 'MULTICOLOR'] as VirusColor[];

function countHealthy(cuerpo: VirusPlayerState['cuerpo']): number {
  let n = 0;
  for (const c of ALL_COLORS) {
    const s = cuerpo[c];
    if (s && isOrganHealthy(s)) n++;
  }
  return n;
}

function spreadableCount(bot: VirusPlayerState, opponents: VirusPlayerState[]): number {
  let n = 0;
  for (const myColor of ALL_COLORS) {
    const mySlot = bot.cuerpo[myColor];
    if (!mySlot || mySlot.viruses.length === 0) continue;
    const virusColor = mySlot.viruses[0].color;
    const canSpread = opponents.some(opp =>
      ALL_COLORS.some(oc => {
        const os = opp.cuerpo[oc];
        return !!os && colorsMatch(virusColor, os.organ.color) && organSlotStatus(os) === 'LIBRE';
      }),
    );
    if (canSpread) n++;
  }
  return n;
}

/**
 * Score a single legal move. Returns 0 for moves the bot judges not worth
 * playing (a wasted CONTAGIO, an unfavourable TRANSPLANTE, a premature
 * ERROR MÉDICO) so they are filtered out of the candidate set.
 */
function scoreMove(
  state:     VirusGameState,
  bot:       VirusPlayerState,
  opponents: VirusPlayerState[],
  myHealthy: number,
  move:      VirusMove,
): number {
  const winNext = myHealthy >= VIRUS_WIN_ORGANS - 1;

  switch (move.type) {
    case 'PLAY_ORGAN':
      return winNext ? 1000 : 200;

    case 'PLAY_VIRUS': {
      const target = state.players.find(p => p.id === move.targetPlayerId);
      const oppH = target ? countHealthy(target.cuerpo) : 0;
      if (oppH >= VIRUS_WIN_ORGANS - 1) return 400;   // CRITICAL_OFFENSE
      return 100 + oppH * 20;
    }

    case 'PLAY_MEDICINA': {
      const slot = bot.cuerpo[move.targetColor];
      if (slot && organSlotStatus(slot) === 'INFECTADO') return winNext ? 1000 : 500;
      return 150;
    }

    case 'PLAY_LADRON': {
      const target = state.players.find(p => p.id === move.targetPlayerId);
      const slot = target?.cuerpo[move.targetColor];
      const healthy = slot ? isOrganHealthy(slot) : false;
      if (healthy && winNext) return 1000;            // WIN_MOVE
      return healthy ? 250 : 100;
    }

    case 'PLAY_TRANSPLANTE': {
      const opp = state.players.find(p => p.id === move.player2Id);
      const mySlot = bot.cuerpo[move.color1];
      const oppSlot = opp?.cuerpo[move.color2];
      if (!mySlot || !oppSlot) return 0;
      const myHealthySlot  = isOrganHealthy(mySlot);
      const oppHealthySlot = isOrganHealthy(oppSlot);
      const netChange = (oppHealthySlot ? 1 : 0) - (myHealthySlot ? 1 : 0);

      let score: number;
      if (organSlotStatus(mySlot) === 'INFECTADO' && oppHealthySlot) score = 250;
      else if (myHealthySlot && !oppHealthySlot)                     score = -50;
      else                                                           score = 50;

      if (netChange > 0 && myHealthy + netChange >= VIRUS_WIN_ORGANS) score = 1000;
      return score;
    }

    case 'PLAY_CONTAGIO': {
      const spreads = spreadableCount(bot, opponents);
      if (spreads <= 0) return 0;                      // wasted — skip
      return myHealthy + spreads >= VIRUS_WIN_ORGANS ? 1000 : spreads * 300;
    }

    case 'PLAY_GUANTE':
      return myHealthy <= 1 ? 220 : 130;

    case 'PLAY_ERROR_MEDICO': {
      const target = state.players.find(p => p.id === move.targetPlayerId);
      const oppH = target ? countHealthy(target.cuerpo) : 0;
      if (myHealthy <= 1 && oppH >= 3) return oppH >= VIRUS_WIN_ORGANS ? 1000 : 350;
      return 0;                                        // not dire enough — skip
    }

    default:
      return 0;
  }
}

/** Pick a move from the score-sorted candidates, with noise at low difficulties. */
function selectByDifficulty(candidates: ScoredMove[], difficulty: BotDifficulty): VirusMove {
  if (difficulty === 'MUY_FACIL') {
    return candidates[Math.floor(Math.random() * candidates.length)].move;
  }
  if (difficulty === 'FACIL') {
    const half = candidates.slice(0, Math.max(1, Math.ceil(candidates.length / 2)));
    return half[Math.floor(Math.random() * half.length)].move;
  }
  if (difficulty === 'NORMAL' && candidates.length > 1 && Math.random() < 0.2) {
    const idx = Math.min(1 + Math.floor(Math.random() * 2), candidates.length - 1);
    return candidates[idx].move;
  }
  // DIFICIL / MUY_DIFICIL: always best move.
  return candidates[0].move;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function getVirusBotMove(
  state:      VirusGameState,
  botIndex:   number,
  difficulty: BotDifficulty,
): VirusMove {
  const bot = state.players?.[botIndex];

  // Defensive: a malformed state (missing player / hand / cuerpo) must never
  // throw here — that would crash the detached bot-move timer. Degrade to a
  // safe, always-legal empty discard instead.
  if (!bot || !Array.isArray(bot.hand)) {
    return { type: 'DISCARD', cardIds: [] };
  }
  if (!bot.cuerpo) bot.cuerpo = {};

  // Guante effect: forced to skip play phase.
  if (bot.mustSkipPlay) {
    const move: VirusMove = { type: 'DISCARD', cardIds: [] };
    logVirusBotDecision(state, botIndex, difficulty, [], move, 'Bajo Guante de Látex: solo puede descartar.');
    return move;
  }

  const opponents = state.players.filter(p => p.id !== bot.id);
  const myHealthy = countHealthy(bot.cuerpo);

  // Enumerate via the shared rule matrix, then apply the strategic scoring layer.
  // `scored` keeps every legal move (incl. score 0 — i.e. judged not worth it) so
  // the decision log can show why options were skipped; `candidates` is the
  // playable subset (score > 0) the selection actually draws from.
  const scored: ScoredMove[] = enumerateLegalVirusMoves(state, bot.id).map(move => ({
    move,
    score: scoreMove(state, bot, opponents, myHealthy, move),
  }));
  const candidates = scored.filter(c => c.score > 0);

  let chosen: VirusMove;
  let note: string | undefined;
  if (candidates.length === 0) {
    chosen = buildDiscardMove(bot);
    note = 'Sin jugadas con valor positivo — recicla cartas.';
  } else {
    candidates.sort((a, b) => b.score - a.score);
    chosen = selectByDifficulty(candidates, difficulty);
  }

  logVirusBotDecision(state, botIndex, difficulty, scored, chosen, note);
  return chosen;
}

// ─── Discard builder ──────────────────────────────────────────────────────────

function buildDiscardMove(bot: VirusPlayerState): VirusMove {
  const toDiscard: string[] = [];

  // 1. Discard virus cards first (most situationally useless when we can't play them).
  for (const card of bot.hand) {
    if (toDiscard.length >= 2) break;
    if (card.type === 'VIRUS') toDiscard.push(card.id);
  }

  // 2. Discard a low-value treatment (not GUANTE or LADRÓN).
  if (toDiscard.length === 0) {
    for (const card of bot.hand) {
      if (card.type === 'TRATAMIENTO' &&
          card.treatment !== 'GUANTE' &&
          card.treatment !== 'LADRON') {
        toDiscard.push(card.id);
        break;
      }
    }
  }

  // 3. Last resort: discard the first card.
  if (toDiscard.length === 0 && bot.hand.length > 0) {
    toDiscard.push(bot.hand[0].id);
  }

  return { type: 'DISCARD', cardIds: toDiscard };
}
