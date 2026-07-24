import { useCurrentDay } from '../context/CurrentDayContext'

function CurrentDaySlider() {
  const {
    currentDayOfLeague,
    setCurrentDayOfLeague,
    minDayOfLeague,
    maxDayOfLeague,
  } = useCurrentDay()

  return (
    <div className="current-day-slider">
      <label className="current-day-slider-label" htmlFor="current-day-slider">
        Current day: Day {currentDayOfLeague}
      </label>
      <input
        id="current-day-slider"
        type="range"
        className="current-day-slider-input"
        min={minDayOfLeague}
        max={maxDayOfLeague}
        step={1}
        value={currentDayOfLeague}
        onChange={(event) => setCurrentDayOfLeague(Number(event.target.value))}
      />
      <div className="current-day-slider-bounds">
        <span>Day {minDayOfLeague}</span>
        <span>Day {maxDayOfLeague}</span>
      </div>
    </div>
  )
}

export default CurrentDaySlider
