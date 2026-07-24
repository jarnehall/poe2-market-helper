function InvestmentCountSlider({
  count,
  setCount,
  minCount,
  maxCount,
}: {
  count: number
  setCount: (count: number) => void
  minCount: number
  maxCount: number
}) {
  return (
    <div className="investment-count-slider">
      <label
        className="investment-count-slider-label"
        htmlFor="investment-count-slider"
      >
        Cards shown: {count}
      </label>
      <input
        id="investment-count-slider"
        type="range"
        className="investment-count-slider-input"
        min={minCount}
        max={maxCount}
        step={1}
        value={count}
        onChange={(event) => setCount(Number(event.target.value))}
      />
    </div>
  )
}

export default InvestmentCountSlider
