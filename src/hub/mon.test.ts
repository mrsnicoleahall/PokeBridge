import { describe, it, expect } from 'vitest';
import { isShiny } from './mon';

describe('Mon hub — shininess invariant', () => {
  it('xor < 8 is shiny in legacy gens (3–5)', () => {
    // tid=sid=0, pid high^low = 0 → xor 0 → shiny everywhere
    expect(isShiny(0x00000000, 0x00000000, 3)).toBe(true);
    expect(isShiny(0x00000000, 0x00000000, 5)).toBe(true);
  });

  it('xor between 8 and 15 is shiny only from Gen 6 (stricter legacy threshold)', () => {
    // Construct a PID/OTID whose shiny xor == 10: low=10, others 0.
    const pid = 0x0000000a;
    const otId = 0x00000000;
    expect(isShiny(pid, otId, 5)).toBe(false); // legacy threshold 8 → not shiny
    expect(isShiny(pid, otId, 6)).toBe(true); // Gen 6 threshold 16 → shiny
  });

  it('non-shiny stays non-shiny in every gen', () => {
    const pid = 0x0000ffff;
    const otId = 0x00000000; // xor = 0xffff ^ 0 = large → never shiny
    expect(isShiny(pid, otId, 3)).toBe(false);
    expect(isShiny(pid, otId, 7)).toBe(false);
  });
});
