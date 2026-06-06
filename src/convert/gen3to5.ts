// Gen 3 → Gen 5 Pokémon uplift (the Pal Park → Poké Transfer path, collapsed into one step).
//
// PK3 and PK5 are structurally different, so this remaps field by field. What carries cleanly:
// species (via internal→National map), PID, OT ID/secret, experience (=level), friendship, EVs,
// contest stats, moves, PP, PP-ups, IVs, egg flag, nature (PID%25), nickname + OT name (charset→UTF-16),
// poké ball, met level, OT gender.
//
// KNOWN GAPS (documented; don't block in-game box loading, and Nicole doesn't need legality):
//   - held item: item IDs differ across gens → cleared to none.
//   - ability: Gen 5 stores an ability *ID*; resolving it needs a species→ability table → left 0.
// These can be filled later with the relevant data tables.

import { PK5_SIZE } from '../codec/pk5';
import { gen3InternalToNational } from './gen3-species';
import { decodeGen3Text } from './gen3-text';

const dv = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);

function writeUtf16(buf: Uint8Array, offset: number, text: string, maxChars: number): void {
  const v = dv(buf);
  let i = 0;
  for (; i < text.length && i < maxChars; i++) v.setUint16(offset + i * 2, text.charCodeAt(i), true);
  v.setUint16(offset + i * 2, 0xffff, true); // terminator
}

export function convertGen3ToGen5(pk3: Uint8Array): Uint8Array {
  if (pk3.length !== 80) throw new Error('expected an 80-byte decrypted PK3');
  const s = dv(pk3);
  const pk5 = new Uint8Array(PK5_SIZE);
  const d = dv(pk5);

  const pid = s.getUint32(0x00, true);
  const otid = s.getUint32(0x04, true);

  d.setUint32(0x00, pid, true); // PID
  d.setUint16(0x08, gen3InternalToNational(s.getUint16(0x20, true)), true); // species (National Dex)
  // 0x0A held item: left 0 (item IDs differ across generations)
  d.setUint16(0x0c, otid & 0xffff, true); // OT ID
  d.setUint16(0x0e, (otid >>> 16) & 0xffff, true); // OT secret ID
  d.setUint32(0x10, s.getUint32(0x24, true), true); // experience (carries the level)
  pk5[0x14] = pk3[0x29]!; // friendship
  // 0x15 ability ID: left 0 (needs a species→ability table)
  pk5[0x16] = pk3[0x1b]!; // markings
  pk5[0x17] = pk3[0x12]! || 2; // language (Gen 3 codes match Gen 5; default ENG)
  pk5.set(pk3.slice(0x38, 0x3e), 0x18); // EVs (HP, Atk, Def, Spe, SpA, SpD)
  pk5.set(pk3.slice(0x3e, 0x44), 0x1e); // contest stats

  for (let i = 0; i < 4; i++) d.setUint16(0x28 + i * 2, s.getUint16(0x2c + i * 2, true), true); // moves
  for (let i = 0; i < 4; i++) pk5[0x30 + i] = pk3[0x34 + i]!; // current PP
  const ppUps = pk3[0x28]!; // Gen 3 packs 2 bits/move; Gen 5 uses one byte each
  for (let i = 0; i < 4; i++) pk5[0x34 + i] = (ppUps >> (i * 2)) & 0x3;

  const gen3iv = s.getUint32(0x48, true);
  const isEgg = (gen3iv >>> 30) & 1;
  d.setUint32(0x38, ((gen3iv & 0x3fffffff) | (isEgg << 30) | (1 << 31)) >>> 0, true); // IVs + egg + nicknamed

  pk5[0x41] = pid % 25; // Gen 5 nature byte
  pk5[0x42] = 0; // no hidden ability

  writeUtf16(pk5, 0x48, decodeGen3Text(pk3, 0x08, 10), 10); // nickname
  writeUtf16(pk5, 0x68, decodeGen3Text(pk3, 0x14, 7), 7); // OT name

  const origins = s.getUint16(0x46, true);
  pk5[0x83] = (origins >> 11) & 0xf; // poké ball
  pk5[0x84] = (origins & 0x7f) | (((origins >> 15) & 1) << 7); // met level + OT gender

  return pk5;
}
