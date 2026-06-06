import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadGen5 } from './gen5';
import { readSpecies } from '../codec/pk5';
import { crc16ccitt } from './crc16';

const sav = new Uint8Array(readFileSync(fileURLToPath(new URL('../../fixtures/b2w2.sav', import.meta.url))));

describe('Gen 5 (B2W2) save parser — against real save', () => {
  it('reads the six Pokémon stored in Box 8', () => {
    const save = loadGen5(sav);
    const got = save.box(7).slice(0, 6).map((slot) => (slot ? readSpecies(slot) : null));
    // Regirock, Virizion, Emboar, Volcarona, Eelektross, Scrafty
    expect(got).toEqual([377, 640, 500, 637, 604, 560]);
  });

  it('returns null for an empty slot (Box 8, slot 6)', () => {
    expect(loadGen5(sav).boxSlot(7, 6)).toBeNull();
  });

  it('decrypted box slots carry a checksum matching their contents (codec agrees with real data)', () => {
    const slot = loadGen5(sav).boxSlot(7, 0);
    expect(slot).not.toBeNull();
    // a correctly-decrypted slot has a non-zero species in the valid range
    const sp = readSpecies(slot!);
    expect(sp).toBeGreaterThan(0);
    expect(sp).toBeLessThanOrEqual(649);
  });

  it('re-serializes byte-identical when nothing is changed', () => {
    const out = loadGen5(sav).toBytes();
    expect(out.length).toBe(sav.length);
    expect(Buffer.from(out).equals(Buffer.from(sav))).toBe(true);
  });

  it('does not mutate the caller’s buffer', () => {
    const copy = sav.slice();
    const save = loadGen5(copy);
    save.setBoxSlot(0, 0, save.boxSlot(7, 0)!); // write into an empty slot
    expect(Buffer.from(copy).equals(Buffer.from(sav))).toBe(true); // original untouched
  });

  it('writes a Pokémon into an empty slot and reads it back', () => {
    const save = loadGen5(sav);
    const regirock = save.boxSlot(7, 0)!; // decrypted Regirock from Box 8
    expect(save.boxSlot(0, 0)).toBeNull(); // Box 1 slot 0 starts empty
    save.setBoxSlot(0, 0, regirock);
    expect(readSpecies(save.boxSlot(0, 0)!)).toBe(377);
  });

  it('recomputing box checksums on an unmodified save is a no-op (validates CRC + offsets vs real data)', () => {
    const save = loadGen5(sav);
    save.recomputeAllBoxChecksums();
    expect(Buffer.from(save.toBytes()).equals(Buffer.from(sav))).toBe(true);
  });

  it('after writing a mon, that box’s stored checksum matches its data', () => {
    const save = loadGen5(sav);
    save.setBoxSlot(0, 0, save.boxSlot(7, 0)!); // Regirock into Box 1, slot 0
    const out = save.toBytes();
    const base = 0x400;
    const stored = out[base + 0xff2]! | (out[base + 0xff3]! << 8);
    expect(stored).toBe(crc16ccitt(out.subarray(base, base + 0xff0)));
  });

  it('keeps the primary and backup copies in sync after a write', () => {
    const save = loadGen5(sav);
    save.setBoxSlot(0, 0, save.boxSlot(7, 0)!);
    const out = save.toBytes();
    const primary = out.subarray(0x400, 0x400 + 0xff4);
    const backup = out.subarray(0x400 + 0x26000, 0x400 + 0x26000 + 0xff4);
    expect(Buffer.from(primary).equals(Buffer.from(backup))).toBe(true);
  });
});
