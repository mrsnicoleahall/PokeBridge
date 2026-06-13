// Hub orchestration: dispatch a decrypted box slot to/from the canonical Mon by generation, and turn a
// Mon + target generation into a transfer outcome (ready / blocked / trimmed). The save-file I/O (loading
// a save, iterating boxes, writing slots) lives in the UI layer; this module is the gen-neutral core that
// makes Gen 3 ↔ 5 ↔ 7 any-direction work without a pivot gen.

import type { Generation, Mon } from './mon';
import { gen3ReadMon, gen3WriteMon } from './codec-gen3';
import { gen4ReadMon, gen4WriteMon } from './codec-gen4';
import { gen5ReadMon, gen5WriteMon } from './codec-gen5';
import { gen7ReadMon, gen7WriteMon } from './codec-gen7';
import { checkCompatibility, type Blocker } from './compatibility';
import { trimToFit } from './trim';

/** Generations that can be both a source and a destination through the hub. */
export type BidirectionalGen = 3 | 4 | 5 | 7;

const READERS: Record<BidirectionalGen, (slot: Uint8Array) => Mon> = {
  3: gen3ReadMon,
  4: gen4ReadMon,
  5: gen5ReadMon,
  7: gen7ReadMon,
};
const WRITERS: Record<BidirectionalGen, (mon: Mon) => Uint8Array> = {
  3: gen3WriteMon,
  4: gen4WriteMon,
  5: gen5WriteMon,
  7: gen7WriteMon,
};

function assertSupported(gen: Generation): asserts gen is BidirectionalGen {
  if (gen !== 3 && gen !== 4 && gen !== 5 && gen !== 7) {
    throw new Error(`Gen ${gen} isn't a bidirectional hub endpoint yet (supported: 3, 4, 5, 7).`);
  }
}

/** Decode a decrypted box slot of the given generation into the canonical hub Mon. */
export function readMon(gen: Generation, slot: Uint8Array): Mon {
  assertSupported(gen);
  return READERS[gen](slot);
}

/** Encode a Mon into the decrypted box-slot bytes for the given generation. */
export function writeMon(gen: Generation, mon: Mon): Uint8Array {
  assertSupported(gen);
  return WRITERS[gen](mon);
}

export type TransferStatus = 'ready' | 'trimmed' | 'blocked';

export interface TransferOutcome {
  status: TransferStatus;
  mon: Mon; // the (possibly trimmed) mon
  bytes?: Uint8Array; // destination box-slot bytes, present when status is ready/trimmed
  blockers: Blocker[]; // why it's blocked (empty when ready)
  removed: string[]; // what trimming changed (empty unless trimmed)
}

/**
 * Decide what happens when `mon` is sent to `targetGen`. Strict by default: if anything can't be
 * represented, the mon is `blocked` with reasons and produces no bytes. With `{ trim: true }` the caller
 * has reviewed the blockers and accepts dropping the flagged fields — if that resolves everything the mon
 * is `trimmed` and written; if an untrimmable blocker remains (e.g. out-of-dex species) it stays blocked.
 */
export function prepareTransfer(mon: Mon, targetGen: Generation, opts: { trim?: boolean } = {}): TransferOutcome {
  assertSupported(targetGen);
  const blockers = checkCompatibility(mon, targetGen);
  if (blockers.length === 0) {
    return { status: 'ready', mon, bytes: writeMon(targetGen, mon), blockers: [], removed: [] };
  }
  if (!opts.trim) {
    return { status: 'blocked', mon, blockers, removed: [] };
  }
  const { mon: trimmed, removed, unresolved } = trimToFit(mon, targetGen);
  if (unresolved.length > 0) {
    return { status: 'blocked', mon: trimmed, blockers: unresolved, removed };
  }
  return { status: 'trimmed', mon: trimmed, bytes: writeMon(targetGen, trimmed), blockers: [], removed };
}
