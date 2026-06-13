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

describe('Gen 3 save writer (down-transfer destination)', () => {
  const dv = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);

  it('no-op oracle: load → toBytes → reload preserves every boxed mon', () => {
    const save = loadGen3(fixture('emerald.sav'));
    const before = save.allBoxMon();
    const reloaded = loadGen3(save.toBytes()).allBoxMon();
    expect(reloaded.length).toBe(before.length);
    for (let i = 0; i < before.length; i++) {
      expect(reloaded[i]!.national).toBe(before[i]!.national);
      expect(Array.from(reloaded[i]!.data)).toEqual(Array.from(before[i]!.data));
    }
  });

  it('writes a mon into a box slot; it reads back identically after reload', () => {
    const save = loadGen3(fixture('emerald.sav'));
    const src = save.allBoxMon()[0]!; // a real, fully-formed PK3
    save.setBoxSlot(13, 29, src.data); // last box, last slot
    const written = loadGen3(save.toBytes()).boxSlot(13, 29);
    expect(written).not.toBeNull();
    expect(dv(written!).getUint32(0x00, true)).toBe(dv(src.data).getUint32(0x00, true)); // same PID
    expect(Array.from(written!)).toEqual(Array.from(src.data)); // same decrypted bytes
  });

  it('writes a mon across a section boundary (slot straddles two 3968-byte sections)', () => {
    // PC byte offset of box 1 slot 19 = 4 + (49)*80 = 3924; +80 = 4004 > 3968 → straddles sections 5 and 6.
    const save = loadGen3(fixture('emerald.sav'));
    const src = save.allBoxMon()[0]!;
    save.setBoxSlot(1, 19, src.data);
    const written = loadGen3(save.toBytes()).boxSlot(1, 19);
    expect(written).not.toBeNull();
    expect(Array.from(written!)).toEqual(Array.from(src.data));
  });

  it('cleared slot reads back as empty', () => {
    const save = loadGen3(fixture('emerald.sav'));
    save.setBoxSlot(13, 28, save.allBoxMon()[0]!.data);
    save.clearBoxSlot(13, 28);
    expect(loadGen3(save.toBytes()).boxSlot(13, 28)).toBeNull();
  });
});
