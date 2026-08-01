import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useLeague } from "../context/LeagueContext";
import { useMeta } from "../context/MetaContext";
import { changeClass, formatDate, formatPercentChange, formatRate } from "../lib/format";
import { getImageUrl } from "../lib/marketData";
import type { HistoryRow, LeagueHistoryRows, LeagueMeta } from "../types";

const WIDTH = 160;
// A little taller than the old 50 (was a very flat 3.2:1) so a trend's rises
// and falls read more clearly at a glance, without the chart becoming so
// tall it dominates the rest of the card.
const HEIGHT = 60;
const PADDING = 4;
const PADDING_LEFT = 16;

interface HoveredPoint {
  league: LeagueMeta;
  row: HistoryRow;
  clientX: number;
  clientY: number;
}

function InvestmentTrend({
  leagueHistories,
  pairName,
  pairImage,
  currentDayOfLeague,
  daysBack,
  daysForward,
}: {
  leagueHistories: LeagueHistoryRows[];
  pairName: string;
  pairImage: string | null;
  currentDayOfLeague: number;
  daysBack: number;
  daysForward: number;
}) {
  const { leagues } = useMeta();
  const { hoveredLeagueId, setHoveredLeagueId } = useLeague();
  const [hovered, setHovered] = useState<HoveredPoint | null>(null);
  const [tooltipOffset, setTooltipOffset] = useState({ x: 0, y: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Nudges the tooltip back on-screen if its default position (centered
  // above the hovered point) would spill off any edge of the viewport —
  // measured after it renders but before paint, so there's no visible
  // flash at the wrong position first.
  useLayoutEffect(() => {
    if (!hovered) {
      setTooltipOffset({ x: 0, y: 0 });
      return;
    }
    const tooltip = tooltipRef.current;
    if (!tooltip) return;

    const margin = 8;
    const rect = tooltip.getBoundingClientRect();

    setTooltipOffset((current) => {
      // rect already has `current`'s offset baked in (it's what was just
      // rendered) — subtract it back out to find where the tooltip would
      // sit with no offset at all, then compute the correction fresh from
      // that, rather than off of whatever offset a previous hover target
      // happened to leave behind.
      const naturalLeft = rect.left - current.x;
      const naturalTop = rect.top - current.y;

      let x = 0;
      if (naturalLeft < margin) {
        x = margin - naturalLeft;
      } else if (naturalLeft + rect.width > window.innerWidth - margin) {
        x = window.innerWidth - margin - rect.width - naturalLeft;
      }

      let y = 0;
      if (naturalTop < margin) {
        y = margin - naturalTop;
      } else if (naturalTop + rect.height > window.innerHeight - margin) {
        y = window.innerHeight - margin - rect.height - naturalTop;
      }

      return x === current.x && y === current.y ? current : { x, y };
    });
  }, [hovered]);

  const clearHover = () => {
    setHovered(null);
    setHoveredLeagueId(null);
  };

  // Scrolling moves the hovered point out from under a stationary cursor
  // without the browser ever firing a mouseleave on it, so the tooltip
  // (anchored to the point's last-known clientX/clientY, now stale) would
  // otherwise stay stuck on screen. Capture phase so this catches scrolling
  // on any ancestor scroll container, not just the window itself.
  useEffect(() => {
    if (!hovered) return;
    window.addEventListener("scroll", clearHover, true);
    return () => window.removeEventListener("scroll", clearHover, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hovered]);

  const startDay = currentDayOfLeague - daysBack;
  const endDay = currentDayOfLeague + daysForward;
  const dayRange = endDay - startDay || 1;

  const xForDay = (dayOfLeague: number) =>
    PADDING_LEFT +
    ((dayOfLeague - startDay) / dayRange) * (WIDTH - PADDING_LEFT - PADDING);

  const leagueById = new Map(leagues.map((league) => [league.id, league]));

  // The rows here are already trimmed to the requested window server-side —
  // no client-side day-of-league math needed, just render what came back.
  const perLeagueRows = leagueHistories
    .map(({ leagueId, rows }) => ({ league: leagueById.get(leagueId), rows }))
    .filter(
      (entry): entry is { league: LeagueMeta; rows: HistoryRow[] } =>
        entry.league !== undefined && entry.rows.length >= 2,
    );

  const allRates = perLeagueRows.flatMap(({ rows }) =>
    rows.map((row) => row.rate),
  );
  if (allRates.length === 0) return null;

  const min = Math.min(...allRates);
  const max = Math.max(...allRates);
  const range = max - min || 1;

  const yForRate = (rate: number) =>
    HEIGHT - PADDING - ((rate - min) / range) * (HEIGHT - PADDING * 2);

  const mid = (min + max) / 2;
  const gridRates =
    min === max
      ? [max]
      : [max, mid, min].filter(
          (rate, index, rates) => rates.indexOf(rate) === index,
        );

  const pairImageUrl = pairImage ? getImageUrl(pairImage) : undefined;

  // Hovering a league's badge (see LeagueBadges) should make its line easy
  // to pick out on every chart on the page at once — moved to the end so
  // it paints last (SVG stacks later-in-document elements on top), with
  // every other league's line/points dimmed alongside it.
  const orderedLeagueRows = perLeagueRows.slice().reverse();
  if (hoveredLeagueId) {
    const hoveredIndex = orderedLeagueRows.findIndex(
      ({ league }) => league.id === hoveredLeagueId,
    );
    if (hoveredIndex !== -1) {
      const [hoveredEntry] = orderedLeagueRows.splice(hoveredIndex, 1);
      orderedLeagueRows.push(hoveredEntry);
    }
  }

  return (
    <div className="investment-trend-wrap">
      <svg
        className="investment-trend"
        width={WIDTH}
        height={HEIGHT}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Rate trend for the days around day ${startDay} to day ${endDay}`}
      >
        <g className="investment-trend-axis">
          {gridRates.map((rate) => (
            <g key={rate}>
              <line
                className="investment-trend-grid-line"
                x1={16}
                x2={WIDTH - PADDING}
                y1={yForRate(rate)}
                y2={yForRate(rate)}
              />
              <text
                className="investment-trend-grid-label"
                x={12}
                y={yForRate(rate)}
                textAnchor="end"
                dominantBaseline="middle"
              >
                {formatRate(rate)}
              </text>
            </g>
          ))}
        </g>
        {/* Ties the highlighted "current day" points below back to the
            actual day they're on at a glance, rather than leaving it to be
            inferred purely from where the highlighted dots happen to land —
            drawn before the data lines/points so it sits behind them. */}
        <line
          className="investment-trend-today-line"
          x1={xForDay(currentDayOfLeague)}
          x2={xForDay(currentDayOfLeague)}
          y1={PADDING}
          y2={HEIGHT - PADDING}
        />
        {orderedLeagueRows.map(({ league, rows }) => {
          const points = rows.map((row) => ({
            x: xForDay(row.dayOfLeague),
            y: yForRate(row.rate),
            row,
          }));
          const linePath = points
            .map(
              (point, index) =>
                `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`,
            )
            .join(" ");
          const isDimmed = hoveredLeagueId !== null && hoveredLeagueId !== league.id;

          return (
            <g
              key={league.id}
              style={{ opacity: isDimmed ? 0.5 : 1, transition: "opacity 0.15s ease" }}
            >
              <path
                className="investment-trend-line"
                style={{ stroke: league.color }}
                d={linePath}
                fill="none"
              />
              {points.map(({ x, y, row }) => {
                const isCurrentDay = row.dayOfLeague === currentDayOfLeague;
                return (
                  <g key={row.dayOfLeague}>
                    <circle
                      className={
                        isCurrentDay
                          ? "investment-trend-point-current"
                          : "investment-trend-point"
                      }
                      style={{ fill: league.color }}
                      cx={x}
                      cy={y}
                      r={isCurrentDay ? 3 : 1.5}
                    />
                    <circle
                      className="investment-trend-point-hit-area"
                      cx={x}
                      cy={y}
                      r={5}
                      onMouseEnter={(event: ReactMouseEvent) => {
                        setHovered({
                          league,
                          row,
                          clientX: event.clientX,
                          clientY: event.clientY,
                        });
                        setHoveredLeagueId(league.id);
                      }}
                      onMouseLeave={clearHover}
                    />
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      {hovered && (
        <div
          ref={tooltipRef}
          className="investment-trend-tooltip"
          style={{
            left: hovered.clientX + tooltipOffset.x,
            top: hovered.clientY + tooltipOffset.y,
          }}
        >
          <div className="investment-trend-tooltip-header">
            <span
              className="investment-trend-tooltip-league"
              style={{ color: hovered.league.color }}
            >
              {hovered.league.name}
            </span>
            <span className="investment-trend-tooltip-day">
              Day {hovered.row.dayOfLeague} · {formatDate(hovered.row.timestamp)}
            </span>
          </div>
          <div className="investment-trend-tooltip-value-row">
            {pairImageUrl && (
              <img
                className="investment-trend-tooltip-icon"
                src={pairImageUrl}
                alt={pairName}
              />
            )}
            <span className="investment-trend-tooltip-rate">
              {hovered.row.rate}
            </span>
            <span
              className={`investment-trend-tooltip-change ${changeClass(hovered.row.percentChange)}`}
            >
              {formatPercentChange(hovered.row.percentChange)}
            </span>
          </div>
          <div className="investment-trend-tooltip-volume">
            Volume: {hovered.row.volumePrimaryValue.toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}

export default InvestmentTrend;
