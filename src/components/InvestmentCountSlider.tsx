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
  const percent =
    maxCount > minCount ? ((count - minCount) / (maxCount - minCount)) * 100 : 0

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
        style={{
          background: `linear-gradient(to right, color-mix(in srgb, var(--accent) 40%, var(--row-alt)) ${percent}%, var(--row-alt) ${percent}%)`,
        }}
      />
    </div>
  )
}

export default InvestmentCountSlider
