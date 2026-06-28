// ─────────────────────────────────────────────────────────────────────────────
// Bot display names — 40 real Spanish first names (20 male + 20 female).
// Each bot in a game is given a random, distinct name from this pool so matches
// feel like playing against real people instead of "Bot 1 / Bot 2".
// ─────────────────────────────────────────────────────────────────────────────

export const BOT_NAMES_MALE: readonly string[] = [
  'Julio', 'Rafa', 'Roberto', 'Javier', 'Carlos',
  'Miguel', 'Antonio', 'Sergio', 'Pablo', 'David',
  'Alberto', 'Fernando', 'Manuel', 'Jorge', 'Andrés',
  'Ignacio', 'Raúl', 'Víctor', 'Diego', 'Álvaro',
];

export const BOT_NAMES_FEMALE: readonly string[] = [
  'Vicky', 'Sandra', 'Sonia', 'Lucía', 'Marta',
  'Elena', 'Carmen', 'Laura', 'Pilar', 'Cristina',
  'Nuria', 'Beatriz', 'Rocío', 'Patricia', 'Ana',
  'Isabel', 'Teresa', 'Silvia', 'Natalia', 'Inés',
];

/** Full pool of 40 names (male + female). */
export const BOT_NAMES: readonly string[] = [...BOT_NAMES_MALE, ...BOT_NAMES_FEMALE];

/**
 * Pick a random bot name not already in `taken`. Falls back to a numbered name
 * if the pool is somehow exhausted (never happens with ≤ a handful of bots).
 */
export function pickBotName(taken: ReadonlySet<string> = new Set()): string {
  const available = BOT_NAMES.filter(n => !taken.has(n));
  if (available.length === 0) {
    return `Invitado ${taken.size + 1}`;
  }
  return available[Math.floor(Math.random() * available.length)];
}
