import { useCurrentDay } from "../context/CurrentDayContext";
import { useTrendWindow } from "../context/TrendWindowContext";
import { formatDate, formatRate } from "../lib/format";
import {
  getAllHistoryRows,
  getHistoryRowsInWindow,
  type LeagueHistory,
} from "../lib/marketData";

const WIDTH = 160;
const HEIGHT = 50;
const PADDING = 3;
const PADDING_LEFT = 16;

function InvestmentTrend({
  leagueHistories,
}: {
  leagueHistories: LeagueHistory[];
}) {
  const { currentDayOfLeague } = useCurrentDay();
  const { daysBack, daysForward } = useTrendWindow();

  const startDay = currentDayOfLeague - daysBack;
  const endDay = currentDayOfLeague + daysForward;
  const dayRange = endDay - startDay || 1;

  const xForDay = (dayOfLeague: number) =>
    PADDING_LEFT +
    ((dayOfLeague - startDay) / dayRange) * (WIDTH - PADDING_LEFT - PADDING);

  const perLeagueRows = leagueHistories
    .map(({ league, history }) => ({
      league,
      rows: getHistoryRowsInWindow(
        getAllHistoryRows(history, currentDayOfLeague),
        daysBack,
        daysForward,
        currentDayOfLeague,
      ),
    }))
    .filter(({ rows }) => rows.length >= 2);

  const allRates = perLeagueRows.flatMap(({ rows }) =>
    rows.map((row) => row.entry.rate),
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

  return (
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
      {perLeagueRows.map(({ league, rows }) => {
        const points = rows.map((row) => ({
          x: xForDay(row.dayOfLeague),
          y: yForRate(row.entry.rate),
          row,
        }));
        const linePath = points
          .map(
            (point, index) =>
              `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`,
          )
          .join(" ");

        return (
          <g key={league.id}>
            <path
              className="investment-trend-line"
              style={{ stroke: league.color }}
              d={linePath}
              fill="none"
            />
            {points.map(({ x, y, row }) => (
              <circle
                key={row.dayOfLeague}
                className={
                  row.isCurrentDay
                    ? "investment-trend-point-current"
                    : "investment-trend-point"
                }
                style={{ fill: league.color }}
                cx={x}
                cy={y}
                r={row.isCurrentDay ? 3 : 1.5}
              >
                <title>
                  {`${league.name} — Day ${row.dayOfLeague} (${formatDate(row.entry.timestamp)}): ${row.entry.rate}`}
                </title>
              </circle>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

export default InvestmentTrend;
