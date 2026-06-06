// Gen 1 (RBY) → Gen 5 uplift. Gen 1 records are unencrypted, 33 bytes, big-endian, and store a
// scrambled internal species index (mapped to National Dex). Gen 1 has no PID/ability/nature/held
// item/friendship — PID is synthesized, nature derived from it, friendship set to a neutral default,
// DVs become IVs (2*DV+1, Special filling both Sp.Atk/Sp.Def). EVs reset (Gen 1 stat-exp differs).

import { PK5_SIZE } from '../codec/pk5';
import { dvToIv, gbHpDv, buildIvWord, synthesizePid } from './gb-common';
import { gen1InternalToNational } from './gen1-species';

function writeUtf16(buf: Uint8Array, offset: number, text: string, maxChars: number): void {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let i = 0;
  for (; i < text.length && i < maxChars; i++) v.setUint16(offset + i * 2, text.charCodeAt(i), true);
  v.setUint16(offset + i * 2, 0xffff, true);
}

export function convertGen1ToGen5(rec: Uint8Array, nickname: string, otName: string): Uint8Array {
  if (rec.length !== 33) throw new Error('expected a 33-byte Gen 1 record');
  const pk5 = new Uint8Array(PK5_SIZE);
  const d = new DataView(pk5.buffer);

  const national = gen1InternalToNational(rec[0x00]!);
  const otid = (rec[0x0c]! << 8) | rec[0x0d]!; // big-endian
  const exp = (rec[0x0e]! << 16) | (rec[0x0f]! << 8) | rec[0x10]!; // big-endian

  const atkDv = rec[0x1b]! >> 4;
  const defDv = rec[0x1b]! & 0xf;
  const speDv = rec[0x1c]! >> 4;
  const spcDv = rec[0x1c]! & 0xf;
  const hpDv = gbHpDv(atkDv, defDv, speDv, spcDv);
  const ivWord = buildIvWord(
    dvToIv(hpDv), dvToIv(atkDv), dvToIv(defDv), dvToIv(speDv), dvToIv(spcDv), dvToIv(spcDv),
  );

  const pid = synthesizePid(otid, (rec[0x1b]! << 8) | rec[0x1c]!, national);

  d.setUint32(0x00, pid, true);
  d.setUint16(0x08, national, true);
  d.setUint16(0x0c, otid, true);
  d.setUint32(0x10, exp >>> 0, true);
  pk5[0x14] = 70; // neutral base friendship (Gen 1 has none)
  pk5[0x17] = 2; // language: ENG default
  for (let i = 0; i < 4; i++) d.setUint16(0x28 + i * 2, rec[0x08 + i]!, true); // moves
  for (let i = 0; i < 4; i++) {
    const pp = rec[0x1d + i]!;
    pk5[0x30 + i] = pp & 0x3f; // current PP
    pk5[0x34 + i] = (pp >> 6) & 0x3; // PP ups
  }
  d.setUint32(0x38, (ivWord | (1 << 31)) >>> 0, true); // IVs + nicknamed flag
  pk5[0x41] = pid % 25; // nature

  writeUtf16(pk5, 0x48, nickname, 10);
  writeUtf16(pk5, 0x68, otName, 7);

  return pk5;
}
