import { useLayoutEffect, useRef, useState } from "react";

interface Offset {
  x: number;
  y: number;
}

const ZERO_OFFSET: Offset = { x: 0, y: 0 };

/**
 * Same correction Tooltip/InvestmentTrend's own tooltips use — nudges an
 * absolutely-positioned floating panel back on-screen if its natural
 * position (from CSS alone, e.g. `right: 0` anchored to a button that
 * isn't near the viewport's right edge) would spill off the left, right,
 * or bottom edge of the viewport. Measured after render but before paint
 * (useLayoutEffect) so there's no visible flash at the wrong position
 * first. Re-measures every time `open` flips to true.
 *
 * Returns a ref to attach to the panel and a `style` object to spread onto
 * it — `transform` layers the correction on top of whatever CSS already
 * positions the panel, rather than fighting it.
 */
export function useKeepOnScreen<T extends HTMLElement>(open: boolean) {
  const ref = useRef<T>(null);
  const [offset, setOffset] = useState<Offset>(ZERO_OFFSET);

  useLayoutEffect(() => {
    if (!open) {
      setOffset(ZERO_OFFSET);
      return;
    }
    const el = ref.current;
    if (!el) return;

    // The full-screen mobile layout (position: fixed, edge-to-edge) doesn't
    // need this — it's already exactly as wide as the viewport, and
    // nudging it would just shift it off one edge instead of the other.
    if (getComputedStyle(el).position === "fixed") {
      setOffset(ZERO_OFFSET);
      return;
    }

    const margin = 8;
    const rect = el.getBoundingClientRect();

    setOffset((current) => {
      const naturalLeft = rect.left - current.x;
      const naturalRight = rect.right - current.x;
      const naturalBottom = rect.bottom - current.y;

      let x = 0;
      if (naturalLeft < margin) {
        x = margin - naturalLeft;
      } else if (naturalRight > window.innerWidth - margin) {
        x = window.innerWidth - margin - naturalRight;
      }

      let y = 0;
      if (naturalBottom > window.innerHeight - margin) {
        y = window.innerHeight - margin - naturalBottom;
      }

      return x === current.x && y === current.y ? current : { x, y };
    });
  }, [open]);

  const style =
    offset.x !== 0 || offset.y !== 0 ? { transform: `translate(${offset.x}px, ${offset.y}px)` } : undefined;

  return { ref, style };
}
