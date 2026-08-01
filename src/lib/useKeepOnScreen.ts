import { useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

/**
 * Positions a floating dropdown panel (Leagues/Filters/Settings) via JS
 * instead of the CSS it'd otherwise need (`position: absolute; top: calc(100%
 * + 8px); right: 0;`, anchored to its toggle button) — the panel's own CSS
 * is just `position: fixed` with no top/left, so it starts out at its
 * out-of-flow "static position" until this runs.
 *
 * Why fixed instead of absolute: an absolutely-positioned descendant still
 * counts toward an `overflow: auto` ancestor's scrollable content width even
 * while out of normal document flow — .app-header-controls (made
 * horizontally scrollable so the header's menu row never wraps) is exactly
 * such an ancestor, so an absolutely-positioned panel nested inside it was
 * making the whole header row ~15px wider — and everything in it shift
 * left — for as long as the panel stayed `position: absolute`. `position:
 * fixed` doesn't have this problem (it isn't counted at all), which is why
 * the panel is fixed unconditionally in CSS rather than only after this
 * hook swaps it — there's no absolute phase for the ancestor to ever see.
 *
 * The trade-off: with no CSS anchoring left to fall back on, this now does
 * 100% of the positioning (not just the keep-on-screen correction it used
 * to layer on top of CSS positioning) — measured after render but before
 * paint (useLayoutEffect), so there's still no visible flash at the wrong
 * position first. Re-measures every time `open` flips to true.
 */
export function useKeepOnScreen<T extends HTMLElement>(open: boolean) {
  const ref = useRef<T>(null);
  const [style, setStyle] = useState<CSSProperties | undefined>(undefined);

  useLayoutEffect(() => {
    if (!open) {
      setStyle(undefined);
      return;
    }
    const el = ref.current;
    if (!el) return;

    // The full-screen mobile layout (position: fixed, edge-to-edge) is
    // already exactly as wide as the viewport and needs no anchoring here
    // — keep in sync with App.css's own `@media (max-width: 600px)` that
    // makes it so. (Checking computed left/right/top instead isn't
    // reliable: Chrome resolves those to used pixel values for any
    // out-of-flow box once it's laid out, even when nothing set them, so
    // they're never actually "auto" by the time this runs either way.)
    if (window.matchMedia("(max-width: 600px)").matches) {
      setStyle(undefined);
      return;
    }

    // The toggle button always immediately precedes the (conditionally
    // rendered) dropdown as a sibling — see LeagueFilter.tsx/MarketOverview.tsx.
    const trigger = el.previousElementSibling;
    if (!trigger) return;

    const margin = 8;
    const triggerRect = trigger.getBoundingClientRect();
    // Safe to measure now even though top/left aren't set yet: width/height
    // come from the panel's own CSS (a fixed width or width: max-content),
    // not from wherever it happens to be positioned.
    const panelRect = el.getBoundingClientRect();

    // Mimics the CSS this replaces: `top: calc(100% + 8px); right: 0`
    // relative to the trigger, i.e. flush with the trigger's right edge.
    let left = triggerRect.right - panelRect.width;
    if (left < margin) {
      left = margin;
    } else if (left + panelRect.width > window.innerWidth - margin) {
      left = window.innerWidth - margin - panelRect.width;
    }

    let top = triggerRect.bottom + 8;
    if (top + panelRect.height > window.innerHeight - margin) {
      top = window.innerHeight - margin - panelRect.height;
    }

    setStyle({ position: "fixed", top: `${top}px`, left: `${left}px` });
  }, [open]);

  return { ref, style };
}
