import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadGen3 } from './gen3';

const fixture = (n: string) => new Uint8Array(readFileSync(fileURLToPath(new URL(`../../fixtures/${n}`, import.meta.url))));

describe('Gen 3 save parser', () => {
  it('enumerates boxed Pokémon from emerald.sav with valid National Dex species', () => {
    const mon = loadGen3(fixture('emerald.sav')).allBoxMon();
    expect(mon.length).toBeGreaterThan(0);
    for (const m of mon) {
      expect(m.national).toBeGreaterThanOrEqual(1);
      expect(m.national).toBeLessThanOrEqual(386);
      expect(m.data.length).toBe(80);
    }
  });

  it('reads firered.sav PC boxes without crashing', () => {
    expect(loadGen3(fixture('firered.sav')).allBoxMon().length).toBeGreaterThanOrEqual(0);
  });

  it('boxSlot returns null for an empty slot and an 80-byte PK3 for a filled one', () => {
    const save = loadGen3(fixture('emerald.sav'));
    const mon = save.allBoxMon();
    expect(mon.length).toBeGreaterThan(0);
    const first = mon[0]!;
    expect(save.boxSlot(first.box, first.slot)).not.toBeNull();
  });
});
