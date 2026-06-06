# PokeBridge — progress (as of 2026-06-05)

**82 tests green · 14 commits on `main` · build clean.** The full chain is done.

## ✅ Gen 1 / 2 / 3 / 4 / 5 → Black/White 2 — all working, all validated against real saves
- **Gen 1** (Red/Blue/Yellow) — validated on the RoC Blue living dex (all 151)
- **Gen 2** (Gold/Silver/Crystal) — validated on the RoC Crystal living dex
- **Gen 3** (Ruby/Sapphire/Emerald/FR/LG) — validated on your Emerald + FireRed
- **Gen 4** (DPPt/HGSS) — validated on your Diamond + SoulSilver
- **Gen 5** (BW/B2W2) — validated on your Black 2

Every generation has an end-to-end test proving: a real mon out of that save → converted → dropped into
your real Black 2 save → reads back as the correct National Dex species, with valid checksums.

## The UI
`npm run dev` → http://localhost:5273 (Chrome for "Save to SD in place"). Pick the source game from the
dropdown (now all five eras) → load `.sav` → your Pokémon appear as sprites → load Black 2 → click a mon →
click an empty box slot → **Save to SD**. Emulator footers (DeSmuME `.dsv`/`.dst`) are auto-stripped.

## How Gen 1/2 conversion handles missing data
Gen 1/2 Pokémon predate PID/nature/ability/gender, so the uplift follows sensible rules:
- **DV → IV** as `2*DV+1` (a flawless GB mon stays flawless)
- **PID** synthesized deterministically (drives nature/gender/shininess); **nature** set from it
- **Gen 1 species** use a scrambled internal index → mapped via a table derived from the living dex and
  verified against known index facts (Rhydon=1, Mew=21, Mewtwo=131, Bulbasaur=153)
- **EVs reset** (Gen 1/2 "stat experience" is a different system)

## Known cosmetic gaps (non-blocking; you said you don't care about legality)
- **Held item** and **ability** are left empty on Gen 1/2/3 transfers — both need cross-gen lookup tables.
  The mon transfers, plays, and is correct in species/level/moves/IVs/nickname; these are quick follow-ups
  whenever you want them filled in.

## Commit log (newest first)
`Gen1 + full chain wiring · Gen2 GSC · gen3 UI wiring · gen3→5 · gen3 parser · gen3 species ·
footer normalizer · CFW save-in-place · UI · orchestrator · Gen5 foundation`
