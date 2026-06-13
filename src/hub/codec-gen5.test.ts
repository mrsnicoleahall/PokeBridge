import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadGen5 } from '../saves/gen5';
import { gen5ReadMon, gen5WriteMon } from './codec-gen5';
import type { Mon } from './mon';

const fixture = (n: string) => new Uint8Array(readFileSync(fileURLToPath(new URL(`../../fixtures/${n}`, import.meta.url))));

function firstRealPk5(): Uint8Array {
  const save = loadGen5(fixture('b2w2.sav'));
  for (let box = 0; box < 24; box++) {
    for (let slot = 0; slot < 30; slot++) {
      const m = save.boxSlot(box, slot);
      if (m) return m;
    }
  }
  throw new Error('no mon in b2w2.sav');
}

const carried: (keyof Mon)[] = [
  'pid', 'nationalDex', 'form', 'otId', 'nickname', 'otName', 'ivs', 'evs', 'moves',
  'movePP', 'ppUps', 'ability', 'abilitySlot', 'nature', 'gender', 'exp', 'friendship', 'language',
];

describe('Gen 5 ⇄ Mon codec', () => {
  it('round-trips a real B2W2 mon through the hub (all carried fields)', () => {
    const m1 = gen5ReadMon(firstRealPk5());
    const m2 = gen5ReadMon(gen5WriteMon(m1));
    for (const k of carried) expect(m2[k]).toEqual(m1[k]);
  });

  it('write produces a slot the Gen 5 save layer accepts and reads back', () => {
    const save = loadGen5(fixture('b2w2.sav'));
    const m1 = gen5ReadMon(firstRealPk5());
    save.setBoxSlot(0, 0, gen5WriteMon(m1));
    const back = loadGen5(save.toBytes()).boxSlot(0, 0)!;
    expect(back).not.toBeNull();
    expect(gen5ReadMon(back).nationalDex).toBe(m1.nationalDex);
    expect(gen5ReadMon(back).pid).toBe(m1.pid);
  });
});
