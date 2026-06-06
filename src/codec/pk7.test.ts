import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PK7_SIZE, decryptPk7, encryptPk7, pk7Checksum, readSpeciesPk7 } from './pk7';

const fixture = (n: string) => new Uint8Array(readFileSync(fileURLToPath(new URL(`../../fixtures/${n}`, import.meta.url))));

function makeDecrypted(ec: number): Uint8Array {
  const buf = new Uint8Array(PK7_SIZE);
  new DataView(buf.buffer).setUint32(0x00, ec >>> 0, true); // encryption constant
  for (let i = 0x08; i < 0xe8; i++) buf[i] = (i * 11 + 5) & 0xff;
  return buf;
}

describe('PK7 codec (Gen 6/7, 232 bytes)', () => {
  it('encrypt then decrypt round-trips byte-identical across shuffle orderings', () => {
    for (let sv = 0; sv < 24; sv++) {
      const dec = makeDecrypted((sv << 13) | 0x55);
      const back = decryptPk7(encryptPk7(dec));
      expect(Array.from(back.slice(0x08, 0xe8))).toEqual(Array.from(dec.slice(0x08, 0xe8)));
    }
  });

  it('writes the recomputed checksum into the 0x06 header', () => {
    const dec = makeDecrypted(0xabcdef01);
    const enc = encryptPk7(dec);
    expect(new DataView(enc.buffer, enc.byteOffset).getUint16(0x06, true)).toBe(pk7Checksum(dec));
  });

  it('decodes real Pokémon from the Ultra Moon save (codec validated vs ground truth)', () => {
    const sav = fixture('usum_moon.sav');
    const dv = new DataView(sav.buffer, sav.byteOffset, sav.byteLength);
    let found = 0;
    for (let off = 0; off + PK7_SIZE <= sav.length; off += 4) {
      const cs = dv.getUint16(off + 0x06, true);
      if (cs === 0) continue;
      const dec = decryptPk7(sav.subarray(off, off + PK7_SIZE));
      if (pk7Checksum(dec) !== cs) continue;
      const sp = readSpeciesPk7(dec);
      if (sp >= 1 && sp <= 807) found++;
    }
    expect(found).toBeGreaterThan(0);
  });
});
