// Gen 7 (Ultra Sun/Ultra Moon) ⇄ Mon codec. Operates on a decrypted 232-byte PK7; the save layer
// (Gen7Save) re-encrypts and checksums. Gen 6/7 already use the hub's stat order (HP, Atk, Def, SpA,
// SpD, Spe), so EVs and the IV dword map straight across. PK7 carries a separate encryption constant.

import { PK7_SIZE } from '../codec/pk7';
import type { Mon } from './mon';

const dvf = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);

function readUtf16(b: Uint8Array, off: number, max: number): string {
  const v = dvf(b);
  let s = '';
  for (let i = 0; i < max; i++) {
    const c = v.getUint16(off + i * 2, true);
    if (c === 0x0000 || c === 0xffff) break;
    s += String.fromCharCode(c);
  }
  return s;
}

function writeUtf16(b: Uint8Array, off: number, text: string, max: number): void {
  const v = dvf(b);
  let i = 0;
  for (; i < text.length && i < max; i++) v.setUint16(off + i * 2, text.charCodeAt(i), true);
  v.setUint16(off + i * 2, 0x0000, true); // Gen 6/7 names are null-terminated
}

export function gen7ReadMon(pk7: Uint8Array): Mon {
  if (pk7.length !== PK7_SIZE) throw new Error(`expected a ${PK7_SIZE}-byte decrypted PK7`);
  const s = dvf(pk7);
  const iv = s.getUint32(0x74, true);
  const fg = pk7[0x1d]!;
  const abilityNumber = pk7[0x15]!;

  return {
    pid: s.getUint32(0x18, true),
    encryptionConstant: s.getUint32(0x00, true),
    nationalDex: s.getUint16(0x08, true),
    form: fg >> 3,
    otName: readUtf16(pk7, 0xb0, 12),
    otId: (s.getUint16(0x0c, true) | (s.getUint16(0x0e, true) << 16)) >>> 0,
    nickname: readUtf16(pk7, 0x40, 12),
    language: pk7[0xe3]! || 2,
    originGen: 7,
    ivs: [iv & 0x1f, (iv >>> 5) & 0x1f, (iv >>> 10) & 0x1f, (iv >>> 15) & 0x1f, (iv >>> 20) & 0x1f, (iv >>> 25) & 0x1f],
    evs: [pk7[0x1e]!, pk7[0x1f]!, pk7[0x20]!, pk7[0x21]!, pk7[0x22]!, pk7[0x23]!],
    moves: [s.getUint16(0x5a, true), s.getUint16(0x5c, true), s.getUint16(0x5e, true), s.getUint16(0x60, true)],
    movePP: [pk7[0x62]!, pk7[0x63]!, pk7[0x64]!, pk7[0x65]!],
    ppUps: [pk7[0x66]!, pk7[0x67]!, pk7[0x68]!, pk7[0x69]!],
    ability: pk7[0x14]!,
    abilitySlot: abilityNumber === 4 ? 2 : abilityNumber === 2 ? 1 : 0,
    nature: pk7[0x1c]!,
    gender: (fg >> 1) & 3,
    exp: s.getUint32(0x10, true),
    friendship: pk7[0xca]!,
  };
}

export function gen7WriteMon(mon: Mon): Uint8Array {
  const p = new Uint8Array(PK7_SIZE);
  const d = dvf(p);

  d.setUint32(0x00, (mon.encryptionConstant ?? mon.pid) >>> 0, true); // EC (= PID for pre-Gen 6 origins)
  d.setUint16(0x08, mon.nationalDex, true);
  d.setUint16(0x0c, mon.otId & 0xffff, true);
  d.setUint16(0x0e, (mon.otId >>> 16) & 0xffff, true);
  d.setUint32(0x10, mon.exp >>> 0, true);
  p[0x14] = mon.ability & 0xff;
  p[0x15] = mon.abilitySlot === 2 ? 4 : (mon.abilitySlot ?? 0) + 1; // ability number (1/2/4)
  d.setUint32(0x18, mon.pid >>> 0, true);
  p[0x1c] = mon.nature & 0xff;
  p[0x1d] = ((mon.form & 0x1f) << 3) | ((mon.gender & 3) << 1);

  for (let i = 0; i < 6; i++) p[0x1e + i] = mon.evs[i]!; // EVs (hub order = Gen 7 order)

  for (let i = 0; i < 4; i++) d.setUint16(0x5a + i * 2, mon.moves[i]!, true);
  for (let i = 0; i < 4; i++) p[0x62 + i] = mon.movePP[i]! & 0xff;
  const pu = mon.ppUps ?? [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) p[0x66 + i] = pu[i]! & 0xff;

  let iv = 0;
  for (let i = 0; i < 6; i++) iv |= (mon.ivs[i]! & 0x1f) << (i * 5); // hub order = Gen 7 order
  iv = (iv | (1 << 31)) >>> 0; // nicknamed bit (egg left 0)
  d.setUint32(0x74, iv, true);

  writeUtf16(p, 0x40, mon.nickname, 12);
  writeUtf16(p, 0xb0, mon.otName, 12);
  p[0xa2] = mon.friendship & 0xff; // OT friendship
  p[0xca] = mon.friendship & 0xff; // current friendship
  p[0xe3] = mon.language ?? 2;
  p[0xdf] = 33; // version of origin: Ultra Moon (kept non-zero)
  return p; // checksum handled by the Gen 7 save layer
}
