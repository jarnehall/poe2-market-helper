import { useEffect, useRef, useState } from 'react'
import type { PoeNinjaStatus } from '../types'

interface InfoIconProps {
  visitorCount: number
  poeNinjaStatus: PoeNinjaStatus | null
}

function InfoIcon({ visitorCount, poeNinjaStatus }: InfoIconProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Closes on any click/tap outside — the same convention the filters
  // dropdown already uses (see MarketOverview), needed here for mobile
  // (there's no "mouse leave" on a touch device to close it otherwise).
  useEffect(() => {
    if (!isOpen) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isOpen])

  const hasFailures = (poeNinjaStatus?.failedItemIds.length ?? 0) > 0
  const needsAttention = visitorCount > 100 || hasFailures

  return (
    <div
      className="info-icon"
      ref={containerRef}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        type="button"
        className={needsAttention ? 'info-icon-button info-icon-button-attention' : 'info-icon-button'}
        aria-expanded={isOpen}
        aria-label="App info"
        // Always opens (never toggles closed) — a tap on a touch device
        // fires a synthetic mouseenter right before the click event, so a
        // toggle here would immediately flip an already-opened-by-hover
        // popover straight back closed. Closing instead happens via
        // mouse-leave (desktop) or an outside tap (see the effect above).
        onClick={() => setIsOpen(true)}
      >
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="12" y1="10.5" x2="12" y2="17.5" />
          <circle cx="12" cy="6.5" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      </button>
      {isOpen && (
        <div className="info-icon-popover" role="dialog">
          <p className="info-icon-line">
            {visitorCount} unique visitor{visitorCount === 1 ? '' : 's'} since last deploy
          </p>
          {poeNinjaStatus?.checked && (
            <p className={hasFailures ? 'info-icon-line info-icon-line-warning' : 'info-icon-line'}>
              {hasFailures
                ? `${poeNinjaStatus.failedItemIds.length} of ${poeNinjaStatus.attemptedCount} poe.ninja request${poeNinjaStatus.attemptedCount === 1 ? '' : 's'} failed on the last reload`
                : 'All poe.ninja requests succeeded on the last reload'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default InfoIcon
