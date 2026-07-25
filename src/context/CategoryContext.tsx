import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ALL_CATEGORIES } from '../lib/marketData'
import { getStoredStringArray, setStoredStringArray } from '../lib/storage'

interface CategoryContextValue {
  categories: string[]
  selectedCategories: string[]
  isCategorySelected: (category: string) => boolean
  toggleCategory: (category: string) => void
  resetCategories: () => void
}

const CategoryContext = createContext<CategoryContextValue | null>(null)

export function CategoryProvider({ children }: { children: ReactNode }) {
  const [selectedCategories, setSelectedCategories] = useState<string[]>(() =>
    getStoredStringArray('selectedCategories', ALL_CATEGORIES),
  )

  useEffect(
    () => setStoredStringArray('selectedCategories', selectedCategories),
    [selectedCategories],
  )

  const toggleCategory = (category: string) => {
    setSelectedCategories((current) =>
      current.includes(category)
        ? current.filter((c) => c !== category)
        : [...current, category],
    )
  }

  const resetCategories = () => setSelectedCategories(ALL_CATEGORIES)

  const value = useMemo<CategoryContextValue>(
    () => ({
      categories: ALL_CATEGORIES,
      selectedCategories,
      isCategorySelected: (category: string) =>
        selectedCategories.includes(category),
      toggleCategory,
      resetCategories,
    }),
    [selectedCategories],
  )

  return (
    <CategoryContext.Provider value={value}>
      {children}
    </CategoryContext.Provider>
  )
}

export function useCategory(): CategoryContextValue {
  const context = useContext(CategoryContext)
  if (!context) {
    throw new Error('useCategory must be used within a CategoryProvider')
  }
  return context
}
