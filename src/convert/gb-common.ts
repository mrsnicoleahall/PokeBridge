// Shared helpers for uplifting Gen 1/2 (Game Boy) Pokémon, which lack modern data.
//
// Gen 1/2 store 4 DVs (0–15): Attack, Defense, Speed, Special. HP's DV is derived from their LSBs.
// We map DV→IV as IV = DV*2+1, so a flawless GB mon (DV 15) becomes a flawless Gen 5 mon (IV 31).
// Special (one stat in Gen 1/2) fills both Sp.Atk and Sp.Def. Gen 1/2 have no PID, so we synthesize
// a deterministic one (drives nature/gender/shininess in Gen 5); nature is set explicitly elsewhere.

export function dvToIv(dv: number): number {
  return (dv & 0xf) * 2 + 1; // 0..15 → 1..31, perfect→perfect
}

/** HP DV is the low bit of each of the four DVs, per Gen 1/2. */
export function gbHpDv(atk: number, def: number, spe: number, spc: number): number {
  return ((atk & 1) << 3) | ((def & 1) << 2) | ((spe & 1) << 1) | (spc & 1);
}

/** Pack six IVs (0–31) into the Gen 5 IV u32 (5 bits each: HP,Atk,Def,Spe,SpA,SpD). */
export function buildIvWord(hp: number, atk: number, def: number, spe: number, spa: number, spd: number): number {
  return (
    ((hp & 31) | ((atk & 31) << 5) | ((def & 31) << 10) | ((spe & 31) << 15) | ((spa & 31) << 20) | ((spd & 31) << 25)) >>> 0
  );
}

/** Deterministic 32-bit PID from stable inputs (so the same GB mon always yields the same PID). */
export function synthesizePid(otid: number, dvWord: number, species: number): number {
  return (Math.imul((otid + species) >>> 0, 0x41c64e6d) + dvWord + 0x6073) >>> 0;
}
