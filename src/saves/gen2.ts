// Gen 2 (Gold/Silver/Crystal) save parser — read access to PC boxes (read-only source).
//
// Gen 2 box layout (per box, 1102 bytes): count(1) + species list (count entries + 0xFF) + 20×32-byte
// Pokémon records (mon data starts at box+0x16) + OT names + nicknames. Boxes live in banks around
// 0x4000/0x6000, but the exact offsets differ between Gold/Silver and Crystal — so rather than hardcode
// them, we DETECT boxes by structure: a real box's species list matches the species byte of each record
// 32 bytes apart. Gen 2 stores species as the National Dex number directly (1–251), and records are not
// encrypted.

import { decodeGbText } from '../convert/gb-text';

const BOX_BYTES = 1102;
const MON_BASE = 0x16; // 22: after count(1) + 20 species + 0xFF
const MON_SIZE = 32;
const OTNAME_BASE = 662; // 22 + 20*32
const NICK_BASE = 882; // 662 + 20*11
const NAME_LEN = 11;

export interface Gen2BoxMon {
  species: number; // National Dex (Gen 2 stores dex number directly)
  data: Uint8Array; // raw 32-byte record
  nickname: string;
  otName: string;
}

function isBoxAt(d: Uint8Array, off: number): number {
  const count = d[off]!;
  if (count < 1 || count > 20) return 0;
  if (d[off + 1 + count] !== 0xff) return 0; // species-list terminator
  for (let i = 0; i < count; i++) {
    const listed = d[off + 1 + i]!;
    if (listed < 1 || listed > 251) return 0;
    if (listed !== d[off + MON_BASE + i * MON_SIZE]) return 0; // list must match record species
  }
  return count;
}

export class Gen2Save {
  constructor(private readonly data: Uint8Array) {}

  allBoxMon(): Gen2BoxMon[] {
    const out: Gen2BoxMon[] = [];
    const seen = new Set<string>();
    for (let off = 0; off + BOX_BYTES <= this.data.length; off++) {
      const count = isBoxAt(this.data, off);
      if (!count) continue;
      for (let i = 0; i < count; i++) {
        const start = off + MON_BASE + i * MON_SIZE;
        const data = this.data.slice(start, start + MON_SIZE);
        const key = String.fromCharCode(...data);
        if (seen.has(key)) continue; // fold away backup-copy duplicates
        seen.add(key);
        out.push({
          species: data[0]!,
          data,
          nickname: decodeGbText(this.data, off + NICK_BASE + i * NAME_LEN, NAME_LEN),
          otName: decodeGbText(this.data, off + OTNAME_BASE + i * NAME_LEN, NAME_LEN),
        });
      }
    }
    return out;
  }
}

export function loadGen2(buffer: Uint8Array): Gen2Save {
  if (buffer.length < 0x8000) throw new Error(`expected a Gen 2 save (>=32KB), got ${buffer.length} bytes`);
  return new Gen2Save(buffer);
}
