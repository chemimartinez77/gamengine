import type { VirusGameState, VirusMove, VirusCard, BotDifficulty } from '@gamengine/shared';
import { describeVirusMove } from '@gamengine/shared';

// ─────────────────────────────────────────────────────────────────────────────
// Virus! server-side bot decision log.
//
// Solves the client masking limitation: the server holds the bot's *real* hand,
// so it can dump the hidden hand + the full scored-action matrix that drove the
// choice. Action labels reuse the shared `describeVirusMove` (Spanish), matching
// the client debug panel's wording.
//
// Gating: enabled in local dev by default; silenced in production. Force with
// `BOT_DEBUG=true` / disable with `BOT_DEBUG=false`.
// ─────────────────────────────────────────────────────────────────────────────

export function isBotDebugEnabled(): boolean {
  const flag = process.env['BOT_DEBUG'];
  if (flag === 'true' || flag === '1')  return true;
  if (flag === 'false' || flag === '0') return false;
  return process.env['NODE_ENV'] !== 'production';
}

export interface ScoredMove { move: VirusMove; score: number }

function cardLabel(c: VirusCard): string {
  return c.type === 'TRATAMIENTO' ? (c.treatment ?? 'TRATAMIENTO') : `${c.type} ${c.color}`;
}

const MAX_ROWS = 8;

/**
 * Print a structured decision block for a bot's turn: identity, hidden hand,
 * scored-action matrix (highest first) and the final chosen move. No-op unless
 * {@link isBotDebugEnabled}.
 */
export function logVirusBotDecision(
  state:      VirusGameState,
  botIndex:   number,
  difficulty: BotDifficulty,
  scored:     ScoredMove[],
  chosen:     VirusMove,
  note?:      string,
): void {
  if (!isBotDebugEnabled()) return;
  const bot = state.players[botIndex];
  if (!bot) return;

  const hand = Array.isArray(bot.hand) && bot.hand.length > 0
    ? bot.hand.map(cardLabel).join(' · ')
    : '(vacía)';

  const sorted = [...scored].sort((a, b) => b.score - a.score);

  const lines: string[] = [];
  lines.push('');
  lines.push(`╔══ 🤖 [${bot.name}] Evaluando turno · dificultad ${difficulty}`);
  lines.push(`║  Mano oculta: ${hand}`);
  if (note) lines.push(`║  Nota: ${note}`);
  lines.push(`║  Matriz de acciones puntuadas (${scored.length} legales):`);

  if (sorted.length === 0) {
    lines.push('║    (sin jugadas legales — recicla)');
  } else {
    for (const { move, score } of sorted.slice(0, MAX_ROWS)) {
      const marker = move === chosen ? '▶' : ' ';
      const action = describeVirusMove(state, bot.id, move).action;
      lines.push(`║   ${marker} ${String(score).padStart(5)}  ${action}`);
    }
    if (sorted.length > MAX_ROWS) {
      lines.push(`║      … (+${sorted.length - MAX_ROWS} jugada(s) más)`);
    }
  }

  const chosenAction = describeVirusMove(state, bot.id, chosen).action;
  lines.push(`╚══ ✅ Jugada elegida: ${chosenAction}`);

  // eslint-disable-next-line no-console
  console.log(lines.join('\n'));
}
