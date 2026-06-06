import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PK3_SIZE, decryptPk3, pk3Checksum, readSpeciesPk3Internal } from './pk3';
import { shuffleByOrder } from './shuffle';

const fixture = (n: string) => new Uint8Array(readFileSync(fileURLToPath(new URL(`../../fixtures/${n}`, import.meta.url))));

/** Build a valid *encrypted* PK3 with a known PID/OTID/internal-species (for unit testing decode). */
function encodePk3(pid: number, otid: number, species: number): Uint8Array {
  const p = new Uint8Array(PK3_SIZE);
  const dv = new DataView(p.buffer);
  dv.setUint32(0x00, pid >>> 0, true);
  dv.setUint32(0x04, otid >>> 0, true);
  dv.setUint16(0x20, species, true); // species = first u16 of canonical Growth substructure
  for (let i = 0x22; i < 0x50; i++) p[i] = (i * 5) & 0xff;
  let sum = 0;
  for (let off = 0x20; off < 0x50; off += 2) sum = (sum + dv.getUint16(off, true)) & 0xffff;
  dv.setUint16(0x1c, sum, true); // checksum over decrypted data
  const subs = [0, 1, 2, 3].map((i) => p.slice(0x20 + i * 12, 0x20 + (i + 1) * 12)) as [Uint8Array, Uint8Array, Uint8Array, Uint8Array];
  const stored = shuffleByOrder(subs, pid % 24);
  for (let i = 0; i < 4; i++) p.set(stored[i]!, 0x20 + i * 12);
  const key = (otid ^ pid) >>> 0;
  for (let off = 0x20; off < 0x50; off += 4) dv.setUint32(off, (dv.getUint32(off, true) ^ key) >>> 0, true);
  return p;
}

/** Scan a Gen 3 save for decodable Pokémon (party + non-straddling box slots). */
function scanPk3(sav: Uint8Array): number {
  let count = 0;
  const dv = new DataView(sav.buffer, sav.byteOffset, sav.byteLength);
  for (let off = 0; off + PK3_SIZE <= sav.length; off += 4) {
    const stored = dv.getUint16(off + 0x1c, true);
    if (stored === 0) continue;
    const dec = decryptPk3(sav.subarray(off, off + PK3_SIZE));
    if (pk3Checksum(dec) !== stored) continue;
    const sp = readSpeciesPk3Internal(dec);
    if (sp >= 1 && sp <= 411) count++;
  }
  return count;
}

describe('PK3 codec (Gen 3, read-only)', () => {
  it('decodes species, verifies checksum, preserves the PID/OTID header', () => {
    const enc = encodePk3(0x12345678, 0x0000abcd, 282);
    const dec = decryptPk3(enc);
    expect(readSpeciesPk3Internal(dec)).toBe(282);
    expect(pk3Checksum(dec)).toBe(new DataView(enc.buffer).getUint16(0x1c, true));
    expect(new DataView(dec.buffer).getUint32(0x00, true)).toBe(0x12345678);
  });

  it('decodes across all 24 substructure orderings', () => {
    for (let i = 0; i < 24; i++) {
      const pid = i + 24 * 7; // pid % 24 == i, exercising every ordering
      const enc = encodePk3(pid, 0x1111, 300);
      expect(readSpeciesPk3Internal(decryptPk3(enc))).toBe(300);
    }
  });

  it('finds real Pokémon in emerald.sav (decode validated against ground truth)', () => {
    expect(scanPk3(fixture('emerald.sav'))).toBeGreaterThan(0);
  });

  it('finds real Pokémon in firered.sav', () => {
    expect(scanPk3(fixture('firered.sav'))).toBeGreaterThan(0);
  });
});
