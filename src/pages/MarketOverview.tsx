import { useEffect, useRef, useState } from "react";
import BestInvestment from "../components/BestInvestment";
import CategoryFilter from "../components/CategoryFilter";
import ChevronIcon from "../components/ChevronIcon";
import DayOfLeagueSlider from "../components/DayOfLeagueSlider";
import DaySpanSlider from "../components/DaySpanSlider";
import InvestmentCountSlider from "../components/InvestmentCountSlider";
import LeagueFilter from "../components/LeagueFilter";
import MinVolumeSlider from "../components/MinVolumeSlider";
import PairCurrencyFilter from "../components/PairCurrencyFilter";
import { useFilters } from "../context/FiltersContext";
import { useLeague } from "../context/LeagueContext";
import { useMeta } from "../context/MetaContext";
import { fetchBestInvestments } from "../lib/api";
import { formatIsoDate, formatTimeUntil } from "../lib/format";
import type { BestInvestment as BestInvestmentEntry } from "../types";

type QueryStatus = "loading" | "error" | "success";

function MarketOverview() {
  const { currentLeague, bounds } = useMeta();
  const { selectedLeagueIds } = useLeague();
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

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");

    fetchBestInvestments(
      {
        leagues: selectedLeagueIds,
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
        setStatus("success");
        setErrorMessage(null);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatus("error");
        setErrorMessage(error instanceof Error ? error.message : "Failed to load");
      });

    return () => controller.abort();
  }, [applied, selectedLeagueIds]);

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
        <h1 className="league-banner-name">
          {currentLeague.name} league{" "}
          <span className="league-banner-version">{currentLeague.version}</span>
        </h1>
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
        />
      )}
    </main>
  );
}

export default MarketOverview;
