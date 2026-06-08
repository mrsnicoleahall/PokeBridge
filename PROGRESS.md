# PokeBridge — progress

**99 tests green · 21 commits on `main` · build clean.** Every layer validated against real save files.

## The chain — any old game → a modern game
**Sources:** Gen 1, 2, 3, 4, 5 (Red/Blue/Yellow · Gold/Silver/Crystal · Ruby…LeafGreen · DPPt/HGSS · BW/B2W2)
**Destinations:** Gen 5 (Black/White/B2W2) **or Gen 7 (Ultra Sun/Ultra Moon)** — pick in the UI.

Every source→destination path has an end-to-end test: a real mon out of that save → converted → into a real
destination save → reads back as the right species, checksums valid.

## The no-Transporter route to Bank/HOME (the dream feature)
Bank/HOME are cloud — can't write them directly. So instead PokeBridge writes your whole collection straight
into an **Ultra Moon** save; from there the game's **native Bank/HOME link moves whole boxes** — no
Poké Transporter, no 30-at-a-time grind. Back up/restore the USUM save with Checkpoint/JKSM on the CFW 3DS.

Cracking Gen 7 was the hard part: its block checksums use CRC-16/X-25 over scattered, game-specific block
offsets — reverse-engineered from your real save (PC storage = block 14, 960×232 @ 0xEACE) and validated with
the no-op oracle (recompute on the untouched save → byte-identical).

## Quality-of-life
- **Transfer all** — fills empty destination slots across boxes in one click.
- **Validity filter** — skips (and reports) Pokémon that legitimately can't move up: out-of-dex species (also
  catches anything that maps to an unknown species) and eggs. Never writes a glitched slot.
- **Emulator saves** — DeSmuME `.dsv`/`.dst` footers auto-stripped.
- **Save in place** — open the destination off the SD card and write back to it (Gen 5 / nds-bootstrap).

## Run it
```bash
cd ~/Projects/PokeBridge
npm run dev      # → http://localhost:5273 (Chrome for in-place SD save)
npm test         # 99 tests
```

## Known cosmetic gaps (non-blocking; you don't care about legality)
- **Ability is now carried** for Gen 1/2/3 — resolved from a species→ability table (slot from the Gen 3
  ability bit, or PID-derived for Gen 1/2). Only the **held item** is left unset (item IDs differ across gens).
- Gen 7 met-data is minimal (version-of-origin set to Ultra Moon). Mon transfer, play, and read back correctly.
