import { useMemo, useRef, useState } from 'react';
import { listSourceMon, transferToGen5Box, type SourceMon } from '../transfer/transfer';
import { loadGen5, type Gen5Save } from '../saves/gen5';
import { readSpecies, readNickname } from '../codec/pk5';
import { spriteUrl, spriteFallbackUrl } from './sprites';

type SourceGame = { id: string; label: string; gen: number; maxDex: number; ready: boolean };

const SOURCE_GAMES: SourceGame[] = [
  { id: 'bw', label: 'Black / White / Black 2 / White 2', gen: 5, maxDex: 649, ready: true },
  { id: 'dppt', label: 'Diamond / Pearl / Platinum', gen: 4, maxDex: 493, ready: true },
  { id: 'hgss', label: 'HeartGold / SoulSilver', gen: 4, maxDex: 493, ready: true },
  { id: 'gba', label: 'Ruby / Sapphire / Emerald / FR / LG  (Gen 3)', gen: 3, maxDex: 386, ready: false },
  { id: 'gb', label: 'Red / Blue / Yellow / Gold / Silver / Crystal  (Gen 1/2)', gen: 1, maxDex: 251, ready: false },
];

const BOX_COLS = 6;
const SLOTS_PER_BOX = 30;
const BOX_COUNT = 24;

const readFile = (file: File): Promise<Uint8Array> =>
  file.arrayBuffer().then((b) => new Uint8Array(b));

function download(bytes: Uint8Array, name: string) {
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function Sprite({ dex, size = 64 }: { dex: number; size?: number }) {
  const [src, setSrc] = useState(spriteUrl(dex));
  return (
    <img
      className="sprite"
      src={src}
      width={size}
      height={size}
      alt={`#${dex}`}
      onError={() => src !== spriteFallbackUrl(dex) && setSrc(spriteFallbackUrl(dex))}
    />
  );
}

export function App() {
  const [game, setGame] = useState<SourceGame>(SOURCE_GAMES[0]!);
  const [mon, setMon] = useState<SourceMon[]>([]);
  const [sourceName, setSourceName] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [moved, setMoved] = useState<Set<number>>(new Set());

  const [save, setSave] = useState<Gen5Save | null>(null);
  const [targetName, setTargetName] = useState('');
  const [box, setBox] = useState(0);
  const [, bump] = useState(0); // force re-read after a mutation
  const [toast, setToast] = useState('');

  const srcInput = useRef<HTMLInputElement>(null);
  const dstInput = useRef<HTMLInputElement>(null);

  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(''), 2600);
  };

  async function loadSource(file: File) {
    try {
      const bytes = await readFile(file);
      const list = listSourceMon(bytes, game.maxDex);
      setMon(list);
      setSourceName(file.name);
      setSelected(null);
      setMoved(new Set());
      flash(`Found ${list.length} Pokémon in ${file.name}`);
    } catch (e) {
      flash(`Couldn't read that save: ${(e as Error).message}`);
    }
  }

  async function loadTarget(file: File) {
    try {
      const bytes = await readFile(file);
      setSave(loadGen5(bytes));
      setTargetName(file.name);
      setBox(0);
      flash(`Loaded destination: ${file.name}`);
    } catch (e) {
      flash(`Not a valid Black/White 2 save: ${(e as Error).message}`);
    }
  }

  const slots = useMemo(() => (save ? save.box(box) : []), [save, box]);

  function placeInSlot(slot: number) {
    if (!save) return flash('Load your Black 2 save on the right first.');
    if (selected == null) return flash('Pick a Pokémon on the left first.');
    if (slots[slot]) return flash('That slot is taken — pick an empty one.');
    const pick = mon[selected]!;
    transferToGen5Box(save, box, slot, game.gen, pick.data);
    setMoved((m) => new Set(m).add(pick.pid));
    setSelected(null);
    bump((v) => v + 1);
    flash(`Sent ${readNickname(pick.data) || `#${pick.species}`} → Box ${box + 1}`);
  }

  return (
    <div className="app">
      <header className="masthead">
        <div className="wordmark">
          POKé<span>BRIDGE</span>
        </div>
        <p className="tagline">Move your Pokémon up the chain — Gen 1·2·3·4 → Black / White</p>
      </header>

      <ol className="steps">
        <li><b>1</b> Pick your old game &amp; load its save</li>
        <li><b>2</b> Load your Black 2 / White 2 save</li>
        <li><b>3</b> Click a Pokémon, then an empty box slot</li>
        <li><b>4</b> Download — your original file is never touched</li>
      </ol>

      <main className="bridge">
        {/* ----------------------------- SOURCE ----------------------------- */}
        <section className="panel source">
          <div className="panel-head">
            <h2>Source game</h2>
            <select
              value={game.id}
              onChange={(e) => {
                const g = SOURCE_GAMES.find((x) => x.id === e.target.value)!;
                setGame(g);
                setMon([]);
                setSourceName('');
              }}
            >
              {SOURCE_GAMES.map((g) => (
                <option key={g.id} value={g.id} disabled={!g.ready}>
                  {g.label}{g.ready ? '' : '  — coming soon'}
                </option>
              ))}
            </select>
          </div>

          {game.ready ? (
            <>
              <button className="drop" onClick={() => srcInput.current?.click()}>
                {sourceName ? <span className="loaded">◈ {sourceName}</span> : 'Load source .sav'}
              </button>
              <input
                ref={srcInput}
                type="file"
                accept=".sav,.dsv,.dst,.bin"
                hidden
                onChange={(e) => e.target.files?.[0] && loadSource(e.target.files[0])}
              />
              <div className="grid mon-grid">
                {mon.map((m, i) => (
                  <button
                    key={`${m.pid}-${i}`}
                    className={`mon ${selected === i ? 'sel' : ''} ${moved.has(m.pid) ? 'moved' : ''}`}
                    onClick={() => setSelected(i)}
                    title={`#${m.species}`}
                  >
                    <Sprite dex={m.species} />
                    <span className="mon-name">{readNickname(m.data) || `#${m.species}`}</span>
                  </button>
                ))}
                {mon.length === 0 && <p className="empty-note">No Pokémon loaded yet.</p>}
              </div>
            </>
          ) : (
            <p className="empty-note">Support for {game.label} is coming next.</p>
          )}
        </section>

        {/* ---------------------------- TRANSFER ---------------------------- */}
        <div className="conduit" aria-hidden>
          <span className={selected != null ? 'arrow live' : 'arrow'}>➜</span>
        </div>

        {/* --------------------------- DESTINATION -------------------------- */}
        <section className="panel target">
          <div className="panel-head">
            <h2>Black 2 / White 2</h2>
            {save && (
              <button className="ghost" onClick={() => download(save.toBytes(), targetName.replace(/\.sav$/i, '') + ' (PokeBridge).sav')}>
                ↓ Download save
              </button>
            )}
          </div>

          {!save ? (
            <>
              <button className="drop" onClick={() => dstInput.current?.click()}>Load Black 2 / White 2 .sav</button>
              <input
                ref={dstInput}
                type="file"
                accept=".sav,.dsv,.dst,.bin"
                hidden
                onChange={(e) => e.target.files?.[0] && loadTarget(e.target.files[0])}
              />
              <p className="empty-note">This is the only save PokeBridge writes to.</p>
            </>
          ) : (
            <>
              <div className="box-nav">
                <button onClick={() => setBox((b) => (b + BOX_COUNT - 1) % BOX_COUNT)}>‹</button>
                <span>Box {box + 1}</span>
                <button onClick={() => setBox((b) => (b + 1) % BOX_COUNT)}>›</button>
              </div>
              <div className="grid box-grid" style={{ gridTemplateColumns: `repeat(${BOX_COLS}, 1fr)` }}>
                {Array.from({ length: SLOTS_PER_BOX }, (_, slot) => {
                  const occupant = slots[slot];
                  const armed = selected != null && !occupant;
                  return (
                    <button
                      key={slot}
                      className={`slot ${occupant ? 'full' : 'open'} ${armed ? 'armed' : ''}`}
                      onClick={() => placeInSlot(slot)}
                    >
                      {occupant ? <Sprite dex={readSpecies(occupant)} size={48} /> : <span className="slot-dot" />}
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
