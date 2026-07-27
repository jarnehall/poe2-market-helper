import { useCurrentDay } from "../context/CurrentDayContext";

function DayOfLeagueSlider() {
  const {
    currentDayOfLeague,
    setCurrentDayOfLeague,
    minDayOfLeague,
    maxDayOfLeague,
  } = useCurrentDay();

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
          setCurrentDayOfLeague(Number(event.target.value))
        }
        style={{
          background: `linear-gradient(to right, color-mix(in srgb, var(--select) 40%, var(--border)) ${percent}%, var(--border) ${percent}%)`,
        }}
      />
    </div>
  );
}

export default DayOfLeagueSlider;
