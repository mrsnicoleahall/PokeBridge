// Transfer orchestration — the clean API the UI sits on.
//   listSourceMon : enumerate the Pokémon in a Gen 4/5 save (deduped)
//   convertToGen5 : uplift a decrypted source mon to Gen 5 form (dispatch by source gen)
//   transferToGen5Box : convert + drop into a target Gen 5 save box slot
//
// Source enumeration uses a scan: it works uniformly across DP/Pt/HGSS/BW/B2W2 (same encryption)
// without per-game box-offset tables, and dedup-by-PID folds away the backup-copy duplicates.

import { decryptPk5, pk5Checksum, readSpecies, PK5_SIZE } from '../codec/pk5';
import { convertGen4ToGen5 } from '../convert/gen4to5';
import type { Gen5Save } from '../saves/gen5';

export interface SourceMon {
  offset: number;
  pid: number;
  species: number;
  data: Uint8Array; // decrypted PK4/PK5
}

/** Enumerate valid Pokémon in a Gen 4/5 save, deduped by PID. `maxDex` bounds the source generation. */
export function listSourceMon(saveBytes: Uint8Array, maxDex = 649): SourceMon[] {
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
    out.push({ offset: off, pid, species, data: dec });
  }
  return out;
}

/** Uplift a decrypted source-gen Pokémon to decrypted Gen 5 form. */
export function convertToGen5(sourceGen: number, decrypted: Uint8Array): Uint8Array {
  switch (sourceGen) {
    case 5:
      return decrypted.slice();
    case 4:
      return convertGen4ToGen5(decrypted);
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
  decrypted: Uint8Array,
): void {
  target.setBoxSlot(box, slot, convertToGen5(sourceGen, decrypted));
}
