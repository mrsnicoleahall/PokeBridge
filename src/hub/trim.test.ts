import { describe, it, expect } from 'vitest';
import type { Mon } from './mon';
import { pidGender } from '../convert/gender';
import { canTransfer } from './compatibility';
import { trimToFit } from './trim';

function mon(overrides: Partial<Mon> = {}): Mon {
  const pid = 0x00000006;
  return {
    pid, nationalDex: 6, form: 0, otName: 'ASH', otId: 0, nickname: 'CHAR', originGen: 7,
    ivs: [31, 31, 31, 31, 31, 31], evs: [0, 0, 0, 0, 0, 0],
    moves: [10, 52, 0, 0], movePP: [35, 25, 0, 0], ability: 66, abilitySlot: 0,
    nature: pid % 25, gender: pidGender(6, pid), exp: 0, friendship: 70, ...overrides,
  };
}

describe('trim engine', () => {
  it('trims a too-new move and a PID-inconsistent nature so the mon fits Gen 3', () => {
    const m = mon({ moves: [10, 600, 0, 0], movePP: [35, 10, 0, 0], nature: 12 });
    const { mon: trimmed, removed, unresolved } = trimToFit(m, 3);
    expect(trimmed.moves[1]).toBe(0); // newer move dropped
    expect(trimmed.movePP[1]).toBe(0);
    expect(trimmed.nature).toBe(trimmed.pid % 25); // nature accepted as the PID-derived value
    expect(removed.length).toBe(2);
    expect(unresolved).toEqual([]);
    expect(canTransfer(trimmed, 3)).toBe(true);
  });

  it('never changes species or PID', () => {
    const m = mon({ moves: [10, 600, 0, 0], nature: 12 });
    const { mon: trimmed } = trimToFit(m, 3);
    expect(trimmed.nationalDex).toBe(m.nationalDex);
    expect(trimmed.pid).toBe(m.pid);
  });

  it('leaves an out-of-dex species unresolved (untrimmable)', () => {
    const m = mon({ nationalDex: 570, ability: 0, abilitySlot: 0, moves: [33, 0, 0, 0], nature: 0x06 % 25 });
    const { mon: trimmed, unresolved } = trimToFit(m, 3);
    expect(trimmed.nationalDex).toBe(570); // species untouched
    expect(unresolved.map((b) => b.code)).toContain('SPECIES_OUT_OF_DEX');
    expect(canTransfer(trimmed, 3)).toBe(false);
  });

  it('trims a PID-inconsistent gender to the value Gen 3 derives from the PID', () => {
    const m = mon({ pid: 0x00000006, gender: 0 }); // Charizard pid low byte 6 < threshold 31 ⇒ PID says female
    const { mon: trimmed, removed, unresolved } = trimToFit(m, 3);
    expect(trimmed.gender).toBe(1); // female
    expect(removed.some((r) => /Gender/.test(r))).toBe(true);
    expect(unresolved).toEqual([]);
    expect(canTransfer(trimmed, 3)).toBe(true);
  });

  it('replaces a hidden ability with the species regular ability when going below Gen 5', () => {
    const m = mon({ abilitySlot: 2, ability: 66, originGen: 7 });
    const { mon: trimmed } = trimToFit(m, 3);
    expect(trimmed.abilitySlot).toBe(0);
    expect(trimmed.ability).toBe(66); // Charizard's regular slot-0 ability is Blaze (66)
  });
});
