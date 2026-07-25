import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ALL_PAIR_CURRENCIES } from '../lib/marketData'
import { getStoredStringArray, setStoredStringArray } from '../lib/storage'

interface PairCurrencyContextValue {
  pairCurrencies: string[]
  selectedPairCurrencies: string[]
  isPairCurrencySelected: (pairId: string) => boolean
  togglePairCurrency: (pairId: string) => void
  resetPairCurrencies: () => void
}

const PairCurrencyContext = createContext<PairCurrencyContextValue | null>(
  null,
)

export function PairCurrencyProvider({ children }: { children: ReactNode }) {
  const [selectedPairCurrencies, setSelectedPairCurrencies] = useState<
    string[]
  >(() => getStoredStringArray('selectedPairCurrencies', ALL_PAIR_CURRENCIES))

  useEffect(
    () =>
      setStoredStringArray('selectedPairCurrencies', selectedPairCurrencies),
    [selectedPairCurrencies],
  )

  const togglePairCurrency = (pairId: string) => {
    setSelectedPairCurrencies((current) =>
      current.includes(pairId)
        ? current.filter((id) => id !== pairId)
        : [...current, pairId],
    )
  }

  const resetPairCurrencies = () =>
    setSelectedPairCurrencies(ALL_PAIR_CURRENCIES)

  const value = useMemo<PairCurrencyContextValue>(
    () => ({
      pairCurrencies: ALL_PAIR_CURRENCIES,
      selectedPairCurrencies,
      isPairCurrencySelected: (pairId: string) =>
        selectedPairCurrencies.includes(pairId),
      togglePairCurrency,
      resetPairCurrencies,
    }),
    [selectedPairCurrencies],
  )

  return (
    <PairCurrencyContext.Provider value={value}>
      {children}
    </PairCurrencyContext.Provider>
  )
}

export function usePairCurrency(): PairCurrencyContextValue {
  const context = useContext(PairCurrencyContext)
  if (!context) {
    throw new Error(
      'usePairCurrency must be used within a PairCurrencyProvider',
    )
  }
  return context
}
