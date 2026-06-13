// The canonical "hub" representation a Pokémon is read into and written out from. It is a superset of
// every supported generation's fields, so any source→destination transfer is just read→Mon→write — with
// no generation acting as a pivot. Generation-specific codecs map their on-disk format ⇄ Mon.
//
// Purist invariant: PID and OT identity are always carried verbatim, so shininess (a function of PID and
// OT ID) is preserved automatically in every direction. A field is only ever dropped by an explicit,
// user-confirmed trim — never silently.

export type Generation = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Six stats in National-Dex/PKHeX order: HP, Atk, Def, SpA, SpD, Spe. */
export type StatSpread = [number, number, number, number, number, number];

export interface Mon {
  // Identity
  pid: number; // u32 — preserved verbatim across all gens
  encryptionConstant?: number; // u32, Gen 6/7 only (absent ⇒ pre-Gen 6 origin)
  nationalDex: number; // 1..1025
  form: number; // form index; 0 = base form

  // Trainer / origin
  otName: string;
  otId: number; // full 32-bit (visible TID in low 16 bits, SID in high 16) — drives shininess
  nickname: string;
  language?: number;
  originGen: Generation; // where this mon actually came from (informs down-transfer legality)

  // Stats
  ivs: StatSpread; // 0..31 each
  evs: StatSpread; // 0..255 each (Gen 3+), 0..65535 stat-exp collapses to this on the way up

  // Battle
  moves: [number, number, number, number]; // move ids; 0 = empty
  movePP: [number, number, number, number];
  ability: number; // ability id; 0 if the origin gen had no abilities (Gen 1/2)
  abilitySlot?: number; // 0 = first, 1 = second, 2 = hidden
  nature: number; // 0..24
  gender: number; // 0 = male, 1 = female, 2 = genderless

  // Progress / misc
  exp: number;
  friendship: number;
  heldItem?: number;
  level?: number;
}

const SHINY_THRESHOLD_GEN6_PLUS = 16;
const SHINY_THRESHOLD_LEGACY = 8;

/**
 * Shininess is derived from PID and OT ID identically in spirit across gens; only the threshold changed
 * (8 through Gen 5, 16 from Gen 6). Since PokeBridge preserves PID and OT ID, a shiny mon stays shiny
 * going up; going down to Gen 3–5 it stays shiny only if it clears the stricter legacy threshold, which
 * the compatibility checker accounts for.
 */
export function isShiny(pid: number, otId: number, gen: Generation): boolean {
  const tid = otId & 0xffff;
  const sid = (otId >>> 16) & 0xffff;
  const high = (pid >>> 16) & 0xffff;
  const low = pid & 0xffff;
  const xor = tid ^ sid ^ high ^ low;
  return xor < (gen >= 6 ? SHINY_THRESHOLD_GEN6_PLUS : SHINY_THRESHOLD_LEGACY);
}
