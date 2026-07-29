import type { ReactNode } from "react";
import { useMeta } from "../context/MetaContext";
import { changeClass, formatPercentChange } from "../lib/format";
import { getImageUrl, getPoeNinjaUrl } from "../lib/marketData";
import type { BestInvestment as BestInvestmentEntry, FavoriteItem } from "../types";
import InvestmentTrend from "./InvestmentTrend";
import RemoveFavoriteButton from "./RemoveFavoriteButton";

function BestInvestment({
  title,
  caption,
  emptyMessage,
  investments,
  isLoading,
  skeletonCount,
  currentDayOfLeague,
  daysBack,
  daysForward,
  onRemoveFavorite,
  extraContent,
}: {
  title: ReactNode;
  caption: string;
  emptyMessage: string;
  investments: BestInvestmentEntry[];
  isLoading: boolean;
  skeletonCount: number;
  currentDayOfLeague: number;
  daysBack: number;
  daysForward: number;
  // Only passed for the Favorites section — when present, every card gets a
  // top-right × to unfavorite it directly, instead of only being able to
  // pin/unpin via the search bar.
  onRemoveFavorite?: (favorite: FavoriteItem) => void;
  // Rendered right under the title in every state (loading/empty/loaded) —
  // currently just the favorites search box, so it's always reachable even
  // before anything's been pinned yet.
  extraContent?: ReactNode;
}) {
  const { leagues } = useMeta();
  const leagueById = new Map(leagues.map((league) => [league.id, league]));
  const fallbackLeagueName = leagues[0]?.name ?? "";

  if (isLoading) {
    return (
      <section className="best-investment">
        <h2 className="best-investment-title">{title}</h2>
        {extraContent}
        <ul className="best-investment-grid" aria-hidden="true">
          {Array.from({ length: skeletonCount }).map((_, index) => (
            <li
              key={index}
              className="best-investment-card best-investment-card-skeleton"
            >
              <div className="best-investment-card-header">
                <div className="skeleton-block skeleton-image" />
                <div className="best-investment-info">
                  <span className="best-investment-name-row">
                    <div className="skeleton-block skeleton-text skeleton-text-name" />
                    <div className="skeleton-block skeleton-text skeleton-text-badge" />
                  </span>
                </div>
              </div>
              <div className="skeleton-block skeleton-chart" />
              <div className="skeleton-block skeleton-text skeleton-text-versus" />
              <div className="best-investment-footer">
                <div className="best-investment-change-group">
                  <div className="skeleton-block skeleton-text skeleton-text-change" />
                </div>
                <div className="skeleton-block skeleton-text skeleton-text-link" />
              </div>
            </li>
          ))}
        </ul>
        <p className="best-investment-caption">{caption}</p>
      </section>
    );
  }

  if (investments.length === 0) {
    return (
      <section className="best-investment best-investment-none">
        <h2 className="best-investment-title">{title}</h2>
        {extraContent}
        {emptyMessage && <p className="best-investment-none-message">{emptyMessage}</p>}
      </section>
    );
  }

  return (
    <section className="best-investment">
      <h2 className="best-investment-title">{title}</h2>
      {extraContent}
      <ul className="best-investment-grid">
        {investments.map((investment) => (
          <li
            key={`${investment.item.id}-${investment.pairId}`}
            className="best-investment-card"
          >
            {onRemoveFavorite && (
              <RemoveFavoriteButton
                onRemove={() =>
                  onRemoveFavorite({
                    category: investment.item.category,
                    itemId: investment.item.id,
                    pairId: investment.pairId,
                  })
                }
                itemName={investment.item.name}
              />
            )}
            <div className="best-investment-card-header">
              <img
                className="best-investment-image"
                src={getImageUrl(investment.item.image)}
                alt={investment.item.name}
              />
              <div className="best-investment-info">
                <span className="best-investment-name-row">
                  <span className="best-investment-name">
                    {investment.item.name}
                  </span>
                  <span className="category-badge">
                    {investment.item.category}
                  </span>
                </span>
              </div>
            </div>
            <InvestmentTrend
              leagueHistories={investment.leagueHistories}
              pairName={investment.pairName}
              pairImage={investment.pairImage}
              currentDayOfLeague={currentDayOfLeague}
              daysBack={daysBack}
              daysForward={daysForward}
            />
            <span className="best-investment-versus">
              {investment.pairName}
            </span>
            <div className="best-investment-footer">
              <div className="best-investment-change-group">
                <span
                  className={`best-investment-change ${changeClass(investment.percentChange)}`}
                >
                  {formatPercentChange(investment.percentChange)}
                </span>
                {investment.leagueChanges.length > 1 && (
                  <span className="best-investment-change-breakdown">
                    {investment.leagueChanges.map(
                      ({ leagueId, percentChange }) => (
                        <span
                          key={leagueId}
                          className="best-investment-change-breakdown-item"
                          style={{ color: leagueById.get(leagueId)?.color }}
                        >
                          {formatPercentChange(percentChange)}
                        </span>
                      ),
                    )}
                  </span>
                )}
              </div>
              <a
                className="best-investment-poe-ninja-link"
                href={getPoeNinjaUrl(investment.item, fallbackLeagueName)}
                target="_blank"
                rel="noreferrer"
              >
                poe.ninja ↗
              </a>
            </div>
          </li>
        ))}
      </ul>
      <p className="best-investment-caption">{caption}</p>
    </section>
  );
}

export default BestInvestment;
