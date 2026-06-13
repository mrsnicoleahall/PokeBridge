import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadGen4 } from './gen4';

const fixture = (n: string) => new Uint8Array(readFileSync(fileURLToPath(new URL(`../../fixtures/${n}`, import.meta.url))));

function firstFilled(save: ReturnType<typeof loadGen4>): { box: number; slot: number } {
  for (let box = 0; box < save.boxCount; box++) {
    for (let slot = 0; slot < 30; slot++) if (save.boxSlot(box, slot)) return { box, slot };
  }
  throw new Error('no mon found');
}
function firstEmpty(save: ReturnType<typeof loadGen4>): { box: number; slot: number } {
  for (let box = 0; box < save.boxCount; box++) {
    for (let slot = 0; slot < 30; slot++) if (!save.boxSlot(box, slot)) return { box, slot };
  }
  throw new Error('save full');
}

describe('Gen 4 save (DP/Pt/HGSS)', () => {
  it('auto-detects the game from the save', () => {
    expect(loadGen4(fixture('diamond.sav')).game).toBe('dp');
    expect(loadGen4(fixture('soulsilver.sav')).game).toBe('hgss');
  });

  it('no-op oracle: load → toBytes is byte-identical (validates checksum + offsets)', () => {
    for (const f of ['diamond.sav', 'soulsilver.sav']) {
      const raw = fixture(f);
      expect(Buffer.from(loadGen4(raw).toBytes()).equals(Buffer.from(raw))).toBe(true);
    }
  });

  it('reads boxed Pokémon with valid Gen 4 species', () => {
    const save = loadGen4(fixture('diamond.sav'));
    const spot = firstFilled(save);
    const mon = save.boxSlot(spot.box, spot.slot)!;
    expect(mon.length).toBe(136);
    const species = mon[0x08]! | (mon[0x09]! << 8);
    expect(species).toBeGreaterThanOrEqual(1);
    expect(species).toBeLessThanOrEqual(493);
  });

  it('writes a mon into a box slot; it reads back identically after reload', () => {
    const save = loadGen4(fixture('soulsilver.sav'));
    const src = save.boxSlot(firstFilled(save).box, firstFilled(save).slot)!;
    const spot = firstEmpty(save);
    save.setBoxSlot(spot.box, spot.slot, src);
    const reloaded = loadGen4(save.toBytes());
    const back = reloaded.boxSlot(spot.box, spot.slot);
    expect(back).not.toBeNull();
    expect(Array.from(back!)).toEqual(Array.from(src));
  });
});
