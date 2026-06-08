import { describe, it, expect } from 'vitest';
import { abilityIdFor, abilitySlotFor } from './abilities';

describe('regular ability table', () => {
  it('returns known abilities by species + slot', () => {
    expect(abilityIdFor(1, 0)).toBe(65); // Bulbasaur → Overgrow
    expect(abilityIdFor(4, 0)).toBe(66); // Charmander → Blaze
    expect(abilityIdFor(25, 0)).toBe(9); // Pikachu → Static
    expect(abilityIdFor(19, 0)).toBe(50); // Rattata → Run Away
    expect(abilityIdFor(19, 1)).toBe(62); // Rattata slot 2 → Guts
  });

  it('single-ability species return the same id for either slot', () => {
    expect(abilityIdFor(25, 0)).toBe(abilityIdFor(25, 1)); // Pikachu only has Static (regular)
  });

  it('returns 0 for species outside the table', () => {
    expect(abilityIdFor(700, 0)).toBe(0);
    expect(abilityIdFor(0, 0)).toBe(0);
  });

  it('abilitySlotFor identifies which slot an ability sits in', () => {
    expect(abilitySlotFor(19, 50)).toBe(0); // Run Away = slot 1
    expect(abilitySlotFor(19, 62)).toBe(1); // Guts = slot 2
    expect(abilitySlotFor(1, 65)).toBe(0);
  });
});
