// Transfer orchestration — the clean API the UI sits on.
//   listSourceMon : enumerate the Pokémon in a Gen 4/5 save (deduped)
//   convertToGen5 : uplift a decrypted source mon to Gen 5 form (dispatch by source gen)
//   transferToGen5Box : convert + drop into a target Gen 5 save box slot
//
// Source enumeration uses a scan: it works uniformly across DP/Pt/HGSS/BW/B2W2 (same encryption)
// without per-game box-offset tables, and dedup-by-PID folds away the backup-copy duplicates.

import { decryptPk5, pk5Checksum, readSpecies, readNickname, PK5_SIZE } from '../codec/pk5';
import { convertGen4ToGen5 } from '../convert/gen4to5';
import { convertGen3ToGen5 } from '../convert/gen3to5';
import { convertGen2ToGen5 } from '../convert/gen2to5';
import { convertGen1ToGen5 } from '../convert/gen1to5';
import { gen1InternalToNational } from '../convert/gen1-species';
import { normalizeSave } from '../saves/normalize';
import { loadGen3 } from '../saves/gen3';
import { loadGen2 } from '../saves/gen2';
import { loadGen1 } from '../saves/gen1';
import type { Gen5Save } from '../saves/gen5';

export interface SourceMon {
  offset: number;
  pid: number;
  species: number; // National Dex
  data: Uint8Array; // raw source-gen record (PK1/PK2/PK3 or decrypted PK4/PK5)
  nickname: string;
  otName: string;
}

/** Extra fields some source gens (1/2) need for conversion but don't store inside the record. */
export interface ConvertOpts {
  nickname?: string;
  otName?: string;
}

/** Enumerate valid Pokémon in a Gen 4/5 save, deduped by PID. `maxDex` bounds the source generation. */
export function listSourceMon(rawBytes: Uint8Array, maxDex = 649): SourceMon[] {
  const saveBytes = normalizeSave(rawBytes); // tolerate emulator footers
  const dv = new DataView(saveBytes.buffer, saveBytes.byteOffset, saveBytes.byteLength);
  const out: SourceMon[] = [];
  const seen = new Set<number>();
  for (let off = 0; off + PK5_SIZE <= saveBytes.length; off += 4) {
    const checksum = dv.getUint16(off + 0x06, true);
    if (checksum === 0) continue;
    const dec = decryptPk5(saveBytes.subarray(off, off + PK5_SIZE));
    if (pk5Checksum(dec) !== checksum) continue;
    const species = readSpecies(dec);
    if (species < 1 || species > maxDex) continue;
    const pid = dv.getUint32(off, true) >>> 0;
    if (seen.has(pid)) continue;
    seen.add(pid);
    out.push({ offset: off, pid, species, data: dec, nickname: readNickname(dec), otName: '' });
  }
  return out;
}

/** Enumerate the transferable Pokémon in a save, dispatching by source generation. */
export function readSource(rawBytes: Uint8Array, sourceGen: number): SourceMon[] {
  if (sourceGen === 1) {
    return loadGen1(rawBytes).allBoxMon()
      .map((m) => ({ offset: 0, pid: 0, species: gen1InternalToNational(m.internal), data: m.data, nickname: m.nickname, otName: m.otName }))
      .filter((m) => m.species >= 1 && m.species <= 151);
  }
  if (sourceGen === 2) {
    return loadGen2(rawBytes).allBoxMon()
      .map((m) => ({ offset: 0, pid: 0, species: m.species, data: m.data, nickname: m.nickname, otName: m.otName }));
  }
  if (sourceGen === 3) {
    return loadGen3(rawBytes).allBoxMon().map((m) => ({
      offset: 0,
      pid: new DataView(m.data.buffer, m.data.byteOffset).getUint32(0x00, true) >>> 0,
      species: m.national,
      data: m.data,
      nickname: '',
      otName: '',
    }));
  }
  // Gen 4/5 share the encryption, so a scan reads them; bound species by the source generation.
  return listSourceMon(rawBytes, sourceGen === 4 ? 493 : 649);
}

/** Uplift a source-gen Pokémon record to a decrypted Gen 5 form. */
export function convertToGen5(sourceGen: number, data: Uint8Array, opts: ConvertOpts = {}): Uint8Array {
  switch (sourceGen) {
    case 5:
      return data.slice();
    case 4:
      return convertGen4ToGen5(data);
    case 3:
      return convertGen3ToGen5(data);
    case 2:
      return convertGen2ToGen5(data, opts.nickname ?? '', opts.otName ?? '');
    case 1:
      return convertGen1ToGen5(data, opts.nickname ?? '', opts.otName ?? '');
    default:
      throw new Error(`Gen ${sourceGen} → 5 conversion not implemented yet`);
  }
}

/** Convert a chosen source mon and write it into a target Gen 5 save box/slot. */
export function transferToGen5Box(
  target: Gen5Save,
  box: number,
  slot: number,
  sourceGen: number,
  data: Uint8Array,
  opts: ConvertOpts = {},
): void {
  target.setBoxSlot(box, slot, convertToGen5(sourceGen, data, opts));
}
