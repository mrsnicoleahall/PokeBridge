import { describe, it, expect } from 'vitest';
import { lcrngNext, lcrngStream } from './prng';

describe('Gen 4/5 LCRNG (next = seed * 0x41C64E6D + 0x6073, mod 2^32)', () => {
  it('advances seed 0 to 0x6073', () => {
    // 0 * mult + 0x6073 = 0x6073
    expect(lcrngNext(0)).toBe(0x6073);
  });

  it('advances seed 0x6073 to the next documented state', () => {
    // (0x6073 * 0x41C64E6D + 0x6073) mod 2^32
    const expected = (0x6073 * 0x41c64e6d + 0x6073) >>> 0; // computed independently below as a guard
    // independent recompute using BigInt to avoid float precision drift
    const big = Number((BigInt(0x6073) * 0x41c64e6dn + 0x6073n) & 0xffffffffn);
    expect(expected).toBe(big);
    expect(lcrngNext(0x6073)).toBe(big);
  });

  it('stays within unsigned 32-bit range', () => {
    let seed = 0x12345678;
    for (let i = 0; i < 1000; i++) {
      seed = lcrngNext(seed);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(0xffffffff);
      expect(Number.isInteger(seed)).toBe(true);
    }
  });

  it('lcrngStream yields the high-16-bits of each successive state', () => {
    // The block cipher XORs data words with (state >> 16). Verify the stream
    // matches manual advancement from a known seed.
    const seed = 0x0000abcd;
    const gen = lcrngStream(seed);
    let s = seed;
    for (let i = 0; i < 5; i++) {
      s = lcrngNext(s);
      expect(gen.next().value).toBe((s >>> 16) & 0xffff);
    }
  });
});
