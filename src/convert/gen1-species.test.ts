import { describe, it, expect } from 'vitest';
import { gen1InternalToNational } from './gen1-species';

describe('Gen 1 internal index → National Dex', () => {
  it('maps the famous index numbers', () => {
    expect(gen1InternalToNational(1)).toBe(112); // Rhydon
    expect(gen1InternalToNational(21)).toBe(151); // Mew
    expect(gen1InternalToNational(131)).toBe(150); // Mewtwo
    expect(gen1InternalToNational(153)).toBe(1); // Bulbasaur
  });

  it('returns 0 for MissingNo / invalid indices', () => {
    expect(gen1InternalToNational(31)).toBe(0);
    expect(gen1InternalToNational(0)).toBe(0);
    expect(gen1InternalToNational(200)).toBe(0);
  });

  it('covers exactly the 151 species, a permutation of National 1..151', () => {
    const nationals = new Set<number>();
    for (let i = 0; i <= 190; i++) {
      const n = gen1InternalToNational(i);
      if (n) nationals.add(n);
    }
    expect(nationals.size).toBe(151);
    for (let d = 1; d <= 151; d++) expect(nationals.has(d)).toBe(true);
  });
});
