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
      />
    </div>
  )
}

export default MinVolumeSlider
