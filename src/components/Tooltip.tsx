import { cloneElement, useLayoutEffect, useRef, useState } from "react";
import type {
  FocusEvent as ReactFocusEvent,
  HTMLAttributes,
  MouseEvent as ReactMouseEvent,
  ReactElement,
  ReactNode,
} from "react";

interface Anchor {
  x: number;
  y: number;
}

// Same look as InvestmentTrend's own graph-dot tooltip (fixed position,
// surface-2 card floating above the target with the same border/shadow/
// radius), appearing instantly instead of waiting out the browser's native
// `title` delay. `text` accepts any ReactNode (not just a plain string) so
// callers can style part of the content (e.g. bold a number, color a league
// name) — most just pass a string. Renders no DOM wrapper of its own —
// clones the handlers straight onto `children` — so it never changes the
// target's layout.
function Tooltip({
  text,
  children,
}: {
  text?: ReactNode;
  children: ReactElement<HTMLAttributes<HTMLElement>>;
}) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Nudges the tooltip back on-screen if centering it above the target
  // would spill off any edge of the viewport — same correction
  // InvestmentTrend's tooltip uses, measured after render but before paint
  // so there's no visible flash at the wrong position first.
  useLayoutEffect(() => {
    if (!anchor) {
      setOffset({ x: 0, y: 0 });
      return;
    }
    const tooltip = tooltipRef.current;
    if (!tooltip) return;

    const margin = 8;
    const rect = tooltip.getBoundingClientRect();

    setOffset((current) => {
      const naturalLeft = rect.left - current.x;
      const naturalTop = rect.top - current.y;

      let x = 0;
      if (naturalLeft < margin) {
        x = margin - naturalLeft;
      } else if (naturalLeft + rect.width > window.innerWidth - margin) {
        x = window.innerWidth - margin - rect.width - naturalLeft;
      }

      let y = 0;
      if (naturalTop < margin) {
        y = margin - naturalTop;
      }

      return x === current.x && y === current.y ? current : { x, y };
    });
  }, [anchor]);

  if (!text) return children;

  const show = (event: ReactMouseEvent<HTMLElement> | ReactFocusEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setAnchor({ x: rect.left + rect.width / 2, y: rect.top });
  };
  const hide = () => setAnchor(null);

  return (
    <>
      {cloneElement(children, {
        onMouseEnter: show,
        onMouseLeave: hide,
        onFocus: show,
        onBlur: hide,
      })}
      {anchor && (
        <div
          ref={tooltipRef}
          className="simple-tooltip"
          role="tooltip"
          style={{ left: anchor.x + offset.x, top: anchor.y + offset.y }}
        >
          {text}
        </div>
      )}
    </>
  );
}

export default Tooltip;
