import { createContext, useContext, useEffect } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { getHeaderImage } from '../lib/marketData'
import type { Game } from '../types'

export function isGame(value: string | null | undefined): value is Game {
  return value === 'poe1' || value === 'poe2'
}

interface GameContextValue {
  game: Game
  setGame: (game: Game) => void
}

const GameContext = createContext<GameContextValue | null>(null)

// Keep in sync with index.html's own <title> — there's no single shared
// source for it, since that static tag is what shows before this ever runs.
const BASE_TITLE = 'Chaos Theory'

// `game` comes from the /:game route param (see App.tsx) rather than being
// owned as its own state here — this provider just exposes it plus a
// setter that navigates to the other route. Switching games therefore also
// drops any other query params (?l=, ?c=, etc.): those describe filter/
// league state that's specific to the OLD game's own leagues/categories,
// which the new game's freshly-remounted state (see key={game} on
// MetaProvider) wouldn't recognize anyway.
export function GameProvider({ game, children }: { game: Game; children: ReactNode }) {
  const navigate = useNavigate()

  // Rebuilt from BASE_TITLE every time (not appended to the existing
  // document.title) so switching games repeatedly can never stack up
  // multiple " | POE1" suffixes — this effect doesn't remount alongside
  // MetaProvider (see key={game} there), so idempotency matters here.
  useEffect(() => {
    document.title = `${BASE_TITLE} | ${game.toUpperCase()}`
  }, [game])

  // The favicon always matches whichever game's header icon is showing
  // (Chaos Orb for both, per their own per-realm asset — see
  // HEADER_IMAGES in marketData.ts) rather than index.html's static
  // /favicon.png default, which only ever shows for the instant before
  // this first runs.
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (link) link.href = getHeaderImage(game)
  }, [game])

  const setGame = (next: Game) => navigate(`/${next}`, { replace: true })

  return <GameContext.Provider value={{ game, setGame }}>{children}</GameContext.Provider>
}

export function useGame(): GameContextValue {
  const context = useContext(GameContext)
  if (!context) {
    throw new Error('useGame must be used within a GameProvider')
  }
  return context
}
