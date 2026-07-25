import { usePairCurrency } from '../context/PairCurrencyContext'
import { LEAGUES, getPairDisplayName } from '../lib/marketData'

function PairCurrencyFilter() {
  const { pairCurrencies, isPairCurrencySelected, togglePairCurrency } =
    usePairCurrency()

  return (
    <div className="pair-currency-filter">
      <span className="pair-currency-filter-label">Traded against</span>
      <div
        className="pair-currency-filter-buttons"
        role="group"
        aria-label="Traded against"
      >
        {pairCurrencies.map((pairId) => {
          const isSelected = isPairCurrencySelected(pairId)
          return (
            <button
              key={pairId}
              type="button"
              aria-pressed={isSelected}
              className={
                isSelected
                  ? 'pair-currency-filter-button pair-currency-filter-button-active'
                  : 'pair-currency-filter-button'
              }
              onClick={() => togglePairCurrency(pairId)}
            >
              {getPairDisplayName(pairId, LEAGUES)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default PairCurrencyFilter
