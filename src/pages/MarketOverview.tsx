import { useEffect, useMemo, useRef, useState } from "react";
import BestInvestment from "../components/BestInvestment";
import CategoryFilter from "../components/CategoryFilter";
import CurrentDaySlider from "../components/CurrentDaySlider";
import InvestmentCountSlider from "../components/InvestmentCountSlider";
import LeagueFilter from "../components/LeagueFilter";
import MinVolumeSlider from "../components/MinVolumeSlider";
import PairCurrencyFilter from "../components/PairCurrencyFilter";
import TrendWindowSliders from "../components/TrendWindowSliders";
import { useCategory } from "../context/CategoryContext";
import { useCurrentDay } from "../context/CurrentDayContext";
import { useLeague } from "../context/LeagueContext";
import { usePairCurrency } from "../context/PairCurrencyContext";
import { useTrendWindow } from "../context/TrendWindowContext";
import { formatIsoDate, formatTimeUntil } from "../lib/format";
import {
  CURRENT_LEAGUE_INFO,
  DEFAULT_BEST_INVESTMENT_COUNT,
  DEFAULT_DAYS_BACK,
  DEFAULT_DAYS_FORWARD,
  DEFAULT_MIN_VOLUME,
  MAX_BEST_INVESTMENT_COUNT,
  MAX_VOLUME_FILTER,
  MIN_BEST_INVESTMENT_COUNT,
  MIN_VOLUME_FILTER,
  filterLeaguesByCategories,
  filterLeaguesByPairCurrencies,
  getBestInvestmentsForWindow,
} from "../lib/marketData";
import { getStoredNumber, setStoredNumber } from "../lib/storage";

function MarketOverview() {
  const { currentDayOfLeague, resetCurrentDay } = useCurrentDay();
  const { selectedLeagues } = useLeague();
  const { selectedCategories, resetCategories } = useCategory();
  const { selectedPairCurrencies, resetPairCurrencies } = usePairCurrency();
  const { daysBack, daysForward, setDaysBack, setDaysForward } =
    useTrendWindow();
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const filtersMenuRef = useRef<HTMLDivElement>(null);
  const filteredLeagues = useMemo(
    () =>
      filterLeaguesByPairCurrencies(
        filterLeaguesByCategories(selectedLeagues, selectedCategories),
        selectedPairCurrencies,
      ),
    [selectedLeagues, selectedCategories, selectedPairCurrencies],
  );
  const [investmentCount, setInvestmentCount] = useState(() =>
    getStoredNumber("investmentCount", DEFAULT_BEST_INVESTMENT_COUNT),
  );
  const [minVolume, setMinVolume] = useState(() =>
    getStoredNumber("minVolume", DEFAULT_MIN_VOLUME),
  );

  useEffect(
    () => setStoredNumber("investmentCount", investmentCount),
    [investmentCount],
  );

  useEffect(() => setStoredNumber("minVolume", minVolume), [minVolume]);

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

  const resetFilters = () => {
    resetCategories();
    resetPairCurrencies();
    resetCurrentDay();
    setDaysBack(DEFAULT_DAYS_BACK);
    setDaysForward(DEFAULT_DAYS_FORWARD);
    setInvestmentCount(DEFAULT_BEST_INVESTMENT_COUNT);
    setMinVolume(DEFAULT_MIN_VOLUME);
  };

  const leagueHasStarted =
    new Date(CURRENT_LEAGUE_INFO.startDate).getTime() <= Date.now();

  return (
    <main className="market-overview">
      <header className="league-banner">
        <h1 className="league-banner-name">
          {CURRENT_LEAGUE_INFO.name} league{" "}
          <span className="league-banner-version">
            {CURRENT_LEAGUE_INFO.version}
          </span>
        </h1>
        <p className="league-banner-started">
          {leagueHasStarted
            ? `Started ${formatIsoDate(CURRENT_LEAGUE_INFO.startDate)}`
            : `Starts ${formatIsoDate(CURRENT_LEAGUE_INFO.startDate)} (in ${formatTimeUntil(CURRENT_LEAGUE_INFO.startDate)})`}
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
            Filters {isFiltersOpen ? "▲" : "▼"}
          </button>
          {isFiltersOpen && (
            <div className="filters-dropdown">
              <CategoryFilter />
              <PairCurrencyFilter />
              <CurrentDaySlider />
              <TrendWindowSliders />
              <InvestmentCountSlider
                count={investmentCount}
                setCount={setInvestmentCount}
                minCount={MIN_BEST_INVESTMENT_COUNT}
                maxCount={MAX_BEST_INVESTMENT_COUNT}
              />
              <MinVolumeSlider
                minVolume={minVolume}
                setMinVolume={setMinVolume}
                minVolumeBound={MIN_VOLUME_FILTER}
                maxVolumeBound={MAX_VOLUME_FILTER}
              />
              <button
                type="button"
                className="filters-reset-button"
                onClick={resetFilters}
              >
                Reset filters
              </button>
            </div>
          )}
        </div>
      </LeagueFilter>
      <BestInvestment
        title={`Best investments — Day ${currentDayOfLeague} of the league`}
        caption={`Based on the rate change from day ${currentDayOfLeague - daysBack} to day ${currentDayOfLeague + daysForward}.`}
        emptyMessage="No investment is good right now."
        investments={getBestInvestmentsForWindow(
          filteredLeagues,
          investmentCount,
          currentDayOfLeague,
          daysBack,
          daysForward,
          minVolume,
        )}
      />
    </main>
  );
}

export default MarketOverview;
