function MinVolumeSlider({
  minVolume,
  setMinVolume,
  minVolumeBound,
  maxVolumeBound,
}: {
  minVolume: number
  setMinVolume: (minVolume: number) => void
  minVolumeBound: number
  maxVolumeBound: number
}) {
  const percent =
    maxVolumeBound > minVolumeBound
      ? ((minVolume - minVolumeBound) / (maxVolumeBound - minVolumeBound)) * 100
      : 0

  return (
    <div className="min-volume-slider">
      <label className="min-volume-slider-label" htmlFor="min-volume-slider">
        Minimum volume: {minVolume}
      </label>
      <input
        id="min-volume-slider"
        type="range"
        className="min-volume-slider-input"
        min={minVolumeBound}
        max={maxVolumeBound}
        step={10}
        value={minVolume}
        onChange={(event) => setMinVolume(Number(event.target.value))}
        style={{
          background: `linear-gradient(to right, color-mix(in srgb, var(--select) 40%, var(--border)) ${percent}%, var(--border) ${percent}%)`,
        }}
      />
    </div>
  )
}

export default MinVolumeSlider
