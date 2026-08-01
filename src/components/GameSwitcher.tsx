import { useGame } from '../context/GameContext'
import type { Game } from '../types'

const GAMES: { id: Game; label: string }[] = [
  { id: 'poe1', label: 'POE1' },
  { id: 'poe2', label: 'POE2' },
]

function GameSwitcher() {
  const { game, setGame } = useGame()

  return (
    <div className="game-switcher" role="group" aria-label="Game">
      {GAMES.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          aria-pressed={game === id}
          className={game === id ? 'game-switcher-button game-switcher-button-active' : 'game-switcher-button'}
          onClick={() => setGame(id)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export default GameSwitcher
