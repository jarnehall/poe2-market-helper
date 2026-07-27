import { useFilters } from "../context/FiltersContext";
import { useMeta } from "../context/MetaContext";

function DayOfLeagueSlider() {
  const { draft, setDraftCurrentDayOfLeague } = useFilters();
  const { minDayOfLeague, maxDayOfLeague } = useMeta().bounds;
  const currentDayOfLeague = draft.currentDayOfLeague;

  const range = maxDayOfLeague - minDayOfLeague || 1;
  const percent = ((currentDayOfLeague - minDayOfLeague) / range) * 100;

  return (
    <div className="day-of-league-slider">
      <label
        className="day-of-league-slider-label"
        htmlFor="day-of-league-slider"
      >
        Day of league: {currentDayOfLeague}
      </label>
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
