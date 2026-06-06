import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { convertGen1ToGen5 } from './gen1to5';
import { gen1InternalToNational } from './gen1-species';
import { readSpecies, readNickname, PK5_SIZE } from '../codec/pk5';
import { loadGen1 } from '../saves/gen1';
import { loadGen5 } from '../saves/gen5';

const dv = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);
const fixture = (n: string) => new Uint8Array(readFileSync(fileURLToPath(new URL(`../../fixtures/${n}`, import.meta.url))));

// Synthetic 33-byte Gen 1 record (big-endian fields). Internal index 153 = Bulbasaur (National 1).
function syntheticPk1(): Uint8Array {
  const r = new Uint8Array(33);
  r[0x00] = 153; // Bulbasaur
  r[0x08] = 33; r[0x09] = 45; // moves (Tackle, Growl)
  r[0x0c] = 0x12; r[0x0d] = 0x34; // OT ID (BE)
  r[0x0e] = 0x00; r[0x0f] = 0x52; r[0x10] = 0x69; // exp (BE) = 21097
  r[0x1b] = 0xff; r[0x1c] = 0xff; // DVs perfect
  r[0x1d] = 35; r[0x1e] = 40; // PP
  return r;
}

describe('Gen 1 → Gen 5 conversion', () => {
  it('maps the internal index to National Dex and carries OT/exp/moves', () => {
    const pk5 = convertGen1ToGen5(syntheticPk1(), 'BUDDY', 'RED');
    const v = dv(pk5);
    expect(readSpecies(pk5)).toBe(1); // Bulbasaur
    expect(v.getUint16(0x0c, true)).toBe(0x1234);
    expect(v.getUint32(0x10, true)).toBe(21097);
    expect(v.getUint16(0x28, true)).toBe(33);
  });

  it('converts perfect DVs to perfect IVs and sets nature from PID', () => {
    const pk5 = convertGen1ToGen5(syntheticPk1(), 'BUDDY', 'RED');
    expect(dv(pk5).getUint32(0x38, true) & 0x3fffffff).toBe(0x3fffffff);
    expect(pk5[0x41]).toBe(dv(pk5).getUint32(0x00, true) % 25);
  });

  it('carries the nickname into Gen 5 UTF-16', () => {
    expect(readNickname(convertGen1ToGen5(syntheticPk1(), 'BUDDY', 'RED'))).toBe('BUDDY');
  });

  it('END-TO-END: a real Blue living-dex mon converts, lands in Black 2, and reads back', () => {
    const src = loadGen1(fixture('gen1_blue.sav')).allBoxMon();
    const pick = src.find((m) => gen1InternalToNational(m.internal) > 0)!;
    const national = gen1InternalToNational(pick.internal);
    const pk5 = convertGen1ToGen5(pick.data, pick.nickname, pick.otName);
    expect(readSpecies(pk5)).toBe(national);

    const save = loadGen5(fixture('b2w2.sav'));
    save.setBoxSlot(0, 0, pk5);
    expect(readSpecies(loadGen5(save.toBytes()).boxSlot(0, 0)!)).toBe(national);
  });
});
