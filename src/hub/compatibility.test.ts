import { describe, it, expect } from 'vitest';
import type { Generation, Mon } from './mon';
import { pidGender } from '../convert/gender';
import { checkCompatibility, canTransfer } from './compatibility';

/** A baseline, fully-compatible Mon: Charizard, PID-consistent nature + gender, only old moves. */
function mon(overrides: Partial<Mon> = {}): Mon {
  const pid = 0x00000006; // pid % 25 = 6
  return {
    pid,
    nationalDex: 6,
    form: 0,
    otName: 'ASH',
    otId: 0,
    nickname: 'CHAR',
    originGen: 3,
    ivs: [31, 31, 31, 31, 31, 31],
    evs: [0, 0, 0, 0, 0, 0],
    moves: [10, 52, 0, 0],
    movePP: [35, 25, 0, 0],
    ability: 66, // Blaze
    abilitySlot: 0,
    nature: pid % 25,
    gender: pidGender(6, pid), // consistent with the PID, like a real mon
    exp: 0,
    friendship: 70,
    ...overrides,
  };
}

describe('compatibility checker', () => {
  it('a Gen 3-native mon transfers cleanly up to Gen 7', () => {
    expect(canTransfer(mon(), 7)).toBe(true);
    expect(checkCompatibility(mon(), 7)).toEqual([]);
  });

  it('a Gen 3-native mon transfers cleanly back down to Gen 3', () => {
    expect(canTransfer(mon(), 3)).toBe(true);
  });

  it('blocks a species that did not exist yet (Zoroark #570 → Gen 3)', () => {
    const b = checkCompatibility(mon({ nationalDex: 570, ability: 0, moves: [33, 0, 0, 0] }), 3);
    expect(b.map((x) => x.code)).toContain('SPECIES_OUT_OF_DEX');
  });

  it('blocks a move newer than the target gen', () => {
    const b = checkCompatibility(mon({ moves: [10, 600, 0, 0] }), 5); // 600 > Gen 5 cap 559
    expect(b.find((x) => x.code === 'MOVE_TOO_NEW')?.field).toBe('move2');
    // same move is fine going to Gen 7 (cap 728)
    expect(canTransfer(mon({ moves: [10, 600, 0, 0], nature: 0x00000006 % 25 }), 7)).toBe(true);
  });

  it('blocks a too-new ability and a hidden ability going below Gen 5', () => {
    expect(checkCompatibility(mon({ ability: 200 }), 3).map((x) => x.code)).toContain('ABILITY_TOO_NEW');
    expect(checkCompatibility(mon({ abilitySlot: 2 }), 4).map((x) => x.code)).toContain(
      'HIDDEN_ABILITY_UNSUPPORTED',
    );
  });

  it('blocks a non-base form moving down, allows it moving up', () => {
    const alolan = mon({ form: 1, originGen: 7, nationalDex: 6 });
    expect(checkCompatibility(alolan, 5).map((x) => x.code)).toContain('FORM_NOT_REPRESENTABLE');
    // moving up/sideways keeps the form
    expect(checkCompatibility(mon({ form: 1, originGen: 3 }), 7).find((x) => x.code === 'FORM_NOT_REPRESENTABLE')).toBeUndefined();
  });

  it('blocks a nature that the Gen 3 PID cannot reproduce, but not for Gen 5', () => {
    const mismatched = mon({ pid: 0x00000006, nature: 10 }); // pid%25 = 6, not 10
    expect(checkCompatibility(mismatched, 3).map((x) => x.code)).toContain('NATURE_NOT_PID_CONSISTENT');
    expect(checkCompatibility(mismatched, 5).find((x) => x.code === 'NATURE_NOT_PID_CONSISTENT')).toBeUndefined();
  });

  it('blocks a gender the Gen 3 PID cannot reproduce, but not for Gen 5/7', () => {
    // Charizard (#6) threshold 31; pid low byte 6 < 31 ⇒ PID says female. Force male to create a mismatch.
    const mismatched = mon({ pid: 0x00000006, gender: 0 });
    expect(checkCompatibility(mismatched, 3).map((x) => x.code)).toContain('GENDER_NOT_PID_CONSISTENT');
    expect(checkCompatibility(mismatched, 5).find((x) => x.code === 'GENDER_NOT_PID_CONSISTENT')).toBeUndefined();
    expect(checkCompatibility(mismatched, 7).find((x) => x.code === 'GENDER_NOT_PID_CONSISTENT')).toBeUndefined();
    // a PID-consistent gender is fine
    expect(checkCompatibility(mon({ pid: 0x00000006 }), 3).find((x) => x.code === 'GENDER_NOT_PID_CONSISTENT')).toBeUndefined();
  });

  it('reports multiple independent blockers at once', () => {
    const bad = mon({ nationalDex: 700, moves: [10, 600, 0, 0], nature: 99 } as Partial<Mon>);
    const codes = checkCompatibility(bad as Mon, 3).map((x) => x.code).sort();
    expect(codes).toContain('SPECIES_OUT_OF_DEX');
    expect(codes).toContain('MOVE_TOO_NEW');
    expect(codes).toContain('NATURE_NOT_PID_CONSISTENT');
  });
});
