import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadGen2 } from './gen2';

const fixture = (n: string) => new Uint8Array(readFileSync(fileURLToPath(new URL(`../../fixtures/${n}`, import.meta.url))));

describe('Gen 2 (GSC) save parser', () => {
  it('enumerates a living dex of boxed Pokémon from Crystal (species = National Dex)', () => {
    const mon = loadGen2(fixture('gen2_crystal.sav')).allBoxMon();
    expect(mon.length).toBeGreaterThan(200); // RoC living dex ≈ 251
    const species = new Set(mon.map((m) => m.species));
    for (const s of species) {
      expect(s).toBeGreaterThanOrEqual(1);
      expect(s).toBeLessThanOrEqual(251);
    }
    // a complete-ish dex should include Bulbasaur(1), Pikachu(25), Mewtwo(150), Celebi(251)
    expect(species.has(1)).toBe(true);
    expect(species.has(251)).toBe(true);
  });

  it('each entry is a 32-byte boxed Pokémon record', () => {
    const mon = loadGen2(fixture('gen2_crystal.sav')).allBoxMon();
    expect(mon[0]!.data.length).toBe(32);
  });
});
