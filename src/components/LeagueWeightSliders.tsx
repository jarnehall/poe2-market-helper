import type { CSSProperties } from "react";
import { useFilters } from "../context/FiltersContext";
import { useLeague } from "../context/LeagueContext";
import { useMeta } from "../context/MetaContext";

// Same "latest-started first" order FiltersContext itself sorts by when
// computing default weights — kept here too (rather than exposed from the
// context) since it's purely a display-order concern for this one component.
function useSortedSelectedLeagues() {
  const { leagues } = useMeta();
  const { selectedLeagueIds } = useLeague();
  const leagueById = new Map(leagues.map((league) => [league.id, league]));

  return selectedLeagueIds
    .map((id) => leagueById.get(id))
    .filter((league): league is NonNullable<typeof league> => league !== undefined)
    .sort((a, b) => (b.startDate > a.startDate ? 1 : b.startDate < a.startDate ? -1 : 0));
}

function LeagueWeightSliders() {
  const { filters, setLeagueWeight } = useFilters();
  const sortedLeagues = useSortedSelectedLeagues();

  if (filters.usePureAverages || sortedLeagues.length === 0) {
    return null;
  }

  return (
    <div className="league-weight-sliders">
      <p className="league-weight-sliders-label">
        League weight (most recent league weighted highest by default)
      </p>
      {sortedLeagues.map((league) => {
        const weight = Math.round(filters.leagueWeights[league.id] ?? 0);
        return (
          <div className="league-weight-slider" key={league.id}>
            <label className="league-weight-slider-label" htmlFor={`league-weight-${league.id}`}>
              <span
                className="league-weight-slider-dot"
                style={{ "--league-color": league.color } as CSSProperties}
              />
              {league.name}: {weight}%
            </label>
            <input
              id={`league-weight-${league.id}`}
              type="range"
              className="league-weight-slider-input"
              min={0}
              max={100}
              step={1}
              value={weight}
              disabled={sortedLeagues.length < 2}
              onChange={(event) => setLeagueWeight(league.id, Number(event.target.value))}
              style={{
                background: `linear-gradient(to right, color-mix(in srgb, var(--select) 40%, var(--border)) ${weight}%, var(--border) ${weight}%)`,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

export default LeagueWeightSliders;
