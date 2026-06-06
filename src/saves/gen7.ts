// Gen 7 (Ultra Sun / Ultra Moon) save — PC box read/write (this is a transfer DESTINATION).
//
// USUM saves (0x6CC00 bytes) are a set of blocks at fixed offsets, with an 8-byte block-info table
// after a "FEEB" marker at BlockInfoOffset 0x6CA00 (table at +0x14): each entry { u32 length, u16 id,
// u16 CRC-16/X-25 }. The PC storage is block id 14 — exactly 960 slots × 232 bytes at 0xEACE — so a
// boxed mon lives at 0xEACE + (box*30 + slot)*232. Writing a slot only requires recomputing block 14's
// checksum (USUM has no whole-save signature, unlike XY/ORAS). All offsets verified against a real save.

import { decryptPk7, encryptPk7, PK7_SIZE } from '../codec/pk7';
import { crc16x25 } from './crc16';

const SAVE_SIZE = 0x6cc00;
const BOX_OFFSET = 0xeace;
const BOX_BLOCK_LEN = 0x36600; // 960 * 232
const BOX_CRC_SLOT = 0x6ca8a; // block-info table (0x6CA14) + id 14 * 8 + 6
const SLOTS_PER_BOX = 30;
const BOX_COUNT = 32;

const u32 = (b: Uint8Array, o: number) => (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;

export class Gen7Save {
  private readonly data: Uint8Array;

  constructor(buffer: Uint8Array) {
    this.data = buffer.slice();
  }

  private slotOffset(box: number, slot: number): number {
    if (box < 0 || box >= BOX_COUNT) throw new RangeError(`box ${box} out of range`);
    if (slot < 0 || slot >= SLOTS_PER_BOX) throw new RangeError(`slot ${slot} out of range`);
    return BOX_OFFSET + (box * SLOTS_PER_BOX + slot) * PK7_SIZE;
  }

  /** Decrypted 232-byte PK7 for a box slot, or null if empty (empty slots have a zero encryption constant). */
  boxSlot(box: number, slot: number): Uint8Array | null {
    const off = this.slotOffset(box, slot);
    if (u32(this.data, off) === 0) return null;
    return decryptPk7(this.data.subarray(off, off + PK7_SIZE));
  }

  /** Write a decrypted PK7 into a box slot, re-encrypt, and refresh the box block's checksum. */
  setBoxSlot(box: number, slot: number, decrypted: Uint8Array): void {
    if (decrypted.length !== PK7_SIZE) throw new Error(`expected a ${PK7_SIZE}-byte PK7`);
    this.data.set(encryptPk7(decrypted), this.slotOffset(box, slot));
    this.recomputeBoxChecksum();
  }

  /** Recompute the PC box block's CRC-16/X-25 (no-op on an unmodified save). */
  recomputeBoxChecksum(): void {
    const crc = crc16x25(this.data, BOX_OFFSET, BOX_BLOCK_LEN);
    this.data[BOX_CRC_SLOT] = crc & 0xff;
    this.data[BOX_CRC_SLOT + 1] = (crc >> 8) & 0xff;
  }

  toBytes(): Uint8Array {
    return this.data.slice();
  }
}

export function loadGen7(buffer: Uint8Array): Gen7Save {
  if (buffer.length !== SAVE_SIZE) {
    throw new Error(`expected a 0x6CC00 Ultra Sun/Moon save, got ${buffer.length} bytes`);
  }
  return new Gen7Save(buffer);
}
