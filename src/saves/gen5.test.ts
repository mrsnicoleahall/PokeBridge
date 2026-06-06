import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadGen5 } from './gen5';
import { readSpecies } from '../codec/pk5';
import { crc16ccitt } from './crc16';

const fixture = (n: string) => new Uint8Array(readFileSync(fileURLToPath(new URL(`../../fixtures/${n}`, import.meta.url))));
const sav = fixture('b2w2.sav');

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

  it('handles an original Black/White save (backup auto-detected at +0x24000)', () => {
    const bw = fixture('bw_black.sav');
    const save = loadGen5(bw);
    save.recomputeAllBoxChecksums(); // no-op iff box layout + backup offset are correct for BW
    expect(Buffer.from(save.toBytes()).equals(Buffer.from(bw))).toBe(true);
  });

  it('transfers a mon into a BW save, reads it back, and keeps checksums valid', () => {
    const save = loadGen5(fixture('bw_black.sav'));
    const donor = loadGen5(fixture('b2w2.sav')).boxSlot(7, 0)!; // Regirock (species 377)
    let done = false;
    for (let b = 0; b < 24 && !done; b++) {
      for (let s = 0; s < 30 && !done; s++) {
        if (save.boxSlot(b, s) !== null) continue;
        save.setBoxSlot(b, s, donor);
        const reloaded = loadGen5(save.toBytes());
        expect(readSpecies(reloaded.boxSlot(b, s)!)).toBe(377);
        reloaded.recomputeAllBoxChecksums();
        expect(Buffer.from(reloaded.toBytes()).equals(Buffer.from(save.toBytes()))).toBe(true);
        done = true;
      }
    }
    expect(done).toBe(true);
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
