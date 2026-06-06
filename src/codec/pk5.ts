// Gen 5 (BW/B2W2) Pokémon block codec.
//
// Decrypted 136-byte layout:
//   0x00  PID (u32)
//   0x06  checksum (u16)  — 16-bit word sum of the four data blocks
//   0x08..0x87  four 32-byte data blocks (canonical A,B,C,D)
//
// On disk the four blocks are shuffled by PID, then 0x08..0x87 is XOR-encrypted with the
// Gen 4/5 LCRNG seeded by the checksum.

import { lcrngStream } from './prng';
import { shuffleBlocks, unshuffleBlocks } from './shuffle';

export const PK5_SIZE = 136;
const BLOCK_START = 0x08;
const BLOCK_END = 0x88; // exclusive — 128 bytes / 64 words / four 32-byte blocks
const BLOCK_SIZE = 32;

type Quad = [Uint8Array, Uint8Array, Uint8Array, Uint8Array];

const view = (b: Uint8Array): DataView => new DataView(b.buffer, b.byteOffset, b.byteLength);

export function pk5Checksum(decrypted: Uint8Array): number {
  const dv = view(decrypted);
  let sum = 0;
  for (let off = BLOCK_START; off < BLOCK_END; off += 2) sum = (sum + dv.getUint16(off, true)) & 0xffff;
  return sum;
}

/** National Dex species id, read from offset 0x08 of *decrypted* data. */
export function readSpecies(decrypted: Uint8Array): number {
  return view(decrypted).getUint16(0x08, true);
}

/** A stored slot is empty when its (unencrypted) checksum field at 0x06 is zero. */
export function isEmptySlot(stored: Uint8Array): boolean {
  return view(stored).getUint16(0x06, true) === 0;
}

/** XOR the 0x08..0x87 region word-by-word with the keystream from `seed` (symmetric: encrypt = decrypt). */
function xorRegion(buf: Uint8Array, seed: number): void {
  const dv = view(buf);
  const stream = lcrngStream(seed);
  for (let off = BLOCK_START; off < BLOCK_END; off += 2) {
    dv.setUint16(off, dv.getUint16(off, true) ^ stream.next().value, true);
  }
}

function getBlocks(buf: Uint8Array): Quad {
  const q: Uint8Array[] = [];
  for (let i = 0; i < 4; i++) {
    q.push(buf.slice(BLOCK_START + i * BLOCK_SIZE, BLOCK_START + (i + 1) * BLOCK_SIZE));
  }
  return q as Quad;
}

function setBlocks(buf: Uint8Array, blocks: Quad): void {
  for (let i = 0; i < 4; i++) buf.set(blocks[i], BLOCK_START + i * BLOCK_SIZE);
}

/** Take a decrypted (canonical) PK5, recompute its checksum, and return the encrypted on-disk form. */
export function encryptPk5(decrypted: Uint8Array): Uint8Array {
  const out = decrypted.slice();
  const dv = view(out);
  const pid = dv.getUint32(0x00, true);
  const checksum = pk5Checksum(out);
  dv.setUint16(0x06, checksum, true);
  setBlocks(out, shuffleBlocks(getBlocks(out), pid)); // canonical -> stored order
  xorRegion(out, checksum);
  return out;
}

/** Take an encrypted on-disk PK5 and return the decrypted canonical form. */
export function decryptPk5(enc: Uint8Array): Uint8Array {
  const out = enc.slice();
  const dv = view(out);
  const pid = dv.getUint32(0x00, true);
  const checksum = dv.getUint16(0x06, true);
  xorRegion(out, checksum);
  setBlocks(out, unshuffleBlocks(getBlocks(out), pid)); // stored order -> canonical
  return out;
}
