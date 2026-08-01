import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { FavoritesProvider } from './context/FavoritesContext'
import { FiltersProvider } from './context/FiltersContext'
import { GameProvider, isGame, useGame } from './context/GameContext'
import { LeagueProvider } from './context/LeagueContext'
import { MetaProvider } from './context/MetaContext'
import { fetchCurrentLeagues } from './lib/api'
import MarketOverview from './pages/MarketOverview'
import type { Game } from './types'
import './App.css'

const DEFAULT_GAME: Game = 'poe2'

// key={game} on MetaProvider forces a full remount of it (and everything
// nested inside — LeagueProvider/FiltersProvider/FavoritesProvider/the page
// itself) whenever the selected game changes, so switching games gets a
// clean Meta/Leagues/Filters/Favorites state for free instead of every
// context needing its own "game changed, reset me" effect.
function GameScopedProviders() {
  const { game } = useGame()

  return (
    <MetaProvider key={game} game={game}>
      <LeagueProvider>
        <FiltersProvider>
          <FavoritesProvider>
            <MarketOverview />
          </FavoritesProvider>
        </FiltersProvider>
      </LeagueProvider>
    </MetaProvider>
  )
}

// The actual /poe1 and /poe2 routes — an invalid/missing :game param (a
// stray path someone typed by hand) just bounces back to "/", which then
// redirects to a real one below.
function GameRoute() {
  const { game } = useParams()
  if (!isGame(game)) return <Navigate to="/" replace />

  return (
    <GameProvider game={game}>
      <GameScopedProviders />
    </GameProvider>
  )
}

// "/" itself isn't a real view — it redirects to whichever game's current
// league started most recently (fetched fresh every visit, since which
// game that is changes over time as new leagues launch). Falls back to
// POE2 if that fetch fails.
function DefaultGameRedirect() {
  const [game, setGame] = useState<Game | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetchCurrentLeagues(controller.signal)
      .then((leagues) => {
        const poe1Started = new Date(leagues.poe1.startDate).getTime()
        const poe2Started = new Date(leagues.poe2.startDate).getTime()
        setGame(poe1Started >= poe2Started ? 'poe1' : 'poe2')
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setGame(DEFAULT_GAME)
      })
    return () => controller.abort()
  }, [])

  if (game === null) {
    return <div className="loading-spinner" role="status" aria-label="Loading" />
  }

  return <Navigate to={`/${game}`} replace />
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DefaultGameRedirect />} />
        <Route path="/:game" element={<GameRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
