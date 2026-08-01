import Tooltip from "./Tooltip";

function PureAveragesToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="pure-averages-toggle" htmlFor="pure-averages-toggle">
      <input
        id="pure-averages-toggle"
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <Tooltip text="Off (default): rank by the league weights below, favoring more recently-started leagues and earlier days in the window. On: rank by a plain, unweighted average across leagues and days, like before — also averages every qualifying pair for a card's displayed change, rather than just its best-performing one.">
        <span className="pure-averages-toggle-text">Use pure averages</span>
      </Tooltip>
    </label>
  );
}

export default PureAveragesToggle;
