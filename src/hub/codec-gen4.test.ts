import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadGen4 } from '../saves/gen4';
import { gen4ReadMon, gen4WriteMon } from './codec-gen4';
import type { Mon } from './mon';

const fixture = (n: string) => new Uint8Array(readFileSync(fileURLToPath(new URL(`../../fixtures/${n}`, import.meta.url))));

function firstRealPk4(file: string): Uint8Array {
  const save = loadGen4(fixture(file));
  for (let box = 0; box < save.boxCount; box++) {
    for (let slot = 0; slot < 30; slot++) {
      const m = save.boxSlot(box, slot);
      if (m) return m;
    }
  }
  throw new Error(`no mon in ${file}`);
}

const carried: (keyof Mon)[] = [
  'pid', 'nationalDex', 'form', 'otId', 'nickname', 'otName', 'ivs', 'evs', 'moves',
  'movePP', 'ppUps', 'ability', 'abilitySlot', 'nature', 'gender', 'exp', 'friendship', 'language',
];

describe('Gen 4 ⇄ Mon codec', () => {
  it('round-trips a real Diamond mon through the hub (all carried fields)', () => {
    const m1 = gen4ReadMon(firstRealPk4('diamond.sav'));
    const m2 = gen4ReadMon(gen4WriteMon(m1));
    for (const k of carried) expect(m2[k]).toEqual(m1[k]);
    expect(m1.nature).toBe(m1.pid % 25); // Gen 4 nature is PID-derived
  });

  it('round-trips a real SoulSilver mon through the hub', () => {
    const m1 = gen4ReadMon(firstRealPk4('soulsilver.sav'));
    const m2 = gen4ReadMon(gen4WriteMon(m1));
    for (const k of carried) expect(m2[k]).toEqual(m1[k]);
  });

  it('write produces a slot the Gen 4 save layer accepts and reads back', () => {
    const save = loadGen4(fixture('diamond.sav'));
    const m1 = gen4ReadMon(firstRealPk4('diamond.sav'));
    // write into box 17 slot 29 (out of the way) and confirm the species survives reload
    save.setBoxSlot(17, 29, gen4WriteMon(m1));
    const back = loadGen4(save.toBytes()).boxSlot(17, 29);
    expect(back).not.toBeNull();
    expect(gen4ReadMon(back!).nationalDex).toBe(m1.nationalDex);
    expect(gen4ReadMon(back!).pid).toBe(m1.pid);
  });
});
