import type {
  VirusGameState, VirusPlayerState, VirusCard, VirusMove,
  VirusColor, OrganSlotStatus,
} from './index.js';
import {
  VIRUS_COLORS, VIRUS_WIN_ORGANS,
  colorsMatch, organSlotStatus, isOrganHealthy,
} from './index.js';

// ─────────────────────────────────────────────────────────────────────────────
// Virus! — shared legal-move matrix (single source of truth).
//
// `enumerateLegalVirusMoves` is the canonical rule-evaluation matrix consumed by
// BOTH the server bot (which scores these moves) and the client debug panel
// (which describes them). Keeping enumeration here means a discrepancy between
// what the human sees and what the bot evaluates is impossible — they read the
// exact same state through the exact same rules.
//
// `describeVirusMove` / `describeVirusDiscard` layer human-readable consequence
// and strategic-impact text on top, for the debug tooling.
// ─────────────────────────────────────────────────────────────────────────────

const ALL_COLORS = [...VIRUS_COLORS, 'MULTICOLOR'] as VirusColor[];

function countHealthy(player: VirusPlayerState): number {
  let n = 0;
  for (const c of ALL_COLORS) {
    const s = player.cuerpo[c];
    if (s && isOrganHealthy(s)) n++;
  }
  return n;
}

/** How many of the player's infected organs could spread to an opponent right now. */
function spreadableCount(player: VirusPlayerState, opponents: VirusPlayerState[]): number {
  let n = 0;
  for (const c of ALL_COLORS) {
    const slot = player.cuerpo[c];
    if (!slot || slot.viruses.length === 0) continue;
    const virusColor = slot.viruses[0].color;
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

function playerName(state: VirusGameState, id: string): string {
  return state.players.find(p => p.id === id)?.name ?? id;
}

function cardInHand(player: VirusPlayerState, cardId: string): VirusCard | undefined {
  return player.hand.find(c => c.id === cardId);
}

/**
 * Enumerate every **strictly legal** play for `playerId` from their current hand,
 * mirroring the engine's legality rules. Order matches the bot's historical
 * enumeration so score ties break identically.
 *
 * DISCARD is intentionally excluded — it is always legal and handled separately
 * (the bot's fallback, the panel's discard section). When the player is under a
 * GUANTE effect (`mustSkipPlay`), no plays are legal and `[]` is returned.
 */
export function enumerateLegalVirusMoves(state: VirusGameState, playerId: string): VirusMove[] {
  const player = state.players.find(p => p.id === playerId);
  if (!player || !Array.isArray(player.hand) || !player.cuerpo) return [];
  if (player.mustSkipPlay) return [];

  const opponents = state.players.filter(p => p.id !== playerId);
  const moves: VirusMove[] = [];

  for (const card of player.hand) {
    if (card.type === 'ORGANO') {
      if (!player.cuerpo[card.color]) moves.push({ type: 'PLAY_ORGAN', cardId: card.id });
    }

    else if (card.type === 'VIRUS') {
      for (const opp of opponents) {
        for (const color of ALL_COLORS) {
          const slot = opp.cuerpo[color];
          if (!slot) continue;
          if (!colorsMatch(card.color, slot.organ.color)) continue;
          if (organSlotStatus(slot) === 'INMUNIZADO') continue;
          moves.push({ type: 'PLAY_VIRUS', cardId: card.id, targetPlayerId: opp.id, targetColor: color });
        }
      }
    }

    else if (card.type === 'MEDICINA') {
      for (const color of ALL_COLORS) {
        const slot = player.cuerpo[color];
        if (!slot) continue;
        if (!colorsMatch(card.color, slot.organ.color)) continue;
        if (organSlotStatus(slot) === 'INMUNIZADO') continue;
        moves.push({ type: 'PLAY_MEDICINA', cardId: card.id, targetColor: color });
      }
    }

    else if (card.type === 'TRATAMIENTO') {
      switch (card.treatment) {
        case 'CONTAGIO':
          moves.push({ type: 'PLAY_CONTAGIO', cardId: card.id });
          break;

        case 'GUANTE':
          moves.push({ type: 'PLAY_GUANTE', cardId: card.id });
          break;

        case 'LADRON':
          for (const opp of opponents) {
            for (const color of ALL_COLORS) {
              const slot = opp.cuerpo[color];
              if (!slot) continue;
              if (organSlotStatus(slot) === 'INMUNIZADO') continue;
              if (player.cuerpo[slot.organ.color]) continue; // would duplicate a colour
              moves.push({ type: 'PLAY_LADRON', cardId: card.id, targetPlayerId: opp.id, targetColor: color });
            }
          }
          break;

        case 'TRANSPLANTE':
          for (const opp of opponents) {
            for (const myColor of ALL_COLORS) {
              const mySlot = player.cuerpo[myColor];
              if (!mySlot || organSlotStatus(mySlot) === 'INMUNIZADO') continue;
              for (const oppColor of ALL_COLORS) {
                const oppSlot = opp.cuerpo[oppColor];
                if (!oppSlot || organSlotStatus(oppSlot) === 'INMUNIZADO') continue;
                const newMyColor  = oppSlot.organ.color;
                const newOppColor = mySlot.organ.color;
                if (newMyColor  !== myColor  && player.cuerpo[newMyColor])  continue;
                if (newOppColor !== oppColor && opp.cuerpo[newOppColor])    continue;
                moves.push({
                  type: 'PLAY_TRANSPLANTE', cardId: card.id,
                  player1Id: playerId, color1: myColor,
                  player2Id: opp.id,    color2: oppColor,
                });
              }
            }
          }
          break;

        case 'ERROR_MEDICO':
          for (const opp of opponents) {
            moves.push({ type: 'PLAY_ERROR_MEDICO', cardId: card.id, targetPlayerId: opp.id });
          }
          break;
      }
    }
  }

  return moves;
}

// ── Human-readable description layer (debug tooling) ──────────────────────────

/** Machine-readable structural delta for console logging. */
export interface VirusStructuralChange {
  /** Effect token, e.g. 'INFECT' | 'CURE' | 'STEAL' | 'ADD_ORGAN'. */
  effect: string;
  targetPlayerId?: string;
  color?: VirusColor;
  from?: OrganSlotStatus;
  to?: OrganSlotStatus | 'DESTRUIDO' | 'ROBADO' | 'INTERCAMBIADO';
}

export interface VirusMoveDescription {
  /** Short action label. */
  action: string;
  /** Immediate rule consequence. */
  consequence: string;
  /** Strategic impact, derived from the shared win-proximity rules. */
  impact: string;
  /** Player whose body is affected (self for organ/medicine, null for global). */
  targetPlayerId: string | null;
  structuralChange: VirusStructuralChange;
}

/**
 * Describe a single legal move's consequence and strategic impact. Uses the same
 * state + rules as {@link enumerateLegalVirusMoves}, so the panel can never show
 * a consequence that disagrees with how the engine/bot read the state.
 */
export function describeVirusMove(
  state: VirusGameState,
  playerId: string,
  move: VirusMove,
): VirusMoveDescription {
  const me = state.players.find(p => p.id === playerId);
  const myHealthy = me ? countHealthy(me) : 0;
  const winNext = myHealthy >= VIRUS_WIN_ORGANS - 1;

  switch (move.type) {
    case 'PLAY_ORGAN': {
      const color = me ? cardInHand(me, move.cardId)?.color ?? 'MULTICOLOR' : 'MULTICOLOR';
      return {
        action: `Colocar Órgano ${color} en tu cuerpo`,
        consequence: `Añade un órgano ${color} sano (LIBRE).`,
        impact: winNext
          ? '¡Cuarto órgano sano → VICTORIA!'
          : `Avanzas a ${myHealthy + 1}/${VIRUS_WIN_ORGANS} órganos sanos.`,
        targetPlayerId: playerId,
        structuralChange: { effect: 'ADD_ORGAN', targetPlayerId: playerId, color, to: 'LIBRE' },
      };
    }

    case 'PLAY_VIRUS': {
      const tName = playerName(state, move.targetPlayerId);
      const target = state.players.find(p => p.id === move.targetPlayerId);
      const slot = target?.cuerpo[move.targetColor];
      const from = slot ? organSlotStatus(slot) : 'LIBRE';
      const oppH = target ? countHealthy(target) : 0;
      const vColor = me ? cardInHand(me, move.cardId)?.color ?? move.targetColor : move.targetColor;

      let consequence: string;
      let to: VirusStructuralChange['to'];
      let effect: string;
      if (from === 'INFECTADO') {
        consequence = `Extirpa el órgano ${move.targetColor} de ${tName} (INFECTADO → destruido).`;
        to = 'DESTRUIDO'; effect = 'EXTIRPATE';
      } else if (from === 'VACUNADO') {
        consequence = `Destruye la vacuna del órgano ${move.targetColor} de ${tName} (VACUNADO → LIBRE).`;
        to = 'LIBRE'; effect = 'DESTROY_VACCINE';
      } else {
        consequence = `Infecta el órgano ${move.targetColor} de ${tName} (LIBRE → INFECTADO).`;
        to = 'INFECTADO'; effect = 'INFECT';
      }
      return {
        action: `Jugar Virus ${vColor} sobre el órgano ${move.targetColor} de ${tName}`,
        consequence,
        impact: oppH >= VIRUS_WIN_ORGANS - 1
          ? `Frena a ${tName}, que estaba a 1 órgano de ganar.`
          : `Presiona a ${tName} (${oppH}/${VIRUS_WIN_ORGANS} órganos sanos).`,
        targetPlayerId: move.targetPlayerId,
        structuralChange: { effect, targetPlayerId: move.targetPlayerId, color: move.targetColor, from, to },
      };
    }

    case 'PLAY_MEDICINA': {
      const slot = me?.cuerpo[move.targetColor];
      const from = slot ? organSlotStatus(slot) : 'LIBRE';
      let consequence: string;
      let to: VirusStructuralChange['to'];
      let effect: string;
      let curesToWin = false;
      if (from === 'INFECTADO') {
        consequence = `Cura tu órgano ${move.targetColor} (INFECTADO → LIBRE).`;
        to = 'LIBRE'; effect = 'CURE'; curesToWin = winNext;
      } else if (from === 'VACUNADO') {
        consequence = `Inmuniza tu órgano ${move.targetColor} (VACUNADO → INMUNIZADO): ya no podrá ser atacado.`;
        to = 'INMUNIZADO'; effect = 'IMMUNIZE';
      } else {
        consequence = `Vacuna tu órgano ${move.targetColor} (LIBRE → VACUNADO).`;
        to = 'VACUNADO'; effect = 'VACCINATE';
      }
      return {
        action: `Aplicar Medicina ${move.targetColor} a tu órgano`,
        consequence,
        impact: curesToWin
          ? '¡Recuperas el 4º órgano sano → VICTORIA!'
          : from === 'INFECTADO'
            ? `Recuperas un órgano sano (${myHealthy + 1}/${VIRUS_WIN_ORGANS}).`
            : 'Refuerzas un órgano para protegerlo de virus.',
        targetPlayerId: playerId,
        structuralChange: { effect, targetPlayerId: playerId, color: move.targetColor, from, to },
      };
    }

    case 'PLAY_LADRON': {
      const tName = playerName(state, move.targetPlayerId);
      const target = state.players.find(p => p.id === move.targetPlayerId);
      const slot = target?.cuerpo[move.targetColor];
      const status = slot ? organSlotStatus(slot) : 'LIBRE';
      const healthy = slot ? isOrganHealthy(slot) : false;
      return {
        action: `Robar el órgano ${move.targetColor} de ${tName}`,
        consequence: `Te quedas su órgano ${move.targetColor} (${status}).`,
        impact: healthy && winNext
          ? '¡Te da el 4º órgano sano → VICTORIA!'
          : healthy
            ? `Le quitas un órgano sano y sumas (${myHealthy + 1}/${VIRUS_WIN_ORGANS}).`
            : `Le robas un órgano, aunque viene infectado.`,
        targetPlayerId: move.targetPlayerId,
        structuralChange: { effect: 'STEAL', targetPlayerId: move.targetPlayerId, color: move.targetColor, from: status, to: 'ROBADO' },
      };
    }

    case 'PLAY_TRANSPLANTE': {
      const n2 = playerName(state, move.player2Id);
      return {
        action: `Intercambiar tu órgano ${move.color1} con el ${move.color2} de ${n2}`,
        consequence: `Intercambia el órgano ${move.color1} (tuyo) por el ${move.color2} de ${n2}.`,
        impact: 'Reordena órganos entre cuerpos; útil para cambiar uno infectado por uno sano.',
        targetPlayerId: move.player2Id,
        structuralChange: { effect: 'TRANSPLANT', targetPlayerId: move.player2Id, color: move.color1, to: 'INTERCAMBIADO' },
      };
    }

    case 'PLAY_CONTAGIO': {
      const opponents = state.players.filter(p => p.id !== playerId);
      const spreads = me ? spreadableCount(me, opponents) : 0;
      return {
        action: 'Propagar Contagio',
        consequence: 'Mueve tus virus a órganos LIBRE de los rivales; tus órganos infectados quedan libres.',
        impact: spreads > 0
          ? `Liberas ${spreads} órgano(s) propio(s) e infectas rivales.`
          : 'Ahora mismo no hay nada que propagar (sin efecto).',
        targetPlayerId: null,
        structuralChange: { effect: 'SPREAD' },
      };
    }

    case 'PLAY_GUANTE':
      return {
        action: 'Usar Guante de Látex',
        consequence: 'Todos los rivales descartan su mano y pierden su próxima jugada.',
        impact: myHealthy <= 1 ? 'Frena a los rivales mientras recuperas terreno.' : 'Retrasa a todos los rivales un turno.',
        targetPlayerId: null,
        structuralChange: { effect: 'FORCE_DISCARD' },
      };

    case 'PLAY_ERROR_MEDICO': {
      const tName = playerName(state, move.targetPlayerId);
      const target = state.players.find(p => p.id === move.targetPlayerId);
      const oppH = target ? countHealthy(target) : 0;
      return {
        action: `Aplicar Error Médico a ${tName}`,
        consequence: `Intercambias tu cuerpo completo con ${tName} (incluidos órganos inmunes).`,
        impact: oppH > myHealthy
          ? `Te quedas su mejor cuerpo (${oppH} vs ${myHealthy} sanos).`
          : 'Intercambio arriesgado: podrías perder posición.',
        targetPlayerId: move.targetPlayerId,
        structuralChange: { effect: 'SWAP_BODY', targetPlayerId: move.targetPlayerId, to: 'INTERCAMBIADO' },
      };
    }

    case 'DISCARD':
      return describeVirusDiscard(state, playerId, move.cardIds);
  }
}

/** Describe a DISCARD of specific cards (the panel's recycle section). */
export function describeVirusDiscard(
  state: VirusGameState,
  playerId: string,
  cardIds: string[],
): VirusMoveDescription {
  const me = state.players.find(p => p.id === playerId);
  const names = (me?.hand ?? [])
    .filter(c => cardIds.includes(c.id))
    .map(c => (c.treatment ?? `${c.type} ${c.color}`))
    .join(', ');
  const n = cardIds.length;
  return {
    action: n === 0 ? 'Pasar turno (descartar 0)' : `Reciclar ${n} carta(s): ${names}`,
    consequence: `Descarta ${n} carta(s) y roba hasta completar ${3}.`,
    impact: n === 0
      ? 'Conservas la mano; útil bajo Guante de Látex.'
      : 'Cambias cartas inútiles por opciones nuevas el próximo turno.',
    targetPlayerId: playerId,
    structuralChange: { effect: 'DISCARD' },
  };
}
