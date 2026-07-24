import { useEffect, useMemo, useRef, useState } from 'react'
import BestInvestment from '../components/BestInvestment'
import CategoryFilter from '../components/CategoryFilter'
import CurrentDaySlider from '../components/CurrentDaySlider'
import InvestmentCountSlider from '../components/InvestmentCountSlider'
import LeagueFilter from '../components/LeagueFilter'
import TrendWindowSliders from '../components/TrendWindowSliders'
import { useCategory } from '../context/CategoryContext'
import { useCurrentDay } from '../context/CurrentDayContext'
import { useLeague } from '../context/LeagueContext'
import { useTrendWindow } from '../context/TrendWindowContext'
import {
  DEFAULT_BEST_INVESTMENT_COUNT,
  MAX_BEST_INVESTMENT_COUNT,
  MIN_BEST_INVESTMENT_COUNT,
  filterLeaguesByCategories,
  getBestInvestmentsForWindow,
} from '../lib/marketData'
import { getStoredNumber, setStoredNumber } from '../lib/storage'

function MarketOverview() {
  const { currentDayOfLeague } = useCurrentDay()
  const { selectedLeagues } = useLeague()
  const { selectedCategories } = useCategory()
  const { daysBack, daysForward } = useTrendWindow()
  const [isFiltersOpen, setIsFiltersOpen] = useState(false)
  const filtersMenuRef = useRef<HTMLDivElement>(null)
  const filteredLeagues = useMemo(
    () => filterLeaguesByCategories(selectedLeagues, selectedCategories),
    [selectedLeagues, selectedCategories],
  )
  const [investmentCount, setInvestmentCount] = useState(() =>
    getStoredNumber('investmentCount', DEFAULT_BEST_INVESTMENT_COUNT),
  )

  useEffect(
    () => setStoredNumber('investmentCount', investmentCount),
    [investmentCount],
  )

  useEffect(() => {
    if (!isFiltersOpen) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!filtersMenuRef.current?.contains(event.target as Node)) {
        setIsFiltersOpen(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isFiltersOpen])

  return (
    <main className="market-overview">
      <h1>Path of Exile 2 Market Guide</h1>
      <LeagueFilter>
        <div className="filters-menu" ref={filtersMenuRef}>
          <button
            type="button"
            className="filters-toggle-button"
            aria-expanded={isFiltersOpen}
            onClick={() => setIsFiltersOpen((open) => !open)}
          >
            Filters {isFiltersOpen ? '▲' : '▼'}
          </button>
          {isFiltersOpen && (
            <div className="filters-dropdown">
              <CategoryFilter />
              <CurrentDaySlider />
              <TrendWindowSliders />
              <InvestmentCountSlider
                count={investmentCount}
                setCount={setInvestmentCount}
                minCount={MIN_BEST_INVESTMENT_COUNT}
                maxCount={MAX_BEST_INVESTMENT_COUNT}
              />
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
        )}
      />
    </main>
  )
}

export default MarketOverview
