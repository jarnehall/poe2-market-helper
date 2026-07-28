import { useFilters } from "../context/FiltersContext";
import { useMeta } from "../context/MetaContext";
import { DEFAULT_CURRENT_DATE, getDayOfLeagueForDate } from "../lib/marketData";

function DayOfLeagueSlider() {
  const { draft, setDraftCurrentDayOfLeague } = useFilters();
  const { bounds, currentLeague } = useMeta();
  const { minDayOfLeague, maxDayOfLeague } = bounds;
  const currentDayOfLeague = draft.currentDayOfLeague;

  const range = maxDayOfLeague - minDayOfLeague || 1;
  const percent = ((currentDayOfLeague - minDayOfLeague) / range) * 100;

  const todayDayOfLeague = Math.min(
    Math.max(
      getDayOfLeagueForDate(DEFAULT_CURRENT_DATE, currentLeague.startDate),
      minDayOfLeague,
    ),
    maxDayOfLeague,
  );

  return (
    <div className="day-of-league-slider">
      <div className="day-of-league-slider-header">
        <label
          className="day-of-league-slider-label"
          htmlFor="day-of-league-slider"
        >
          Day of league: {currentDayOfLeague}{" "}
          <span className="day-of-league-slider-today">
            (today: day {todayDayOfLeague})
          </span>
        </label>
        <button
          type="button"
          className="day-of-league-jump-today-button"
          disabled={currentDayOfLeague === todayDayOfLeague}
          onClick={() => setDraftCurrentDayOfLeague(todayDayOfLeague)}
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
        value={currentDayOfLeague}
        onChange={(event) =>
          setDraftCurrentDayOfLeague(Number(event.target.value))
        }
        style={{
          background: `linear-gradient(to right, color-mix(in srgb, var(--select) 40%, var(--border)) ${percent}%, var(--border) ${percent}%)`,
        }}
      />
    </div>
  );
}

export default DayOfLeagueSlider;
