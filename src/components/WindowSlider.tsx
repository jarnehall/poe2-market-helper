import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { useCurrentDay } from "../context/CurrentDayContext";
import { useTrendWindow } from "../context/TrendWindowContext";

type Handle = "start" | "current" | "end";

function WindowSlider() {
  const {
    currentDayOfLeague,
    setCurrentDayOfLeague,
    minDayOfLeague,
    maxDayOfLeague,
  } = useCurrentDay();
  const { daysBack, daysForward, setDaysBack, setDaysForward } =
    useTrendWindow();
  const trackRef = useRef<HTMLDivElement>(null);
  const [draggingHandle, setDraggingHandle] = useState<Handle | null>(null);

  const startDay = currentDayOfLeague - daysBack;
  const endDay = currentDayOfLeague + daysForward;
  const dayRange = maxDayOfLeague - minDayOfLeague || 1;

  const dayToPercent = (day: number) =>
    ((day - minDayOfLeague) / dayRange) * 100;

  const dayForClientX = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return currentDayOfLeague;
    const rect = track.getBoundingClientRect();
    const percent = Math.min(
      100,
      Math.max(0, ((clientX - rect.left) / rect.width) * 100),
    );
    return Math.round(minDayOfLeague + (percent / 100) * dayRange);
  };

  // Handles can land on (or very near) the same day — e.g. the default
  // window has start/current/end all close together near day 1 — so hit
  // detection is done by day-value proximity rather than relying on which
  // thumb happens to be painted on top at that pixel.
  const closestHandle = (day: number): Handle => {
    const distances: Array<[Handle, number]> = [
      ["start", Math.abs(day - startDay)],
      ["current", Math.abs(day - currentDayOfLeague)],
      ["end", Math.abs(day - endDay)],
    ];
    distances.sort((a, b) => a[1] - b[1]);
    return distances[0][0];
  };

  const moveHandle = (handle: Handle, day: number) => {
    if (handle === "start") {
      const clamped = Math.min(
        Math.max(day, minDayOfLeague),
        currentDayOfLeague,
      );
      setDaysBack(currentDayOfLeague - clamped);
    } else if (handle === "end") {
      const clamped = Math.max(
        Math.min(day, maxDayOfLeague),
        currentDayOfLeague,
      );
      setDaysForward(clamped - currentDayOfLeague);
    } else {
      // Moving "current" slides the whole window together — daysBack/
      // daysForward stay the same offsets; TrendWindowContext already clamps
      // them if the new position would push either edge out of range.
      setCurrentDayOfLeague(
        Math.min(Math.max(day, minDayOfLeague), maxDayOfLeague),
      );
    }
  };

  // Dragging is driven by window-level listeners rather than the Pointer
  // Capture API — simpler, and side-steps capture-related quirks when a
  // drag gesture is delivered programmatically (e.g. browser automation).
  // Deliberately only depends on draggingHandle: only one handle moves at a
  // time, so currentDayOfLeague/minDayOfLeague/maxDayOfLeague are constant
  // for the duration of any single drag — they only change between drags,
  // which is exactly when draggingHandle itself changes too. Depending on
  // them as well would tear down and rebuild these listeners on every
  // intermediate pointermove instead of once per drag.
  useEffect(() => {
    if (!draggingHandle) return;

    const handlePointerMove = (event: PointerEvent) => {
      moveHandle(draggingHandle, dayForClientX(event.clientX));
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

  const handleTrackPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const day = dayForClientX(event.clientX);
    const handle = closestHandle(day);
    setDraggingHandle(handle);
    moveHandle(handle, day);
  };

  const handleKeyDown =
    (handle: Handle, day: number) => (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
        event.preventDefault();
        moveHandle(handle, day - 1);
      } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
        event.preventDefault();
        moveHandle(handle, day + 1);
      }
    };

  const thumbs: Array<{
    handle: Handle;
    day: number;
    label: string;
    className: string;
  }> = [
    {
      handle: "start",
      day: startDay,
      label: `Window start: Day ${startDay}`,
      className: "window-slider-thumb-start",
    },
    {
      handle: "end",
      day: endDay,
      label: `Window end: Day ${endDay}`,
      className: "window-slider-thumb-end",
    },
    {
      handle: "current",
      day: currentDayOfLeague,
      label: `Current day: Day ${currentDayOfLeague}`,
      className: "window-slider-thumb-current",
    },
  ];

  return (
    <div className="window-slider">
      <span className="window-slider-label">
        Day {startDay} → Day {currentDayOfLeague} → Day {endDay}
      </span>
      <div
        className="window-slider-track"
        ref={trackRef}
        onPointerDown={handleTrackPointerDown}
      >
        <div
          className="window-slider-range"
          style={{
            left: `${dayToPercent(startDay)}%`,
            right: `${100 - dayToPercent(endDay)}%`,
          }}
        />
        {thumbs.map(({ handle, day, label, className }) => (
          <div
            key={handle}
            className={`window-slider-thumb ${className}`}
            style={{ left: `${dayToPercent(day)}%` }}
            role="slider"
            tabIndex={0}
            aria-label={label}
            aria-valuemin={minDayOfLeague}
            aria-valuemax={maxDayOfLeague}
            aria-valuenow={day}
            onKeyDown={handleKeyDown(handle, day)}
          />
        ))}
      </div>
      <div className="window-slider-bounds">
        <span>Day {minDayOfLeague}</span>
        <span>Day {maxDayOfLeague}</span>
      </div>
    </div>
  );
}

export default WindowSlider;
