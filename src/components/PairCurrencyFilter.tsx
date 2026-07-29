import { useFilters } from '../context/FiltersContext'
import { useMeta } from '../context/MetaContext'

function PairCurrencyFilter() {
  const { pairCurrencies } = useMeta()
  const { filters, togglePairCurrency } = useFilters()

  return (
    <div className="pair-currency-filter">
      <span className="pair-currency-filter-label">Traded against</span>
      <div
        className="pair-currency-filter-buttons"
        role="group"
        aria-label="Traded against"
      >
        {pairCurrencies.map((pairCurrency) => {
          const isSelected = filters.pairCurrencies.includes(pairCurrency.id)
          return (
            <button
              key={pairCurrency.id}
              type="button"
              aria-pressed={isSelected}
              className={
                isSelected
                  ? 'pair-currency-filter-button pair-currency-filter-button-active'
                  : 'pair-currency-filter-button'
              }
              onClick={() => togglePairCurrency(pairCurrency.id)}
            >
              {pairCurrency.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default PairCurrencyFilter
