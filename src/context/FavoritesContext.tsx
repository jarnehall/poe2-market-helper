import { createContext, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { getStoredStringArray, setStoredStringArray } from '../lib/storage'
import type { FavoriteItem } from '../types'
import { useGame } from './GameContext'

// getStoredStringArray/setStoredStringArray only round-trip string[], so each
// favorite is packed into one delimited string rather than adding a new
// storage helper just for this. "::" is used (not a plain space) because
// category names can contain spaces (e.g. "Lineage Gems").
const SEPARATOR = '::'

function encode(favorite: FavoriteItem): string {
  return [favorite.category, favorite.itemId, favorite.pairId].join(SEPARATOR)
}

function decode(raw: string): FavoriteItem | null {
  const parts = raw.split(SEPARATOR)
  if (parts.length !== 3) return null
  const [category, itemId, pairId] = parts
  return { category, itemId, pairId }
}

interface FavoritesContextValue {
  favorites: FavoriteItem[]
  isFavorite: (itemId: string, pairId: string) => boolean
  toggleFavorite: (favorite: FavoriteItem) => void
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null)

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { game } = useGame()
  const [favorites, setFavorites] = useState<FavoriteItem[]>(() =>
    getStoredStringArray(`${game}:favorites`, [])
      .map(decode)
      .filter((favorite): favorite is FavoriteItem => favorite !== null),
  )

  const persist = (next: FavoriteItem[]) => {
    setFavorites(next)
    setStoredStringArray(`${game}:favorites`, next.map(encode))
  }

  const value = useMemo<FavoritesContextValue>(
    () => ({
      favorites,
      isFavorite: (itemId, pairId) =>
        favorites.some((favorite) => favorite.itemId === itemId && favorite.pairId === pairId),
      toggleFavorite: (favorite) => {
        const exists = favorites.some(
          (existing) => existing.itemId === favorite.itemId && existing.pairId === favorite.pairId,
        )
        persist(
          exists
            ? favorites.filter(
                (existing) => !(existing.itemId === favorite.itemId && existing.pairId === favorite.pairId),
              )
            : [...favorites, favorite],
        )
      },
    }),
    [favorites],
  )

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>
}

export function useFavorites(): FavoritesContextValue {
  const context = useContext(FavoritesContext)
  if (!context) {
    throw new Error('useFavorites must be used within a FavoritesProvider')
  }
  return context
}
