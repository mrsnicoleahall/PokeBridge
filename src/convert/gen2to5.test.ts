import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { convertGen2ToGen5 } from './gen2to5';
import { readSpecies, readNickname, PK5_SIZE } from '../codec/pk5';
import { loadGen2 } from '../saves/gen2';
import { loadGen5 } from '../saves/gen5';

const dv = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);
const fixture = (n: string) => new Uint8Array(readFileSync(fileURLToPath(new URL(`../../fixtures/${n}`, import.meta.url))));

// Synthetic 32-byte Gen 2 box record (big-endian fields).
function syntheticPk2(): Uint8Array {
  const r = new Uint8Array(32);
  r[0x00] = 25; // species: Pikachu (= National Dex)
  r[0x02] = 84; // move1
  r[0x03] = 45; // move2
  r[0x06] = 0x12; r[0x07] = 0x34; // OT ID (BE)
  r[0x08] = 0x00; r[0x09] = 0x52; r[0x0a] = 0x69; // exp (BE) = 21097
  r[0x15] = 0xff; r[0x16] = 0xff; // DVs all 15 (perfect)
  r[0x17] = 30; r[0x18] = 40; // PP (no PP-ups)
  r[0x1b] = 70; // friendship
  return r;
}

describe('Gen 2 → Gen 5 conversion', () => {
  it('maps species (Dex), carries OT ID, exp, friendship, moves', () => {
    const pk5 = convertGen2ToGen5(syntheticPk2(), 'SPARKY', 'ASH');
    const v = dv(pk5);
    expect(readSpecies(pk5)).toBe(25);
    expect(v.getUint16(0x0c, true)).toBe(0x1234);
    expect(v.getUint32(0x10, true)).toBe(21097);
    expect(pk5[0x14]).toBe(70);
    expect(v.getUint16(0x28, true)).toBe(84);
  });

  it('converts perfect DVs to perfect IVs and sets nature from PID', () => {
    const pk5 = convertGen2ToGen5(syntheticPk2(), 'SPARKY', 'ASH');
    expect(dv(pk5).getUint32(0x38, true) & 0x3fffffff).toBe(0x3fffffff);
    const pid = dv(pk5).getUint32(0x00, true);
    expect(pk5[0x41]).toBe(pid % 25);
  });

  it('carries the nickname into Gen 5 UTF-16', () => {
    expect(readNickname(convertGen2ToGen5(syntheticPk2(), 'SPARKY', 'ASH'))).toBe('SPARKY');
  });

  it('END-TO-END: a real Crystal living-dex mon converts, lands in Black 2, and reads back', () => {
    const src = loadGen2(fixture('gen2_crystal.sav')).allBoxMon();
    expect(src.length).toBeGreaterThan(200);
    const pick = src[0]!;
    const pk5 = convertGen2ToGen5(pick.data, pick.nickname, pick.otName);
    expect(readSpecies(pk5)).toBe(pick.species);

    const save = loadGen5(fixture('b2w2.sav'));
    save.setBoxSlot(0, 0, pk5);
    expect(readSpecies(loadGen5(save.toBytes()).boxSlot(0, 0)!)).toBe(pick.species);
  });
});
