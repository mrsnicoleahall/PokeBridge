import { describe, it, expect } from 'vitest';
import { convertPk5ToPk7 } from './pk5to7';
import { readSpeciesPk7 } from '../codec/pk7';

const dv = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);

function makePk5(): Uint8Array {
  const p = new Uint8Array(136);
  const v = dv(p);
  v.setUint32(0x00, 0x0abcdef1, true); // PID
  v.setUint16(0x08, 445, true); // species (Garchomp)
  v.setUint16(0x0c, 0x1234, true); // TID
  v.setUint32(0x10, 600000, true); // exp
  p[0x14] = 200; // friendship
  p[0x15] = 24; // ability id
  p.set([1, 2, 3, 4, 5, 6], 0x18); // EVs in Gen 5 order: HP,Atk,Def,Spe,SpA,SpD
  v.setUint16(0x28, 200, true); // move1 (Dragon Claw-ish id)
  p[0x41] = 7; // nature
  v.setUint32(0x38, 0x3fffffff, true); // perfect IVs
  for (let i = 0; i < 'GARCHOMP'.length; i++) v.setUint16(0x48 + i * 2, 'GARCHOMP'.charCodeAt(i), true);
  v.setUint16(0x48 + 16, 0xffff, true);
  return p;
}

describe('PK5 → PK7 conversion', () => {
  it('carries species, EC=PID, PID, exp, nature, ability, move1', () => {
    const pk7 = convertPk5ToPk7(makePk5());
    const v = dv(pk7);
    expect(readSpeciesPk7(pk7)).toBe(445);
    expect(v.getUint32(0x00, true)).toBe(0x0abcdef1); // EC = PID
    expect(v.getUint32(0x18, true)).toBe(0x0abcdef1); // PID
    expect(v.getUint32(0x10, true)).toBe(600000);
    expect(pk7[0x1c]).toBe(7); // nature
    expect(pk7[0x14]).toBe(24); // ability
    expect(v.getUint16(0x5a, true)).toBe(200); // move1
  });

  it('reorders EVs and IVs to the Gen 6/7 stat order (Speed moves last)', () => {
    const pk7 = convertPk5ToPk7(makePk5());
    // EVs: Gen5 [HP1,Atk2,Def3,Spe4,SpA5,SpD6] -> Gen7 [HP1,Atk2,Def3,SpA5,SpD6,Spe4]
    expect(Array.from(pk7.slice(0x1e, 0x24))).toEqual([1, 2, 3, 5, 6, 4]);
    // perfect IVs stay perfect after reorder
    expect(dv(pk7).getUint32(0x74, true) & 0x3fffffff).toBe(0x3fffffff);
  });

  it('copies the nickname into the Gen 7 name field (null-terminated)', () => {
    const pk7 = convertPk5ToPk7(makePk5());
    let name = '';
    const v = dv(pk7);
    for (let i = 0; i < 12; i++) { const c = v.getUint16(0x40 + i * 2, true); if (c === 0) break; name += String.fromCharCode(c); }
    expect(name).toBe('GARCHOMP');
  });
});
