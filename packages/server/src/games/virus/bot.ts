import type {
  VirusGameState, VirusPlayerState, VirusCard,
  OrganSlot, VirusColor, VirusMove, BotDifficulty,
} from '@gamengine/shared';
import {
  VIRUS_COLORS, VIRUS_WIN_ORGANS,
  colorsMatch, organSlotStatus, isOrganHealthy,
} from '@gamengine/shared';

// ─────────────────────────────────────────────────────────────────────────────
// Virus! heuristic bot — weight-based utility selection.
//
// All legal moves for the bot's current hand are enumerated and scored.
// The highest-scoring move is returned (with random noise injected at lower
// difficulty levels to simulate human-like imperfection).
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

function spreadableCount(
  bot: VirusPlayerState,
  opponents: VirusPlayerState[],
): number {
  let n = 0;
  for (const myColor of ALL_COLORS) {
    const mySlot = bot.cuerpo[myColor];
    if (!mySlot || mySlot.viruses.length === 0) continue;
    const virusColor = mySlot.viruses[0].color;
    const canSpread = opponents.some(opp =>
      ALL_COLORS.some(oc => {
        const os = opp.cuerpo[oc];
        return os && colorsMatch(virusColor, os.organ.color) && organSlotStatus(os) === 'LIBRE';
      }),
    );
    if (canSpread) n++;
  }
  return n;
}

interface Candidate { move: VirusMove; score: number }

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

  const botId     = bot.id;
  const opponents = state.players.filter(p => p.id !== botId);
  const myHealthy = countHealthy(bot.cuerpo);

  // Guante effect: forced to skip play phase.
  if (bot.mustSkipPlay) {
    return { type: 'DISCARD', cardIds: [] };
  }

  const candidates: Candidate[] = [];

  for (const card of bot.hand) {

    // ── ÓRGANO ───────────────────────────────────────────────────────────────
    if (card.type === 'ORGANO') {
      if (!bot.cuerpo[card.color]) {
        // Placing this organ is always healthy; if it gives us 4 → WIN.
        const win = myHealthy >= VIRUS_WIN_ORGANS - 1;
        candidates.push({ move: { type: 'PLAY_ORGAN', cardId: card.id }, score: win ? 1000 : 200 });
      }
    }

    // ── VIRUS ─────────────────────────────────────────────────────────────────
    else if (card.type === 'VIRUS') {
      for (const opp of opponents) {
        const oppH = countHealthy(opp.cuerpo);
        for (const color of ALL_COLORS) {
          const slot = opp.cuerpo[color];
          if (!slot) continue;
          if (!colorsMatch(card.color, slot.organ.color)) continue;
          if (organSlotStatus(slot) === 'INMUNIZADO') continue;

          // Base: 100 + 20 per healthy organ the opponent has (prioritise dangerous players).
          let score = 100 + oppH * 20;
          if (oppH >= VIRUS_WIN_ORGANS - 1) score = 400;  // CRITICAL_OFFENSE

          candidates.push({
            move:  { type: 'PLAY_VIRUS', cardId: card.id, targetPlayerId: opp.id, targetColor: color },
            score,
          });
        }
      }
    }

    // ── MEDICINA ──────────────────────────────────────────────────────────────
    else if (card.type === 'MEDICINA') {
      for (const color of ALL_COLORS) {
        const slot = bot.cuerpo[color];
        if (!slot) continue;
        if (!colorsMatch(card.color, slot.organ.color)) continue;
        const status = organSlotStatus(slot);
        if (status === 'INMUNIZADO') continue;

        if (status === 'INFECTADO') {
          // Curing restores this organ to healthy; check win condition.
          const win = myHealthy >= VIRUS_WIN_ORGANS - 1;
          candidates.push({
            move:  { type: 'PLAY_MEDICINA', cardId: card.id, targetColor: color },
            score: win ? 1000 : 500,  // WIN_MOVE or CRITICAL_DEFENSE
          });
        } else {
          // Vaccinate (LIBRE) or immunize (VACUNADO) — progression.
          candidates.push({
            move:  { type: 'PLAY_MEDICINA', cardId: card.id, targetColor: color },
            score: 150,
          });
        }
      }
    }

    // ── TRATAMIENTOS ──────────────────────────────────────────────────────────
    else if (card.type === 'TRATAMIENTO') {

      // CONTAGIO — transfers own viruses to opponents; cures our own infected organs.
      if (card.treatment === 'CONTAGIO') {
        const spreads = spreadableCount(bot, opponents);
        if (spreads > 0) {
          const newHealthy = myHealthy + spreads;
          const win = newHealthy >= VIRUS_WIN_ORGANS;
          candidates.push({
            move:  { type: 'PLAY_CONTAGIO', cardId: card.id },
            score: win ? 1000 : spreads * 300,  // 300 pts per organ healed/spread
          });
        }
        // If nothing would spread, CONTAGIO is wasted — skip it.
      }

      // GUANTE — forces all opponents to discard their hand and skip play next turn.
      else if (card.treatment === 'GUANTE') {
        // Value rises when bot is losing ground; always at least moderately useful.
        candidates.push({
          move:  { type: 'PLAY_GUANTE', cardId: card.id },
          score: myHealthy <= 1 ? 220 : 130,
        });
      }

      // LADRÓN — steal an opponent's non-immune organ.
      else if (card.treatment === 'LADRON') {
        for (const opp of opponents) {
          for (const color of ALL_COLORS) {
            const slot = opp.cuerpo[color];
            if (!slot) continue;
            if (organSlotStatus(slot) === 'INMUNIZADO') continue;

            const stolenColor = slot.organ.color;
            if (bot.cuerpo[stolenColor]) continue;  // would create duplicate

            const healthy = isOrganHealthy(slot);
            let score = healthy ? 250 : 100;
            if (healthy && myHealthy >= VIRUS_WIN_ORGANS - 1) score = 1000;  // WIN_MOVE

            candidates.push({
              move:  { type: 'PLAY_LADRON', cardId: card.id, targetPlayerId: opp.id, targetColor: color },
              score,
            });
          }
        }
      }

      // TRANSPLANTE — swap one organ between any two different players.
      // Bot only considers swaps where it is one of the two parties.
      else if (card.treatment === 'TRANSPLANTE') {
        for (const opp of opponents) {
          for (const myColor of ALL_COLORS) {
            const mySlot = bot.cuerpo[myColor];
            if (!mySlot || organSlotStatus(mySlot) === 'INMUNIZADO') continue;

            for (const oppColor of ALL_COLORS) {
              const oppSlot = opp.cuerpo[oppColor];
              if (!oppSlot || organSlotStatus(oppSlot) === 'INMUNIZADO') continue;

              // Duplicate-collision guard (mirrors the engine check).
              const newMyColor  = oppSlot.organ.color;
              const newOppColor = mySlot.organ.color;
              if (newMyColor  !== myColor  && bot.cuerpo[newMyColor])  continue;
              if (newOppColor !== oppColor && opp.cuerpo[newOppColor]) continue;

              const myHealthySlot  = isOrganHealthy(mySlot);
              const oppHealthySlot = isOrganHealthy(oppSlot);
              const netChange = (oppHealthySlot ? 1 : 0) - (myHealthySlot ? 1 : 0);

              let score: number;
              if (organSlotStatus(mySlot) === 'INFECTADO' && oppHealthySlot) {
                // Excellent: trade infected for healthy.
                score = 250;
              } else if (myHealthySlot && !oppHealthySlot) {
                // Bad: give healthy away for infected.
                score = -50;
              } else {
                score = 50;  // neutral / minor
              }

              if (netChange > 0 && myHealthy + netChange >= VIRUS_WIN_ORGANS) score = 1000;

              if (score > 0) {
                candidates.push({
                  move: {
                    type:      'PLAY_TRANSPLANTE',
                    cardId:    card.id,
                    player1Id: botId,
                    color1:    myColor,
                    player2Id: opp.id,
                    color2:    oppColor,
                  },
                  score,
                });
              }
            }
          }
        }
      }

      // ERROR MÉDICO — swap entire bodies with a target player.
      else if (card.treatment === 'ERROR_MEDICO') {
        for (const opp of opponents) {
          const oppH = countHealthy(opp.cuerpo);
          // Only worth using when bot is in dire straits and opponent thrives.
          if (myHealthy <= 1 && oppH >= 3) {
            candidates.push({
              move:  { type: 'PLAY_ERROR_MEDICO', cardId: card.id, targetPlayerId: opp.id },
              score: oppH >= VIRUS_WIN_ORGANS ? 1000 : 350,
            });
          }
        }
      }
    }
  }

  // ── DISCARD fallback ──────────────────────────────────────────────────────────
  if (candidates.length === 0) {
    return buildDiscardMove(bot);
  }

  candidates.sort((a, b) => b.score - a.score);

  // Inject randomness at lower difficulties.
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
