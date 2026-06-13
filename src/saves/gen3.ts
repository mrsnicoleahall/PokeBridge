// Gen 3 (RSE / FRLG) save parser — read access to PC boxes (Gen 3 is a read-only source).
//
// Layout (see Bulbapedia "Save data structure (Generation III)"):
//   Two game-save blocks: A @ 0x0000, B @ 0xE000, each 14 sections × 0x1000 bytes.
//   Section footer: id @ 0xFF4 (u16), checksum @ 0xFF6, signature @ 0xFF8 (=0x08012025), saveIndex @ 0xFFC.
//   Active block = the one with the higher save index (tie → B). Sections are stored rotated, so map by id.
//   PC buffer = sections 5–13 concatenated (3968 bytes each from 5–12, 2000 from 13) = 33,744 bytes.
//   Boxed Pokémon: start at buffer offset 0x04, 80 bytes each, 14 boxes × 30 slots, row-major.

import { decryptPk3, encryptPk3, pk3Checksum, readSpeciesPk3Internal, PK3_SIZE } from '../codec/pk3';
import { gen3InternalToNational } from '../convert/gen3-species';
import { normalizeSave } from './normalize';

const BLOCK_SIZE = 0xe000;
const SECTION_SIZE = 0x1000;
const PC_BUFFER_SIZE = 33744;
const BOXES = 14;
const SLOTS_PER_BOX = 30;
const PC_MON_START = 0x04;
const SECTION_CHECKSUM_OFFSET = 0x0ff6; // u16, within each section footer
// PC data lives in sections 5–13. Bytes each section contributes (and that its checksum covers):
// 3968 for sections 5–12, 2000 for section 13. (Bulbapedia: Save data structure (Generation III).)
const PC_SECTION_IDS = [5, 6, 7, 8, 9, 10, 11, 12, 13] as const;
const pcSectionUsed = (id: number): number => (id === 13 ? 2000 : 3968);

/** Gen 3 section checksum: sum the section's used region as 32-bit words, then fold to 16 bits. */
function sectionChecksum(data: Uint8Array, off: number, usedBytes: number): number {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let sum = 0;
  for (let i = 0; i < usedBytes; i += 4) sum = (sum + dv.getUint32(off + i, true)) >>> 0;
  return ((sum & 0xffff) + (sum >>> 16)) & 0xffff;
}

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
  private readonly data: Uint8Array; // private copy of the whole save (the active block gets written back)
  private readonly offsetById: Map<number, number>; // logical section id → physical offset in the active block
  private readonly pc: Uint8Array; // reconstructed contiguous PC buffer (sections 5–13)

  constructor(data: Uint8Array) {
    this.data = data.slice(); // own a copy — never mutate the caller's bytes
    const buf = this.data;
    const idxA = u32(buf, 0x0000 + 0x0ffc);
    const idxB = u32(buf, BLOCK_SIZE + 0x0ffc);
    const base = idxB >= idxA ? BLOCK_SIZE : 0x0000; // most recent save (tie → B)

    // Sections are stored in a rotated order — map logical section id → physical offset.
    this.offsetById = new Map<number, number>();
    for (let p = 0; p < 14; p++) {
      const off = base + p * SECTION_SIZE;
      this.offsetById.set(u16(buf, off + 0x0ff4), off);
    }

    // Reconstruct the PC buffer from sections 5–13.
    const pc = new Uint8Array(PC_BUFFER_SIZE);
    let cursor = 0;
    for (const id of PC_SECTION_IDS) {
      const off = this.offsetById.get(id);
      const used = pcSectionUsed(id);
      if (off !== undefined) pc.set(buf.subarray(off, off + used), cursor);
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

  /**
   * Write a decrypted 80-byte PK3 into a box slot. Re-encrypts and stores it in the contiguous PC
   * buffer; toBytes() scatters that buffer back across sections (handling slots that straddle a
   * section boundary) and refreshes the affected section checksums.
   */
  setBoxSlot(box: number, slot: number, decrypted: Uint8Array): void {
    if (box < 0 || box >= BOXES) throw new RangeError(`box ${box} out of range`);
    if (slot < 0 || slot >= SLOTS_PER_BOX) throw new RangeError(`slot ${slot} out of range`);
    if (decrypted.length !== PK3_SIZE) throw new Error(`expected a ${PK3_SIZE}-byte PK3`);
    const off = PC_MON_START + (box * SLOTS_PER_BOX + slot) * PK3_SIZE;
    this.pc.set(encryptPk3(decrypted), off);
  }

  /** Clear a box slot (mark it empty: a zeroed slot has checksum 0, which the reader treats as empty). */
  clearBoxSlot(box: number, slot: number): void {
    const off = PC_MON_START + (box * SLOTS_PER_BOX + slot) * PK3_SIZE;
    this.pc.fill(0, off, off + PK3_SIZE);
  }

  /** Current save bytes (a copy): the PC buffer scattered back to the active block, checksums refreshed. */
  toBytes(): Uint8Array {
    const out = this.data.slice();
    let cursor = 0;
    for (const id of PC_SECTION_IDS) {
      const off = this.offsetById.get(id);
      const used = pcSectionUsed(id);
      if (off !== undefined) {
        out.set(this.pc.subarray(cursor, cursor + used), off);
        const crc = sectionChecksum(out, off, used);
        out[off + SECTION_CHECKSUM_OFFSET] = crc & 0xff;
        out[off + SECTION_CHECKSUM_OFFSET + 1] = (crc >> 8) & 0xff;
      }
      cursor += used;
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
