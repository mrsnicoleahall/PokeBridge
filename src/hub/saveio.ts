// Uniform save I/O over the three bidirectional generations, so the UI can treat Gen 3 / 5 / 7 the same:
// load bytes → read any occupied slot as a Mon, place a Mon into a slot, export bytes. Each generation's
// own Save class does the real encryption/checksum work; this is just a thin, gen-neutral adapter.

import { loadGen3 } from '../saves/gen3';
import { loadGen4 } from '../saves/gen4';
import { loadGen5 } from '../saves/gen5';
import { loadGen7 } from '../saves/gen7';
import { readMon, writeMon, type BidirectionalGen } from './transfer';
import type { Mon } from './mon';

export interface HubSave {
  readonly gen: BidirectionalGen;
  readonly boxCount: number;
  readonly slotsPerBox: number;
  /** Decoded Mon at this slot, or null if the slot is empty. */
  slot(box: number, slot: number): Mon | null;
  /** Encode and write a Mon into a slot (re-encrypts + fixes checksums under the hood). */
  place(box: number, slot: number, mon: Mon): void;
  /** Write already-encoded box-slot bytes (used by the legacy Gen 1/2/4 up-converters, which emit PK5/PK7 directly). */
  placeRaw(box: number, slot: number, decoded: Uint8Array): void;
  /** Clear a slot (Gen 3 supports a true clear; Gen 5/7 callers just avoid occupied slots). */
  clear(box: number, slot: number): void;
  /** Current save bytes (a copy) — ready to download or write back to the SD. */
  toBytes(): Uint8Array;
}

const SLOTS_PER_BOX = 30;
const BOX_COUNT: Record<BidirectionalGen, number> = { 3: 14, 4: 18, 5: 24, 7: 32 };

export function loadHubSave(gen: BidirectionalGen, bytes: Uint8Array): HubSave {
  const save: { boxSlot(b: number, s: number): Uint8Array | null; setBoxSlot(b: number, s: number, d: Uint8Array): void; clearBoxSlot?(b: number, s: number): void; toBytes(): Uint8Array } =
    gen === 3 ? loadGen3(bytes) : gen === 4 ? loadGen4(bytes) : gen === 5 ? loadGen5(bytes) : loadGen7(bytes);

  return {
    gen,
    boxCount: BOX_COUNT[gen],
    slotsPerBox: SLOTS_PER_BOX,
    slot(box, slot) {
      const dec = save.boxSlot(box, slot);
      return dec ? readMon(gen, dec) : null;
    },
    place(box, slot, mon) {
      save.setBoxSlot(box, slot, writeMon(gen, mon));
    },
    placeRaw(box, slot, decoded) {
      save.setBoxSlot(box, slot, decoded);
    },
    clear(box, slot) {
      save.clearBoxSlot?.(box, slot);
    },
    toBytes: () => save.toBytes(),
  };
}

export interface EnumeratedMon {
  box: number;
  slot: number;
  mon: Mon;
}

/** Every occupied slot in the save, decoded to Mon, in box→slot order. */
export function enumerateMon(save: HubSave): EnumeratedMon[] {
  const out: EnumeratedMon[] = [];
  for (let box = 0; box < save.boxCount; box++) {
    for (let slot = 0; slot < save.slotsPerBox; slot++) {
      const mon = save.slot(box, slot);
      if (mon) out.push({ box, slot, mon });
    }
  }
  return out;
}

/** First empty slot at or after the cursor, scanning boxes in order; null if the save is full. */
export function firstEmptySlot(save: HubSave): { box: number; slot: number } | null {
  for (let box = 0; box < save.boxCount; box++) {
    for (let slot = 0; slot < save.slotsPerBox; slot++) {
      if (!save.slot(box, slot)) return { box, slot };
    }
  }
  return null;
}
