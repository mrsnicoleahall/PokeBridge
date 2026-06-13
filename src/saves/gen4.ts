// Gen 4 (Diamond/Pearl, Platinum, HeartGold/SoulSilver) save — PC box read/write.
//
// A Gen 4 save (0x80000) holds two 0x40000 partitions (current + backup). Each partition has a General
// block and a Storage (PC box) block, each ending in a 20-byte footer: { u32 storageCount, u32 general
// count, u32 blockSize, …, u16 checksum (last 2 bytes) }. The checksum is CRC-16/CCITT over the block
// minus its footer. General and Storage active copies are chosen independently by highest save count.
//
// Per-game layout (from PKHeX SAV4DP/Pt/HGSS), verified here against real Diamond + SoulSilver saves via
// the no-op oracle (recompute the checksum on an untouched save → byte-identical):
//   DP   storage @ 0xC100  size 0x121E0  box base +4
//   Pt   storage @ 0xCF2C  size 0x121E4  box base +4
//   HGSS storage @ 0xF700  size 0x12310  box base +0
// Pokémon are 136-byte PK4 (same shuffle + LCRNG encryption as Gen 5), 18 boxes × 30 slots.

import { decryptPk5, encryptPk5, pk5Checksum, readSpecies, PK5_SIZE } from '../codec/pk5';
import { crc16ccitt } from './crc16';

const SAVE_SIZE = 0x80000;
const PARTITION = 0x40000;
const BOXES = 18;
const SLOTS_PER_BOX = 30;
const MAX_DEX = 493;

export type Gen4Game = 'dp' | 'pt' | 'hgss';

interface GameLayout {
  sStart: number; // storage block offset in partition 0
  sSize: number; // storage block size
  box: number; // box data offset within the storage block
  footer: number; // footer size; the checksum covers the block minus this, and lives in the last 2 bytes
}

// Verified against real saves: DP storage @0xC100 size 0x121E0 footer 20, box +4; HGSS @0xF700 size
// 0x12310 footer 16, box +0 (no-op oracle matches the stored CRC). Pt mirrors DP (PKHeX) — not validated
// here for lack of a fixture, but a wrong value only makes loadGen4 reject the save, never corrupt it.
const LAYOUTS: Record<Gen4Game, GameLayout> = {
  dp: { sStart: 0xc100, sSize: 0x121e0, box: 4, footer: 20 },
  pt: { sStart: 0xcf2c, sSize: 0x121e4, box: 4, footer: 20 },
  hgss: { sStart: 0xf700, sSize: 0x12310, box: 0, footer: 16 },
};

const u16 = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);
const u32 = (b: Uint8Array, o: number) => (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;

/** Does the storage block at this base have a valid CRC-16/CCITT footer checksum? */
function storageValid(data: Uint8Array, base: number, sSize: number, footer: number): boolean {
  if (base + sSize > data.length) return false;
  const stored = u16(data, base + sSize - 2);
  return crc16ccitt(data.subarray(base, base + sSize - footer)) === stored;
}

export class Gen4Save {
  private readonly data: Uint8Array;
  readonly game: Gen4Game;
  private readonly sbo: number; // active storage block base offset
  private readonly boxBase: number;

  constructor(buffer: Uint8Array, game: Gen4Game, storagePartition: number) {
    this.data = buffer.slice();
    this.game = game;
    const layout = LAYOUTS[game];
    this.sbo = layout.sStart + storagePartition;
    this.boxBase = this.sbo + layout.box;
  }

  private slotOffset(box: number, slot: number): number {
    if (box < 0 || box >= BOXES) throw new RangeError(`box ${box} out of range`);
    if (slot < 0 || slot >= SLOTS_PER_BOX) throw new RangeError(`slot ${slot} out of range`);
    return this.boxBase + (box * SLOTS_PER_BOX + slot) * PK5_SIZE;
  }

  get boxCount(): number {
    return BOXES;
  }

  /** Decrypted 136-byte PK4 for a box slot, or null if empty/invalid. */
  boxSlot(box: number, slot: number): Uint8Array | null {
    const off = this.slotOffset(box, slot);
    const stored = this.data.subarray(off, off + PK5_SIZE);
    const cs = u16(stored, 0x06);
    if (cs === 0) return null;
    const dec = decryptPk5(stored);
    if (pk5Checksum(dec) !== cs) return null;
    const sp = readSpecies(dec);
    if (sp < 1 || sp > MAX_DEX) return null;
    return dec;
  }

  /** Write a decrypted PK4 into a slot (same encryption as Gen 5) and refresh the storage checksum. */
  setBoxSlot(box: number, slot: number, decrypted: Uint8Array): void {
    if (decrypted.length !== PK5_SIZE) throw new Error(`expected a ${PK5_SIZE}-byte PK4`);
    this.data.set(encryptPk5(decrypted), this.slotOffset(box, slot));
    this.recomputeStorageChecksum();
  }

  clearBoxSlot(box: number, slot: number): void {
    const off = this.slotOffset(box, slot);
    this.data.fill(0, off, off + PK5_SIZE);
    this.recomputeStorageChecksum();
  }

  /** Recompute the active storage block's CRC-16/CCITT footer (no-op on an unmodified save). */
  recomputeStorageChecksum(): void {
    const { sSize, footer } = LAYOUTS[this.game];
    const crc = crc16ccitt(this.data.subarray(this.sbo, this.sbo + sSize - footer));
    this.data[this.sbo + sSize - 2] = crc & 0xff;
    this.data[this.sbo + sSize - 1] = (crc >> 8) & 0xff;
  }

  toBytes(): Uint8Array {
    return this.data.slice();
  }
}

/**
 * Load a Gen 4 save, auto-detecting the game (DP / Pt / HGSS) and the active storage copy: the game whose
 * storage footer checksum validates, picking the partition with the higher storage save count.
 */
export function loadGen4(buffer: Uint8Array): Gen4Save {
  if (buffer.length !== SAVE_SIZE) {
    throw new Error(`expected a 0x80000 Gen 4 save, got ${buffer.length} bytes`);
  }
  for (const game of ['dp', 'pt', 'hgss'] as Gen4Game[]) {
    const { sStart, sSize, footer } = LAYOUTS[game];
    const valid: { partition: number; count: number }[] = [];
    for (const partition of [0, PARTITION]) {
      const base = sStart + partition;
      if (storageValid(buffer, base, sSize, footer)) {
        valid.push({ partition, count: u32(buffer, base + sSize - footer) }); // storage save count @ footer +0x00
      }
    }
    if (valid.length > 0) {
      const active = valid.reduce((a, b) => (b.count > a.count ? b : a));
      return new Gen4Save(buffer, game, active.partition);
    }
  }
  throw new Error('not a recognizable Gen 4 (DP/Pt/HGSS) save — no valid storage block found');
}
