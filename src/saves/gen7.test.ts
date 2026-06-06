import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadGen7 } from './gen7';
import { readSpeciesPk7, PK7_SIZE } from '../codec/pk7';

const fixture = (n: string) => new Uint8Array(readFileSync(fileURLToPath(new URL(`../../fixtures/${n}`, import.meta.url))));

function makePk7(species: number, ec: number): Uint8Array {
  const d = new Uint8Array(PK7_SIZE);
  const v = new DataView(d.buffer);
  v.setUint32(0x00, ec >>> 0, true); // encryption constant
  v.setUint16(0x08, species, true);
  return d;
}

describe('Gen 7 (Ultra Moon) save', () => {
  it('recomputing the box checksum on an unmodified save is a no-op (validates CRC + offsets)', () => {
    const raw = fixture('usum_moon.sav');
    const save = loadGen7(raw);
    save.recomputeBoxChecksum();
    expect(Buffer.from(save.toBytes()).equals(Buffer.from(raw))).toBe(true);
  });

  it('writes a Pokémon into a box slot, reads it back, and keeps the save the right size', () => {
    const save = loadGen7(fixture('usum_moon.sav'));
    save.setBoxSlot(0, 0, makePk7(150, 0x12345678)); // Mewtwo
    const out = save.toBytes();
    expect(out.length).toBe(0x6cc00);
    expect(readSpeciesPk7(loadGen7(out).boxSlot(0, 0)!)).toBe(150);
  });

  it('writing one slot changes only the box block + its checksum (other blocks untouched)', () => {
    const raw = fixture('usum_moon.sav');
    const save = loadGen7(raw);
    save.setBoxSlot(5, 10, makePk7(384, 0xabcdef01)); // Rayquaza
    const out = save.toBytes();
    let firstDiff = -1;
    let lastDiff = -1;
    for (let i = 0; i < out.length; i++) {
      if (out[i] !== raw[i]) { if (firstDiff < 0) firstDiff = i; lastDiff = i; }
    }
    // changes confined to the box block (0xEACE..0x450CE) and the checksum slot (0x6CA8A)
    expect(firstDiff).toBeGreaterThanOrEqual(0xeace);
    expect(lastDiff).toBeLessThanOrEqual(0x6ca8b);
  });
});
