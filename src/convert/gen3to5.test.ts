import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { convertGen3ToGen5 } from './gen3to5';
import { gen3InternalToNational } from './gen3-species';
import { readSpecies, readNickname, PK5_SIZE } from '../codec/pk5';
import { loadGen3 } from '../saves/gen3';
import { loadGen5 } from '../saves/gen5';

const dv = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);
const fixture = (n: string) => new Uint8Array(readFileSync(fileURLToPath(new URL(`../../fixtures/${n}`, import.meta.url))));

// Build a synthetic *decrypted* canonical PK3 (80 bytes) with known fields.
function syntheticPk3(): Uint8Array {
  const p = new Uint8Array(80);
  const v = dv(p);
  v.setUint32(0x00, 0x12345678, true); // PID
  v.setUint32(0x04, 0x0000abcd, true); // OTID
  // nickname "PIKA" (Gen3 charset): P=0xCA I=0xC3 K=0xC5 A=0xBB, term 0xFF
  p.set([0xca, 0xc3, 0xc5, 0xbb, 0xff], 0x08);
  // OT name "ASH": A=0xBB S=0xCD H=0xC2
  p.set([0xbb, 0xcd, 0xc2, 0xff], 0x14);
  v.setUint16(0x20, 25, true); // Growth: species internal 25 (Pikachu, internal==national here)
  v.setUint32(0x24, 21097, true); // exp
  p[0x29] = 70; // friendship
  v.setUint16(0x2c, 84, true); // move1 (Thunder Shock)
  v.setUint16(0x2e, 45, true); // move2 (Growl)
  p[0x34] = 30; // pp1
  p[0x35] = 40; // pp2
  p.set([10, 20, 30, 40, 50, 60], 0x38); // EVs
  v.setUint32(0x48, 0x3fffffff, true); // perfect IVs (bits 0-29), no egg/ability bits
  return p;
}

describe('Gen 3 → Gen 5 conversion', () => {
  it('maps species to National Dex and preserves PID', () => {
    const pk5 = convertGen3ToGen5(syntheticPk3());
    expect(readSpecies(pk5)).toBe(gen3InternalToNational(25));
    expect(dv(pk5).getUint32(0x00, true)).toBe(0x12345678);
  });

  it('carries experience, friendship, EVs, moves, PP', () => {
    const pk5 = convertGen3ToGen5(syntheticPk3());
    const v = dv(pk5);
    expect(v.getUint32(0x10, true)).toBe(21097); // exp
    expect(pk5[0x14]).toBe(70); // friendship
    expect(Array.from(pk5.slice(0x18, 0x1e))).toEqual([10, 20, 30, 40, 50, 60]); // EVs
    expect(v.getUint16(0x28, true)).toBe(84); // move1
    expect(v.getUint16(0x2a, true)).toBe(45); // move2
    expect(pk5[0x30]).toBe(30); // pp1
  });

  it('carries IVs and sets the Gen 5 nature byte to PID % 25', () => {
    const pk5 = convertGen3ToGen5(syntheticPk3());
    expect(dv(pk5).getUint32(0x38, true) & 0x3fffffff).toBe(0x3fffffff);
    expect(pk5[0x41]).toBe(0x12345678 % 25);
  });

  it('re-encodes the nickname into Gen 5 UTF-16', () => {
    expect(readNickname(convertGen3ToGen5(syntheticPk3()))).toBe('PIKA');
  });

  it('END-TO-END: a real Emerald box mon converts, lands in the Black 2 save, and reads back', () => {
    const src = loadGen3(fixture('emerald.sav')).allBoxMon();
    expect(src.length).toBeGreaterThan(0);
    const pick = src[0]!;
    const pk5 = convertGen3ToGen5(pick.data);
    expect(readSpecies(pk5)).toBe(pick.national);

    const save = loadGen5(fixture('b2w2.sav'));
    save.setBoxSlot(0, 0, pk5);
    expect(readSpecies(loadGen5(save.toBytes()).boxSlot(0, 0)!)).toBe(pick.national);
  });
});
