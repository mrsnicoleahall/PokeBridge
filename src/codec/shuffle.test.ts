import { describe, it, expect } from 'vitest';
import { blockOrderIndex, shuffleBlocks, unshuffleBlocks } from './shuffle';

type Quad = [string, string, string, string];

describe('Gen 4/5 block shuffle', () => {
  it('derives the order index from bits 13-17 of the PID, mod 24', () => {
    expect(blockOrderIndex(0)).toBe(0);
    expect(blockOrderIndex(1 << 13)).toBe(1);
    expect(blockOrderIndex(23 << 13)).toBe(23);
    expect(blockOrderIndex(24 << 13)).toBe(0); // wraps mod 24
    expect(blockOrderIndex(25 << 13)).toBe(1);
  });

  it('unshuffle restores canonical A,B,C,D for index 1 (stored order A,B,D,C)', () => {
    const stored: Quad = ['A', 'B', 'D', 'C'];
    expect(unshuffleBlocks(stored, 1 << 13)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('shuffle places canonical blocks into stored order for index 1', () => {
    const canonical: Quad = ['A', 'B', 'C', 'D'];
    expect(shuffleBlocks(canonical, 1 << 13)).toEqual(['A', 'B', 'D', 'C']);
  });

  it('shuffle and unshuffle are inverses for all 24 orderings', () => {
    for (let sv = 0; sv < 24; sv++) {
      const pid = sv << 13;
      const canonical: Quad = ['A', 'B', 'C', 'D'];
      const stored = shuffleBlocks(canonical, pid);
      expect(unshuffleBlocks(stored, pid)).toEqual(canonical);
    }
  });
});
