// Gen 3 (Ruby/Sapphire/Emerald/FireRed/LeafGreen) Pokémon codec — DECODE ONLY (Gen 3 is a read-only source).
//
// 80-byte PK3:
//   0x00 PID (u32)
//   0x04 OT ID (u32)
//   0x1C checksum (u16) — sum of the 16-bit words of the *decrypted* data region
//   0x20..0x4F  four 12-byte substructures (Growth, Attacks, EVs, Misc), order = PID % 24
//
// The data region is XOR-encrypted with key = (OT ID ^ PID) and the four substructures are shuffled
// by PID % 24. The species is the first u16 of the (canonical) Growth substructure — note this is the
// Gen 3 *internal* species index, not the National Dex number.

import { unshuffleByOrder } from './shuffle';

export const PK3_SIZE = 80;
const DATA = 0x20;
const DATA_END = 0x50;
const SUB = 12;

const view = (b: Uint8Array): DataView => new DataView(b.buffer, b.byteOffset, b.byteLength);

export function decryptPk3(enc: Uint8Array): Uint8Array {
  const out = enc.slice();
  const dv = view(out);
  const pid = dv.getUint32(0x00, true);
  const otid = dv.getUint32(0x04, true);
  const key = (otid ^ pid) >>> 0;

  for (let off = DATA; off < DATA_END; off += 4) {
    dv.setUint32(off, (dv.getUint32(off, true) ^ key) >>> 0, true);
  }

  const subs = [0, 1, 2, 3].map((i) => out.slice(DATA + i * SUB, DATA + (i + 1) * SUB)) as [
    Uint8Array, Uint8Array, Uint8Array, Uint8Array,
  ];
  const canonical = unshuffleByOrder(subs, pid % 24);
  for (let i = 0; i < 4; i++) out.set(canonical[i]!, DATA + i * SUB);
  return out;
}

/** Sum of the 16-bit words of the decrypted data region (matches the stored field at 0x1C). */
export function pk3Checksum(decrypted: Uint8Array): number {
  const dv = view(decrypted);
  let sum = 0;
  for (let off = DATA; off < DATA_END; off += 2) sum = (sum + dv.getUint16(off, true)) & 0xffff;
  return sum;
}

/** Gen 3 *internal* species index (needs an internal→National map before use as a dex number). */
export function readSpeciesPk3Internal(decrypted: Uint8Array): number {
  return view(decrypted).getUint16(DATA, true);
}
