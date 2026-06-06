import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadGen1 } from './gen1';
import { gen1InternalToNational } from '../convert/gen1-species';

const fixture = (n: string) => new Uint8Array(readFileSync(fileURLToPath(new URL(`../../fixtures/${n}`, import.meta.url))));

describe('Gen 1 (RBY) save parser', () => {
  it('reads the complete Blue living dex (151 species, all mapping to National 1..151)', () => {
    const mon = loadGen1(fixture('gen1_blue.sav')).allBoxMon();
    const nationals = new Set<number>();
    for (const m of mon) {
      const n = gen1InternalToNational(m.internal);
      if (n) nationals.add(n);
    }
    expect(nationals.size).toBe(151);
    expect(nationals.has(1)).toBe(true); // Bulbasaur
    expect(nationals.has(151)).toBe(true); // Mew
  });

  it('each record is 33 bytes', () => {
    expect(loadGen1(fixture('gen1_blue.sav')).allBoxMon()[0]!.data.length).toBe(33);
  });
});
