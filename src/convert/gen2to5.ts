// Gen 2 (GSC) → Gen 5 uplift. Gen 2 records are unencrypted, 32 bytes, big-endian, and store species
// as the National Dex number directly. Gen 1/2 lack a PID, abilities, and natures, so those are
// synthesized; DVs become IVs (2*DV+1). Gen 1/2 "stat experience" is a different system from Gen 5 EVs,
// so EVs reset to 0. Held item and ability need cross-gen data tables → left empty (documented).

import { PK5_SIZE } from '../codec/pk5';
import { dvToIv, gbHpDv, buildIvWord, synthesizePid } from './gb-common';

function writeUtf16(buf: Uint8Array, offset: number, text: string, maxChars: number): void {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let i = 0;
  for (; i < text.length && i < maxChars; i++) v.setUint16(offset + i * 2, text.charCodeAt(i), true);
  v.setUint16(offset + i * 2, 0xffff, true);
}

export function convertGen2ToGen5(rec: Uint8Array, nickname: string, otName: string): Uint8Array {
  if (rec.length !== 32) throw new Error('expected a 32-byte Gen 2 record');
  const pk5 = new Uint8Array(PK5_SIZE);
  const d = new DataView(pk5.buffer);

  const species = rec[0x00]!; // = National Dex
  const otid = (rec[0x06]! << 8) | rec[0x07]!; // big-endian
  const exp = (rec[0x08]! << 16) | (rec[0x09]! << 8) | rec[0x0a]!; // big-endian

  const atkDv = rec[0x15]! >> 4;
  const defDv = rec[0x15]! & 0xf;
  const speDv = rec[0x16]! >> 4;
  const spcDv = rec[0x16]! & 0xf;
  const hpDv = gbHpDv(atkDv, defDv, speDv, spcDv);
  const ivWord = buildIvWord(
    dvToIv(hpDv), dvToIv(atkDv), dvToIv(defDv), dvToIv(speDv), dvToIv(spcDv), dvToIv(spcDv),
  );

  const pid = synthesizePid(otid, (rec[0x15]! << 8) | rec[0x16]!, species);

  d.setUint32(0x00, pid, true);
  d.setUint16(0x08, species, true);
  d.setUint16(0x0c, otid, true);
  d.setUint32(0x10, exp >>> 0, true);
  pk5[0x14] = rec[0x1b]!; // friendship
  pk5[0x17] = 2; // language: ENG default
  // EVs (0x18) left 0 — Gen 1/2 stat-exp doesn't map to Gen 5 EVs
  for (let i = 0; i < 4; i++) d.setUint16(0x28 + i * 2, rec[0x02 + i]!, true); // moves
  for (let i = 0; i < 4; i++) {
    const pp = rec[0x17 + i]!;
    pk5[0x30 + i] = pp & 0x3f; // current PP
    pk5[0x34 + i] = (pp >> 6) & 0x3; // PP ups
  }
  d.setUint32(0x38, (ivWord | (1 << 31)) >>> 0, true); // IVs + nicknamed flag
  pk5[0x41] = pid % 25; // nature

  writeUtf16(pk5, 0x48, nickname, 10); // nickname (Gen 2 stores species name if not renamed)
  writeUtf16(pk5, 0x68, otName, 7); // OT name

  return pk5;
}
