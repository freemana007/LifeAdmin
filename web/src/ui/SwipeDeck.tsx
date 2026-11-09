import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { DeckCard } from "../api";
import type { Category } from "../format";
import { Icon } from "./Icon";

const THRESHOLD = 100;

export interface SwipeDeckProps {
  cards: DeckCard[];
  catOf: (kind: string) => Category;
  labelOf: (kind: string) => string;
  onSwipe: (card: DeckCard, liked: boolean) => void;
  onUndo?: () => void;
  canUndo: boolean;
}

const reduceMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Tinder-style deck: drag the top card right to like or left to pass. The same
 * actions are on buttons and the arrow keys, so it works without a touchscreen
 * and with a screen reader.
 */
export function SwipeDeck({ cards, catOf, labelOf, onSwipe, onUndo, canUndo }: SwipeDeckProps) {
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState<null | "left" | "right">(null);
  const [announce, setAnnounce] = useState("");
  const drag = useRef<{ x: number; y: number; id: number } | null>(null);
  const top = cards[0];

  useEffect(() => {
    setDx(0);
    setLeaving(null);
  }, [top?.id]);

  function decide(liked: boolean) {
    if (!top || leaving) return;
    setAnnounce(`${liked ? "Liked" : "Passed on"} ${top.name}`);
    if (reduceMotion()) return onSwipe(top, liked);
    setLeaving(liked ? "right" : "left");
    window.setTimeout(() => onSwipe(top, liked), 220);
  }

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("a,button")) return;
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id === e.pointerId) setDx(e.clientX - drag.current.x);
  };
  const up = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    if (dx > THRESHOLD) decide(true);
    else if (dx < -THRESHOLD) decide(false);
    else setDx(0);
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      decide(true);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      decide(false);
    } else if ((e.key === "z" || e.key === "Backspace") && canUndo) {
      e.preventDefault();
      onUndo?.();
    }
  };

  const offset = leaving === "right" ? 520 : leaving === "left" ? -520 : dx;
  const likeOpacity = Math.max(0, Math.min(1, offset / THRESHOLD));
  const nopeOpacity = Math.max(0, Math.min(1, -offset / THRESHOLD));

  return (
    <div className="deck" tabIndex={0} onKeyDown={key} aria-roledescription="swipe deck" aria-label="Things to do. Use the left and right arrow keys, or the buttons, to pass or like.">
      <div className="deck-stack">
        {cards
          .slice(0, 3)
          .reverse()
          .map((c) => {
            const depth = cards.indexOf(c);
            const isTop = depth === 0;
            const style = isTop
              ? {
                  transform: `translateX(${offset}px) rotate(${offset / 18}deg)`,
                  transition: drag.current ? "none" : "transform var(--dur) var(--ease)",
                }
              : { transform: `translateY(${depth * 10}px) scale(${1 - depth * 0.04})` };
            return (
              <div
                key={c.id}
                className={`swipe-card cat-${catOf(c.kind)} ${isTop ? "is-top" : ""}`}
                style={style}
                aria-hidden={!isTop}
                onPointerDown={isTop ? down : undefined}
                onPointerMove={isTop ? move : undefined}
                onPointerUp={isTop ? up : undefined}
                onPointerCancel={isTop ? () => ((drag.current = null), setDx(0)) : undefined}
              >
                {isTop && (
                  <>
                    <span className="stamp-like" style={{ opacity: likeOpacity }} aria-hidden="true">
                      LIKE
                    </span>
                    <span className="stamp-nope" style={{ opacity: nopeOpacity }} aria-hidden="true">
                      NOPE
                    </span>
                  </>
                )}
                <div className="swipe-band">
                  <span className="kind">{labelOf(c.kind)}</span>
                  {c.event && <span className="badge badge-on">On that day</span>}
                </div>
                <div className="swipe-body">
                  <h3>{c.name}</h3>
                  <p className="swipe-when">
                    <Icon name="calendar" size={16} />
                    {c.when}
                  </p>
                  <p className="swipe-meta">
                    <span>
                      <Icon name="pin" size={16} />
                      {c.distanceKm < 1 ? "Under 1 km away" : `${c.distanceKm} km away`}
                      {c.venue ? ` · ${c.venue}` : ""}
                    </span>
                  </p>
                  {c.summary && <p className="swipe-summary">{c.summary}</p>}
                  <div className="swipe-tags">
                    {c.free ? <span className="tag">Free</span> : c.price !== null ? <span className="tag">€{c.price.toFixed(2)}</span> : <span className="tag tag-quiet">Price not listed</span>}
                    <span className="tag tag-quiet">{c.indoor ? "Indoors" : "Outdoors"}</span>
                    {c.kidFriendly && <span className="tag tag-quiet">Good with kids</span>}
                    {c.lengthKm ? <span className="tag tag-quiet">{c.lengthKm} km{c.difficulty ? ` · ${c.difficulty}` : ""}</span> : null}
                  </div>
                  {c.url && isTop && (
                    <a className="link small swipe-link" href={c.url} target="_blank" rel="noreferrer">
                      More about this <Icon name="link" size={14} />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
      </div>

      <div className="deck-actions">
        <button className="deck-btn deck-nope" onClick={() => decide(false)} aria-label={top ? `Pass on ${top.name}` : "Pass"} disabled={!top}>
          <Icon name="close" size={28} />
        </button>
        <button className="deck-btn deck-undo" onClick={onUndo} aria-label="Undo last swipe" disabled={!canUndo}>
          <Icon name="undo" size={22} />
        </button>
        <button className="deck-btn deck-like" onClick={() => decide(true)} aria-label={top ? `Like ${top.name}` : "Like"} disabled={!top}>
          <Icon name="heart" size={28} />
        </button>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
