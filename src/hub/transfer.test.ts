import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadGen3 } from '../saves/gen3';
import { loadGen7 } from '../saves/gen7';
import { gen3ReadMon } from './codec-gen3';
import { gen7ReadMon } from './codec-gen7';
import { isShiny, type Mon } from './mon';
import { prepareTransfer } from './transfer';

const fixture = (n: string) => new Uint8Array(readFileSync(fileURLToPath(new URL(`../../fixtures/${n}`, import.meta.url))));

function syntheticGen7Mon(overrides: Partial<Mon> = {}): Mon {
  const pid = 0x00000006;
  return {
    pid, encryptionConstant: 0xdeadbeef, nationalDex: 6, form: 0, otName: 'ASH', otId: 0,
    nickname: 'CHAR', language: 2, originGen: 7, ivs: [31, 31, 31, 31, 31, 31], evs: [0, 0, 0, 0, 0, 0],
    moves: [10, 52, 0, 0], movePP: [35, 25, 0, 0], ppUps: [0, 0, 0, 0], ability: 66, abilitySlot: 0,
    nature: pid % 25, gender: 0, exp: 0, friendship: 70, ...overrides,
  };
}

describe('hub transfer — any direction, no pivot', () => {
  it('round-trips a real Emerald mon UP to Gen 7 and back DOWN to Gen 3 (Gen 5 never involved)', () => {
    const original = loadGen3(fixture('emerald.sav')).allBoxMon()[0]!.data;
    const m0 = gen3ReadMon(original);

    // UP: Gen 3 mon → Gen 7 directly through the hub
    const up = prepareTransfer(m0, 7);
    expect(up.status).toBe('ready');
    const usum = loadGen7(fixture('usum_moon.sav'));
    usum.setBoxSlot(0, 0, up.bytes!);
    const m1 = gen7ReadMon(loadGen7(usum.toBytes()).boxSlot(0, 0)!);
    expect(m1.nationalDex).toBe(m0.nationalDex);

    // DOWN: that Gen 7 mon → Gen 3 directly through the hub
    const down = prepareTransfer(m1, 3);
    expect(down.status).toBe('ready'); // a Gen-3-native mon comes home clean
    const emerald = loadGen3(fixture('emerald.sav'));
    emerald.setBoxSlot(13, 25, down.bytes!);
    const m2 = gen3ReadMon(loadGen3(emerald.toBytes()).boxSlot(13, 25)!);

    for (const k of ['nationalDex', 'pid', 'otId', 'nature', 'ability', 'abilitySlot', 'exp', 'friendship', 'nickname'] as (keyof Mon)[]) {
      expect(m2[k]).toEqual(m0[k]);
    }
    expect(m2.ivs).toEqual(m0.ivs);
    expect(m2.evs).toEqual(m0.evs);
    expect(m2.moves).toEqual(m0.moves);
    // shininess is a function of PID + OT ID, both preserved → identical verdict both ends
    expect(isShiny(m2.pid, m2.otId, 3)).toBe(isShiny(m0.pid, m0.otId, 3));
  });

  it('strictly blocks an out-of-dex species going down, even with trim requested', () => {
    const zoroark = syntheticGen7Mon({ nationalDex: 570, ability: 0, moves: [33, 0, 0, 0] });
    expect(prepareTransfer(zoroark, 3).status).toBe('blocked');
    const trimmed = prepareTransfer(zoroark, 3, { trim: true });
    expect(trimmed.status).toBe('blocked'); // species is untrimmable
    expect(trimmed.blockers.map((b) => b.code)).toContain('SPECIES_OUT_OF_DEX');
  });

  it('trims a too-new move on request and then transfers', () => {
    const m = syntheticGen7Mon({ moves: [10, 600, 0, 0], movePP: [35, 10, 0, 0] }); // move 600 > Gen 3
    expect(prepareTransfer(m, 3).status).toBe('blocked');
    const out = prepareTransfer(m, 3, { trim: true });
    expect(out.status).toBe('trimmed');
    expect(out.removed.length).toBeGreaterThan(0);
    expect(out.bytes).toBeDefined();
    expect(out.mon.moves[1]).toBe(0);
  });
});
