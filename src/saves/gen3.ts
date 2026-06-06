// Gen 3 (RSE / FRLG) save parser — read access to PC boxes (Gen 3 is a read-only source).
//
// Layout (see Bulbapedia "Save data structure (Generation III)"):
//   Two game-save blocks: A @ 0x0000, B @ 0xE000, each 14 sections × 0x1000 bytes.
//   Section footer: id @ 0xFF4 (u16), checksum @ 0xFF6, signature @ 0xFF8 (=0x08012025), saveIndex @ 0xFFC.
//   Active block = the one with the higher save index (tie → B). Sections are stored rotated, so map by id.
//   PC buffer = sections 5–13 concatenated (3968 bytes each from 5–12, 2000 from 13) = 33,744 bytes.
//   Boxed Pokémon: start at buffer offset 0x04, 80 bytes each, 14 boxes × 30 slots, row-major.

import { decryptPk3, pk3Checksum, readSpeciesPk3Internal, PK3_SIZE } from '../codec/pk3';
import { gen3InternalToNational } from '../convert/gen3-species';
import { normalizeSave } from './normalize';

const BLOCK_SIZE = 0xe000;
const SECTION_SIZE = 0x1000;
const PC_BUFFER_SIZE = 33744;
const BOXES = 14;
const SLOTS_PER_BOX = 30;
const PC_MON_START = 0x04;

const u16 = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);
const u32 = (b: Uint8Array, o: number) =>
  (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;

export interface Gen3BoxMon {
  box: number;
  slot: number;
  internal: number;
  national: number;
  data: Uint8Array; // decrypted PK3 (80 bytes)
}

export class Gen3Save {
  private readonly pc: Uint8Array;

  constructor(data: Uint8Array) {
    const idxA = u32(data, 0x0000 + 0x0ffc);
    const idxB = u32(data, BLOCK_SIZE + 0x0ffc);
    const base = idxB >= idxA ? BLOCK_SIZE : 0x0000; // most recent save (tie → B)

    // Sections are stored in a rotated order — map logical section id → physical offset.
    const offsetById = new Map<number, number>();
    for (let p = 0; p < 14; p++) {
      const off = base + p * SECTION_SIZE;
      offsetById.set(u16(data, off + 0x0ff4), off);
    }

    // Reconstruct the PC buffer from sections 5–13.
    const pc = new Uint8Array(PC_BUFFER_SIZE);
    let cursor = 0;
    for (let id = 5; id <= 13; id++) {
      const off = offsetById.get(id);
      const used = id === 13 ? 2000 : 3968;
      if (off !== undefined) pc.set(data.subarray(off, off + used), cursor);
      cursor += used;
    }
    this.pc = pc;
  }

  /** Decrypted 80-byte PK3 for a box slot, or null if empty (Gen 3 internal box numbering). */
  boxSlot(box: number, slot: number): Uint8Array | null {
    if (box < 0 || box >= BOXES) throw new RangeError(`box ${box} out of range`);
    if (slot < 0 || slot >= SLOTS_PER_BOX) throw new RangeError(`slot ${slot} out of range`);
    const off = PC_MON_START + (box * SLOTS_PER_BOX + slot) * PK3_SIZE;
    const stored = this.pc.subarray(off, off + PK3_SIZE);
    if (u16(stored, 0x1c) === 0) return null; // checksum 0 → empty slot
    return decryptPk3(stored);
  }

  /** All boxed Pokémon with valid checksums and a known National Dex species. */
  allBoxMon(): Gen3BoxMon[] {
    const out: Gen3BoxMon[] = [];
    for (let box = 0; box < BOXES; box++) {
      for (let slot = 0; slot < SLOTS_PER_BOX; slot++) {
        const off = PC_MON_START + (box * SLOTS_PER_BOX + slot) * PK3_SIZE;
        const stored = this.pc.subarray(off, off + PK3_SIZE);
        const checksum = u16(stored, 0x1c);
        if (checksum === 0) continue;
        const data = decryptPk3(stored);
        if (pk3Checksum(data) !== checksum) continue; // skip anything that doesn't decode cleanly
        const internal = readSpeciesPk3Internal(data);
        const national = gen3InternalToNational(internal);
        if (national < 1 || national > 386) continue;
        out.push({ box, slot, internal, national, data });
      }
    }
    return out;
  }
}

export function loadGen3(buffer: Uint8Array): Gen3Save {
  const data = normalizeSave(buffer);
  if (data.length < BLOCK_SIZE * 2) {
    throw new Error(`expected a Gen 3 save (>=114KB), got ${data.length} bytes`);
  }
  return new Gen3Save(data);
}
