// PK5 → PK7 uplift. Everything in the pipeline already becomes a Gen 5 Pokémon, so this one step
// carries any source into Gen 6/7 form. Gen 6/7 reorganized the record (232 bytes, separate encryption
// constant, PID at 0x18) and changed the stat order to HP, Atk, Def, SpA, SpD, Spe (Speed moved last) —
// so EVs and IVs are reordered. Held item is dropped (item IDs differ); ability id carries over.

import { PK7_SIZE } from '../codec/pk7';

const STAT_REORDER = [0, 1, 2, 4, 5, 3]; // Gen 5 [HP,Atk,Def,Spe,SpA,SpD] index for each Gen 7 slot

function copyName(src: Uint8Array, srcOff: number, dst: Uint8Array, dstOff: number, maxChars: number): void {
  const sv = new DataView(src.buffer, src.byteOffset, src.byteLength);
  const dv = new DataView(dst.buffer, dst.byteOffset, dst.byteLength);
  let i = 0;
  for (; i < maxChars; i++) {
    const c = sv.getUint16(srcOff + i * 2, true);
    if (c === 0xffff || c === 0x0000) break;
    dv.setUint16(dstOff + i * 2, c, true);
  }
  dv.setUint16(dstOff + i * 2, 0x0000, true); // Gen 6/7 names are null-terminated
}

export function convertPk5ToPk7(pk5: Uint8Array): Uint8Array {
  const s = new DataView(pk5.buffer, pk5.byteOffset, pk5.byteLength);
  const pk7 = new Uint8Array(PK7_SIZE);
  const d = new DataView(pk7.buffer);

  const pid = s.getUint32(0x00, true);
  d.setUint32(0x00, pid, true); // encryption constant = PID
  d.setUint16(0x08, s.getUint16(0x08, true), true); // species
  d.setUint16(0x0c, s.getUint16(0x0c, true), true); // TID
  d.setUint16(0x0e, s.getUint16(0x0e, true), true); // SID
  d.setUint32(0x10, s.getUint32(0x10, true), true); // experience
  pk7[0x14] = pk5[0x15]!; // ability id
  pk7[0x15] = 1; // ability number (slot)
  d.setUint32(0x18, pid, true); // PID
  pk7[0x1c] = pk5[0x41]!; // nature

  for (let i = 0; i < 6; i++) pk7[0x1e + i] = pk5[0x18 + STAT_REORDER[i]!]!; // EVs (reordered)

  for (let i = 0; i < 4; i++) d.setUint16(0x5a + i * 2, s.getUint16(0x28 + i * 2, true), true); // moves
  for (let i = 0; i < 4; i++) pk7[0x62 + i] = pk5[0x30 + i]!; // current PP
  for (let i = 0; i < 4; i++) pk7[0x66 + i] = pk5[0x34 + i]!; // PP ups

  const iv5 = s.getUint32(0x38, true);
  const get5 = (n: number) => (iv5 >>> (n * 5)) & 31;
  let iv7 = 0;
  for (let i = 0; i < 6; i++) iv7 |= (get5(STAT_REORDER[i]!) & 31) << (i * 5);
  iv7 |= ((iv5 >>> 30) & 1) << 30; // is-egg
  iv7 |= ((iv5 >>> 31) & 1) << 31; // is-nicknamed
  d.setUint32(0x74, iv7 >>> 0, true);

  copyName(pk5, 0x48, pk7, 0x40, 12); // nickname
  copyName(pk5, 0x68, pk7, 0xb0, 12); // OT name

  pk7[0xa2] = pk5[0x14]!; // OT friendship
  pk7[0xca] = pk5[0x14]!; // current friendship
  pk7[0xe3] = pk5[0x17]! || 2; // language (default ENG)
  pk7[0xdf] = 33; // version of origin: Ultra Moon (kept non-zero)
  return pk7;
}
