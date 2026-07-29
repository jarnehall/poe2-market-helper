import { useEffect, useState } from "react";
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { useFilters } from "../context/FiltersContext";
import { useMeta } from "../context/MetaContext";
import { DEFAULT_CURRENT_DATE, getDayOfLeagueForDate } from "../lib/marketData";

function DayOfLeagueSlider() {
  const { filters, setCurrentDayOfLeague } = useFilters();
  const { bounds, currentLeague } = useMeta();
  const { minDayOfLeague, maxDayOfLeague } = bounds;
  const currentDayOfLeague = filters.currentDayOfLeague;

  // Drives the thumb/label while dragging so the slider itself feels
  // instant — the committed value (which the chart's data window is keyed
  // on) only updates once the drag/keypress ends, so the graphs don't
  // reflow on every intermediate tick, just once when it's released.
  const [draftDay, setDraftDay] = useState(currentDayOfLeague);
  useEffect(() => setDraftDay(currentDayOfLeague), [currentDayOfLeague]);

  const range = maxDayOfLeague - minDayOfLeague || 1;
  const percent = ((draftDay - minDayOfLeague) / range) * 100;

  const todayDayOfLeague = Math.min(
    Math.max(
      getDayOfLeagueForDate(DEFAULT_CURRENT_DATE, currentLeague.startDate),
      minDayOfLeague,
    ),
    maxDayOfLeague,
  );

  const commit = (
    event: ReactPointerEvent<HTMLInputElement> | KeyboardEvent<HTMLInputElement>,
  ) => setCurrentDayOfLeague(Number(event.currentTarget.value));

  return (
    <div className="day-of-league-slider">
      <div className="day-of-league-slider-header">
        <label
          className="day-of-league-slider-label"
          htmlFor="day-of-league-slider"
        >
          Day of league: {draftDay}{" "}
          <span className="day-of-league-slider-today">
            (today: day {todayDayOfLeague})
          </span>
        </label>
        <button
          type="button"
          className="day-of-league-jump-today-button"
          disabled={currentDayOfLeague === todayDayOfLeague}
          onClick={() => setCurrentDayOfLeague(todayDayOfLeague)}
        >
          Jump to today
        </button>
      </div>
      <input
        id="day-of-league-slider"
        type="range"
        className="day-of-league-slider-input"
        min={minDayOfLeague}
        max={maxDayOfLeague}
        step={1}
        value={draftDay}
        onChange={(event) => setDraftDay(Number(event.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        style={{
          background: `linear-gradient(to right, color-mix(in srgb, var(--select) 40%, var(--border)) ${percent}%, var(--border) ${percent}%)`,
        }}
      />
    </div>
  );
}

export default DayOfLeagueSlider;
