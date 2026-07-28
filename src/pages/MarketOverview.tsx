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
import { formatIsoDate, formatTimeUntil } from "../lib/format";
import type { BestInvestment as BestInvestmentEntry, PoeNinjaStatus } from "../types";

type QueryStatus = "loading" | "error" | "success";

function MarketOverview() {
  const { currentLeague, bounds, visitorCount } = useMeta();
  const { selectedLeagueIds, liveLeague } = useLeague();
  const { favorites, isFavorite, toggleFavorite } = useFavorites();
  // The live league is never one of the selectable/toggleable leagues (see
  // LeagueContext), but its data is still always requested as a display-only
  // overlay — the backend only adds it when its id is present in `leagues`.
  const requestLeagueIds = liveLeague
    ? [...selectedLeagueIds, liveLeague.id]
    : selectedLeagueIds;
  const {
    draft,
    applied,
    isDirty,
    setDraftInvestmentCount,
    setDraftMinVolume,
    applyFilters,
    resetFilters,
  } = useFilters();
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

    fetchBestInvestments(
      {
        leagues: requestLeagueIds,
        categories: applied.categories,
        pairCurrencies: applied.pairCurrencies,
        currentDayOfLeague: applied.currentDayOfLeague,
        daysBack: applied.daysBack,
        daysForward: applied.daysForward,
        count: applied.investmentCount,
        minVolume: applied.minVolume,
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

    return () => controller.abort();
  }, [applied, selectedLeagueIds, liveLeague]);

  useEffect(() => {
    if (favorites.length === 0) {
      setFavoriteInvestments([]);
      setFavoritesStatus("success");
      return;
    }

    const controller = new AbortController();
    setFavoritesStatus("loading");

    fetchFavorites(
      {
        favorites,
        leagues: requestLeagueIds,
        currentDayOfLeague: applied.currentDayOfLeague,
        daysBack: applied.daysBack,
        daysForward: applied.daysForward,
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

    return () => controller.abort();
    // Deliberately keyed on just the day-window fields (not the whole
    // `applied` object) — favorites ignore Categories/pair-currency/count/
    // minVolume entirely, so a change to those shouldn't refetch this list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    favorites,
    selectedLeagueIds,
    liveLeague,
    applied.currentDayOfLeague,
    applied.daysBack,
    applied.daysForward,
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
          <h1 className="league-banner-name">
            {currentLeague.name} league{" "}
            <span className="league-banner-version">{currentLeague.version}</span>
          </h1>
          <InfoIcon visitorCount={visitorCount} poeNinjaStatus={poeNinjaStatus} />
        </div>
        <p className="league-banner-started">
          {leagueHasStarted
            ? `Started ${formatIsoDate(currentLeague.startDate)}`
            : `Starts ${formatIsoDate(currentLeague.startDate)} (in ${formatTimeUntil(currentLeague.startDate)})`}
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
            {isDirty && (
              <span className="filters-dirty-dot" aria-label="Unapplied filter changes" />
            )}
            <ChevronIcon open={isFiltersOpen} />
          </button>
          {isFiltersOpen && (
            <div className="filters-dropdown">
              <CategoryFilter />
              <PairCurrencyFilter />
              <DayOfLeagueSlider />
              <DaySpanSlider />
              <InvestmentCountSlider
                count={draft.investmentCount}
                setCount={setDraftInvestmentCount}
                minCount={bounds.minBestInvestmentCount}
                maxCount={bounds.maxBestInvestmentCount}
              />
              <MinVolumeSlider
                minVolume={draft.minVolume}
                setMinVolume={setDraftMinVolume}
                minVolumeBound={bounds.minVolumeFilter}
                maxVolumeBound={bounds.maxVolumeFilter}
              />
              <div className="filters-actions">
                <button
                  type="button"
                  className="filters-apply-button"
                  disabled={!isDirty}
                  onClick={applyFilters}
                >
                  Apply filters
                </button>
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
          caption={`Rate change from day ${applied.currentDayOfLeague - applied.daysBack} to day ${applied.currentDayOfLeague + applied.daysForward}.`}
          emptyMessage=""
          investments={favoriteInvestments}
          isLoading={favoritesStatus === "loading"}
          skeletonCount={favorites.length}
          currentDayOfLeague={applied.currentDayOfLeague}
          daysBack={applied.daysBack}
          daysForward={applied.daysForward}
          isFavorite={isFavorite}
          onToggleFavorite={toggleFavorite}
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
                Day {applied.currentDayOfLeague}
              </span>{" "}
              of the league
            </>
          }
          caption={`Based on the rate change from day ${applied.currentDayOfLeague - applied.daysBack} to day ${applied.currentDayOfLeague + applied.daysForward}.`}
          emptyMessage="No investment is good right now."
          investments={investments}
          isLoading={status === "loading"}
          skeletonCount={applied.investmentCount}
          currentDayOfLeague={applied.currentDayOfLeague}
          daysBack={applied.daysBack}
          daysForward={applied.daysForward}
          isFavorite={isFavorite}
          onToggleFavorite={toggleFavorite}
        />
      )}
    </main>
  );
}

export default MarketOverview;
