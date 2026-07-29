import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useLeague } from '../context/LeagueContext'
import ChevronIcon from './ChevronIcon'

function LeagueFilter({ children }: { children?: ReactNode }) {
  const { selectableLeagues, liveLeague, isLeagueSelected, toggleLeague } = useLeague()
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isOpen])

  return (
    <div className="league-filter">
      <div className="league-filter-menu" ref={menuRef}>
        <button
          type="button"
          className="league-filter-toggle-button"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((open) => !open)}
        >
          Leagues
          <ChevronIcon open={isOpen} />
        </button>
        {isOpen && (
          <div className="league-filter-dropdown">
            <div className="dropdown-header">
              <button
                type="button"
                className="dropdown-close-button"
                aria-label="Close"
                onClick={() => setIsOpen(false)}
              >
                ×
              </button>
            </div>
            <div
              className="league-filter-dropdown-buttons"
              role="group"
              aria-label="Leagues"
            >
              {selectableLeagues.map((league) => {
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
                    style={{ '--league-color': league.color } as CSSProperties}
                    onClick={() => toggleLeague(league.id)}
                  >
                    {league.name}
                  </button>
                )
              })}
            </div>
            {liveLeague && (
              <p className="league-filter-dropdown-note">
                {liveLeague.name} is the current league — always shown, not selectable.
              </p>
            )}
          </div>
        )}
      </div>
      {children}
    </div>
  )
}

export default LeagueFilter
