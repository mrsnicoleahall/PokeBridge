import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { listSourceMon, readSource, convertToGen5, transferToGen5Box } from './transfer';
import { loadGen5 } from '../saves/gen5';
import { readSpecies } from '../codec/pk5';

const fixture = (n: string) => new Uint8Array(readFileSync(fileURLToPath(new URL(`../../fixtures/${n}`, import.meta.url))));

describe('transfer orchestrator', () => {
  it('lists deduped Pokémon from a real Gen 4 save', () => {
    const mon = listSourceMon(fixture('diamond.sav'), 493);
    expect(mon.length).toBeGreaterThan(0);
    for (const m of mon) {
      expect(m.species).toBeGreaterThan(0);
      expect(m.species).toBeLessThanOrEqual(493);
    }
    const pids = mon.map((m) => m.pid);
    expect(new Set(pids).size).toBe(pids.length); // backup-copy duplicates folded away
  });

  it('finds a deep box of Pokémon in the SoulSilver save', () => {
    expect(listSourceMon(fixture('soulsilver.sav'), 493).length).toBeGreaterThan(50);
  });

  it('transfers a chosen Gen 4 mon into a Gen 5 box and reads it back', () => {
    const pick = listSourceMon(fixture('diamond.sav'), 493)[0]!;
    const save = loadGen5(fixture('b2w2.sav'));
    transferToGen5Box(save, 0, 0, 4, pick.data);
    expect(readSpecies(loadGen5(save.toBytes()).boxSlot(0, 0)!)).toBe(pick.species);
  });

  it('Gen 5 → Gen 5 transfer is a faithful copy', () => {
    const save = loadGen5(fixture('b2w2.sav'));
    const regirock = save.boxSlot(7, 0)!; // species 377
    transferToGen5Box(save, 0, 1, 5, regirock);
    expect(readSpecies(loadGen5(save.toBytes()).boxSlot(0, 1)!)).toBe(377);
  });

  it('readSource reads Gen 3 box mon (Emerald) with National Dex species', () => {
    const mon = readSource(fixture('emerald.sav'), 3);
    expect(mon.length).toBeGreaterThan(0);
    for (const m of mon) {
      expect(m.species).toBeGreaterThanOrEqual(1);
      expect(m.species).toBeLessThanOrEqual(386);
    }
  });

  it('readSource reads Gen 4 sources via scan', () => {
    expect(readSource(fixture('diamond.sav'), 4).length).toBeGreaterThan(0);
  });

  it('transfers a real Gen 3 mon into Black 2 through the orchestrator', () => {
    const pick = readSource(fixture('emerald.sav'), 3)[0]!;
    const save = loadGen5(fixture('b2w2.sav'));
    transferToGen5Box(save, 0, 0, 3, pick.data);
    expect(readSpecies(loadGen5(save.toBytes()).boxSlot(0, 0)!)).toBe(pick.species);
  });

  it('convertToGen5 rejects source gens not yet implemented (clear error, no silent corruption)', () => {
    expect(() => convertToGen5(2, new Uint8Array(80))).toThrowError(/gen 2/i);
  });
});
