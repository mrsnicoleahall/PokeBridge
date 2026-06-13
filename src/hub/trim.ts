// Per-mon trim: the user, after reviewing why a mon is blocked, opts to send it anyway. Trimming clears
// ONLY the fields the compatibility checker flagged — it never touches species or PID. Some blockers are
// untrimmable (you can't trim a species into having existed); those are returned as `unresolved`, and the
// mon still can't be transferred.

import { abilityIdFor } from '../convert/abilities';
import { checkCompatibility, type Blocker } from './compatibility';
import type { Generation, Mon } from './mon';

export interface TrimResult {
  mon: Mon; // a trimmed copy (original untouched)
  removed: string[]; // human-readable list of what was changed, for the UI
  unresolved: Blocker[]; // blockers trimming can't fix — mon still won't transfer if non-empty
}

/** Produce a copy of `mon` trimmed to fit `target`, reporting what changed and what couldn't be fixed. */
export function trimToFit(mon: Mon, target: Generation): TrimResult {
  const out: Mon = { ...mon, moves: [...mon.moves], movePP: [...mon.movePP], ivs: [...mon.ivs], evs: [...mon.evs] };
  const removed: string[] = [];

  for (const b of checkCompatibility(mon, target)) {
    switch (b.code) {
      case 'MOVE_TOO_NEW': {
        const i = Number(b.field!.replace('move', '')) - 1;
        removed.push(`Move ${i + 1} (#${out.moves[i]}) removed`);
        out.moves[i] = 0;
        out.movePP[i] = 0;
        break;
      }
      case 'ABILITY_TOO_NEW':
      case 'HIDDEN_ABILITY_UNSUPPORTED': {
        const regular = abilityIdFor(out.nationalDex, 0);
        removed.push(`Ability changed to this species' regular ability (#${regular})`);
        out.ability = regular;
        out.abilitySlot = 0;
        break;
      }
      case 'FORM_NOT_REPRESENTABLE': {
        removed.push(`Form reset to base form`);
        out.form = 0;
        break;
      }
      case 'NATURE_NOT_PID_CONSISTENT': {
        removed.push(`Nature becomes ${out.pid % 25} (the value Gen ${target} reads from this PID)`);
        out.nature = out.pid % 25;
        break;
      }
      case 'SPECIES_OUT_OF_DEX':
        // untrimmable — handled below via re-check
        break;
    }
  }

  // Whatever still blocks after trimming (e.g. an out-of-dex species) is unresolved.
  const unresolved = checkCompatibility(out, target);
  return { mon: out, removed, unresolved };
}
