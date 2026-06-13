// Gen 5 (BW/B2W2) ⇄ Mon codec. Operates on a decrypted 136-byte PK5; the save layer
// (Gen5Save.setBoxSlot) re-encrypts and checksums. Stat order in Gen 4/5 is HP, Atk, Def, Spe, SpA, SpD
// (Speed 4th), so EVs and the IV dword are reordered into the hub's HP, Atk, Def, SpA, SpD, Spe order.

import { PK5_SIZE } from '../codec/pk5';
import { abilitySlotFor } from '../convert/abilities';
import type { Mon } from './mon';

const dvf = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);

function readUtf16(b: Uint8Array, off: number, max: number): string {
  const v = dvf(b);
  let s = '';
  for (let i = 0; i < max; i++) {
    const c = v.getUint16(off + i * 2, true);
    if (c === 0xffff || c === 0x0000) break;
    s += String.fromCharCode(c);
  }
  return s;
}

function writeUtf16(b: Uint8Array, off: number, text: string, max: number): void {
  const v = dvf(b);
  let i = 0;
  for (; i < text.length && i < max; i++) v.setUint16(off + i * 2, text.charCodeAt(i), true);
  v.setUint16(off + i * 2, 0xffff, true);
}

export function gen5ReadMon(pk5: Uint8Array): Mon {
  if (pk5.length !== PK5_SIZE) throw new Error(`expected a ${PK5_SIZE}-byte decrypted PK5`);
  const s = dvf(pk5);
  const species = s.getUint16(0x08, true);
  const iv = s.getUint32(0x38, true);
  const gByte = pk5[0x40]!;
  const abilityId = pk5[0x15]!;
  const hidden = (pk5[0x42]! & 1) === 1;

  return {
    pid: s.getUint32(0x00, true),
    nationalDex: species,
    form: gByte >> 3,
    otName: readUtf16(pk5, 0x68, 8),
    otId: (s.getUint16(0x0c, true) | (s.getUint16(0x0e, true) << 16)) >>> 0,
    nickname: readUtf16(pk5, 0x48, 11),
    language: pk5[0x17]! || 2,
    originGen: 5,
    ivs: [iv & 0x1f, (iv >>> 5) & 0x1f, (iv >>> 10) & 0x1f, (iv >>> 20) & 0x1f, (iv >>> 25) & 0x1f, (iv >>> 15) & 0x1f],
    evs: [pk5[0x18]!, pk5[0x19]!, pk5[0x1a]!, pk5[0x1c]!, pk5[0x1d]!, pk5[0x1b]!],
    moves: [s.getUint16(0x28, true), s.getUint16(0x2a, true), s.getUint16(0x2c, true), s.getUint16(0x2e, true)],
    movePP: [pk5[0x30]!, pk5[0x31]!, pk5[0x32]!, pk5[0x33]!],
    ppUps: [pk5[0x34]!, pk5[0x35]!, pk5[0x36]!, pk5[0x37]!],
    ability: abilityId,
    abilitySlot: hidden ? 2 : abilitySlotFor(species, abilityId),
    nature: pk5[0x41]!,
    gender: gByte & 0x04 ? 2 : gByte & 0x02 ? 1 : 0,
    exp: s.getUint32(0x10, true),
    friendship: pk5[0x14]!,
    heldItem: s.getUint16(0x0a, true),
  };
}

export function gen5WriteMon(mon: Mon): Uint8Array {
  const p = new Uint8Array(PK5_SIZE);
  const d = dvf(p);

  d.setUint32(0x00, mon.pid >>> 0, true);
  d.setUint16(0x08, mon.nationalDex, true);
  // 0x0A held item dropped (item ids differ across gens)
  d.setUint16(0x0c, mon.otId & 0xffff, true);
  d.setUint16(0x0e, (mon.otId >>> 16) & 0xffff, true);
  d.setUint32(0x10, mon.exp >>> 0, true);
  p[0x14] = mon.friendship & 0xff;
  p[0x15] = mon.ability & 0xff;
  p[0x17] = mon.language ?? 2;

  // EVs (Gen 5 order HP, Atk, Def, Spe, SpA, SpD)
  p[0x18] = mon.evs[0]!; p[0x19] = mon.evs[1]!; p[0x1a] = mon.evs[2]!;
  p[0x1b] = mon.evs[5]!; p[0x1c] = mon.evs[3]!; p[0x1d] = mon.evs[4]!;

  for (let i = 0; i < 4; i++) d.setUint16(0x28 + i * 2, mon.moves[i]!, true);
  for (let i = 0; i < 4; i++) p[0x30 + i] = mon.movePP[i]! & 0xff;
  const pu = mon.ppUps ?? [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) p[0x34 + i] = pu[i]! & 0xff;

  // IV dword (HP, Atk, Def, Spe, SpA, SpD) + nicknamed bit (egg left 0)
  const iv =
    (((mon.ivs[0]! & 0x1f)) |
      ((mon.ivs[1]! & 0x1f) << 5) |
      ((mon.ivs[2]! & 0x1f) << 10) |
      ((mon.ivs[5]! & 0x1f) << 15) |
      ((mon.ivs[3]! & 0x1f) << 20) |
      ((mon.ivs[4]! & 0x1f) << 25) |
      (1 << 31)) >>> 0;
  d.setUint32(0x38, iv, true);

  p[0x40] = ((mon.form & 0x1f) << 3) | (mon.gender === 2 ? 0x04 : mon.gender === 1 ? 0x02 : 0x00);
  p[0x41] = mon.nature & 0xff;
  p[0x42] = mon.abilitySlot === 2 ? 1 : 0;

  writeUtf16(p, 0x48, mon.nickname, 11);
  writeUtf16(p, 0x68, mon.otName, 7);
  return p; // checksum set by encryptPk5 on save write
}
