// Gen 5 (Black 2 / White 2) save parser — read access to PC boxes.
// Offsets verified against a real B2W2 save (see SPEC.md). Reads the primary save block.

import { decryptPk5, encryptPk5, isEmptySlot, PK5_SIZE } from '../codec/pk5';
import { crc16ccitt } from './crc16';
import { normalizeSave } from './normalize';

const BOX_BASE = 0x400;
const BOX_STRIDE = 0x1000;
const SLOT_SIZE = PK5_SIZE; // 136
const SLOTS_PER_BOX = 30;
const BOX_COUNT = 24;
const BOX_DATA_LEN = 0xff0; // 30 * 136 — region a box's checksum covers
const BOX_CRC_OFFSET = 0xff2; // box CRC-16-CCITT stored here, relative to box start
// The backup save copy lives at a generation-specific offset: +0x26000 on Black 2/White 2,
// +0x24000 on the original Black/White. Box base/stride/checksum are otherwise identical.
const BACKUP_CANDIDATES = [0x26000, 0x24000];

export class Gen5Save {
  private readonly data: Uint8Array;
  private readonly copies: number[]; // [primary 0, backup] — backup offset detected (BW vs B2W2)

  /** Owns a private copy of the buffer — never mutates the caller's data. */
  constructor(buffer: Uint8Array) {
    this.data = buffer.slice();
    this.copies = [0, this.detectBackupOffset()];
  }

  /** The real backup block is the candidate offset whose box checksums all still validate. */
  private detectBackupOffset(): number {
    let best = BACKUP_CANDIDATES[0]!;
    let bestMatches = -1;
    for (const delta of BACKUP_CANDIDATES) {
      let matches = 0;
      for (let box = 0; box < BOX_COUNT; box++) {
        const start = delta + BOX_BASE + box * BOX_STRIDE;
        if (start + BOX_CRC_OFFSET + 2 > this.data.length) break;
        const stored = this.data[start + BOX_CRC_OFFSET]! | (this.data[start + BOX_CRC_OFFSET + 1]! << 8);
        if (crc16ccitt(this.data.subarray(start, start + BOX_DATA_LEN)) === stored) matches++;
      }
      if (matches > bestMatches) { bestMatches = matches; best = delta; }
    }
    return best;
  }

  private boxStart(copy: number, box: number): number {
    if (box < 0 || box >= BOX_COUNT) throw new RangeError(`box ${box} out of range`);
    return copy + BOX_BASE + box * BOX_STRIDE;
  }

  private slotOffset(copy: number, box: number, slot: number): number {
    if (slot < 0 || slot >= SLOTS_PER_BOX) throw new RangeError(`slot ${slot} out of range`);
    return this.boxStart(copy, box) + slot * SLOT_SIZE;
  }

  /** Recompute one box's CRC-16-CCITT footer (in the given copy) from its current slot data. */
  private updateBoxChecksum(copy: number, box: number): void {
    const start = this.boxStart(copy, box);
    const crc = crc16ccitt(this.data.subarray(start, start + BOX_DATA_LEN));
    const at = start + BOX_CRC_OFFSET;
    this.data[at] = crc & 0xff;
    this.data[at + 1] = (crc >> 8) & 0xff;
  }

  /** Decrypted 136-byte PK5 for a box slot (read from the primary copy), or null if empty. */
  boxSlot(box: number, slot: number): Uint8Array | null {
    const off = this.slotOffset(0, box, slot);
    const stored = this.data.subarray(off, off + SLOT_SIZE);
    if (isEmptySlot(stored)) return null;
    return decryptPk5(stored);
  }

  /**
   * Write a decrypted PK5 into a box slot. Re-encrypts, writes into BOTH the primary and backup
   * copies, and refreshes that box's checksum in each — leaving a fully valid save.
   */
  setBoxSlot(box: number, slot: number, decrypted: Uint8Array): void {
    if (decrypted.length !== SLOT_SIZE) throw new Error(`expected ${SLOT_SIZE}-byte PK5`);
    const enc = encryptPk5(decrypted);
    for (const copy of this.copies) {
      this.data.set(enc, this.slotOffset(copy, box, slot));
      this.updateBoxChecksum(copy, box);
    }
  }

  /** Recompute every box checksum in both copies. On an untouched save this is a no-op. */
  recomputeAllBoxChecksums(): void {
    for (const copy of this.copies) {
      for (let box = 0; box < BOX_COUNT; box++) this.updateBoxChecksum(copy, box);
    }
  }

  /** Current save bytes (a copy). Box checksums are kept valid by setBoxSlot. */
  toBytes(): Uint8Array {
    return this.data.slice();
  }

  /** All 30 slots of a box, each decrypted PK5 or null. */
  box(box: number): (Uint8Array | null)[] {
    return Array.from({ length: SLOTS_PER_BOX }, (_, slot) => this.boxSlot(box, slot));
  }
}

export function loadGen5(buffer: Uint8Array): Gen5Save {
  const data = normalizeSave(buffer); // strip emulator footers (DeSmuME .dsv/.dst)
  if (data.length !== 0x80000) {
    throw new Error(`expected a 512KB Gen 5 save, got ${data.length} bytes`);
  }
  return new Gen5Save(data);
}
