import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gen3InternalToNational } from './gen3-species';
import { PK3_SIZE, decryptPk3, pk3Checksum, readSpeciesPk3Internal } from '../codec/pk3';

const fixture = (n: string) => new Uint8Array(readFileSync(fileURLToPath(new URL(`../../fixtures/${n}`, import.meta.url))));

describe('Gen 3 internal → National Dex', () => {
  it('maps Kanto/Johto species 1:1 (internal 1..251)', () => {
    expect(gen3InternalToNational(1)).toBe(1); // Bulbasaur
    expect(gen3InternalToNational(151)).toBe(151); // Mew
    expect(gen3InternalToNational(251)).toBe(251); // Celebi
  });

  it('maps Hoenn (internal 277..411) to National 252..386', () => {
    expect(gen3InternalToNational(277)).toBe(252); // Treecko
    expect(gen3InternalToNational(283)).toBe(258); // Mudkip
    expect(gen3InternalToNational(409)).toBe(384); // Rayquaza
    expect(gen3InternalToNational(411)).toBe(386); // Deoxys
  });

  it('returns 0 for the unused internal range and out-of-range values', () => {
    expect(gen3InternalToNational(0)).toBe(0);
    expect(gen3InternalToNational(252)).toBe(0);
    expect(gen3InternalToNational(276)).toBe(0);
    expect(gen3InternalToNational(412)).toBe(0);
  });

  it('every real Pokémon in emerald.sav maps to a valid National Dex number (1..386)', () => {
    const sav = fixture('emerald.sav');
    const dv = new DataView(sav.buffer, sav.byteOffset, sav.byteLength);
    let count = 0;
    for (let off = 0; off + PK3_SIZE <= sav.length; off += 4) {
      const stored = dv.getUint16(off + 0x1c, true);
      if (stored === 0) continue;
      const dec = decryptPk3(sav.subarray(off, off + PK3_SIZE));
      if (pk3Checksum(dec) !== stored) continue;
      const internal = readSpeciesPk3Internal(dec);
      if (internal < 1 || internal > 411) continue;
      const national = gen3InternalToNational(internal);
      expect(national).toBeGreaterThanOrEqual(1);
      expect(national).toBeLessThanOrEqual(386);
      count++;
    }
    expect(count).toBeGreaterThan(0);
  });
});
