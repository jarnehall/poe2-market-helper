import { useState } from 'react'
import { useCurrentDay } from '../context/CurrentDayContext'
import { changeClass, formatDate, formatPercentChange } from '../lib/format'
import {
  getAllHistoryRows,
  getHistoryRowsAroundCurrentDay,
} from '../lib/marketData'
import type { League } from '../lib/marketData'
import type { HistoryEntry } from '../types'

function PairHistoryTable({
  history,
  league,
}: {
  history: HistoryEntry[]
  league?: League
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const { currentDayOfLeague } = useCurrentDay()

  const allRows = getAllHistoryRows(history, currentDayOfLeague)
  const visibleRows = isExpanded
    ? allRows
    : getHistoryRowsAroundCurrentDay(allRows, currentDayOfLeague)

  return (
    <div className="pair-card">
      <div className="pair-header">
        {league && (
          <span
            className="pair-history-league-label"
            style={{ color: league.color }}
          >
            {league.name}
          </span>
        )}
        <button
          type="button"
          className="toggle-history-button"
          onClick={() => setIsExpanded((expanded) => !expanded)}
        >
          {isExpanded ? 'Show fewer dates' : 'Show all dates'}
        </button>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Day</th>
              <th>Date</th>
              <th>Rate</th>
              <th>Change</th>
              <th>Volume</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(
              ({ entry, percentChange, isCurrentDay, dayOfLeague }) => (
                <tr
                  key={entry.timestamp}
                  className={isCurrentDay ? 'current-day' : undefined}
                >
                  <td>{dayOfLeague}</td>
                  <td>
                    {formatDate(entry.timestamp)}
                    {isCurrentDay && (
                      <span className="current-day-badge">Today</span>
                    )}
                  </td>
                  <td>{entry.rate}</td>
                  <td className={changeClass(percentChange)}>
                    {formatPercentChange(percentChange)}
                  </td>
                  <td>{entry.volumePrimaryValue.toLocaleString()}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default PairHistoryTable
