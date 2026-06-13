import { useMemo, useRef, useState } from 'react';
import {
  readSource, convertToGen5, convertToGen7, isTransferableToGen5, isTransferableToGen7, type SourceMon,
} from '../transfer/transfer';
import { loadHubSave, enumerateMon, firstEmptySlot, type HubSave } from '../hub/saveio';
import { prepareTransfer, type BidirectionalGen } from '../hub/transfer';
import { checkCompatibility, type Blocker } from '../hub/compatibility';
import type { Mon } from '../hub/mon';
import { spriteUrl, spriteFallbackUrl } from './sprites';

type SourceGame = { id: string; label: string; gen: number };
type DestGame = { id: string; label: string; gen: BidirectionalGen };

// Hub gens (3/5/7) are full source AND destination. Gen 1/2/4 stay up-only sources (→ Gen 5/7).
const SOURCE_GAMES: SourceGame[] = [
  { id: 'rby', label: 'Red / Blue / Yellow  (Gen 1)', gen: 1 },
  { id: 'gsc', label: 'Gold / Silver / Crystal  (Gen 2)', gen: 2 },
  { id: 'gba', label: 'Ruby / Sapphire / Emerald / FR / LG  (Gen 3)', gen: 3 },
  { id: 'dppt', label: 'Diamond / Pearl / Platinum  (Gen 4)', gen: 4 },
  { id: 'hgss', label: 'HeartGold / SoulSilver  (Gen 4)', gen: 4 },
  { id: 'bw', label: 'Black / White / Black 2 / White 2  (Gen 5)', gen: 5 },
  { id: 'usum', label: 'Ultra Sun / Ultra Moon  (Gen 7)', gen: 7 },
];

const DEST_GAMES: DestGame[] = [
  { id: 'gen3', label: 'Ruby / Sapphire / Emerald / FR / LG  (Gen 3)', gen: 3 },
  { id: 'gen4', label: 'Diamond / Pearl / Platinum / HG / SS  (Gen 4)', gen: 4 },
  { id: 'gen5', label: 'Black / White / Black 2 / White 2  (Gen 5)', gen: 5 },
  { id: 'gen7', label: 'Ultra Sun / Ultra Moon  (Gen 7)', gen: 7 },
];

const BOX_COLS = 6;
const SLOTS_PER_BOX = 30;
const HAS_FSA = typeof window !== 'undefined' && 'showOpenFilePicker' in window;
const isHubGen = (g: number): g is BidirectionalGen => g === 3 || g === 4 || g === 5 || g === 7;
const UP_ONLY_DESTS = (g: number) => g === 5 || g === 7; // where legacy Gen 1/2 sources may go

type Entry =
  | { kind: 'hub'; dex: number; label: string; mon: Mon }
  | { kind: 'legacy'; dex: number; label: string; gen: number; data: Uint8Array; nickname: string; otName: string };

interface Verdict {
  ready: boolean;
  blockers: Blocker[];
  trimmable: boolean; // every blocker can be trimmed away (i.e. none are untrimmable like out-of-dex)
}

const readFile = (file: File): Promise<Uint8Array> => file.arrayBuffer().then((b) => new Uint8Array(b));

function download(bytes: Uint8Array, name: string) {
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function legacyConvert(entry: Extract<Entry, { kind: 'legacy' }>, destGen: BidirectionalGen): Uint8Array {
  const opts = { nickname: entry.nickname, otName: entry.otName };
  return destGen === 7 ? convertToGen7(entry.gen, entry.data, opts) : convertToGen5(entry.gen, entry.data, opts);
}

/** Can this entry go to the chosen destination generation? (display + gating, independent of the loaded save) */
function evaluate(entry: Entry, destGen: BidirectionalGen): Verdict {
  if (entry.kind === 'hub') {
    const blockers = checkCompatibility(entry.mon, destGen);
    return { ready: blockers.length === 0, blockers, trimmable: blockers.length > 0 && blockers.every((b) => b.code !== 'SPECIES_OUT_OF_DEX') };
  }
  // legacy Gen 1/2 — up only (to Gen 5/7)
  if (!UP_ONLY_DESTS(destGen)) {
    return { ready: false, trimmable: false, blockers: [{ code: 'SPECIES_OUT_OF_DEX', detail: `Gen ${entry.gen} Pokémon only transfer UP — pick a Gen 5 or Gen 7 destination.` }] };
  }
  const ok = destGen === 7 ? isTransferableToGen7(legacyConvert(entry, destGen)) : isTransferableToGen5(legacyConvert(entry, destGen));
  return { ready: ok, trimmable: false, blockers: ok ? [] : [{ code: 'SPECIES_OUT_OF_DEX', detail: "Can't transfer up (out of the destination's dex, or an egg)." }] };
}

function Sprite({ dex, size = 64 }: { dex: number; size?: number }) {
  const [src, setSrc] = useState(spriteUrl(dex));
  return (
    <img className="sprite" src={src} width={size} height={size} alt={`#${dex}`}
      onError={() => src !== spriteFallbackUrl(dex) && setSrc(spriteFallbackUrl(dex))} />
  );
}

export function App() {
  const [game, setGame] = useState<SourceGame>(SOURCE_GAMES[2]!); // default Gen 3
  const [entries, setEntries] = useState<Entry[]>([]);
  const [sourceName, setSourceName] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [trimArmed, setTrimArmed] = useState(false);
  const [moved, setMoved] = useState<Set<number>>(new Set());

  const [destGame, setDestGame] = useState<DestGame>(DEST_GAMES[1]!); // default Gen 5
  const [save, setSave] = useState<HubSave | null>(null);
  const [targetName, setTargetName] = useState('');
  const [targetHandle, setTargetHandle] = useState<any>(null);
  const [box, setBox] = useState(0);
  const [, bump] = useState(0);
  const [toast, setToast] = useState('');

  const srcInput = useRef<HTMLInputElement>(null);
  const dstInput = useRef<HTMLInputElement>(null);
  const destGen = destGame.gen;

  const flash = (m: string) => { setToast(m); window.setTimeout(() => setToast(''), 3200); };

  // Per-entry readiness for the current destination — recomputed when entries or destination change.
  const verdicts = useMemo(() => entries.map((e) => evaluate(e, destGen)), [entries, destGen]);
  const readyCount = verdicts.filter((v) => v.ready).length;

  async function loadSource(file: File) {
    try {
      const bytes = await readFile(file);
      let list: Entry[];
      if (isHubGen(game.gen)) {
        const s = loadHubSave(game.gen, bytes);
        list = enumerateMon(s).map(({ mon }) => ({ kind: 'hub', dex: mon.nationalDex, label: mon.nickname || `#${mon.nationalDex}`, mon }));
      } else {
        list = readSource(bytes, game.gen).map((m: SourceMon) => ({
          kind: 'legacy', dex: m.species, label: m.nickname || `#${m.species}`, gen: game.gen, data: m.data, nickname: m.nickname, otName: m.otName,
        }));
      }
      setEntries(list);
      setSourceName(file.name);
      setSelected(null);
      setTrimArmed(false);
      setMoved(new Set());
      flash(`Found ${list.length} Pokémon in ${file.name}`);
    } catch (e) {
      flash(`Couldn't read that save: ${(e as Error).message}`);
    }
  }

  async function loadTarget(file: File, handle: any = null) {
    try {
      setSave(loadHubSave(destGen, await readFile(file)));
      setTargetName(file.name);
      setTargetHandle(handle);
      setBox(0);
      flash(handle ? `Loaded ${file.name} — savable to the SD in place` : `Loaded destination: ${file.name}`);
    } catch (e) {
      flash(`Not a valid ${destGame.label} save: ${(e as Error).message}`);
    }
  }

  async function openTargetFromDisk() {
    try {
      const [handle] = await (window as any).showOpenFilePicker({
        types: [{ description: 'Pokémon save', accept: { 'application/octet-stream': ['.sav', '.dsv', '.dst', '.bin'] } }],
      });
      await loadTarget(await handle.getFile(), handle);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') flash(`Couldn't open: ${(e as Error).message}`);
    }
  }

  async function saveOut() {
    if (!save) return;
    const bytes = save.toBytes();
    try {
      if (targetHandle) {
        const w = await targetHandle.createWritable();
        await w.write(bytes as unknown as BufferSource);
        await w.close();
        return flash('✓ Saved back to the SD card, in place');
      }
      if (HAS_FSA) {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: targetName || `${destGame.id}.sav`,
          types: [{ accept: { 'application/octet-stream': ['.sav'] } }],
        });
        const w = await handle.createWritable();
        await w.write(bytes as unknown as BufferSource);
        await w.close();
        setTargetHandle(handle);
        return flash('✓ Saved');
      }
      download(bytes, (targetName || destGame.id).replace(/\.sav$/i, '') + ' (PokeBridge).sav');
      flash('Downloaded — drop it on your SD card');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') flash(`Save failed: ${(e as Error).message}`);
    }
  }

  const slots = useMemo(() => (save ? Array.from({ length: SLOTS_PER_BOX }, (_, s) => save.slot(box, s)) : []), [save, box]);

  /** Place the selected entry into a slot, applying trim if the user armed it. */
  function placeInSlot(slot: number) {
    if (!save) return flash('Load your destination save on the right first.');
    if (selected == null) return flash('Pick a Pokémon on the left first.');
    if (slots[slot]) return flash('That slot is taken — pick an empty one.');
    const entry = entries[selected]!;

    if (entry.kind === 'hub') {
      const out = prepareTransfer(entry.mon, destGen, { trim: trimArmed });
      if (out.status === 'blocked') return flash(`${entry.label} can't go to Gen ${destGen}: ${out.blockers[0]!.detail}`);
      save.place(box, slot, out.mon);
      const note = out.status === 'trimmed' ? ` · trimmed: ${out.removed.join(', ')}` : '';
      finishPlace(selected, `Sent ${entry.label} → Box ${box + 1}${note}`);
    } else {
      if (!UP_ONLY_DESTS(destGen)) return flash(`Gen ${entry.gen} Pokémon can only transfer up to Gen 5 or 7.`);
      const pk = legacyConvert(entry, destGen);
      const ok = destGen === 7 ? isTransferableToGen7(pk) : isTransferableToGen5(pk);
      if (!ok) return flash(`${entry.label} can't transfer up — skipped.`);
      save.placeRaw(box, slot, pk);
      finishPlace(selected, `Sent ${entry.label} → Box ${box + 1}`);
    }
  }

  function finishPlace(idx: number, msg: string) {
    setMoved((m) => new Set(m).add(idx));
    setSelected(null);
    setTrimArmed(false);
    bump((v) => v + 1);
    flash(msg);
  }

  /** Move every ready (no-trim-needed) mon into free slots, in order. Blocked mon are left for review. */
  function transferAllReady() {
    if (!save) return flash('Load your destination save on the right first.');
    let placed = 0;
    const newlyMoved = new Set(moved);
    for (let i = 0; i < entries.length; i++) {
      if (newlyMoved.has(i) || !verdicts[i]!.ready) continue;
      const spot = firstEmptySlot(save);
      if (!spot) break;
      const entry = entries[i]!;
      if (entry.kind === 'hub') save.place(spot.box, spot.slot, entry.mon);
      else save.placeRaw(spot.box, spot.slot, legacyConvert(entry, destGen));
      newlyMoved.add(i);
      placed++;
    }
    setMoved(newlyMoved);
    setSelected(null);
    bump((v) => v + 1);
    const blocked = entries.length - newlyMoved.size;
    flash(placed ? `Transferred ${placed} ready Pokémon${blocked ? ` · ${blocked} need review` : ''} ✓` : 'Nothing ready to transfer.');
  }

  const sel = selected != null ? { entry: entries[selected]!, verdict: verdicts[selected]! } : null;

  return (
    <div className="app">
      <header className="masthead">
        <div className="wordmark">POKé<span>BRIDGE</span></div>
        <p className="tagline">Move your Pokémon <b>any direction</b> across Gen 3 ↔ 5 ↔ 7 — and up from Gen 1/2/4.</p>
      </header>

      <ol className="steps">
        <li><b>1</b> Pick a source game &amp; load its save</li>
        <li><b>2</b> Pick &amp; load the destination save</li>
        <li><b>3</b> Click a Pokémon (✓ ready / ⚠ needs review), then an empty slot</li>
        <li><b>4</b> Save — your original files are never touched</li>
      </ol>

      <main className="bridge">
        {/* ----------------------------- SOURCE ----------------------------- */}
        <section className="panel source">
          <div className="panel-head">
            <h2>Source game</h2>
            <select value={game.id} onChange={(e) => { setGame(SOURCE_GAMES.find((x) => x.id === e.target.value)!); setEntries([]); setSourceName(''); setSelected(null); }}>
              {SOURCE_GAMES.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
            </select>
          </div>

          <button className="drop" onClick={() => srcInput.current?.click()}>
            {sourceName ? <span className="loaded">◈ {sourceName}</span> : 'Load source .sav'}
          </button>
          <input ref={srcInput} type="file" accept=".sav,.dsv,.dst,.bin" hidden
            onChange={(e) => e.target.files?.[0] && loadSource(e.target.files[0])} />

          {entries.length > 0 && (
            <div className="bulk-row">
              <span>{entries.length} Pokémon · {readyCount} ready → Gen {destGen} · {moved.size} sent</span>
              <button className="bulk-btn" onClick={transferAllReady} disabled={!save || moved.size >= entries.length}>
                Transfer all ready →
              </button>
            </div>
          )}

          <div className="grid mon-grid">
            {entries.map((m, i) => {
              const v = verdicts[i]!;
              return (
                <button key={`${i}-${m.dex}`}
                  className={`mon ${selected === i ? 'sel' : ''} ${moved.has(i) ? 'moved' : ''} ${v.ready ? 'ok' : 'blocked'}`}
                  onClick={() => { setSelected(i); setTrimArmed(false); }} title={m.label}>
                  <Sprite dex={m.dex} />
                  <span className="mon-name">{m.label}</span>
                  <span className={`badge ${v.ready ? 'badge-ok' : 'badge-warn'}`}>{v.ready ? '✓' : '⚠'}</span>
                </button>
              );
            })}
            {entries.length === 0 && <p className="empty-note">No Pokémon loaded yet.</p>}
          </div>

          {/* ------- per-mon review when a blocked mon is selected ------- */}
          {sel && !sel.verdict.ready && (
            <div className="review">
              <h3>⚠ {sel.entry.label} can't move to Gen {destGen} as-is</h3>
              <ul>{sel.verdict.blockers.map((b, k) => <li key={k}>{b.detail}</li>)}</ul>
              {sel.verdict.trimmable ? (
                <button className="trim-btn" onClick={() => { setTrimArmed(true); flash('Trim armed — click an empty slot to send the trimmed copy.'); }}>
                  Trim &amp; transfer {trimArmed ? '(armed — pick a slot)' : '→'}
                </button>
              ) : (
                <p className="hard-block">This can't be trimmed — the species doesn't exist in Gen {destGen}.</p>
              )}
            </div>
          )}
          {sel && sel.verdict.ready && <p className="ready-hint">✓ {sel.entry.label} is ready — click an empty slot on the right.</p>}
        </section>

        {/* ---------------------------- CONDUIT ----------------------------- */}
        <div className="conduit" aria-hidden><span className={selected != null ? 'arrow live' : 'arrow'}>➜</span></div>

        {/* --------------------------- DESTINATION -------------------------- */}
        <section className="panel target">
          <div className="panel-head">
            <h2>Destination</h2>
            {save ? (
              <button className="ghost" onClick={saveOut}>
                {targetHandle ? '✓ Save to SD (in place)' : HAS_FSA ? '↓ Save to SD…' : '↓ Download save'}
              </button>
            ) : (
              <select value={destGame.id} onChange={(e) => setDestGame(DEST_GAMES.find((x) => x.id === e.target.value)!)}>
                {DEST_GAMES.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
              </select>
            )}
          </div>

          {!save ? (
            <>
              <button className="drop" onClick={() => (HAS_FSA ? openTargetFromDisk() : dstInput.current?.click())}>
                Load {destGame.label} .sav
              </button>
              <input ref={dstInput} type="file" accept=".sav,.dsv,.dst,.bin" hidden
                onChange={(e) => e.target.files?.[0] && loadTarget(e.target.files[0])} />
              <p className="empty-note">
                This is the save PokeBridge writes to.{HAS_FSA ? ' Open it off your SD card to save back in place.' : ''}
              </p>
            </>
          ) : (
            <>
              <p className="sd-hint">
                {destGen === 7 ? (
                  <>↳ Back up the Ultra Sun/Moon save with <code>Checkpoint</code>, edit here, restore — then the in-game Bank/HOME link moves whole boxes.</>
                ) : destGen === 5 || destGen === 4 ? (
                  <>↳ On a CFW 2DS this DS save lives by the ROM in <code>/roms/nds/</code> (or <code>/saves/</code>). Save back and load on the console.</>
                ) : (
                  <>↳ Gen 3 save — back it up first (the original is never touched here), then load the edited copy on your console/emulator.</>
                )}
              </p>
              <div className="box-nav">
                <button onClick={() => setBox((b) => (b + save.boxCount - 1) % save.boxCount)}>‹</button>
                <span>Box {box + 1} / {save.boxCount}</span>
                <button onClick={() => setBox((b) => (b + 1) % save.boxCount)}>›</button>
              </div>
              <div className="grid box-grid" style={{ gridTemplateColumns: `repeat(${BOX_COLS}, 1fr)` }}>
                {Array.from({ length: SLOTS_PER_BOX }, (_, slot) => {
                  const occupant = slots[slot];
                  const armed = selected != null && !occupant && (sel?.verdict.ready || trimArmed);
                  return (
                    <button key={slot} className={`slot ${occupant ? 'full' : 'open'} ${armed ? 'armed' : ''}`} onClick={() => placeInSlot(slot)}>
                      {occupant ? <Sprite dex={occupant.nationalDex} size={48} /> : <span className="slot-dot" />}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </main>

      <div className={`toast ${toast ? 'show' : ''}`}>{toast}</div>
    </div>
  );
}
