import {
  type VirusGameState, type VirusPlayerState, type VirusCard,
  type VirusMove, type VirusCuerpo, type OrganSlot, type VirusColor,
  type TreatmentKind,
  VIRUS_HAND_SIZE, VIRUS_WIN_ORGANS, VIRUS_COLORS,
  colorsMatch, organSlotStatus, isOrganHealthy,
} from '@gamengine/shared';
import { GameError } from '@gamengine/shared';

// ── Deep-copy helpers ──────────────────────────────────────────────────────────

function copyCard(c: VirusCard): VirusCard {
  return { ...c };
}

function copySlot(s: OrganSlot): OrganSlot {
  return {
    organ:    copyCard(s.organ),
    viruses:  s.viruses.map(copyCard),
    medicines: s.medicines.map(copyCard),
  };
}

function copyCuerpo(c: VirusCuerpo): VirusCuerpo {
  const out: VirusCuerpo = {};
  for (const color of [...VIRUS_COLORS, 'MULTICOLOR'] as VirusColor[]) {
    if (c[color]) out[color] = copySlot(c[color]!);
  }
  return out;
}

function copyPlayer(p: VirusPlayerState): VirusPlayerState {
  return {
    ...p,
    hand:   p.hand.map(copyCard),
    cuerpo: copyCuerpo(p.cuerpo),
  };
}

function copyState(s: VirusGameState): VirusGameState {
  return {
    ...s,
    players:     s.players.map(copyPlayer),
    deck:        s.deck.map(copyCard),
    discardPile: s.discardPile.map(copyCard),
  };
}

// ── Utility ───────────────────────────────────────────────────────────────────

function removeFromHand(player: VirusPlayerState, cardId: string): VirusCard {
  const idx = player.hand.findIndex(c => c.id === cardId);
  if (idx === -1) throw new GameError('CARD_NOT_IN_HAND');
  return player.hand.splice(idx, 1)[0];
}

function findPlayer(s: VirusGameState, id: string): VirusPlayerState {
  const p = s.players.find(pl => pl.id === id);
  if (!p) throw new GameError('PLAYER_NOT_FOUND');
  return p;
}

/** Draw from deck until hand reaches VIRUS_HAND_SIZE. Recycles discards when needed. */
function drawToFull(player: VirusPlayerState, s: VirusGameState): void {
  while (player.hand.length < VIRUS_HAND_SIZE) {
    if (s.deck.length === 0) {
      if (s.discardPile.length === 0) break; // nothing left
      // Shuffle discard into deck.
      const cards = [...s.discardPile];
      for (let i = cards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cards[i], cards[j]] = [cards[j], cards[i]];
      }
      s.deck = cards;
      s.discardPile = [];
    }
    player.hand.push(s.deck.shift()!);
  }
  player.handCount = player.hand.length;
}

/** Check if any player satisfies the win condition (4 healthy organs). */
function checkWin(s: VirusGameState): string | null {
  for (const p of s.players) {
    const healthyCount = Object.values(p.cuerpo)
      .filter(slot => slot !== undefined && isOrganHealthy(slot as OrganSlot))
      .length;
    if (healthyCount >= VIRUS_WIN_ORGANS) return p.id;
  }
  return null;
}

function advanceTurn(s: VirusGameState): void {
  s.turn = (s.turn + 1) % s.players.length;
}

// ── Action handlers (mutate the working copy `s`) ─────────────────────────────

function handlePlayOrgano(
  s: VirusGameState,
  player: VirusPlayerState,
  move: Extract<VirusMove, { type: 'PLAY_ORGAN' }>,
): void {
  const card = removeFromHand(player, move.cardId);
  if (card.type !== 'ORGANO') throw new GameError('NOT_AN_ORGAN');

  const color = card.color;
  if (player.cuerpo[color]) throw new GameError('ORGAN_SLOT_OCCUPIED');

  player.cuerpo[color] = { organ: card, viruses: [], medicines: [] };
}

function handlePlayVirus(
  s: VirusGameState,
  player: VirusPlayerState,
  move: Extract<VirusMove, { type: 'PLAY_VIRUS' }>,
): void {
  const card = removeFromHand(player, move.cardId);
  if (card.type !== 'VIRUS') throw new GameError('NOT_A_VIRUS');

  const target = findPlayer(s, move.targetPlayerId);
  if (target.id === player.id) throw new GameError('CANNOT_ATTACK_SELF');

  const slot = target.cuerpo[move.targetColor];
  if (!slot) throw new GameError('TARGET_HAS_NO_ORGAN_HERE');
  if (!colorsMatch(card.color, slot.organ.color)) throw new GameError('COLOR_MISMATCH');

  const status = organSlotStatus(slot);
  if (status === 'INMUNIZADO') throw new GameError('ORGAN_IS_IMMUNE');

  if (status === 'INFECTADO') {
    // Extirpar: second virus destroys the organ — discard organ + both viruses.
    s.discardPile.push(slot.organ, ...slot.viruses, card);
    delete target.cuerpo[move.targetColor];
  } else if (status === 'VACUNADO') {
    // Destruir vacuna: virus cancels out the medicine.
    s.discardPile.push(card, ...slot.medicines);
    slot.medicines = [];
    // Organ remains, now LIBRE.
  } else {
    // Infectar: free organ gets the virus.
    slot.viruses.push(card);
  }
}

function handlePlayMedicina(
  s: VirusGameState,
  player: VirusPlayerState,
  move: Extract<VirusMove, { type: 'PLAY_MEDICINA' }>,
): void {
  const card = removeFromHand(player, move.cardId);
  if (card.type !== 'MEDICINA') throw new GameError('NOT_A_MEDICINA');

  const slot = player.cuerpo[move.targetColor];
  if (!slot) throw new GameError('NO_ORGAN_AT_COLOR');
  if (!colorsMatch(card.color, slot.organ.color)) throw new GameError('COLOR_MISMATCH');

  const status = organSlotStatus(slot);
  if (status === 'INMUNIZADO') throw new GameError('ORGAN_ALREADY_IMMUNE');

  if (status === 'INFECTADO') {
    // Curar: medicine cures the virus — both go to discard.
    s.discardPile.push(card, ...slot.viruses);
    slot.viruses = [];
  } else if (status === 'VACUNADO') {
    // Inmunizar: second medicine makes the organ immune.
    slot.medicines.push(card);
  } else {
    // Vacunar: first medicine on a free organ.
    slot.medicines.push(card);
  }
}

function handlePlayTransplante(
  s: VirusGameState,
  player: VirusPlayerState,
  move: Extract<VirusMove, { type: 'PLAY_TRANSPLANTE' }>,
): void {
  const card = removeFromHand(player, move.cardId);
  if (card.type !== 'TRATAMIENTO' || card.treatment !== 'TRANSPLANTE') throw new GameError('NOT_TRANSPLANTE');
  s.discardPile.push(card);

  if (move.player1Id === move.player2Id) throw new GameError('SAME_PLAYER_SWAP');

  const p1 = findPlayer(s, move.player1Id);
  const p2 = findPlayer(s, move.player2Id);

  const slot1 = p1.cuerpo[move.color1];
  const slot2 = p2.cuerpo[move.color2];

  if (!slot1) throw new GameError('P1_HAS_NO_ORGAN');
  if (!slot2) throw new GameError('P2_HAS_NO_ORGAN');
  if (organSlotStatus(slot1) === 'INMUNIZADO') throw new GameError('P1_ORGAN_IS_IMMUNE');
  if (organSlotStatus(slot2) === 'INMUNIZADO') throw new GameError('P2_ORGAN_IS_IMMUNE');

  // Determine resulting colors after swap.
  const newColor1 = slot2.organ.color;  // what p1 will receive
  const newColor2 = slot1.organ.color;  // what p2 will receive

  // Collision check: p1 must not already own an organ of newColor1 (unless it's the one being removed).
  if (newColor1 !== move.color1 && p1.cuerpo[newColor1]) throw new GameError('P1_WOULD_HAVE_DUPLICATE');
  if (newColor2 !== move.color2 && p2.cuerpo[newColor2]) throw new GameError('P2_WOULD_HAVE_DUPLICATE');

  // Execute swap.
  delete p1.cuerpo[move.color1];
  delete p2.cuerpo[move.color2];
  p1.cuerpo[newColor1] = slot2;
  p2.cuerpo[newColor2] = slot1;
}

function handlePlayLadron(
  s: VirusGameState,
  player: VirusPlayerState,
  move: Extract<VirusMove, { type: 'PLAY_LADRON' }>,
): void {
  const card = removeFromHand(player, move.cardId);
  if (card.type !== 'TRATAMIENTO' || card.treatment !== 'LADRON') throw new GameError('NOT_LADRON');
  s.discardPile.push(card);

  const target = findPlayer(s, move.targetPlayerId);
  if (target.id === player.id) throw new GameError('CANNOT_STEAL_FROM_SELF');

  const slot = target.cuerpo[move.targetColor];
  if (!slot) throw new GameError('TARGET_HAS_NO_ORGAN');
  if (organSlotStatus(slot) === 'INMUNIZADO') throw new GameError('ORGAN_IS_IMMUNE');

  // Player cannot already have an organ of the same color.
  const stolenColor = slot.organ.color;
  if (player.cuerpo[stolenColor]) throw new GameError('WOULD_CREATE_DUPLICATE');

  delete target.cuerpo[move.targetColor];
  player.cuerpo[stolenColor] = slot;
}

function handlePlayContagio(
  s: VirusGameState,
  player: VirusPlayerState,
  move: Extract<VirusMove, { type: 'PLAY_CONTAGIO' }>,
): void {
  const card = removeFromHand(player, move.cardId);
  if (card.type !== 'TRATAMIENTO' || card.treatment !== 'CONTAGIO') throw new GameError('NOT_CONTAGIO');
  s.discardPile.push(card);

  // Opponents in turn order starting from the next player.
  const myIdx = s.players.indexOf(player);
  const opponents = s.players
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.id !== player.id)
    .sort((a, b) => {
      const ai = (a.i - myIdx - 1 + s.players.length) % s.players.length;
      const bi = (b.i - myIdx - 1 + s.players.length) % s.players.length;
      return ai - bi;
    })
    .map(({ p }) => p);

  // Spread each virus from player's infected organs to first eligible opponent.
  for (const color of [...VIRUS_COLORS, 'MULTICOLOR'] as VirusColor[]) {
    const slot = player.cuerpo[color];
    if (!slot || slot.viruses.length === 0) continue;

    const virusCard = slot.viruses[0];
    const virusColor = virusCard.color;

    // Find first opponent with a FREE organ that color-matches the virus.
    for (const opp of opponents) {
      let placed = false;
      for (const oc of [...VIRUS_COLORS, 'MULTICOLOR'] as VirusColor[]) {
        const oppSlot = opp.cuerpo[oc];
        if (!oppSlot) continue;
        if (!colorsMatch(virusColor, oppSlot.organ.color)) continue;
        if (organSlotStatus(oppSlot) !== 'LIBRE') continue;
        // Transfer virus.
        oppSlot.viruses.push(virusCard);
        slot.viruses = [];
        placed = true;
        break;
      }
      if (placed) break;
    }
  }
}

function handlePlayGuante(
  s: VirusGameState,
  player: VirusPlayerState,
  move: Extract<VirusMove, { type: 'PLAY_GUANTE' }>,
): void {
  const card = removeFromHand(player, move.cardId);
  if (card.type !== 'TRATAMIENTO' || card.treatment !== 'GUANTE') throw new GameError('NOT_GUANTE');
  s.discardPile.push(card);

  for (const p of s.players) {
    if (p.id === player.id) continue;
    s.discardPile.push(...p.hand);
    p.hand = [];
    p.handCount = 0;
    p.mustSkipPlay = true;
  }
}

function handlePlayErrorMedico(
  s: VirusGameState,
  player: VirusPlayerState,
  move: Extract<VirusMove, { type: 'PLAY_ERROR_MEDICO' }>,
): void {
  const card = removeFromHand(player, move.cardId);
  if (card.type !== 'TRATAMIENTO' || card.treatment !== 'ERROR_MEDICO') throw new GameError('NOT_ERROR_MEDICO');
  s.discardPile.push(card);

  const target = findPlayer(s, move.targetPlayerId);
  if (target.id === player.id) throw new GameError('CANNOT_SWAP_WITH_SELF');

  // Swap entire bodies (including immunized organs).
  const tmp = player.cuerpo;
  player.cuerpo = target.cuerpo;
  target.cuerpo = tmp;
}

function handleDiscard(
  s: VirusGameState,
  player: VirusPlayerState,
  move: Extract<VirusMove, { type: 'DISCARD' }>,
): void {
  const ids = new Set(move.cardIds);
  const discarded = player.hand.filter(c => ids.has(c.id));
  if (discarded.length !== ids.size) throw new GameError('CARD_NOT_IN_HAND');
  player.hand = player.hand.filter(c => !ids.has(c.id));
  s.discardPile.push(...discarded);
}

// ── Main exported reducer ──────────────────────────────────────────────────────

export function handleVirusMove(
  state: VirusGameState,
  move: VirusMove,
  playerId: string,
): VirusGameState {
  if (state.winner !== null) throw new GameError('GAME_OVER');

  const s = copyState(state);
  const idx = s.players.findIndex(p => p.id === playerId);
  if (idx === -1) throw new GameError('PLAYER_NOT_FOUND');
  if (s.turn !== idx) throw new GameError('NOT_YOUR_TURN');

  const player = s.players[idx];

  // Guante effect: the player must skip their play phase this turn.
  if (player.mustSkipPlay) {
    if (move.type !== 'DISCARD') throw new GameError('MUST_SKIP_PLAY');
    player.mustSkipPlay = false;
    handleDiscard(s, player, move as Extract<VirusMove, { type: 'DISCARD' }>);
  } else {
    switch (move.type) {
      case 'PLAY_ORGAN':       handlePlayOrgano(s, player, move); break;
      case 'PLAY_VIRUS':       handlePlayVirus(s, player, move); break;
      case 'PLAY_MEDICINA':    handlePlayMedicina(s, player, move); break;
      case 'PLAY_TRANSPLANTE': handlePlayTransplante(s, player, move); break;
      case 'PLAY_LADRON':      handlePlayLadron(s, player, move); break;
      case 'PLAY_CONTAGIO':    handlePlayContagio(s, player, move); break;
      case 'PLAY_GUANTE':      handlePlayGuante(s, player, move); break;
      case 'PLAY_ERROR_MEDICO': handlePlayErrorMedico(s, player, move); break;
      case 'DISCARD':          handleDiscard(s, player, move); break;
      default:                 throw new GameError('UNKNOWN_MOVE');
    }
  }

  // Phase 2: draw back up to 3 cards.
  drawToFull(player, s);

  // Win check after every action.
  const winnerId = checkWin(s);
  if (winnerId !== null) {
    s.winner = winnerId;
    s.phase  = 'GAME_OVER';
    return s;
  }

  advanceTurn(s);
  return s;
}
