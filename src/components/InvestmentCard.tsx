import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useMeta } from "../context/MetaContext";
import { changeClass, formatPercentChange } from "../lib/format";
import { getImageUrl, getPoeNinjaUrl } from "../lib/marketData";
import type { BestInvestment as BestInvestmentEntry, FavoriteItem } from "../types";
import FavoriteStar from "./FavoriteStar";
import InvestmentTrend from "./InvestmentTrend";
import Tooltip from "./Tooltip";

function InvestmentCard({
  investment,
  currentDayOfLeague,
  daysBack,
  daysForward,
  isFavorite,
  onToggleFavorite,
}: {
  investment: BestInvestmentEntry;
  currentDayOfLeague: number;
  daysBack: number;
  daysForward: number;
  isFavorite: (itemId: string, pairId: string) => boolean;
  onToggleFavorite: (favorite: FavoriteItem) => void;
}) {
  const { leagues } = useMeta();
  const leagueById = new Map(leagues.map((league) => [league.id, league]));
  const fallbackLeagueName = leagues[0]?.name ?? "";

  // Which of investment.pairs' charts is currently shown — defaults to (and
  // resets back to, if a refetch swaps in a different item/pair for this
  // slot) the ranked/pinned pair, never carried over across investments.
  const [activePairId, setActivePairId] = useState(investment.pairId);
  useEffect(() => {
    setActivePairId(investment.pairId);
  }, [investment.item.id, investment.pairId]);

  // Falls back to the investment's own pair data if `pairs` is ever empty
  // (it shouldn't be — the ranked/pinned pair is always included — but this
  // keeps a backend/frontend mismatch from crashing the card).
  const pairs =
    investment.pairs.length > 0
      ? investment.pairs
      : [
          {
            pairId: investment.pairId,
            pairName: investment.pairName,
            pairImage: investment.pairImage,
            percentChange: investment.percentChange,
            leagueHistories: investment.leagueHistories,
          },
        ];
  const activePair = pairs.find((pair) => pair.pairId === activePairId) ?? pairs[0];

  // The footer's percentChange/leagueChanges are always about the ranked/
  // pinned pair (investment.pairName), not whichever one the chart above is
  // currently showing (activePair) — the pair-switcher only ever changes
  // the chart, never these numbers, so the tooltip text has to name the
  // same pair those numbers were actually computed for.
  //
  // The window always starts exactly on currentDayOfLeague, never
  // currentDayOfLeague - daysBack — daysBack only controls how far back the
  // chart's x-axis extends for visual context, it never factors into the
  // percent-change math itself (see MarketData::windowPercentChangeFromRows).
  const windowStartDay = currentDayOfLeague;
  const windowEndDay = currentDayOfLeague + daysForward;

  return (
    <li className="best-investment-card">
      <FavoriteStar
        isFavorite={isFavorite(investment.item.id, investment.pairId)}
        onToggle={() =>
          onToggleFavorite({
            category: investment.item.category,
            itemId: investment.item.id,
            pairId: investment.pairId,
          })
        }
        itemName={investment.item.name}
      />
      <div className="best-investment-card-header">
        <img
          className="best-investment-image"
          src={getImageUrl(investment.item.image)}
          alt={investment.item.name}
        />
        <div className="best-investment-info">
          <span className="best-investment-name">{investment.item.name}</span>
        </div>
      </div>
      <InvestmentTrend
        leagueHistories={activePair.leagueHistories}
        pairName={activePair.pairName}
        pairImage={activePair.pairImage}
        currentDayOfLeague={currentDayOfLeague}
        daysBack={daysBack}
        daysForward={daysForward}
      />
      <div className="best-investment-versus-row">
        <span className="best-investment-versus">
          {activePair.pairImage && (
            <img
              className="best-investment-versus-icon"
              src={getImageUrl(activePair.pairImage)}
              alt=""
              aria-hidden="true"
            />
          )}
          <span className="best-investment-versus-name">{activePair.pairName}</span>
        </span>
        {pairs.length > 0 && (
          <div className="pair-switcher">
            {pairs.map((pair) => (
              <Tooltip key={pair.pairId} text={pair.pairName}>
                <button
                  type="button"
                  aria-label={`Switch to ${pair.pairName}: ${formatPercentChange(pair.percentChange)}`}
                  className={
                    pair.pairId === activePair.pairId
                      ? "pair-switcher-button pair-switcher-button-active"
                      : "pair-switcher-button"
                  }
                  onClick={() => setActivePairId(pair.pairId)}
                >
                  {pair.pairImage ? (
                    <img
                      className="pair-switcher-button-icon"
                      src={getImageUrl(pair.pairImage)}
                      alt=""
                      aria-hidden="true"
                    />
                  ) : (
                    <span className="pair-switcher-button-name">{pair.pairName}</span>
                  )}
                  <span className={`pair-switcher-button-change ${changeClass(pair.percentChange)}`}>
                    {formatPercentChange(pair.percentChange)}
                  </span>
                </button>
              </Tooltip>
            ))}
          </div>
        )}
        <span className="category-badge">{investment.item.category}</span>
      </div>
      <div className="best-investment-footer">
        <div className="best-investment-change-group">
          <Tooltip
            text={
              <span style={{ fontWeight: 300 }}>
                Average change across all selected leagues for {investment.pairName}, from day{" "}
                <span style={{ fontWeight: 700 }}>{windowStartDay}</span> to day{" "}
                <span style={{ fontWeight: 700 }}>{windowEndDay}</span>.
              </span>
            }
          >
            <span className={`best-investment-change ${changeClass(investment.percentChange)}`}>
              {formatPercentChange(investment.percentChange)}
            </span>
          </Tooltip>
          {investment.leagueChanges.length > 1 && (
            <span className="best-investment-change-breakdown">
              {investment.leagueChanges.map(({ leagueId, percentChange }) => {
                const league = leagueById.get(leagueId);
                return (
                  <Tooltip
                    key={leagueId}
                    text={
                      <span style={{ fontWeight: 300 }}>
                        <span style={{ color: league?.color, fontWeight: 700 }}>
                          {league?.name ?? "This league"}
                        </span>
                        's own change for {investment.pairName}, from day{" "}
                        <span style={{ fontWeight: 700 }}>{windowStartDay}</span> to day{" "}
                        <span style={{ fontWeight: 700 }}>{windowEndDay}</span>.
                      </span>
                    }
                  >
                    <span
                      className={`best-investment-change-breakdown-item ${changeClass(percentChange)}`}
                      style={{ "--league-color": league?.color } as CSSProperties}
                    >
                      <span className="best-investment-change-breakdown-dot" />
                      <span className="best-investment-change-breakdown-text">
                        {formatPercentChange(percentChange)}
                      </span>
                    </span>
                  </Tooltip>
                );
              })}
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
  );
}

export default InvestmentCard;
