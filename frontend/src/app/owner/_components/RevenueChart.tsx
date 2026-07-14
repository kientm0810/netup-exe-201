import type { OwnerCommerceDaily } from "../_lib/commerce";

type RevenueChartProps = {
  data: OwnerCommerceDaily[];
};

const width = 960;
const height = 300;
const padding = { top: 24, right: 26, bottom: 46, left: 82 };

const series = [
  { key: "total_revenue_vnd", label: "Tổng doanh thu", color: "#991b1b", width: 3.5 },
  { key: "court_revenue_vnd", label: "Thuê sân", color: "#2563eb", width: 2.5 },
  { key: "water_revenue_vnd", label: "Nước uống", color: "#059669", width: 2.5 },
  { key: "shuttlecock_revenue_vnd", label: "Cầu lông", color: "#d97706", width: 2.5 },
] as const;

function compactVnd(value: number): string {
  return new Intl.NumberFormat("vi-VN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function dateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

export function RevenueChart({ data }: RevenueChartProps) {
  const ordered = [...data].sort((left, right) => left.date.localeCompare(right.date));
  if (ordered.length === 0) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-500">
        Chưa có dữ liệu doanh thu theo ngày.
      </div>
    );
  }

  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(
    1,
    ...ordered.flatMap((item) => series.map(({ key }) => Number(item[key]) || 0)),
  );
  const ceiling = maxValue * 1.1;
  const xAt = (index: number) =>
    padding.left + (ordered.length === 1 ? chartWidth / 2 : (index / (ordered.length - 1)) * chartWidth);
  const yAt = (value: number) => padding.top + chartHeight - ((Number(value) || 0) / ceiling) * chartHeight;
  const pointsFor = (key: (typeof series)[number]["key"]) =>
    ordered.map((item, index) => `${xAt(index)},${yAt(item[key])}`).join(" ");
  const areaPoints = `${padding.left},${padding.top + chartHeight} ${pointsFor("total_revenue_vnd")} ${
    padding.left + chartWidth
  },${padding.top + chartHeight}`;
  const dateStep = Math.max(1, Math.ceil(ordered.length / 7));

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-slate-600">
        {series.map((item) => (
          <span key={item.key} className="inline-flex items-center gap-2">
            <span className="h-0.5 w-6 rounded-full" style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full min-w-[720px]"
          role="img"
          aria-label="Biểu đồ doanh thu thuê sân, nước uống và cầu lông theo ngày"
        >
          <defs>
            <linearGradient id="owner-total-revenue-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#991b1b" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#991b1b" stopOpacity="0" />
            </linearGradient>
          </defs>

          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = padding.top + chartHeight * ratio;
            const value = ceiling * (1 - ratio);
            return (
              <g key={ratio}>
                <line
                  x1={padding.left}
                  x2={padding.left + chartWidth}
                  y1={y}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeDasharray={ratio === 1 ? undefined : "5 6"}
                />
                <text x={padding.left - 12} y={y + 4} textAnchor="end" fontSize="12" fill="#64748b">
                  {compactVnd(value)}
                </text>
              </g>
            );
          })}

          <polygon points={areaPoints} fill="url(#owner-total-revenue-area)" />
          {series.map((item) => (
            <g key={item.key}>
              <polyline
                points={pointsFor(item.key)}
                fill="none"
                stroke={item.color}
                strokeWidth={item.width}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {ordered.map((entry, index) => (
                <circle
                  key={`${item.key}-${entry.date}`}
                  cx={xAt(index)}
                  cy={yAt(entry[item.key])}
                  r={item.key === "total_revenue_vnd" ? 3.5 : 2.5}
                  fill="white"
                  stroke={item.color}
                  strokeWidth="2"
                >
                  <title>{`${item.label} ${dateLabel(entry.date)}: ${new Intl.NumberFormat("vi-VN").format(
                    entry[item.key],
                  )}đ`}</title>
                </circle>
              ))}
            </g>
          ))}

          {ordered.map((item, index) => {
            if (index % dateStep !== 0 && index !== ordered.length - 1) return null;
            return (
              <text
                key={item.date}
                x={xAt(index)}
                y={height - 14}
                textAnchor="middle"
                fontSize="12"
                fill="#64748b"
              >
                {dateLabel(item.date)}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
