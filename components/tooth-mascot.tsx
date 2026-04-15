"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const SPOOKED_MESSAGES = [
  "Eek — caught me!",
  "I was just passing through!",
  "Nothing to see here!",
  "Oh! Hi!! Bye!!",
  "Pretend you didn't see me.",
  "Don't mind me, carry on!",
  "Molar-ly mortified, gotta go!",
  "You have great eyes. Gotta run!",
  "I'll floss off now!",
  "Was just checking on the enamel.",
  "You didn't see anything…",
  "Root of the problem? Not me!",
];

/**
 * Feature flag — flip to `false` to disable the tooth mascot everywhere.
 * Lives at the top of this file so it's a one-line toggle.
 */
const MASCOT_ENABLED = false;

const SNOOZE_KEY = "tooth:snoozed-until";
const SNOOZE_HOURS = 24;
const FIRST_PEEK_MIN_MS = 4_000;
const FIRST_PEEK_MAX_MS = 10_000;
const NEXT_PEEK_MIN_MS = 8_000;
const NEXT_PEEK_MAX_MS = 20_000;
const SPOOKED_DURATION_MS = 2_400;

type Corner = "top-left" | "top-right" | "bottom-left";
type Mode = "hidden" | "peeking" | "spooked";

/**
 * Per-corner geometry. The tooth is rotated so its crown (with the eyes) is
 * what leans into the screen from the edge. Translate values move it in screen
 * coords *before* the rotation is applied (so translate is axis-aligned).
 */
const CORNER_CONFIG: Record<
  Corner,
  {
    anchorCls: string;
    hiddenTx: string;
    peekTx: string;
    rotation: number; // degrees
    bubbleCls: string;
    bubbleOriginCls: string; // transform-origin for grow-in animation
    bubblePointerCls: string;
  }
> = {
  "top-left": {
    anchorCls: "top-10 left-0",
    hiddenTx: "translateX(-130%)",
    peekTx: "translateX(-55%)",
    rotation: 75,
    // Bubble sits just right of the peek tooth, vertically aligned with the face.
    bubbleCls: "left-[58px] top-[6px]",
    bubbleOriginCls: "origin-left",
    bubblePointerCls:
      "before:absolute before:left-[-5px] before:top-4 before:w-[10px] before:h-[10px] before:rotate-45 before:bg-background before:border-b before:border-l",
  },
  "top-right": {
    anchorCls: "top-10 right-0",
    hiddenTx: "translateX(130%)",
    peekTx: "translateX(55%)",
    rotation: -75,
    bubbleCls: "right-[58px] top-[6px]",
    bubbleOriginCls: "origin-right",
    bubblePointerCls:
      "before:absolute before:right-[-5px] before:top-4 before:w-[10px] before:h-[10px] before:rotate-45 before:bg-background before:border-t before:border-r",
  },
  "bottom-left": {
    anchorCls: "bottom-10 left-0",
    hiddenTx: "translateX(-130%)",
    peekTx: "translateX(-55%)",
    rotation: 75,
    bubbleCls: "left-[58px] bottom-[6px]",
    bubbleOriginCls: "origin-left",
    bubblePointerCls:
      "before:absolute before:left-[-5px] before:bottom-4 before:w-[10px] before:h-[10px] before:rotate-45 before:bg-background before:border-b before:border-l",
  },
};

const CORNERS: Corner[] = ["top-left", "top-right", "bottom-left"];

// Ease-out-back — overshoots then settles (classic "boing" feel).
const BOUNCE_EASE = "cubic-bezier(0.34, 1.56, 0.64, 1)";
// Fast retreat — the tooth is startled and running away.
const RETREAT_EASE = "cubic-bezier(0.4, 0, 0.8, 0.4)";

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pickRandom<T>(arr: T[], not?: T): T {
  if (arr.length <= 1 || not === undefined) {
    return arr[Math.floor(Math.random() * arr.length)];
  }
  const pool = arr.filter((x) => x !== not);
  return pool[Math.floor(Math.random() * pool.length)];
}

function isSnoozed(): boolean {
  try {
    const raw = window.localStorage.getItem(SNOOZE_KEY);
    if (!raw) return false;
    return Date.now() < Number(raw);
  } catch {
    return false;
  }
}

function snooze() {
  try {
    window.localStorage.setItem(
      SNOOZE_KEY,
      String(Date.now() + SNOOZE_HOURS * 60 * 60 * 1000),
    );
  } catch {
    // ignore
  }
}

export function ToothMascot() {
  if (!MASCOT_ENABLED) return null;
  return <ToothMascotImpl />;
}

function ToothMascotImpl() {
  const [mode, setMode] = useState<Mode>("hidden");
  const [corner, setCorner] = useState<Corner | null>(null);
  const [message, setMessage] = useState<string>(SPOOKED_MESSAGES[0]);
  const [dismissed, setDismissed] = useState(false);
  const timerRef = useRef<number | null>(null);

  function clearTimer() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  /**
   * Stage a peek. We set the corner and mount at `hidden` first, then flip to
   * `peeking` on the next animation frame so the CSS transition fires — without
   * the rAF trick the element would appear already-at-peek-position with no
   * slide-in animation.
   */
  function scheduleNextPeek(previousCorner: Corner | null, delayMs: number) {
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      const next = pickRandom(CORNERS, previousCorner ?? undefined);
      setCorner(next);
      setMode("hidden");
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setMode("peeking"));
      });
    }, delayMs);
  }

  // Mount: if not snoozed, schedule first peek.
  useEffect(() => {
    if (isSnoozed()) {
      setDismissed(true);
      return;
    }
    scheduleNextPeek(null, randomBetween(FIRST_PEEK_MIN_MS, FIRST_PEEK_MAX_MS));
    return clearTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When spooked: slide back out after a beat, then schedule the next peek.
  useEffect(() => {
    if (mode !== "spooked" || dismissed) return;
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      setMode("hidden");
      scheduleNextPeek(
        corner,
        randomBetween(NEXT_PEEK_MIN_MS, NEXT_PEEK_MAX_MS),
      );
    }, SPOOKED_DURATION_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, dismissed]);

  function handleSpook() {
    if (mode !== "peeking") return;
    setMessage(pickRandom(SPOOKED_MESSAGES, message));
    setMode("spooked");
  }

  function handleDismiss(e: React.MouseEvent) {
    e.stopPropagation();
    setDismissed(true);
    snooze();
    clearTimer();
  }

  if (dismissed || !corner) return null;

  const cfg = CORNER_CONFIG[corner];
  const currentTx = mode === "peeking" ? cfg.peekTx : cfg.hiddenTx;
  const currentEase = mode === "spooked" ? RETREAT_EASE : BOUNCE_EASE;
  const currentDuration = mode === "spooked" ? 360 : 520;

  return (
    <div className={cn("fixed z-50 pointer-events-none", cfg.anchorCls)}>
      {/* Translate wrapper — slides tooth onto / off the screen */}
      <div
        className="relative w-14 h-16"
        style={{
          transform: currentTx,
          transition: `transform ${currentDuration}ms ${currentEase}`,
        }}
      >
        {/* Rotation wrapper — tilts tooth so its face leans into view */}
        <div
          className="absolute inset-0 origin-center"
          style={{
            transform: `rotate(${cfg.rotation}deg)`,
            transition: `transform ${currentDuration}ms ${currentEase}`,
          }}
        >
          <button
            type="button"
            onMouseEnter={handleSpook}
            onFocus={handleSpook}
            className="pointer-events-auto w-full h-full focus:outline-none"
            aria-label="Tooth mascot"
          >
            <ToothSvg spooked={mode === "spooked"} />
          </button>
        </div>
      </div>

      {/* Speech bubble — grows out from the tooth's face with a bouncy scale. */}
      <div
        className={cn(
          "pointer-events-auto absolute w-max max-w-[200px] rounded-xl bg-background border shadow-lg px-3 py-2 text-[12px] leading-snug",
          cfg.bubbleCls,
          cfg.bubbleOriginCls,
          cfg.bubblePointerCls,
          mode === "spooked"
            ? "opacity-100 scale-100"
            : "opacity-0 scale-50 pointer-events-none",
        )}
        style={{
          transition: `opacity 180ms ease-out, transform 340ms ${BOUNCE_EASE}`,
        }}
      >
        <button
          onClick={handleDismiss}
          className="absolute -top-1.5 -right-1.5 p-0.5 rounded-full bg-background border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="Dismiss mascot for a day"
        >
          <X className="h-2.5 w-2.5" />
        </button>
        <p className="pr-2">{message}</p>
      </div>
    </div>
  );
}

/** Cute SVG tooth. Eyes widen when spooked; mouth becomes an "oh!" shape. */
function ToothSvg({ spooked }: { spooked: boolean }) {
  return (
    <svg
      width="56"
      height="64"
      viewBox="0 0 56 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="drop-shadow-md shrink-0 w-full h-full"
      aria-hidden="true"
    >
      <path
        d="M14 4 Q6 4 4 14 Q2 24 6 34 Q8 42 12 54 Q14 60 18 58 Q22 56 22 46 Q22 40 26 40 Q30 40 30 46 Q30 56 34 58 Q38 60 40 54 Q44 42 46 34 Q50 24 48 14 Q46 4 38 4 Z"
        fill="#fdfcf8"
        stroke="#d4d0c5"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M10 10 Q10 6 14 6 Q18 6 20 10"
        stroke="#ffffff"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
        opacity="0.8"
      />
      <ellipse
        cx="18"
        cy="22"
        rx={spooked ? 3 : 2}
        ry={spooked ? 3.5 : 3}
        fill="#1f2937"
        className={spooked ? undefined : "tooth-eye"}
      />
      <ellipse
        cx="34"
        cy="22"
        rx={spooked ? 3 : 2}
        ry={spooked ? 3.5 : 3}
        fill="#1f2937"
        className={spooked ? undefined : "tooth-eye"}
      />
      <circle cx={spooked ? 19 : 18.7} cy="21" r="0.7" fill="#ffffff" />
      <circle cx={spooked ? 35 : 34.7} cy="21" r="0.7" fill="#ffffff" />
      {spooked ? (
        <ellipse cx="26" cy="32" rx="2" ry="2.5" fill="#1f2937" />
      ) : (
        <path
          d="M20 30 Q26 34 32 30"
          stroke="#1f2937"
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
        />
      )}
      <circle cx="14" cy="28" r="2" fill="#fda4af" opacity="0.6" />
      <circle cx="38" cy="28" r="2" fill="#fda4af" opacity="0.6" />
      <style>{`
        .tooth-eye {
          animation: tooth-blink 5s infinite;
          transform-origin: center;
          transform-box: fill-box;
        }
        @keyframes tooth-blink {
          0%, 92%, 100% { transform: scaleY(1); }
          94%, 97% { transform: scaleY(0.1); }
        }
      `}</style>
    </svg>
  );
}
