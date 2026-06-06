// Gen 6/7 (XY/ORAS/SM/USUM) Pokémon block codec. Like Gen 4/5, the four data blocks are XOR-encrypted
// with the LCRNG and shuffled — but the record is 232 bytes (four 56-byte blocks at 0x08..0xE7) and
// BOTH the cipher seed and the shuffle order come from the Encryption Constant (EC, u32 @ 0x00), not
// the checksum/PID (verified against a real Ultra Moon save). The checksum at 0x06 is validation only.

import { lcrngStream } from './prng';
import { shuffleByOrder, unshuffleByOrder } from './shuffle';

export const PK7_SIZE = 232;
const BLOCK_START = 0x08;
const BLOCK_END = 0xe8; // exclusive — 224 bytes / four 56-byte blocks
const BLOCK_SIZE = 56;

type Quad = [Uint8Array, Uint8Array, Uint8Array, Uint8Array];

const view = (b: Uint8Array): DataView => new DataView(b.buffer, b.byteOffset, b.byteLength);
const orderIndex = (ec: number): number => ((ec >>> 13) & 0x1f) % 24;

export function pk7Checksum(decrypted: Uint8Array): number {
  const dv = view(decrypted);
  let sum = 0;
  for (let off = BLOCK_START; off < BLOCK_END; off += 2) sum = (sum + dv.getUint16(off, true)) & 0xffff;
  return sum;
}

function xorRegion(buf: Uint8Array, seed: number): void {
  const dv = view(buf);
  const stream = lcrngStream(seed);
  for (let off = BLOCK_START; off < BLOCK_END; off += 2) {
    dv.setUint16(off, dv.getUint16(off, true) ^ stream.next().value, true);
  }
}

function getBlocks(buf: Uint8Array): Quad {
  const q: Uint8Array[] = [];
  for (let i = 0; i < 4; i++) q.push(buf.slice(BLOCK_START + i * BLOCK_SIZE, BLOCK_START + (i + 1) * BLOCK_SIZE));
  return q as Quad;
}

function setBlocks(buf: Uint8Array, blocks: Quad): void {
  for (let i = 0; i < 4; i++) buf.set(blocks[i]!, BLOCK_START + i * BLOCK_SIZE);
}

export function encryptPk7(decrypted: Uint8Array): Uint8Array {
  const out = decrypted.slice();
  const dv = view(out);
  const ec = dv.getUint32(0x00, true);
  dv.setUint16(0x06, pk7Checksum(out), true);
  setBlocks(out, shuffleByOrder(getBlocks(out), orderIndex(ec)));
  xorRegion(out, ec); // Gen 6/7 cipher is seeded by the EC, not the checksum
  return out;
}

export function decryptPk7(enc: Uint8Array): Uint8Array {
  const out = enc.slice();
  const dv = view(out);
  const ec = dv.getUint32(0x00, true);
  xorRegion(out, ec); // Gen 6/7 cipher is seeded by the EC, not the checksum
  setBlocks(out, unshuffleByOrder(getBlocks(out), orderIndex(ec)));
  return out;
}

export function readSpeciesPk7(decrypted: Uint8Array): number {
  return view(decrypted).getUint16(0x08, true);
}
