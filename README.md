# PokeBridge

A local tool to move **legitimately-caught Pokémon up the generation chain into Black/White/Black 2/White 2**,
where the official Pokémon Bank path can carry them to the modern games. It collapses a messy, partly-impossible
transfer chain (the severed Gen 2→3 jump, one-way Pal Park / Poké Transfer) into: **pick a mon → drop it in your BW box.**

- **Gen 1 / 2 / 3 / 4 → Gen 5.** No editing, no modification, no legality engine — your Pokémon, moved up unchanged.
- **Only Gen 5 is ever written.** Gen 1–4 are read-only sources.
- **Works with emulator / CFW saves** (GBARunner2, nds-bootstrap) — handles raw saves and emulator footers.
- **Web UI** (coming): drag a `.sav` in → see your boxes → click a Pokémon → download the result.

## Status
Engine built test-first against real save files. See `SPEC.md` for the build order and progress.

```bash
npm install
npm test        # run the suite
```

## Layout
- `src/codec/` — Pokémon block encrypt/decrypt (PRNG, block shuffle, PK5)
- `src/saves/` — save parsing/writing + checksums (Gen 5 read/write)
- `src/convert/` — cross-generation uplift rules (Gen 4→5, …)
- `src/transfer/` — orchestration (pick source mon → write into target)
- `fixtures/` — real save files for tests (gitignored; never committed)
