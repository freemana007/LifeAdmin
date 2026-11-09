import { useEffect, useMemo, useState } from "react";
import { api, type DeckCard, type FreeTimeMeta, type FreeTimeResult, type Interest, type Plan, type PlanStop, type SavedPlan, type TasteState } from "../api";
import type { View } from "../App";
import type { Category } from "../format";
import { EmptyState, ProviderBadge } from "../ui/bits";
import { Button } from "../ui/Button";
import { Icon, type IconName } from "../ui/Icon";
import { useToast } from "../ui/Toast";
import { useAction } from "../ui/useAction";
import { CaughtUpArt } from "../illustrations";
import { SwipeDeck } from "../ui/SwipeDeck";

type Who = "solo" | "couple" | "kids" | "friends";

const INTEREST_LABEL: Record<Interest, { label: string; cat: Category }> = {
  walks: { label: "Walks & nature", cat: "warranty" },
  gigs: { label: "Gigs & music", cat: "receipt" },
  nightlife: { label: "Clubs & nightlife", cat: "receipt" },
  heritage: { label: "Heritage", cat: "official" },
  arts: { label: "Arts & shows", cat: "official" },
  family: { label: "Family", cat: "bill" },
  food: { label: "Food & markets", cat: "renewal" },
  sport: { label: "Sport & active", cat: "contract" },
  rainy: { label: "Rainy-day", cat: "contract" },
};

/** Colour by what kind of outing it is (same palette as the rest of the app). */
const KIND_CAT: Record<string, Category> = {
  walk: "warranty", nature: "warranty", beach: "warranty",
  heritage: "official", museum: "official", tour: "official", talk: "official", theatre: "official", festival: "official",
  gig: "receipt", music: "receipt", club: "receipt", pub: "receipt", comedy: "receipt",
  food: "renewal", market: "renewal",
  family: "bill",
  sport: "contract", water: "contract", wellness: "contract", other: "other",
};
const KIND_LABEL: Record<string, string> = {
  walk: "Walk", nature: "Nature", beach: "Beach", heritage: "Heritage", museum: "Museum & gallery", tour: "Tour", talk: "Talk & workshop",
  theatre: "Show", festival: "Festival", gig: "Gig", music: "Live music", club: "Club night", pub: "Pub", comedy: "Comedy",
  food: "Food", market: "Market", family: "Family", sport: "Active", water: "On the water", wellness: "Spa", other: "Visit",
};

const WHO: { id: Who; label: string }[] = [
  { id: "solo", label: "Just me" },
  { id: "couple", label: "Couple" },
  { id: "kids", label: "With kids" },
  { id: "friends", label: "Friends" },
];
const BUDGETS: { label: string; value: number | null }[] = [
  { label: "Any", value: null },
  { label: "Free", value: 0 },
  { label: "€20", value: 20 },
  { label: "€50", value: 50 },
];
const RADII = [5, 15, 30, 50];
const TIMES = Array.from({ length: 40 }, (_, i) => {
  const m = 7 * 60 + i * 30; // 07:00 → 02:30
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
});

const PREFS_KEY = "lifeadmin.freetime.prefs";
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function nextDays() {
  const today = new Date();
  const add = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return d;
  };
  const sat = add((6 - today.getDay() + 7) % 7 || 7);
  const sun = add((7 - today.getDay()) % 7 || 7);
  const label = (d: Date) => d.toLocaleDateString("en-IE", { weekday: "short", day: "numeric", month: "short" });
  return [
    { id: iso(today), label: "Today" },
    { id: iso(add(1)), label: "Tomorrow" },
    { id: iso(sat), label: label(sat) },
    { id: iso(sun), label: label(sun) },
  ].filter((d, i, all) => all.findIndex((x) => x.id === d.id) === i);
}

interface Prefs {
  near: string;
  radiusKm: number;
  who: Who;
  budget: number | null;
  interests: Interest[];
  start: string;
  end: string;
}
const DEFAULT_PREFS: Prefs = { near: "dublin-city-centre", radiusKm: 15, who: "couple", budget: null, interests: [], start: "13:00", end: "17:00" };
function loadPrefs(): Prefs {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function FreeTime({ initialDate }: { go: (v: View) => void; initialDate?: string }) {
  const days = useMemo(nextDays, []);
  const [meta, setMeta] = useState<FreeTimeMeta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [date, setDate] = useState(initialDate ?? days[2]?.id ?? days[0].id);
  const [result, setResult] = useState<FreeTimeResult | null>(null);
  const [which, setWhich] = useState(0);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<SavedPlan[]>([]);
  const [taste, setTaste] = useState<TasteState>({ kinds: {}, liked: [] });
  const [cards, setCards] = useState<DeckCard[] | null>(null);
  const [history, setHistory] = useState<{ card: DeckCard; liked: boolean }[]>([]);
  const [confirmReset, setConfirmReset] = useState(false);
  const act = useAction();
  const toast = useToast();

  useEffect(() => {
    api.taste().then(setTaste, () => {});
  }, []);

  async function startDeck() {
    setBusy(true);
    setResult(null);
    const r = await act(() => api.freeTimeDeck({ ...prefs, date }), { retry: () => void startDeck() });
    setBusy(false);
    if (r) {
      setCards(r.cards);
      setTaste({ kinds: r.kinds, liked: r.liked });
      setHistory([]);
      requestAnimationFrame(() => document.getElementById("ft-deck")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  async function onSwipe(card: DeckCard, liked: boolean) {
    setCards((cs) => cs?.filter((c) => c.id !== card.id) ?? null);
    setHistory((h) => [...h, { card, liked }]);
    const t = await act(() => api.swipe(card, liked, date), {
      rollback: () => {
        setCards((cs) => [card, ...(cs ?? [])]);
        setHistory((h) => h.filter((x) => x.card.id !== card.id));
      },
      retry: () => void onSwipe(card, liked),
    });
    if (t) setTaste(t);
  }

  async function undoSwipe() {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory((h) => h.slice(0, -1));
    setCards((cs) => [last.card, ...(cs ?? [])]);
    const t = await act(() => api.unswipe(last.card.id, date), {
      rollback: () => {
        setHistory((h) => [...h, last]);
        setCards((cs) => cs?.filter((c) => c.id !== last.card.id) ?? null);
      },
    });
    if (t) setTaste(t);
  }

  async function removePick(id: string) {
    const t = await act(() => api.unswipe(id, date));
    if (t) setTaste(t);
  }

  async function resetTaste() {
    const t = await act(() => api.resetTaste());
    if (t) {
      setTaste(t);
      setConfirmReset(false);
      setCards(null);
      toast({ message: "Your taste has been reset." });
    }
  }

  const loadMeta = () => {
    setMetaError(null);
    api.freeTimeMeta().then(setMeta, (e) => setMetaError(e.message));
  };
  useEffect(loadMeta, []);
  useEffect(() => {
    api.savedPlans().then(setSaved, () => {});
  }, []);

  const update = (patch: Partial<Prefs>) =>
    setPrefs((p) => {
      const next = { ...p, ...patch };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        /* per-visit only */
      }
      return next;
    });

  async function makePlan(usePicks = false) {
    setBusy(true);
    const r = await act(() => api.planFreeTime({ ...prefs, date, usePicks }), { retry: () => void makePlan(usePicks) });
    setBusy(false);
    if (r) {
      setResult(r);
      setWhich(0);
      requestAnimationFrame(() => document.getElementById("ft-results")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  async function save(p: Plan) {
    if (!result) return;
    const body = {
      date,
      townName: result.town.name,
      title: p.title,
      stops: p.stops.map((s) => ({ name: s.name, kind: s.kind, start: s.start, end: s.end, url: s.url, venue: s.venue, lat: s.lat, lng: s.lng })),
    };
    const s = await act(() => api.savePlan(body), { retry: () => void save(p) });
    if (s) {
      setSaved((xs) => [...xs, s].sort((a, b) => a.date.localeCompare(b.date)));
      toast({ message: "Plan saved. It's in your calendar feed too." });
    }
  }

  async function remove(p: SavedPlan) {
    setSaved((xs) => xs.filter((x) => x.id !== p.id));
    await act(() => api.deletePlan(p.id), { rollback: () => setSaved((xs) => [...xs, p]), retry: () => void remove(p) });
  }

  if (metaError)
    return (
      <div className="card stack" role="alert">
        <h2>We couldn't load what's on</h2>
        <p className="muted">{metaError}</p>
        <Button variant="primary" icon="retry" onClick={loadMeta}>
          Try again
        </Button>
      </div>
    );

  const towns = meta ? [...meta.towns].sort((a, b) => a.name.localeCompare(b.name)) : [];
  const current = result?.plans[which];
  const updated = meta ? new Date(meta.generatedAt).toLocaleDateString("en-IE", { day: "numeric", month: "short" }) : "";

  return (
    <section className="stack">
      <header>
        <h1 className="headline">Free time</h1>
        <p className="muted">Tell us when you're free and we'll plan it with what's on near you: walks, gigs, heritage, family days out.</p>
      </header>

      <form
        className="card form ft-form"
        onSubmit={(e) => {
          e.preventDefault();
          void makePlan();
        }}
      >
        <fieldset className="ft-field">
          <legend>When</legend>
          <div className="choice-chips">
            {days.map((d) => (
              <button type="button" key={d.id} className={`choice ${date === d.id ? "on" : ""}`} aria-pressed={date === d.id} onClick={() => setDate(d.id)}>
                {d.label}
              </button>
            ))}
            <label className="choice choice-date">
              <span className="sr-only">Another day</span>
              <input id="ft-date" type="date" value={date} min={days[0].id} onChange={(e) => e.target.value && setDate(e.target.value)} />
            </label>
          </div>
          <div className="two-col">
            <label className="field">
              From
              <select id="ft-start" value={prefs.start} onChange={(e) => update({ start: e.target.value })}>
                {TIMES.slice(0, -2).map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Until
              <select id="ft-end" value={prefs.end} onChange={(e) => update({ end: e.target.value })}>
                {TIMES.slice(2).map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>

        <div className="two-col">
          <label className="field">
            Near
            <select id="ft-near" value={prefs.near} onChange={(e) => update({ near: e.target.value })} disabled={!meta}>
              {towns.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.name === t.county ? "" : `, Co. ${t.county}`}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Within
            <select id="ft-radius" value={prefs.radiusKm} onChange={(e) => update({ radiusKm: Number(e.target.value) })}>
              {RADII.map((r) => (
                <option key={r} value={r}>
                  {r} km
                </option>
              ))}
            </select>
          </label>
        </div>

        <fieldset className="ft-field">
          <legend>Who's going</legend>
          <div className="choice-chips">
            {WHO.map((w) => (
              <button type="button" key={w.id} className={`choice ${prefs.who === w.id ? "on" : ""}`} aria-pressed={prefs.who === w.id} onClick={() => update({ who: w.id })}>
                {w.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="ft-field">
          <legend>Budget each</legend>
          <div className="choice-chips">
            {BUDGETS.map((b) => (
              <button type="button" key={b.label} className={`choice ${prefs.budget === b.value ? "on" : ""}`} aria-pressed={prefs.budget === b.value} onClick={() => update({ budget: b.value })}>
                {b.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="ft-field">
          <legend>What do you fancy?</legend>
          <div className="choice-chips">
            {(meta?.interests ?? (Object.keys(INTEREST_LABEL) as Interest[])).map((i) => {
              const on = prefs.interests.includes(i);
              return (
                <button
                  type="button"
                  key={i}
                  className={`choice interest cat-${INTEREST_LABEL[i].cat} ${on ? "on" : ""}`}
                  aria-pressed={on}
                  onClick={() => update({ interests: on ? prefs.interests.filter((x) => x !== i) : [...prefs.interests, i] })}
                >
                  {on && <Icon name="check" size={16} />}
                  {INTEREST_LABEL[i].label}
                </button>
              );
            })}
          </div>
          <span className="hint">Pick none for a bit of everything.</span>
        </fieldset>

        <div className="ft-go">
          <Button type="button" variant="primary" size="lg" block icon="heart" disabled={busy || !meta} onClick={() => void startDeck()}>
            Swipe through what's on
          </Button>
          <Button variant="secondary" size="lg" block icon="sun" disabled={busy || !meta}>
            {busy ? "Working…" : "Just plan it for me"}
          </Button>
        </div>
      </form>

      <TasteSummary taste={taste} confirming={confirmReset} onAskReset={() => setConfirmReset(true)} onCancel={() => setConfirmReset(false)} onReset={() => void resetTaste()} />

      {cards && (
        <section id="ft-deck" className="stack" aria-labelledby="ft-deck-title">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 id="ft-deck-title" className="ft-plan-title">
              What's on near {towns.find((t) => t.id === prefs.near)?.name ?? "you"}
            </h2>
            <span className="small muted">{cards.length} left</span>
          </div>
          <p className="small muted">Swipe right for yes, left for no. We'll remember what you like.</p>
          {cards.length ? (
            <SwipeDeck
              cards={cards}
              catOf={(k) => KIND_CAT[k] ?? "other"}
              labelOf={(k) => KIND_LABEL[k] ?? "Visit"}
              onSwipe={(c, liked) => void onSwipe(c, liked)}
              onUndo={() => void undoSwipe()}
              canUndo={history.length > 0}
            />
          ) : (
            <div className="card">
              <EmptyState art={<CaughtUpArt />} title="That's everything for this slot">
                <p>Try another day, a wider area, or plan with what you liked.</p>
              </EmptyState>
              {history.length > 0 && (
                <div className="row" style={{ justifyContent: "center" }}>
                  <Button variant="ghost" icon="undo" onClick={() => void undoSwipe()}>
                    Undo last swipe
                  </Button>
                </div>
              )}
            </div>
          )}
          <Picks picks={taste.liked.filter((l) => l.date === date)} onRemove={(id) => void removePick(id)} onPlan={() => void makePlan(true)} busy={busy} />
        </section>
      )}

      {result && (
        <section id="ft-results" className="stack" aria-live="polite">
          <div className={`ft-weather ${result.weather?.rainy ? "is-rainy" : ""}`}>
            <Icon name={result.weather?.rainy ? "rain" : "sun"} />
            {result.weather ? (
              <span>{result.weather.summary}</span>
            ) : (
              <span>
                No forecast here.{" "}
                <a href="https://www.met.ie/forecasts" target="_blank" rel="noreferrer">
                  Check met.ie
                </a>{" "}
                before you go.
              </span>
            )}
          </div>

          {!current ? (
            <div className="card">
              <EmptyState art={<CaughtUpArt />} title="Nothing fits that slot">
                <p>{result.notes.find((n) => n.startsWith("Nothing")) ?? "Try a longer time, a wider area or different interests."}</p>
              </EmptyState>
            </div>
          ) : (
            <>
              <div className="ft-plan-head">
                <div>
                  <span className="eyebrow">
                    Plan {which + 1} of {result.plans.length} · near {result.town.name}
                  </span>
                  <h2 className="ft-plan-title">{current.title}</h2>
                  <p className="small muted">
                    {current.knownCostPerPerson > 0 ? `About €${current.knownCostPerPerson.toFixed(2)} each` : current.priceUnknown ? "Some prices not listed" : "Free"}
                    {current.knownCostPerPerson > 0 && current.priceUnknown ? ", plus anything not listed" : ""}
                    {current.hoursTypical ? ". Opening hours are typical, so check before you go." : "."}
                  </p>
                </div>
              </div>

              <ol className="ft-itinerary">
                {current.stops.map((s, i) => (
                  <Stop key={s.id} s={s} first={i === 0} />
                ))}
              </ol>

              <div className="row">
                <Button variant="primary" icon="check" onClick={() => save(current)}>
                  Save plan
                </Button>
                {result.plans.length > 1 && (
                  <Button variant="secondary" icon="retry" onClick={() => setWhich((w) => (w + 1) % result.plans.length)}>
                    Show another plan
                  </Button>
                )}
              </div>
            </>
          )}
        </section>
      )}

      {saved.length > 0 && (
        <section className="card stack" aria-labelledby="ft-saved">
          <h2 id="ft-saved">Saved plans</h2>
          <ul className="ft-saved">
            {saved.map((p) => (
              <li key={p.id}>
                <span className="grow">
                  <strong>{p.title}</strong>
                  <span className="small muted">
                    {new Date(`${p.date}T12:00:00`).toLocaleDateString("en-IE", { weekday: "short", day: "numeric", month: "short" })} · {p.stops[0]?.start}–
                    {p.stops[p.stops.length - 1]?.end} · {p.townName}
                  </span>
                </span>
                <button className="icon-btn" aria-label={`Delete plan “${p.title}”`} onClick={() => remove(p)}>
                  <Icon name="trash" size={18} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {meta && (
        <footer className="ft-credits">
          <p>
            {meta.snapshot ? `Listings as of ${updated}.` : `Listings updated ${updated}.`} What's on comes from Irish open data:
          </p>
          <ul>
            {meta.sources
              .filter((s) => s.ok || s.id === "met-eireann")
              .filter((s, i, all) => all.findIndex((x) => x.credit === s.credit) === i)
              .map((s) => (
                <li key={s.id}>
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.credit}
                  </a>{" "}
                  ({s.licence}){s.id === "met-eireann" && !s.ok ? ", when available" : ""}
                </li>
              ))}
          </ul>
        </footer>
      )}
    </section>
  );
}

function Stop({ s, first }: { s: PlanStop; first: boolean }) {
  const cat = KIND_CAT[s.kind] ?? "other";
  const walking = s.travelKm > 0 && s.travelKm < 1.2;
  const travelIcon: IconName = walking ? "foot" : "car";
  return (
    <li className={`ft-stop cat-${cat}`}>
      {s.travelMin > 0 && (
        <span className="ft-leg">
          <Icon name={travelIcon} size={16} />
          {s.travelMin} min{walking ? " walk" : " drive"} · {s.travelKm} km{first ? " from the centre" : ""}
        </span>
      )}
      <div className="ft-stop-row">
        <span className="ft-time">
          <strong>{s.start}</strong>
          <span>{s.end}</span>
        </span>
        <div className="ft-card">
          <div className="ft-card-top">
            <ProviderBadge name={s.name} cat={cat} size="sm" />
            <span className="kind">{KIND_LABEL[s.kind] ?? "Visit"}</span>
            {s.free ? <span className="badge badge-example">Free</span> : s.price !== null ? <span className="ft-price">€{s.price.toFixed(2)}</span> : null}
          </div>
          <h3>{s.name}</h3>
          {(s.venue || s.summary) && <p className="small muted">{[s.venue, s.summary].filter(Boolean).join(" · ")}</p>}
          {s.notes.map((n) => (
            <p key={n} className="ft-note">
              <Icon name="info" size={14} />
              {n}
            </p>
          ))}
          <div className="row">
            {s.url && (
              <a className="btn btn-secondary btn-sm" href={s.url} target="_blank" rel="noreferrer">
                <Icon name="link" size={16} />
                {["gig", "club", "comedy", "theatre", "festival"].includes(s.kind) ? "Tickets & details" : "Details"}
              </a>
            )}
            <a className="btn btn-ghost btn-sm" href={`https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`} target="_blank" rel="noreferrer">
              <Icon name="pin" size={16} />
              Map
            </a>
          </div>
        </div>
      </div>
    </li>
  );
}

function TasteSummary({ taste, confirming, onAskReset, onCancel, onReset }: { taste: TasteState; confirming: boolean; onAskReset: () => void; onCancel: () => void; onReset: () => void }) {
  const entries = Object.entries(taste.kinds).filter(([, v]) => v.like + v.pass > 0);
  if (!entries.length) return null;
  const rate = (v: { like: number; pass: number }) => (v.like + 1) / (v.like + v.pass + 2);
  const likes = entries.filter(([, v]) => v.like > 0 && rate(v) > 0.5).sort((a, b) => rate(b[1]) - rate(a[1]) || b[1].like - a[1].like);
  const nopes = entries.filter(([, v]) => v.pass > v.like).sort((a, b) => b[1].pass - a[1].pass);
  return (
    <section className="card taste" aria-labelledby="taste-title">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 id="taste-title" className="card-title">
          Your taste
        </h2>
        {confirming ? (
          <span className="row">
            <span className="small">Forget everything you've swiped?</span>
            <Button size="sm" variant="danger" onClick={onReset}>
              Reset
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel}>
              Keep
            </Button>
          </span>
        ) : (
          <button className="link small" onClick={onAskReset}>
            Reset
          </button>
        )}
      </div>
      {likes.length > 0 && (
        <div className="taste-row">
          <span className="small muted">You like</span>
          <span className="choice-chips">
            {likes.map(([k, v]) => (
              <span key={k} className={`tag-taste cat-${KIND_CAT[k] ?? "other"}`}>
                <Icon name="heart" size={14} />
                {KIND_LABEL[k] ?? k} <span className="taste-count">{v.like}</span>
              </span>
            ))}
          </span>
        </div>
      )}
      {nopes.length > 0 && (
        <div className="taste-row">
          <span className="small muted">Less keen on</span>
          <span className="choice-chips">
            {nopes.map(([k, v]) => (
              <span key={k} className="tag-taste tag-nope">
                {KIND_LABEL[k] ?? k} <span className="taste-count">{v.pass}</span>
              </span>
            ))}
          </span>
        </div>
      )}
      <p className="hint">Your swipes shape what you see first and how plans are put together.</p>
    </section>
  );
}

function Picks({ picks, onRemove, onPlan, busy }: { picks: (DeckCard & { date: string })[]; onRemove: (id: string) => void; onPlan: () => void; busy: boolean }) {
  if (!picks.length) return null;
  return (
    <section className="card stack" aria-labelledby="picks-title">
      <h2 id="picks-title" className="card-title">
        Your picks for this day ({picks.length})
      </h2>
      <ul className="picks">
        {picks.map((p) => (
          <li key={p.id} className={`cat-${KIND_CAT[p.kind] ?? "other"}`}>
            <ProviderBadge name={p.name} cat={KIND_CAT[p.kind] ?? "other"} size="sm" />
            <span className="grow">
              <strong>{p.name}</strong>
              <span className="small muted">
                {KIND_LABEL[p.kind] ?? "Visit"} · {p.when}
              </span>
            </span>
            <button className="icon-btn" aria-label={`Remove ${p.name} from your picks`} onClick={() => onRemove(p.id)}>
              <Icon name="close" size={18} />
            </button>
          </li>
        ))}
      </ul>
      <Button variant="primary" icon="sun" disabled={busy} onClick={onPlan}>
        Plan with my picks
      </Button>
    </section>
  );
}
