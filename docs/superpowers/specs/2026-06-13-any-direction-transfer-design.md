# Any-Direction Transfer — Design

**Date:** 2026-06-13
**Status:** approved (Nicole), implementation in progress on `feat/any-direction-transfer`

## Goal

Today PokeBridge only moves Pokémon **up** the generation chain. This feature lets the user drop in
**any** supported save, pick **any other** generation, and transfer the chosen Pokémon **in either
direction** — as long as each mon can legitimately exist in the destination generation. The Pokémon is
never silently altered.

## Scope

- **Bidirectional:** Gen 3 ↔ Gen 5 ↔ Gen 7 (Ruby/Sapphire/Emerald/FireRed/LeafGreen ↔ Black/White/B2W2 ↔
  Ultra Sun/Ultra Moon).
- **Source-only (up only):** Gen 1, Gen 2 — unchanged.
- **Gen 4:** later phase (no save support exists yet; DP/Pt/HGSS double-block layout is the heavy lift).
- **Pokémon Box (GameCube `.gci`):** out of scope. Different container; not pursued.

## Key decisions

1. **Canonical hub, no pivot gen.** Every save is read into one neutral in-memory `Mon` object (a superset
   of all generations' fields). Every generation has a *reader* (`save → Mon[]`) and a *writer*
   (`Mon → save bytes`). Any source→destination is `read → Mon → write`. **Gen 5 is no longer a
   middleman** — Gen 3 ↔ Gen 7 goes direct through the neutral hub, so nothing is pinched through the PK5
   byte format. This replaces today's `genXto5` + `pk5to7` chain.
2. **Strict by default, with per-mon trim on review.** A mon transfers only if it fits the destination
   with **zero changes**. Anything that can't be represented is **blocked with a reason**, never silently
   modified. For each blocked mon the user can review and choose **"Trim & transfer"** (drops only the
   offending fields, shows exactly what) or skip it.

## Architecture

```
            readers                         writers
  Gen3 save ─┐                          ┌─ Gen3 save  (NEW writer — done)
  Gen5 save ─┼──►   Mon (hub object)  ──┼─ Gen5 save  (exists)
  Gen7 save ─┘          │               └─ Gen7 save  (exists)
  Gen1/2    ─┘ (up only)│
                        ▼
              checkCompatibility(mon, targetGen) → Blocker[]
                        │
                  (strict: block; or user opts to trim → applyTrim(mon, blockers) → Mon)
```

### Components

- **`Mon` hub type** (`src/hub/mon.ts`) — normalized representation: PID, encryption constant (Gen6/7),
  national dex + form, OT name/ID, nickname, IVs, EVs, moves+PP, ability(+slot), nature, gender,
  shininess, exp, friendship, held item, origin generation.
- **Per-gen codecs** — `readMon`/`writeMon` mapping each generation's on-disk Pokémon ⇄ `Mon`. Built by
  re-expressing the existing `genXto5` / `pk5to7` field logic around the hub (covered by existing tests).
- **Gen 3 save writer** (`src/saves/gen3.ts`) — **done**: `setBoxSlot` / `clearBoxSlot` / `toBytes`,
  PK3 re-encryption (`encryptPk3`), section scatter (handles slots straddling section boundaries), and
  Gen 3 section-checksum recompute.
- **Compatibility checker** (`src/hub/compatibility.ts`) — `checkCompatibility(mon, targetGen) →
  Blocker[]`. Blocker categories: species out of target dex; move introduced after target gen; ability /
  held item / form not representable; and the down-only PID-coupling case (Gen 3 derives nature, gender,
  and ability from the PID, and shininess is locked to it — so a mon whose nature/gender/ability can't be
  reproduced from its PID is blocked rather than mutated).
- **Trim engine** (`src/hub/trim.ts`) — `applyTrim(mon, blockers) → { mon, removed[] }`. Only ever clears
  fields the checker flagged; never changes the species or PID.
- **UI** — source picker (any supported save) + destination-gen picker; per-mon list showing ✅ ready or
  ⚠️ blocked-with-reasons; per-mon "Trim & transfer" / skip; then write (download or save-in-place).

## Phasing

- **Phase 1 (current):** Gen 3 writer ✅ → `Mon` hub → per-gen codecs → compatibility checker + trim →
  UI wiring. Unlocks Gen 3 ↔ 5 ↔ 7 any direction.
- **Phase 2 (later):** Gen 4 read + write.

## Testing

Real saves as git-ignored fixtures (Emerald, a Gen 5, USUM). Property/round-trip tests both directions:
- Up: Emerald mon → USUM → read back (already covered for the up paths).
- Down: a USUM mon that existed in Gen 3 → Emerald → read back; species / IVs / EVs / **shininess**
  preserved.
- No-op oracle for every writer (load → toBytes → reload is identity).
- Compatibility checker unit tests per blocker category; trim only removes flagged fields.

## Invariants (purist guarantees)

- PID and OT identity are always preserved → shininess is preserved automatically, up or down.
- A transferred mon's species/IVs/EVs/moves are never changed except by an explicit per-mon trim the user
  confirmed after seeing what would be removed.
