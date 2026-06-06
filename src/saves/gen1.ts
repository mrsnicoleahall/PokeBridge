// Gen 1 (Red/Blue/Yellow) save parser — read access to PC boxes (read-only source).
//
// Box layout (1122 bytes): count(1) + species list (20, 0xFF-terminated) + padding(1) + 20×33-byte
// records (data at box+0x16) + 20×11 OT names + 20×11 nicknames. Boxes live at 0x4000 (1–6) and
// 0x6000 (7–12), but we DETECT boxes by structure (species list matches each record's species byte,
// 33 bytes apart) so we don't depend on exact offsets. Records are unencrypted. The species byte is a
// Gen 1 *internal index* (1–190), mapped to National Dex elsewhere.

import { decodeGbText } from '../convert/gb-text';

const BOX_BYTES = 1122;
const MON_BASE = 0x16; // 22 = count(1) + 20 species + padding(1)
const MON_SIZE = 33;
const OTNAME_BASE = 682; // 22 + 20*33
const NICK_BASE = 902; // 682 + 20*11
const NAME_LEN = 11;

export interface Gen1BoxMon {
  internal: number; // Gen 1 internal species index
  data: Uint8Array; // raw 33-byte record
  nickname: string;
  otName: string;
}

function boxCountAt(d: Uint8Array, off: number): number {
  const count = d[off]!;
  if (count < 1 || count > 20) return 0;
  if (d[off + 1 + count] !== 0xff) return 0;
  for (let i = 0; i < count; i++) {
    const listed = d[off + 1 + i]!;
    if (listed < 1 || listed > 190) return 0;
    if (listed !== d[off + MON_BASE + i * MON_SIZE]) return 0;
  }
  return count;
}

export class Gen1Save {
  constructor(private readonly data: Uint8Array) {}

  allBoxMon(): Gen1BoxMon[] {
    const out: Gen1BoxMon[] = [];
    const seen = new Set<string>();
    for (let off = 0; off + BOX_BYTES <= this.data.length; off++) {
      const count = boxCountAt(this.data, off);
      if (!count) continue;
      for (let i = 0; i < count; i++) {
        const start = off + MON_BASE + i * MON_SIZE;
        const data = this.data.slice(start, start + MON_SIZE);
        const key = String.fromCharCode(...data);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          internal: data[0]!,
          data,
          nickname: decodeGbText(this.data, off + NICK_BASE + i * NAME_LEN, NAME_LEN),
          otName: decodeGbText(this.data, off + OTNAME_BASE + i * NAME_LEN, NAME_LEN),
        });
      }
    }
    return out;
  }
}

export function loadGen1(buffer: Uint8Array): Gen1Save {
  if (buffer.length < 0x8000) throw new Error(`expected a Gen 1 save (>=32KB), got ${buffer.length} bytes`);
  return new Gen1Save(buffer);
}
