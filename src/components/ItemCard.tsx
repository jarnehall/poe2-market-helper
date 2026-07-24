import { useCurrentDay } from '../context/CurrentDayContext'
import { useLeague } from '../context/LeagueContext'
import {
  getItemImageUrl,
  getSortedPairIdsByAverageChange,
} from '../lib/marketData'
import type { MarketItem } from '../types'
import PairSummaryItem from './PairSummaryItem'

function ItemCard({
  item,
  pairIds,
}: {
  item: MarketItem
  pairIds: string[]
}) {
  const { currentDayOfLeague } = useCurrentDay()
  const { selectedLeagues } = useLeague()

  return (
    <section className="item-card">
      <h2>
        <img
          className="item-image"
          src={getItemImageUrl(item)}
          alt={item.name}
        />
        {item.name}
        <span className="category-badge">{item.category}</span>
      </h2>

      <ul className="pair-summary-list">
        {getSortedPairIdsByAverageChange(
          selectedLeagues,
          item.id,
          pairIds,
          currentDayOfLeague,
        ).map((pairId) => (
          <PairSummaryItem key={pairId} item={item} pairId={pairId} />
        ))}
      </ul>
    </section>
  )
}

export default ItemCard
