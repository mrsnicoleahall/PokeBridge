import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadGen7 } from '../saves/gen7';
import { decryptPk7, pk7Checksum, readSpeciesPk7, PK7_SIZE } from '../codec/pk7';
import { gen7ReadMon, gen7WriteMon } from './codec-gen7';
import type { Mon } from './mon';

const fixture = (n: string) => new Uint8Array(readFileSync(fileURLToPath(new URL(`../../fixtures/${n}`, import.meta.url))));

// This save's PC boxes are empty; its real Pokémon live elsewhere (party). Find the first decodable PK7
// anywhere in the save via the same sliding scan the codec test uses — that gives us real Gen 7 data.
function firstRealPk7(): Uint8Array {
  const sav = fixture('usum_moon.sav');
  const dv = new DataView(sav.buffer, sav.byteOffset, sav.byteLength);
  for (let off = 0; off + PK7_SIZE <= sav.length; off += 4) {
    const cs = dv.getUint16(off + 0x06, true);
    if (cs === 0) continue;
    const dec = decryptPk7(sav.subarray(off, off + PK7_SIZE));
    if (pk7Checksum(dec) !== cs) continue;
    const sp = readSpeciesPk7(dec);
    if (sp >= 1 && sp <= 807) return dec;
  }
  throw new Error('no decodable PK7 found in usum_moon.sav');
}

const carried: (keyof Mon)[] = [
  'pid', 'encryptionConstant', 'nationalDex', 'form', 'otId', 'nickname', 'otName', 'ivs', 'evs',
  'moves', 'movePP', 'ppUps', 'ability', 'abilitySlot', 'nature', 'gender', 'exp', 'friendship', 'language',
];

describe('Gen 7 ⇄ Mon codec', () => {
  it('round-trips a real Ultra Moon mon through the hub (all carried fields)', () => {
    const m1 = gen7ReadMon(firstRealPk7());
    const m2 = gen7ReadMon(gen7WriteMon(m1));
    for (const k of carried) expect(m2[k]).toEqual(m1[k]);
  });

  it('write produces a slot the Gen 7 save layer accepts and reads back', () => {
    const save = loadGen7(fixture('usum_moon.sav'));
    const m1 = gen7ReadMon(firstRealPk7());
    save.setBoxSlot(0, 0, gen7WriteMon(m1));
    const back = loadGen7(save.toBytes()).boxSlot(0, 0)!;
    expect(back).not.toBeNull();
    expect(gen7ReadMon(back).nationalDex).toBe(m1.nationalDex);
    expect(gen7ReadMon(back).pid).toBe(m1.pid);
  });
});
