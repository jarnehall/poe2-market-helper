import { useTrendWindow } from '../context/TrendWindowContext'

function TrendWindowSliders() {
  const {
    daysBack,
    daysForward,
    setDaysBack,
    setDaysForward,
    minDays,
    maxDaysBack,
    maxDaysForward,
  } = useTrendWindow()

  return (
    <div className="trend-window-sliders">
      <div className="trend-window-slider">
        <label
          className="trend-window-slider-label"
          htmlFor="days-back-slider"
        >
          Days back: {daysBack}
        </label>
        <input
          id="days-back-slider"
          type="range"
          className="trend-window-slider-input"
          min={minDays}
          max={maxDaysBack}
          step={1}
          value={daysBack}
          onChange={(event) => setDaysBack(Number(event.target.value))}
        />
      </div>
      <div className="trend-window-slider">
        <label
          className="trend-window-slider-label"
          htmlFor="days-forward-slider"
        >
          Days forward: {daysForward}
        </label>
        <input
          id="days-forward-slider"
          type="range"
          className="trend-window-slider-input"
          min={minDays}
          max={maxDaysForward}
          step={1}
          value={daysForward}
          onChange={(event) => setDaysForward(Number(event.target.value))}
        />
      </div>
    </div>
  )
}

export default TrendWindowSliders
