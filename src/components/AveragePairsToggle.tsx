import Tooltip from "./Tooltip";

function AveragePairsToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="average-pairs-toggle" htmlFor="average-pairs-toggle">
      <input
        id="average-pairs-toggle"
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <Tooltip text="Rank/display each item by the average change across every pair it qualifies with, instead of just its best-performing pair.">
        <span className="average-pairs-toggle-text">Average all pairs</span>
      </Tooltip>
    </label>
  );
}

export default AveragePairsToggle;
