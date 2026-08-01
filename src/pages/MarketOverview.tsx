import { useEffect, useRef, useState } from "react";
import AveragePairsToggle from "../components/AveragePairsToggle";
import BestInvestment from "../components/BestInvestment";
import CategoryFilter from "../components/CategoryFilter";
import ChevronIcon from "../components/ChevronIcon";
import DayOfLeagueSlider from "../components/DayOfLeagueSlider";
import DaySpanSlider from "../components/DaySpanSlider";
import FavoritesSearch from "../components/FavoritesSearch";
import GameSwitcher from "../components/GameSwitcher";
import InvestmentCountSlider from "../components/InvestmentCountSlider";
import LeagueFilter from "../components/LeagueFilter";
import MinVolumeSlider from "../components/MinVolumeSlider";
import PairCurrencyFilter from "../components/PairCurrencyFilter";
import ResetFiltersButton from "../components/ResetFiltersButton";
import Tooltip from "../components/Tooltip";
import { useFavorites } from "../context/FavoritesContext";
import { useFilters } from "../context/FiltersContext";
import { useGame } from "../context/GameContext";
import { useLeague } from "../context/LeagueContext";
import { useMeta } from "../context/MetaContext";
import { fetchBestInvestments, fetchFavorites, resetPoeNinjaCache } from "../lib/api";
import { formatDate, formatTimeUntil } from "../lib/format";
import {
  DEFAULT_CURRENT_DATE,
  getDayOfLeagueForDate,
  getHeaderImage,
} from "../lib/marketData";
import { useKeepOnScreen } from "../lib/useKeepOnScreen";
import type {
  BestInvestment as BestInvestmentEntry,
  PoeNinjaStatus,
} from "../types";

type QueryStatus = "loading" | "error" | "success";

// Dragging a slider fires a state update (and would otherwise fire a
// request) per intermediate value, not just on release — this delays the
// actual network call until the filters stop changing for a moment, so a
// drag collapses into a single request instead of dozens.
const FETCH_DEBOUNCE_MS = 350;

function MarketOverview() {
  const { game } = useGame();
  const { currentLeague, bounds, visitorCount } = useMeta();
  const { selectedLeagueIds, liveLeague } = useLeague();
  const { favorites, isFavorite, toggleFavorite } = useFavorites();
  // The live league is never one of the selectable/toggleable leagues (see
  // LeagueContext), but its data is still always requested as a display-only
  // overlay — the backend only adds it when its id is present in `leagues`.
  const requestLeagueIds = liveLeague
    ? [...selectedLeagueIds, liveLeague.id]
    : selectedLeagueIds;
  const { filters, setInvestmentCount, setMinVolume, setUseAveragePairs } =
    useFilters();
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const filtersMenuRef = useRef<HTMLDivElement>(null);
  const { ref: filtersDropdownRef, style: filtersDropdownStyle } =
    useKeepOnScreen<HTMLDivElement>(isFiltersOpen);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  const { ref: settingsDropdownRef, style: settingsDropdownStyle } =
    useKeepOnScreen<HTMLDivElement>(isSettingsOpen);
  const headerRef = useRef<HTMLElement>(null);

  const [investments, setInvestments] = useState<BestInvestmentEntry[]>([]);
  const [status, setStatus] = useState<QueryStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [poeNinjaStatus, setPoeNinjaStatus] = useState<PoeNinjaStatus | null>(
    null,
  );
  // False only when the selected day/league combination has no price data
  // at all (e.g. a static league whose ingested snapshot doesn't reach this
  // far back/forward) — lets the empty state explain that instead of
  // reading like "nothing is profitable right now" when there's actually no
  // data to judge at all. Defaults true so the very first render (before any
  // response has landed) never shows the "no data" message prematurely.
  const [hasDataInWindow, setHasDataInWindow] = useState(true);

  const [favoriteInvestments, setFavoriteInvestments] = useState<
    BestInvestmentEntry[]
  >([]);
  const [favoritesStatus, setFavoritesStatus] =
    useState<QueryStatus>("loading");

  // The day window actually reflected in `investments`/`favoriteInvestments`
  // right now — deliberately NOT the same as `filters`. A chart's x-axis
  // domain is derived from currentDayOfLeague/daysBack/daysForward, while
  // its plotted points come from leagueHistories (server data for whatever
  // window was last fetched) — if the axis switched to the new window the
  // instant a slider is released, but the fetch for that window hasn't
  // resolved yet, old points would get mapped onto a domain they were never
  // computed for and render far outside the card. These only advance once
  // the matching response actually lands, so the axis and the data it's
  // scaling always describe the same window.
  const [appliedWindow, setAppliedWindow] = useState(() => ({
    currentDayOfLeague: filters.currentDayOfLeague,
    daysBack: filters.daysBack,
    daysForward: filters.daysForward,
  }));
  // Also tracks requestLeagueIds (unlike appliedWindow above) so it can
  // double as the "is favoriteInvestments actually stale" signature below —
  // a pin/unpin alone doesn't change this, only the day window or league
  // selection does.
  const [appliedFavoritesWindow, setAppliedFavoritesWindow] = useState(() => ({
    currentDayOfLeague: filters.currentDayOfLeague,
    daysBack: filters.daysBack,
    daysForward: filters.daysForward,
    leagueIds: requestLeagueIds,
  }));

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");

    const timeoutId = window.setTimeout(() => {
      fetchBestInvestments(
        {
          game,
          leagues: requestLeagueIds,
          categories: filters.categories,
          pairCurrencies: filters.pairCurrencies,
          currentDayOfLeague: filters.currentDayOfLeague,
          daysBack: filters.daysBack,
          daysForward: filters.daysForward,
          count: filters.investmentCount,
          minVolume: filters.minVolume,
          useAveragePairs: filters.useAveragePairs,
        },
        controller.signal,
      )
        .then((response) => {
          setInvestments(response.investments);
          setPoeNinjaStatus(response.poeNinjaStatus);
          setHasDataInWindow(response.hasDataInWindow ?? true);
          setStatus("success");
          setErrorMessage(null);
          setAppliedWindow({
            currentDayOfLeague: filters.currentDayOfLeague,
            daysBack: filters.daysBack,
            daysForward: filters.daysForward,
          });
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError")
            return;
          setStatus("error");
          setErrorMessage(
            error instanceof Error ? error.message : "Failed to load",
          );
        });
    }, FETCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [game, filters, selectedLeagueIds, liveLeague]);

  // Starring/unstarring a card already shown in Best investments doesn't
  // need a round trip at all — we already have that exact item+pair's data
  // right here. This keeps favoriting instant for that common case; the
  // debounced fetch below still runs right after as the authoritative
  // source (needed for e.g. a favorite pinned via search, which has no
  // locally-known data yet, or when the day window/leagues change).
  useEffect(() => {
    setFavoriteInvestments((current) => {
      const favoriteKeys = new Set(
        favorites.map((f) => `${f.itemId}::${f.pairId}`),
      );
      // `pinPairId` (only set on results from the /favorites endpoint) is
      // the pairId the pin was actually requested with — use it in place of
      // `pairId` when present, since the backend can promote a pinned
      // item's displayed pairId to a different one that actually has
      // current-league data (see augmentWithLiveLeague). Falling back to
      // `pairId` covers investments sourced from the best-investments list
      // instead, which never carry `pinPairId` but were starred at their
      // own current pairId, so the two coincide there anyway.
      const pinKey = (inv: BestInvestmentEntry) =>
        `${inv.item.id}::${inv.pinPairId ?? inv.pairId}`;
      const kept = current.filter((inv) => favoriteKeys.has(pinKey(inv)));

      const keptKeys = new Set(kept.map(pinKey));
      const newlyAvailable = investments.filter(
        (inv) => favoriteKeys.has(pinKey(inv)) && !keptKeys.has(pinKey(inv)),
      );

      if (kept.length === current.length && newlyAvailable.length === 0) {
        return current;
      }

      return [...kept, ...newlyAvailable];
    });
  }, [favorites, investments]);

  useEffect(() => {
    if (favorites.length === 0) {
      setFavoriteInvestments([]);
      setFavoritesStatus("success");
      setAppliedFavoritesWindow({
        currentDayOfLeague: filters.currentDayOfLeague,
        daysBack: filters.daysBack,
        daysForward: filters.daysForward,
        leagueIds: requestLeagueIds,
      });
      return;
    }

    const controller = new AbortController();
    setFavoritesStatus("loading");

    const timeoutId = window.setTimeout(() => {
      fetchFavorites(
        {
          game,
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
          setAppliedFavoritesWindow({
            currentDayOfLeague: filters.currentDayOfLeague,
            daysBack: filters.daysBack,
            daysForward: filters.daysForward,
            leagueIds: requestLeagueIds,
          });
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError")
            return;
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
    game,
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
      document.documentElement.style.setProperty(
        "--header-height",
        `${header.offsetHeight}px`,
      );
    };
    updateHeaderHeight();
    const observer = new ResizeObserver(updateHeaderHeight);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  const leagueHasStarted =
    new Date(currentLeague.startDate).getTime() <= Date.now();
  const hasPoeNinjaFailures = (poeNinjaStatus?.failedItemIds.length ?? 0) > 0;
  // Nothing needed a fresh fetch at all — every item's live-league data
  // came straight from the on-disk cache (see PoeNinjaClient), so there's
  // nothing to have "succeeded" or "failed" on this particular reload.
  const allPoeNinjaServedFromCache = poeNinjaStatus?.checked && poeNinjaStatus.attemptedCount === 0;

  // Deliberately not real auth (the backend's own check is the same literal
  // string) — just a confirmation gate so this destructive-ish action isn't
  // one accidental click away, for a utility button used maybe once a
  // league. window.prompt/alert rather than the app's own styled dialogs:
  // this is an occasional admin nicety, not a primary user flow.
  const handleResetPoeNinjaCache = () => {
    const password = window.prompt('Enter the password to reset the poe.ninja cache:');
    if (password === null) return;

    resetPoeNinjaCache(password)
      .then((response) => {
        window.alert(
          `Cleared ${response.cleared.length} poe.ninja cache file${response.cleared.length === 1 ? '' : 's'}. Fresh data will be fetched on the next reload.`,
        );
      })
      .catch((error: unknown) => {
        window.alert(`Couldn't reset the poe.ninja cache: ${error instanceof Error ? error.message : 'unknown error'}`);
      });
  };

  // The league's actual current day, independent of whatever day the
  // slider is browsing — same clamped calculation DayOfLeagueSlider uses
  // for its own "(today: day N)" hint.
  const todayDayOfLeague = Math.min(
    Math.max(
      getDayOfLeagueForDate(DEFAULT_CURRENT_DATE, currentLeague.startDate),
      bounds.minDayOfLeague,
    ),
    bounds.maxDayOfLeague,
  );

  // Favorites not yet resolved locally (see the reconciling effect above) —
  // typically one pinned via search, whose data isn't already sitting in
  // `investments`. Rendered as trailing skeleton cards so there's still
  // instant feedback instead of a silent ~1s wait for the fetch.
  const loadedFavoriteKeys = new Set(
    favoriteInvestments.map(
      (inv) => `${inv.item.id}::${inv.pinPairId ?? inv.pairId}`,
    ),
  );
  const pendingFavoritesCount = favorites.filter(
    (favorite) =>
      !loadedFavoriteKeys.has(`${favorite.itemId}::${favorite.pairId}`),
  ).length;

  // True only while favoriteInvestments is stale for a reason that
  // invalidates the *whole* list (the day window or league selection
  // changed) — a full skeleton is the right feedback there, same as Best
  // investments. A pin/unpin alone doesn't reach here: it's resolved
  // instantly by the reconciling effect above (or, for a brand new pin,
  // shown via pendingFavoritesCount) without needing the rest of the list
  // to flash back to skeleton.
  const favoritesDataStale =
    appliedFavoritesWindow.currentDayOfLeague !== filters.currentDayOfLeague ||
    appliedFavoritesWindow.daysBack !== filters.daysBack ||
    appliedFavoritesWindow.daysForward !== filters.daysForward ||
    appliedFavoritesWindow.leagueIds.join(",") !== requestLeagueIds.join(",");
  const favoritesIsLoading =
    favoritesStatus === "loading" && favoritesDataStale;

  return (
    <>
      <header className="app-header" ref={headerRef}>
        <div className="app-header-inner">
          <span className="app-header-title" aria-label="Chaos Theory">
            <img
              className="app-header-title-icon"
              src={getHeaderImage(game)}
              alt=""
              aria-hidden="true"
            />
            <span className="app-header-title-full" aria-hidden="true">
              Chaos Theory
            </span>
          </span>
          <div className="app-header-controls">
            <GameSwitcher />
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
                  <div
                    className="filters-dropdown"
                    ref={filtersDropdownRef}
                    style={filtersDropdownStyle}
                  >
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
                  <div
                    className="settings-dropdown"
                    ref={settingsDropdownRef}
                    style={settingsDropdownStyle}
                  >
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
                    <AveragePairsToggle
                      checked={filters.useAveragePairs}
                      onChange={setUseAveragePairs}
                    />
                    <div className="settings-info">
                      <p className="settings-info-line">
                        {visitorCount} unique visitor
                        {visitorCount === 1 ? "" : "s"} since last deploy
                      </p>
                      {poeNinjaStatus?.checked &&
                        (hasPoeNinjaFailures ? (
                          <Tooltip
                            tooltipClassName="poe-ninja-failed-tooltip-panel"
                            text={
                              <div className="poe-ninja-failed-tooltip">
                                {poeNinjaStatus.failedItems.map((failedItem) => (
                                  <div key={failedItem.itemId} className="poe-ninja-failed-tooltip-entry">
                                    <div className="poe-ninja-failed-tooltip-item-name">{failedItem.itemName}</div>
                                    <div className="poe-ninja-failed-tooltip-url">{failedItem.url}</div>
                                  </div>
                                ))}
                              </div>
                            }
                          >
                            <p className="settings-info-line settings-info-line-warning">
                              {`${poeNinjaStatus.failedItemIds.length} of ${poeNinjaStatus.attemptedCount} poe.ninja request${poeNinjaStatus.attemptedCount === 1 ? "" : "s"} failed on the last reload`}
                            </p>
                          </Tooltip>
                        ) : (
                          <p className="settings-info-line">
                            {allPoeNinjaServedFromCache
                              ? "All poe.ninja requests were served from cache"
                              : "All poe.ninja requests succeeded on the last reload"}
                          </p>
                        ))}
                      <button
                        type="button"
                        className="poe-ninja-cache-reset-button"
                        onClick={handleResetPoeNinjaCache}
                      >
                        Reset poe.ninja cache
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <ResetFiltersButton />
            </LeagueFilter>
          </div>
        </div>
      </header>
      <main className="market-overview">
        <header className="league-banner">
          <h1 className="league-banner-name">{currentLeague.name}</h1>
          <div className="league-banner-started-group">
            <p className="league-banner-started">
              <span
                className={
                  leagueHasStarted
                    ? "league-banner-started-dot league-banner-started-dot-live"
                    : "league-banner-started-dot"
                }
              />
              <span className="league-banner-started-text">
                {leagueHasStarted
                  ? `Started ${formatDate(currentLeague.startDate)}`
                  : `Starts ${formatDate(currentLeague.startDate)} (in ${formatTimeUntil(currentLeague.startDate)})`}
              </span>
            </p>
            <p className="league-banner-started">
              <span className="league-banner-started-text">
                Day {todayDayOfLeague}
              </span>
            </p>
          </div>
        </header>
        {favoritesStatus !== "error" && (
          <BestInvestment
            title="Favorites"
            caption={`Rate change from day ${filters.currentDayOfLeague} to day ${filters.currentDayOfLeague + filters.daysForward}.`}
            emptyMessage=""
            investments={favoriteInvestments}
            isLoading={favoritesIsLoading}
            skeletonCount={favorites.length}
            pendingSkeletonCount={pendingFavoritesCount}
            currentDayOfLeague={appliedFavoritesWindow.currentDayOfLeague}
            daysBack={appliedFavoritesWindow.daysBack}
            daysForward={appliedFavoritesWindow.daysForward}
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
            caption={`Based on the rate change from day ${filters.currentDayOfLeague} to day ${filters.currentDayOfLeague + filters.daysForward}.`}
            emptyMessage={
              hasDataInWindow
                ? "No investment is good right now."
                : `No price data for day ${appliedWindow.currentDayOfLeague} to day ${appliedWindow.currentDayOfLeague + appliedWindow.daysForward} with the selected leagues. Try a different day or league selection.`
            }
            investments={investments}
            isLoading={status === "loading"}
            skeletonCount={filters.investmentCount}
            currentDayOfLeague={appliedWindow.currentDayOfLeague}
            daysBack={appliedWindow.daysBack}
            daysForward={appliedWindow.daysForward}
            isFavorite={isFavorite}
            onToggleFavorite={toggleFavorite}
          />
        )}
      </main>
    </>
  );
}

export default MarketOverview;
