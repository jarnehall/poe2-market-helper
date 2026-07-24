import { useState } from 'react'
import { useCurrentDay } from '../context/CurrentDayContext'
import { useLeague } from '../context/LeagueContext'
import { changeClass, formatPercentChange } from '../lib/format'
import {
  getAveragePercentChangeForPair,
  getLeagueHistoriesForPair,
  getNextDayPercentChange,
  getPairDisplayName,
  getPairImageUrl,
} from '../lib/marketData'
import type { MarketItem } from '../types'
import PairHistoryTable from './PairHistoryTable'

function PairSummaryItem({
  item,
  pairId,
}: {
  item: MarketItem
  pairId: string
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const { currentDayOfLeague } = useCurrentDay()
  const { selectedLeagues } = useLeague()
  const percentChange = getAveragePercentChangeForPair(
    selectedLeagues,
    item.id,
    pairId,
    currentDayOfLeague,
    getNextDayPercentChange,
  )
  const leagueHistories = getLeagueHistoriesForPair(
    selectedLeagues,
    item.id,
    pairId,
  )

  return (
    <li className="pair-summary-item">
      <div className="pair-summary-row">
        <img
          className="pair-image"
          src={getPairImageUrl(pairId, selectedLeagues)}
          alt={getPairDisplayName(pairId, selectedLeagues)}
        />
        <span className="pair-summary-name">
          {getPairDisplayName(pairId, selectedLeagues)}
        </span>
        <span className={`pair-summary-change ${changeClass(percentChange)}`}>
          {formatPercentChange(percentChange)}
        </span>
        <button
          type="button"
          className="toggle-history-button"
          onClick={() => setIsExpanded((expanded) => !expanded)}
        >
          {isExpanded ? 'Hide details' : 'Show details'}
        </button>
      </div>
      {isExpanded && (
        <div className="pair-history-by-league">
          {leagueHistories.map(({ league, history }) => (
            <PairHistoryTable
              key={league.id}
              history={history}
              league={leagueHistories.length > 1 ? league : undefined}
            />
          ))}
        </div>
      )}
    </li>
  )
}

export default PairSummaryItem
