# PokeBridge — spec

A local tool to move Pokémon **up** the generation chain into **Black/White/Black 2/White 2**, so they
can then ride the official Pokémon Bank path to the modern games. It collapses a messy, partly-impossible
official transfer chain (notably the severed Gen 2→3 jump, plus one-way Pal Park / Poké Transfer) into
"pick a mon → drop it in your BW box."

## Decisions (locked)
- **Platform:** local web app on the Mac. Reads/writes `.sav` files off the mounted SD card. (Not on-device homebrew.)
- **Scope:** transfer/uplift ONLY. No save editing, no Pokémon modification, no legality engine.
  Nicole catches mon legitimately in-game and moves them up the chain *unchanged*. Inputs are assumed legit.
- **Only Gen 5 (BW/B2W2) is ever WRITTEN.** Gen 1–4 are read-only *sources*. Conversion is always
  source-gen → Gen 5 (PK1/PK2/PK3/PK4 → PK5), collapsing the chain into "pick mon → drop in BW box".
- **Source gens:** ALL of Gen 1, 2, 3, 4 are in scope as sources → Gen 5. The full chain, no hoops.
  Build order tackles Gen 4→5 first (closest formats, real data on hand), then Gen 3→5, then Gen 1/2→5
  (GB era — DVs→IVs etc. follow the official Poké Transporter VC-transfer rules), but all four ship.
- **Must work on emulator / virtual-card saves** (CFW: GBARunner2 for GBA, nds-bootstrap for DS). The
  input normalizer detects & strips known emulator footers (e.g. DeSmuME `.dsv`/`.dst` 122-byte footer)
  and validates raw save size before parsing. Output must be a clean raw `.sav` the game/emulator accepts.
- **UI:** intuitive `.sav` upload + result download; ideally also point directly at the mounted SD card path.

## Architecture — five isolated units
1. **codec/** — encode/decode raw Pokémon blocks ↔ a normalized model.
   - `prng` — Gen 4/5 LCRNG used for block encryption.
   - `shuffle` — the 24-permutation block shuffle keyed off PID.
   - `pk5`, `pk4`, `pk3` — per-gen decrypt/encrypt + field read/write.
2. **saves/** — per-game save parser/writer (Gen 3 RSE/FRLG, Gen 4 DPPt/HGSS, Gen 5 BW/B2W2).
   `load(buffer) → {trainer, boxes, party}`, `write(model) → buffer` with correct checksums.
3. **convert/** — cross-gen uplift rules (species/XP/IVs/ability/met-data/origin flags). Gen 3→5 = Gen 3→4 ∘ Gen 4→5.
4. **transfer/** — pure orchestrator: `(sourceSave, picks, targetSave) → updated targetSave`.
5. **ui/** — Vite + React dual-pane box view, drag-to-transfer, auto-backup on write. (Built after the engine is proven.)

## Trust rules
- **Never** overwrite a `.sav` without backing up the original first.
- Every codec must pass a **round-trip test** (`encode(decode(x)) === x`, byte-identical) before any write path uses it.
- Engine is pure/testable with zero UI or filesystem coupling.

## Confirmed B2W2 offsets (verified against Nicole's real save, 2026-06-05)
- Save = 0x80000 (512KB). Two blocks; the second mirrors the first at **+0x26000**. Save counter at offset 0.
- **Box data base `0x400`**, box stride `0x1000` (0xFF0 data + names), **30 slots/box × 136 bytes**, 24 boxes.
- **Party base `0x18E08`**, 220-byte entries.
- A stored slot is empty when its 0x06 checksum is 0 / species is 0.
- Codec confirmed: real mon decrypt correctly (Regirock/Virizion/Emboar/Volcarona/Eelektross/Scrafty in Box 8; Kyurem+Sigilyph in party).

## Build order
1. ✅ codec: prng → shuffle → pk5 (decrypt/encrypt/round-trip) — **DONE**
2. ✅ saves: Gen 5 read boxes + write a slot (byte-identical identity round-trip) — **DONE** (verified vs real save)
3. ✅ Gen 5 block-checksum recompute (CRC-16-CCITT per box @ +0xFF2, both copies) — **DONE**, oracle-verified byte-identical on the real save
4. ✅ Gen 4→5 conversion — **DONE**. End-to-end verified: real Diamond mon → converted → into B2W2 save → reads back. (PK4↔PK5 share layout; deltas = nature byte 0x41 = PID%25, flags 0x42 = 0.)
5. ✅ transfer orchestrator + source enumerator — **DONE**. `listSourceMon` (scan + dedup-by-PID, game-agnostic for Gen 4/5) → `transferToGen5Box`. Verified on Diamond + SoulSilver → B2W2.
6. ✅ UI MVP (Vite+React) — **DONE**. Pick source game → load .sav → sprite grid of your mon → load Black 2 → click mon → click empty box slot → download. Pixel BW sprites, clean storage-terminal look. `npm run dev` (port 5273).
7. PK3 reader + Gen 3→5 (emerald.sav, firered.sav)  ← **next**
8. Gen 1/2 (GB) readers + Gen 1/2→5 (official VC-transfer DV→IV rules)
9. Input normalizer (strip DeSmuME/emulator footers) + direct SD-card path + polish
   - ✅ direct SD save: File System Access API writes the raw `.sav` back in place on the card (CFW/nds-bootstrap compatible); download fallback otherwise. CFW round-trip documented in README.
   - ⏳ still to do: strip emulator footers (DeSmuME `.dsv`/`.dst`) on input so footer'd saves load.

Real-save round-trip verification is a milestone for when Nicole has actual saves on the SD card; until then
development uses synthetic blocks + documented test vectors + fresh (empty-box) saves.
