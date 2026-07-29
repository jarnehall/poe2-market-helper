import { useFilters } from "../context/FiltersContext";
import { useLeague } from "../context/LeagueContext";
import ResetIcon from "./ResetIcon";

// Resets every filter/setting (FiltersContext) and the league selection
// (LeagueContext) back to their defaults in one click — the two contexts
// each already persist to localStorage/the URL on change, so simply
// resetting their state cleans both of those up too, nothing extra needed
// here.
function ResetFiltersButton() {
  const { isDefault: filtersAreDefault, resetFilters } = useFilters();
  const { isDefaultSelection: leaguesAreDefault, resetLeagues } = useLeague();
  const isAlreadyDefault = filtersAreDefault && leaguesAreDefault;

  return (
    <button
      type="button"
      className="reset-filters-button"
      disabled={isAlreadyDefault}
      aria-label="Reset all filters to their defaults"
      onClick={() => {
        resetFilters();
        resetLeagues();
      }}
    >
      <ResetIcon />
      {/* Hidden below a width where it'd otherwise force the header's
          button row to wrap (see App.css) — the icon plus aria-label
          carry the same meaning on its own past that point. */}
      <span className="reset-filters-button-label">Reset all filters</span>
    </button>
  );
}

export default ResetFiltersButton;
