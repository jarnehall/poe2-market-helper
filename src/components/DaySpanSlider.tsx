import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { useFilters } from "../context/FiltersContext";

type Handle = "before" | "after";

// The window's before/after span, independent of which day is "current" —
// that lives in its own DayOfLeagueSlider. Because the two handles live on
// disjoint sides of a shared zero point (before is always <= 0, after is
// always >= 0), there's no overlapping-thumb ambiguity to resolve, unlike
// the old single three-handle slider this replaced.
function DaySpanSlider() {
  const { filters, setDaysBack, setDaysForward, maxDaysBack, maxDaysForward } = useFilters();
  const { daysBack, daysForward } = filters;
  const trackRef = useRef<HTMLDivElement>(null);
  const [draggingHandle, setDraggingHandle] = useState<Handle | null>(null);

  const domainMin = -maxDaysBack;
  const domainMax = maxDaysForward;
  const domainRange = domainMax - domainMin || 1;

  const valueToPercent = (value: number) =>
    ((value - domainMin) / domainRange) * 100;

  const valueForClientX = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    const percent = Math.min(
      100,
      Math.max(0, ((clientX - rect.left) / rect.width) * 100),
    );
    return Math.round(domainMin + (percent / 100) * domainRange);
  };

  const moveHandle = (handle: Handle, value: number) => {
    if (handle === "before") {
      const clamped = Math.min(Math.max(value, -maxDaysBack), 0);
      setDaysBack(-clamped);
    } else {
      const clamped = Math.min(Math.max(value, 0), maxDaysForward);
      setDaysForward(clamped);
    }
  };

  // Deliberately only depends on draggingHandle: only one handle drags at a
  // time, so maxDaysBack/maxDaysForward are constant for the duration of any
  // single drag.
  useEffect(() => {
    if (!draggingHandle) return;

    const handlePointerMove = (event: PointerEvent) => {
      moveHandle(draggingHandle, valueForClientX(event.clientX));
    };
    const stopDragging = () => setDraggingHandle(null);

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingHandle]);

  const handleTrackPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const value = valueForClientX(event.clientX);
    const handle: Handle = value <= 0 ? "before" : "after";
    setDraggingHandle(handle);
    moveHandle(handle, value);
  };

  const handleKeyDown =
    (handle: Handle, domainValue: number) => (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
        event.preventDefault();
        moveHandle(handle, domainValue - 1);
      } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
        event.preventDefault();
        moveHandle(handle, domainValue + 1);
      }
    };

  return (
    <div className="day-span-slider">
      <span className="day-span-slider-label">
        {daysBack} days before → {daysForward} days after
      </span>
      <div
        className="day-span-slider-track"
        ref={trackRef}
        onPointerDown={handleTrackPointerDown}
      >
        <div
          className="day-span-slider-range"
          style={{
            left: `${valueToPercent(-daysBack)}%`,
            right: `${100 - valueToPercent(daysForward)}%`,
          }}
        />
        <div
          className="day-span-slider-tick"
          style={{ left: `${valueToPercent(0)}%` }}
        />
        <div
          className="day-span-slider-thumb day-span-slider-thumb-before"
          style={{ left: `${valueToPercent(-daysBack)}%` }}
          role="slider"
          tabIndex={0}
          aria-label={`Days before: ${daysBack}`}
          aria-valuemin={0}
          aria-valuemax={maxDaysBack}
          aria-valuenow={daysBack}
          onKeyDown={handleKeyDown("before", -daysBack)}
        />
        <div
          className="day-span-slider-thumb day-span-slider-thumb-after"
          style={{ left: `${valueToPercent(daysForward)}%` }}
          role="slider"
          tabIndex={0}
          aria-label={`Days after: ${daysForward}`}
          aria-valuemin={0}
          aria-valuemax={maxDaysForward}
          aria-valuenow={daysForward}
          onKeyDown={handleKeyDown("after", daysForward)}
        />
      </div>
    </div>
  );
}

export default DaySpanSlider;
