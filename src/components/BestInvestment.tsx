import type { ReactNode } from "react";
import { useLeague } from "../context/LeagueContext";
import { changeClass, formatPercentChange } from "../lib/format";
import {
  getItemImageUrl,
  getPairDisplayName,
  getPoeNinjaUrl,
  type BestInvestment as BestInvestmentEntry,
} from "../lib/marketData";
import InvestmentTrend from "./InvestmentTrend";

function BestInvestment({
  title,
  caption,
  emptyMessage,
  investments,
}: {
  title: ReactNode;
  caption: string;
  emptyMessage: string;
  investments: BestInvestmentEntry[];
}) {
  const { selectedLeagues } = useLeague();

  if (investments.length === 0) {
    return (
      <section className="best-investment best-investment-none">
        <h2 className="best-investment-title">{title}</h2>
        <p className="best-investment-none-message">{emptyMessage}</p>
      </section>
    );
  }

  return (
    <section className="best-investment">
      <h2 className="best-investment-title">{title}</h2>
      <ul className="best-investment-grid">
        {investments.map((investment) => (
          <li
            key={`${investment.item.id}-${investment.pairId}`}
            className="best-investment-card"
          >
            <div className="best-investment-card-header">
              <img
                className="best-investment-image"
                src={getItemImageUrl(investment.item)}
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
              pairId={investment.pairId}
            />
            <span className="best-investment-versus">
              {getPairDisplayName(investment.pairId, selectedLeagues)}
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
                      ({ league, percentChange }) => (
                        <span
                          key={league.id}
                          className="best-investment-change-breakdown-item"
                          style={{ color: league.color }}
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
                href={getPoeNinjaUrl(investment.item)}
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
