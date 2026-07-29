import { useEffect, useRef, useState } from "react";
import BestInvestment from "../components/BestInvestment";
import CategoryFilter from "../components/CategoryFilter";
import ChevronIcon from "../components/ChevronIcon";
import DayOfLeagueSlider from "../components/DayOfLeagueSlider";
import DaySpanSlider from "../components/DaySpanSlider";
import FavoritesSearch from "../components/FavoritesSearch";
import InvestmentCountSlider from "../components/InvestmentCountSlider";
import LeagueBadges from "../components/LeagueBadges";
import LeagueFilter from "../components/LeagueFilter";
import MinVolumeSlider from "../components/MinVolumeSlider";
import PairCurrencyFilter from "../components/PairCurrencyFilter";
import { useFavorites } from "../context/FavoritesContext";
import { useFilters } from "../context/FiltersContext";
import { useLeague } from "../context/LeagueContext";
import { useMeta } from "../context/MetaContext";
import { fetchBestInvestments, fetchFavorites } from "../lib/api";
import { formatDate, formatTimeUntil } from "../lib/format";
import { getImageUrl } from "../lib/marketData";
import type { BestInvestment as BestInvestmentEntry, PoeNinjaStatus } from "../types";

type QueryStatus = "loading" | "error" | "success";

// Dragging a slider fires a state update (and would otherwise fire a
// request) per intermediate value, not just on release — this delays the
// actual network call until the filters stop changing for a moment, so a
// drag collapses into a single request instead of dozens.
const FETCH_DEBOUNCE_MS = 350;

// Same Divine Orb icon shown throughout the app for that currency — purely
// decorative branding here, not tied to any particular league's data, so
// it's a fixed path rather than looked up per-request.
const DIVINE_ORB_IMAGE =
  "/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lNb2RWYWx1ZXMiLCJzY2FsZSI6MSwicmVhbG0iOiJwb2UyIn1d/2986e220b3/CurrencyModValues.png";

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
  const { filters, setInvestmentCount, setMinVolume } = useFilters();
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const filtersMenuRef = useRef<HTMLDivElement>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);

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

  useEffect(() => {
    if (!isSettingsOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!settingsMenuRef.current?.contains(event.target as Node)) {
        setIsSettingsOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isSettingsOpen]);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const updateHeaderHeight = () => {
      document.documentElement.style.setProperty("--header-height", `${header.offsetHeight}px`);
    };
    updateHeaderHeight();
    const observer = new ResizeObserver(updateHeaderHeight);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  const leagueHasStarted =
    new Date(currentLeague.startDate).getTime() <= Date.now();
  const hasPoeNinjaFailures = (poeNinjaStatus?.failedItemIds.length ?? 0) > 0;

  return (
    <>
      <header className="app-header" ref={headerRef}>
        <div className="app-header-inner">
          <span className="app-header-title" aria-label="Jarnehall&rsquo;s Market Helper">
            <img
              className="app-header-title-icon"
              src={getImageUrl(DIVINE_ORB_IMAGE)}
              alt=""
              aria-hidden="true"
            />
            <span className="app-header-title-full" aria-hidden="true">
              Jarnehall&rsquo;s Market Helper
            </span>
            <span className="app-header-title-short" aria-hidden="true">
              JMH
            </span>
          </span>
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
                  <MinVolumeSlider
                    minVolume={filters.minVolume}
                    setMinVolume={setMinVolume}
                    minVolumeBound={bounds.minVolumeFilter}
                    maxVolumeBound={bounds.maxVolumeFilter}
                  />
                </div>
              )}
            </div>
            <div className="settings-menu" ref={settingsMenuRef}>
              <button
                type="button"
                className="settings-toggle-button"
                aria-expanded={isSettingsOpen}
                onClick={() => setIsSettingsOpen((open) => !open)}
              >
                Settings
                <ChevronIcon open={isSettingsOpen} />
              </button>
              {isSettingsOpen && (
                <div className="settings-dropdown">
                  <div className="dropdown-header">
                    <button
                      type="button"
                      className="dropdown-close-button"
                      aria-label="Close"
                      onClick={() => setIsSettingsOpen(false)}
                    >
                      ×
                    </button>
                  </div>
                  <DayOfLeagueSlider />
                  <DaySpanSlider />
                  <InvestmentCountSlider
                    count={filters.investmentCount}
                    setCount={setInvestmentCount}
                    minCount={bounds.minBestInvestmentCount}
                    maxCount={bounds.maxBestInvestmentCount}
                  />
                  <div className="settings-info">
                    <p className="settings-info-line">
                      {visitorCount} unique visitor{visitorCount === 1 ? "" : "s"} since last deploy
                    </p>
                    {poeNinjaStatus?.checked && (
                      <p
                        className={
                          hasPoeNinjaFailures
                            ? "settings-info-line settings-info-line-warning"
                            : "settings-info-line"
                        }
                      >
                        {hasPoeNinjaFailures
                          ? `${poeNinjaStatus.failedItemIds.length} of ${poeNinjaStatus.attemptedCount} poe.ninja request${poeNinjaStatus.attemptedCount === 1 ? "" : "s"} failed on the last reload`
                          : "All poe.ninja requests succeeded on the last reload"}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </LeagueFilter>
        </div>
      </header>
      <main className="market-overview">
        <header className="league-banner">
          <h1 className="league-banner-name">{currentLeague.name} league</h1>
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
        <LeagueBadges />
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
            isFavorite={isFavorite}
            onToggleFavorite={toggleFavorite}
          />
        )}
      </main>
    </>
  );
}

export default MarketOverview;
