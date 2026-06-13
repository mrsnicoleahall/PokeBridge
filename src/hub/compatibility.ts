// Strict-mode compatibility: can this exact Mon exist in the target generation with ZERO changes?
// Returns a list of blockers (empty = transfers cleanly). The UI shows blockers per mon and lets the
// user opt into trimming them (see hub/trim.ts) — nothing is ever altered silently.

import type { Generation, Mon } from './mon';
import { pidGender } from '../convert/gender';

export type BlockerCode =
  | 'SPECIES_OUT_OF_DEX' // species didn't exist yet in the target gen
  | 'MOVE_TOO_NEW' // a move was introduced after the target gen
  | 'ABILITY_TOO_NEW' // an ability was introduced after the target gen
  | 'HIDDEN_ABILITY_UNSUPPORTED' // Hidden Abilities didn't exist before Gen 5
  | 'FORM_NOT_REPRESENTABLE' // an alternate form can't exist in the target gen
  | 'NATURE_NOT_PID_CONSISTENT' // Gen 3 derives nature from the PID; a mismatch can't be kept
  | 'GENDER_NOT_PID_CONSISTENT'; // Gen 3 derives gender from the PID; a mismatch can't be kept

export interface Blocker {
  code: BlockerCode;
  detail: string; // human-readable, shown in the review UI
  field?: string; // e.g. "move2" — what the user would trim
}

// Highest National Dex number that exists in each generation's data.
const DEX_CAP: Record<Generation, number> = { 1: 151, 2: 251, 3: 386, 4: 493, 5: 649, 6: 721, 7: 807 };
// Highest valid move id per generation.
const MOVE_CAP: Record<Generation, number> = { 1: 165, 2: 251, 3: 354, 4: 467, 5: 559, 6: 621, 7: 728 };
// Highest valid ability id per generation (Gen 1/2 had no abilities).
const ABILITY_CAP: Record<Generation, number> = { 1: 0, 2: 0, 3: 77, 4: 123, 5: 164, 6: 191, 7: 233 };

/**
 * Generations that derive a Pokémon's nature directly from its PID (no separate nature field). Writing a
 * mon here with a nature that disagrees with PID % 25 would force a PID change — which we refuse, since
 * the PID is identity (and shininess). Gen 3 and Gen 4 are PID-coupled; Gen 5 decoupled nature into its
 * own field, so it (and Gen 6/7) are exempt.
 */
const NATURE_FROM_PID: ReadonlySet<Generation> = new Set<Generation>([3, 4]);

/** All blockers preventing `mon` from existing unchanged in `target`. Empty array ⇒ transfers cleanly. */
export function checkCompatibility(mon: Mon, target: Generation): Blocker[] {
  const blockers: Blocker[] = [];

  if (mon.nationalDex > DEX_CAP[target]) {
    blockers.push({
      code: 'SPECIES_OUT_OF_DEX',
      detail: `#${mon.nationalDex} didn't exist in Gen ${target} (its dex goes up to #${DEX_CAP[target]}).`,
    });
  }

  for (let i = 0; i < 4; i++) {
    const move = mon.moves[i]!;
    if (move > 0 && move > MOVE_CAP[target]) {
      blockers.push({
        code: 'MOVE_TOO_NEW',
        field: `move${i + 1}`,
        detail: `Move #${move} was introduced after Gen ${target} (max move there is #${MOVE_CAP[target]}).`,
      });
    }
  }

  if (mon.ability > 0 && mon.ability > ABILITY_CAP[target]) {
    blockers.push({
      code: 'ABILITY_TOO_NEW',
      field: 'ability',
      detail: `Ability #${mon.ability} was introduced after Gen ${target} (max there is #${ABILITY_CAP[target]}).`,
    });
  }

  if (mon.abilitySlot === 2 && target < 5) {
    blockers.push({
      code: 'HIDDEN_ABILITY_UNSUPPORTED',
      field: 'ability',
      detail: `Hidden Abilities didn't exist before Gen 5; this mon would need a regular ability.`,
    });
  }

  // Conservative form rule: a non-base form is always safe to carry up or sideways from its origin, but
  // moving it *down* (target older than where it came from) can't be represented. A precise per-form
  // introduction table can refine this later; until then, down-moving any special form is blocked.
  if (mon.form > 0 && target < mon.originGen) {
    blockers.push({
      code: 'FORM_NOT_REPRESENTABLE',
      field: 'form',
      detail: `This mon's form (${mon.form}) came from Gen ${mon.originGen} and can't be represented in Gen ${target}.`,
    });
  }

  if (NATURE_FROM_PID.has(target) && mon.nature !== mon.pid % 25) {
    blockers.push({
      code: 'NATURE_NOT_PID_CONSISTENT',
      field: 'nature',
      detail:
        `Gen ${target} reads nature from the PID (this PID gives nature ${mon.pid % 25}, but the mon is ` +
        `nature ${mon.nature}); keeping its nature would mean changing the PID, which we never do.`,
    });
  }

  // Gen 3 has no stored gender field — it reads gender from the PID + species ratio. So a mon whose gender
  // disagrees with what its PID produces can't keep that gender in Gen 3 without changing the PID. (Gen 5/7
  // store gender explicitly, so this only applies to a Gen 3 target.)
  if (target === 3 && mon.nationalDex <= DEX_CAP[3]) {
    const pidG = pidGender(mon.nationalDex, mon.pid);
    if (pidG !== mon.gender) {
      const nameOf = (g: number) => (g === 1 ? 'female' : g === 2 ? 'genderless' : 'male');
      blockers.push({
        code: 'GENDER_NOT_PID_CONSISTENT',
        field: 'gender',
        detail: `Gen ${target} reads gender from the PID (this PID gives ${nameOf(pidG)}, but the mon is ${nameOf(mon.gender)}); keeping it would require changing the PID.`,
      });
    }
  }

  return blockers;
}

/** Convenience: true if the mon can transfer to the target generation with no changes at all. */
export function canTransfer(mon: Mon, target: Generation): boolean {
  return checkCompatibility(mon, target).length === 0;
}
