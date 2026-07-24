import type { CSSProperties, ReactNode } from 'react'
import { useLeague } from '../context/LeagueContext'

function LeagueFilter({ children }: { children?: ReactNode }) {
  const { leagues, isLeagueSelected, toggleLeague } = useLeague()

  return (
    <div className="league-filter">
      <div className="league-filter-buttons" role="group" aria-label="Leagues">
        {leagues.map((league) => {
          const isSelected = isLeagueSelected(league.id)
          return (
            <button
              key={league.id}
              type="button"
              aria-pressed={isSelected}
              className={
                isSelected
                  ? 'league-filter-button league-filter-button-active'
                  : 'league-filter-button'
              }
              style={
                { '--league-color': league.color } as CSSProperties
              }
              onClick={() => toggleLeague(league.id)}
            >
              {league.name}
            </button>
          )
        })}
      </div>
      {children}
    </div>
  )
}

export default LeagueFilter
