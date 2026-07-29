import type { ReactNode } from "react";
import type { BestInvestment as BestInvestmentEntry, FavoriteItem } from "../types";
import InvestmentCard from "./InvestmentCard";
import LeagueBadges from "./LeagueBadges";

function SkeletonCard() {
  return (
    <li className="best-investment-card best-investment-card-skeleton">
      <div className="best-investment-card-header">
        <div className="skeleton-block skeleton-image" />
        <div className="best-investment-info">
          <div className="skeleton-block skeleton-text skeleton-text-name" />
        </div>
      </div>
      <div className="skeleton-block skeleton-chart" />
      <div className="best-investment-versus-row">
        <div className="skeleton-block skeleton-text skeleton-text-versus" />
        <div className="skeleton-block skeleton-text skeleton-text-badge" />
      </div>
      <div className="best-investment-footer">
        <div className="best-investment-change-group">
          <div className="skeleton-block skeleton-text skeleton-text-change" />
        </div>
        <div className="skeleton-block skeleton-text skeleton-text-link" />
      </div>
    </li>
  );
}

function BestInvestment({
  title,
  caption,
  emptyMessage,
  investments,
  isLoading,
  skeletonCount,
  pendingSkeletonCount = 0,
  currentDayOfLeague,
  daysBack,
  daysForward,
  isFavorite,
  onToggleFavorite,
  extraContent,
}: {
  title: ReactNode;
  caption: string;
  emptyMessage: string;
  investments: BestInvestmentEntry[];
  isLoading: boolean;
  skeletonCount: number;
  // Extra skeleton cards appended after the already-loaded ones — e.g. a
  // favorite just pinned via search, whose data we don't have yet, while
  // the rest of the list keeps showing what's already loaded. Distinct from
  // the full-list skeleton below (isLoading && investments.length === 0),
  // which is only for when nothing at all has loaded yet.
  pendingSkeletonCount?: number;
  currentDayOfLeague: number;
  daysBack: number;
  daysForward: number;
  isFavorite: (itemId: string, pairId: string) => boolean;
  onToggleFavorite: (favorite: FavoriteItem) => void;
  // Rendered right under the title in every state (loading/empty/loaded) —
  // currently just the favorites search box, so it's always reachable even
  // before anything's been pinned yet.
  extraContent?: ReactNode;
}) {
  // Skeletons are only for the true first load — once we already have data
  // (e.g. a refetch triggered by toggling a favorite, or nudging a filter),
  // keep showing it as-is while the new response comes in rather than
  // discarding it for a full skeleton flash the user would see as every
  // card "ghosting" for a moment.
  if (isLoading && investments.length === 0) {
    return (
      <section className="best-investment">
        <h2 className="best-investment-title">{title}</h2>
        {extraContent}
        <LeagueBadges />
        <ul className="best-investment-grid" aria-hidden="true">
          {Array.from({ length: skeletonCount }).map((_, index) => (
            <SkeletonCard key={index} />
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
      <LeagueBadges />
      <ul className="best-investment-grid">
        {investments.map((investment) => (
          <InvestmentCard
            key={`${investment.item.id}-${investment.pairId}`}
            investment={investment}
            currentDayOfLeague={currentDayOfLeague}
            daysBack={daysBack}
            daysForward={daysForward}
            isFavorite={isFavorite}
            onToggleFavorite={onToggleFavorite}
          />
        ))}
        {Array.from({ length: pendingSkeletonCount }).map((_, index) => (
          <SkeletonCard key={`pending-${index}`} />
        ))}
      </ul>
      <p className="best-investment-caption">{caption}</p>
    </section>
  );
}

export default BestInvestment;
