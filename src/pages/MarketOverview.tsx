import { useEffect, useRef, useState } from "react";
import BestInvestment from "../components/BestInvestment";
import CategoryFilter from "../components/CategoryFilter";
import ChevronIcon from "../components/ChevronIcon";
import DayOfLeagueSlider from "../components/DayOfLeagueSlider";
import DaySpanSlider from "../components/DaySpanSlider";
import FavoritesSearch from "../components/FavoritesSearch";
import InfoIcon from "../components/InfoIcon";
import InvestmentCountSlider from "../components/InvestmentCountSlider";
import LeagueFilter from "../components/LeagueFilter";
import MinVolumeSlider from "../components/MinVolumeSlider";
import PairCurrencyFilter from "../components/PairCurrencyFilter";
import { useFavorites } from "../context/FavoritesContext";
import { useFilters } from "../context/FiltersContext";
import { useLeague } from "../context/LeagueContext";
import { useMeta } from "../context/MetaContext";
import { fetchBestInvestments, fetchFavorites } from "../lib/api";
import { formatDate, formatTimeUntil } from "../lib/format";
import type { BestInvestment as BestInvestmentEntry, PoeNinjaStatus } from "../types";

type QueryStatus = "loading" | "error" | "success";

// Dragging a slider fires a state update (and would otherwise fire a
// request) per intermediate value, not just on release — this delays the
// actual network call until the filters stop changing for a moment, so a
// drag collapses into a single request instead of dozens.
const FETCH_DEBOUNCE_MS = 350;

function MarketOverview() {
  const { currentLeague, bounds, visitorCount } = useMeta();
  const { selectedLeagueIds, liveLeague } = useLeague();
  const { favorites, toggleFavorite } = useFavorites();
  // The live league is never one of the selectable/toggleable leagues (see
  // LeagueContext), but its data is still always requested as a display-only
  // overlay — the backend only adds it when its id is present in `leagues`.
  const requestLeagueIds = liveLeague
    ? [...selectedLeagueIds, liveLeague.id]
    : selectedLeagueIds;
  const { filters, setInvestmentCount, setMinVolume, resetFilters } = useFilters();
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const filtersMenuRef = useRef<HTMLDivElement>(null);

  const [investments, setInvestments] = useState<BestInvestmentEntry[]>([]);
  const [status, setStatus] = useState<QueryStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [poeNinjaStatus, setPoeNinjaStatus] = useState<PoeNinjaStatus | null>(null);

  const [favoriteInvestments, setFavoriteInvestments] = useState<BestInvestmentEntry[]>([]);
  const [favoritesStatus, setFavoritesStatus] = useState<QueryStatus>("loading");

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");

    const timeoutId = window.setTimeout(() => {
      fetchBestInvestments(
        {
          leagues: requestLeagueIds,
          categories: filters.categories,
          pairCurrencies: filters.pairCurrencies,
          currentDayOfLeague: filters.currentDayOfLeague,
          daysBack: filters.daysBack,
          daysForward: filters.daysForward,
          count: filters.investmentCount,
          minVolume: filters.minVolume,
        },
        controller.signal,
      )
        .then((response) => {
          setInvestments(response.investments);
          setPoeNinjaStatus(response.poeNinjaStatus);
          setStatus("success");
          setErrorMessage(null);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setStatus("error");
          setErrorMessage(error instanceof Error ? error.message : "Failed to load");
        });
    }, FETCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [filters, selectedLeagueIds, liveLeague]);

  useEffect(() => {
    if (favorites.length === 0) {
      setFavoriteInvestments([]);
      setFavoritesStatus("success");
      return;
    }

    const controller = new AbortController();
    setFavoritesStatus("loading");

    const timeoutId = window.setTimeout(() => {
      fetchFavorites(
        {
          favorites,
          leagues: requestLeagueIds,
          currentDayOfLeague: filters.currentDayOfLeague,
          daysBack: filters.daysBack,
          daysForward: filters.daysForward,
        },
        controller.signal,
      )
        .then((response) => {
          setFavoriteInvestments(response.investments);
          setFavoritesStatus("success");
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setFavoritesStatus("error");
        });
    }, FETCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
    // Deliberately keyed on just the day-window fields (not the whole
    // `filters` object) — favorites ignore Categories/pair-currency/count/
    // minVolume entirely, so a change to those shouldn't refetch this list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    favorites,
    selectedLeagueIds,
    liveLeague,
    filters.currentDayOfLeague,
    filters.daysBack,
    filters.daysForward,
  ]);

  useEffect(() => {
    if (!isFiltersOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!filtersMenuRef.current?.contains(event.target as Node)) {
        setIsFiltersOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isFiltersOpen]);

  const leagueHasStarted =
    new Date(currentLeague.startDate).getTime() <= Date.now();

  return (
    <main className="market-overview">
      <header className="league-banner">
        <div className="league-banner-top-row">
          <h1 className="league-banner-name">{currentLeague.name} league</h1>
          <InfoIcon visitorCount={visitorCount} poeNinjaStatus={poeNinjaStatus} />
        </div>
        <p
          className="league-banner-started"
          title={leagueHasStarted ? "Live" : "Upcoming"}
        >
          <span
            className={
              leagueHasStarted
                ? "league-banner-started-dot league-banner-started-dot-live"
                : "league-banner-started-dot"
            }
          />
          {leagueHasStarted
            ? `Started ${formatDate(currentLeague.startDate)}`
            : `Starts ${formatDate(currentLeague.startDate)} (in ${formatTimeUntil(currentLeague.startDate)})`}
        </p>
      </header>
      <LeagueFilter>
        <div className="filters-menu" ref={filtersMenuRef}>
          <button
            type="button"
            className="filters-toggle-button"
            aria-expanded={isFiltersOpen}
            onClick={() => setIsFiltersOpen((open) => !open)}
          >
            Filters
            <ChevronIcon open={isFiltersOpen} />
          </button>
          {isFiltersOpen && (
            <div className="filters-dropdown">
              <div className="dropdown-header">
                <span className="dropdown-panel-label">Filters</span>
                <button
                  type="button"
                  className="dropdown-close-button"
                  aria-label="Close"
                  onClick={() => setIsFiltersOpen(false)}
                >
                  ×
                </button>
              </div>
              <CategoryFilter />
              <PairCurrencyFilter />
              <DayOfLeagueSlider />
              <DaySpanSlider />
              <InvestmentCountSlider
                count={filters.investmentCount}
                setCount={setInvestmentCount}
                minCount={bounds.minBestInvestmentCount}
                maxCount={bounds.maxBestInvestmentCount}
              />
              <MinVolumeSlider
                minVolume={filters.minVolume}
                setMinVolume={setMinVolume}
                minVolumeBound={bounds.minVolumeFilter}
                maxVolumeBound={bounds.maxVolumeFilter}
              />
              <div className="filters-actions">
                <button
                  type="button"
                  className="filters-reset-button"
                  onClick={resetFilters}
                >
                  Reset filters
                </button>
              </div>
            </div>
          )}
        </div>
      </LeagueFilter>
      {favoritesStatus !== "error" && (
        <BestInvestment
          title="Favorites"
          caption={`Rate change from day ${filters.currentDayOfLeague - filters.daysBack} to day ${filters.currentDayOfLeague + filters.daysForward}.`}
          emptyMessage=""
          investments={favoriteInvestments}
          isLoading={favoritesStatus === "loading"}
          skeletonCount={favorites.length}
          currentDayOfLeague={filters.currentDayOfLeague}
          daysBack={filters.daysBack}
          daysForward={filters.daysForward}
          onRemoveFavorite={toggleFavorite}
          extraContent={<FavoritesSearch />}
        />
      )}
      {status === "error" ? (
        <section className="best-investment best-investment-none">
          <h2 className="best-investment-title">Best investments</h2>
          <p className="best-investment-none-message">
            Couldn&rsquo;t load investments: {errorMessage}
          </p>
        </section>
      ) : (
        <BestInvestment
          title={
            <>
              Best investments —{" "}
              <span className="best-investment-title-day">
                Day {filters.currentDayOfLeague}
              </span>{" "}
              of the league
            </>
          }
          caption={`Based on the rate change from day ${filters.currentDayOfLeague - filters.daysBack} to day ${filters.currentDayOfLeague + filters.daysForward}.`}
          emptyMessage="No investment is good right now."
          investments={investments}
          isLoading={status === "loading"}
          skeletonCount={filters.investmentCount}
          currentDayOfLeague={filters.currentDayOfLeague}
          daysBack={filters.daysBack}
          daysForward={filters.daysForward}
        />
      )}
    </main>
  );
}

export default MarketOverview;
