import { describe, it, expect } from 'vitest';
import { dvToIv, gbHpDv, buildIvWord, synthesizePid } from './gb-common';

describe('GB (Gen 1/2) uplift helpers', () => {
  it('maps DV→IV as 2*DV+1 (perfect stays perfect)', () => {
    expect(dvToIv(15)).toBe(31);
    expect(dvToIv(0)).toBe(1);
    expect(dvToIv(7)).toBe(15);
  });

  it('derives the HP DV from the low bits of the other DVs', () => {
    expect(gbHpDv(15, 15, 15, 15)).toBe(15); // all odd → 1111
    expect(gbHpDv(0, 0, 0, 0)).toBe(0);
    expect(gbHpDv(1, 0, 1, 0)).toBe(0b1010); // atk + spe odd
  });

  it('packs six perfect IVs into 0x3FFFFFFF', () => {
    expect(buildIvWord(31, 31, 31, 31, 31, 31)).toBe(0x3fffffff);
    expect(buildIvWord(0, 31, 0, 0, 0, 0)).toBe(31 << 5);
  });

  it('synthesizes a stable 32-bit PID (deterministic, in range)', () => {
    const a = synthesizePid(12345, 0xabcd, 25);
    const b = synthesizePid(12345, 0xabcd, 25);
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(0xffffffff);
    expect(synthesizePid(12345, 0xabcd, 26)).not.toBe(a); // different species → different PID
  });
});
