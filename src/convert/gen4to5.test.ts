import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { convertGen4ToGen5 } from './gen4to5';
import { decryptPk5, encryptPk5, pk5Checksum, readSpecies, PK5_SIZE } from '../codec/pk5';
import { loadGen5 } from '../saves/gen5';

const dv = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);
const fixture = (n: string) => new Uint8Array(readFileSync(fileURLToPath(new URL(`../../fixtures/${n}`, import.meta.url))));

function syntheticPk4(opts: { pid: number; species: number; ivs: number; nick: string }): Uint8Array {
  const p = new Uint8Array(PK5_SIZE);
  const v = dv(p);
  v.setUint32(0x00, opts.pid >>> 0, true);
  v.setUint16(0x08, opts.species, true);
  v.setUint32(0x38, opts.ivs >>> 0, true);
  for (let i = 0; i < opts.nick.length; i++) v.setUint16(0x48 + i * 2, opts.nick.charCodeAt(i), true);
  v.setUint16(0x48 + opts.nick.length * 2, 0xffff, true);
  return p;
}

/** Pull the first real Gen 4 Pokémon out of a Gen 4 save (codec already decodes Gen 4). */
function firstGen4Mon(sav: Uint8Array): Uint8Array {
  for (let off = 0; off + PK5_SIZE <= sav.length; off += 4) {
    const cs = dv(sav).getUint16(off + 0x06, true);
    if (cs === 0) continue;
    const d = decryptPk5(sav.subarray(off, off + PK5_SIZE));
    if (pk5Checksum(d) !== cs) continue;
    const sp = readSpecies(d);
    if (sp >= 1 && sp <= 493) return d;
  }
  throw new Error('no Gen 4 mon found');
}

describe('Gen 4 → Gen 5 conversion', () => {
  it('preserves PID, species, IVs, and nickname (shared field layout)', () => {
    const pk5 = convertGen4ToGen5(syntheticPk4({ pid: 0x12345678, species: 445, ivs: 0x3fffffff, nick: 'GARCHOMP' }));
    const a = dv(pk5);
    expect(a.getUint32(0x00, true)).toBe(0x12345678);
    expect(readSpecies(pk5)).toBe(445);
    expect(a.getUint32(0x38, true) & 0x3fffffff).toBe(0x3fffffff);
    expect(a.getUint16(0x48, true)).toBe('G'.charCodeAt(0));
  });

  it('sets the Gen 5 nature byte (0x41) to PID % 25', () => {
    const pk5 = convertGen4ToGen5(syntheticPk4({ pid: 0x12345678, species: 1, ivs: 0, nick: 'A' }));
    expect(pk5[0x41]).toBe(0x12345678 % 25);
  });

  it('produces a valid PK5 (encrypt/decrypt round-trips with a correct checksum)', () => {
    const pk5 = convertGen4ToGen5(syntheticPk4({ pid: 0xabcdef01, species: 248, ivs: 0x12345678, nick: 'TTAR' }));
    const enc = encryptPk5(pk5);
    expect(pk5Checksum(decryptPk5(enc))).toBe(dv(enc).getUint16(0x06, true));
    expect(readSpecies(decryptPk5(enc))).toBe(248);
  });

  it('END-TO-END: a real Diamond Pokémon converts, lands in the Black 2 save, and reads back', () => {
    const pk4 = firstGen4Mon(fixture('diamond.sav'));
    const species = readSpecies(pk4);

    const save = loadGen5(fixture('b2w2.sav'));
    save.setBoxSlot(0, 0, convertGen4ToGen5(pk4)); // into Box 1, slot 0

    const reloaded = loadGen5(save.toBytes());
    expect(readSpecies(reloaded.boxSlot(0, 0)!)).toBe(species);
  });
});
