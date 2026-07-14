"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

export type MultiLineChartPoint = {
  label: string;
  values: Record<string, number>;
};

export type MultiLineChartSeries = {
  key: string;
  label: string;
  color: string;
};

type MultiLineChartProps = {
  data: MultiLineChartPoint[];
  series: MultiLineChartSeries[];
  height?: number;
  valueFormatter?: (value: number) => string;
  emptyMessage?: string;
  showArea?: boolean;
};

const compactNumber = new Intl.NumberFormat("vi-VN", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function niceMaximum(value: number) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const fraction = value / magnitude;
  const rounded = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return rounded * magnitude;
}

function smoothPath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  return points.slice(1).reduce((path, point, index) => {
    const currentIndex = index + 1;
    const previous = points[currentIndex - 1];
    const beforePrevious = points[currentIndex - 2] ?? previous;
    const next = points[currentIndex + 1] ?? point;
    const controlOneX = previous.x + (point.x - beforePrevious.x) / 6;
    const controlOneY = previous.y + (point.y - beforePrevious.y) / 6;
    const controlTwoX = point.x - (next.x - previous.x) / 6;
    const controlTwoY = point.y - (next.y - previous.y) / 6;
    return `${path} C ${controlOneX} ${controlOneY}, ${controlTwoX} ${controlTwoY}, ${point.x} ${point.y}`;
  }, `M ${points[0].x} ${points[0].y}`);
}

export function MultiLineChart({
  data,
  series,
  height = 320,
  valueFormatter = (value) => compactNumber.format(value),
  emptyMessage = "Chưa có dữ liệu để vẽ biểu đồ.",
  showArea = true,
}: MultiLineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const rawId = useId();
  const chartId = rawId.replace(/[^a-zA-Z0-9_-]/g, "");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateWidth = () => setWidth(Math.max(320, Math.round(container.getBoundingClientRect().width)));
    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const chart = useMemo(() => {
    const padding = { top: 22, right: 18, bottom: 46, left: width < 480 ? 40 : 52 };
    const innerWidth = Math.max(1, width - padding.left - padding.right);
    const innerHeight = Math.max(1, height - padding.top - padding.bottom);
    const rawMaximum = Math.max(
      0,
      ...data.flatMap((item) => series.map((itemSeries) => Number(item.values[itemSeries.key]) || 0)),
    );
    const maximum = niceMaximum(rawMaximum);
    const xFor = (index: number) =>
      padding.left + (data.length <= 1 ? innerWidth / 2 : (index / (data.length - 1)) * innerWidth);
    const yFor = (value: number) => padding.top + innerHeight - (Math.max(0, value) / maximum) * innerHeight;
    const paths = Object.fromEntries(
      series.map((itemSeries) => {
        const points = data.map((item, index) => ({
          x: xFor(index),
          y: yFor(Number(item.values[itemSeries.key]) || 0),
        }));
        return [itemSeries.key, { points, path: smoothPath(points) }];
      }),
    ) as Record<string, { points: Array<{ x: number; y: number }>; path: string }>;
    const maximumLabels = Math.max(3, Math.floor(innerWidth / 105));
    const labelStep = Math.max(1, Math.ceil(data.length / maximumLabels));
    const labelIndexes = data
      .map((_, index) => index)
      .filter((index) => index % labelStep === 0 || index === data.length - 1);

    return { padding, innerWidth, innerHeight, maximum, xFor, yFor, paths, labelIndexes };
  }, [data, height, series, width]);

  if (data.length === 0 || series.length === 0) {
    return (
      <div className="grid min-h-64 place-items-center rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-6 text-center text-sm text-slate-500">
        {emptyMessage}
      </div>
    );
  }

  const baseline = chart.padding.top + chart.innerHeight;
  const hoveredPoint = hoveredIndex === null ? null : data[hoveredIndex];
  const tooltipLeft = hoveredIndex === null
    ? 0
    : Math.min(94, Math.max(6, (chart.xFor(hoveredIndex) / width) * 100));

  function selectNearestPoint(clientX: number, svg: SVGSVGElement) {
    const bounds = svg.getBoundingClientRect();
    if (bounds.width <= 0) return;
    const chartX = ((clientX - bounds.left) / bounds.width) * width;
    const ratio = (chartX - chart.padding.left) / chart.innerWidth;
    const nextIndex = Math.round(Math.min(1, Math.max(0, ratio)) * (data.length - 1));
    setHoveredIndex(nextIndex);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Chú giải biểu đồ">
        {series.map((itemSeries) => (
          <div key={itemSeries.key} className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <span
              className="h-2.5 w-2.5 rounded-full shadow-sm"
              style={{ backgroundColor: itemSeries.color }}
              aria-hidden="true"
            />
            {itemSeries.label}
          </div>
        ))}
      </div>

      <div ref={containerRef} className="relative w-full overflow-visible">
        {hoveredPoint ? (
          <div
            className="pointer-events-none absolute z-10 min-w-44 -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
            style={{ left: `${tooltipLeft}%`, top: 8 }}
            role="status"
          >
            <p className="mb-1.5 font-semibold text-slate-900">{hoveredPoint.label}</p>
            <div className="space-y-1">
              {series.map((itemSeries) => (
                <p key={itemSeries.key} className="flex items-center justify-between gap-5 text-slate-600">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: itemSeries.color }} />
                    {itemSeries.label}
                  </span>
                  <strong className="text-slate-900">{valueFormatter(hoveredPoint.values[itemSeries.key] ?? 0)}</strong>
                </p>
              ))}
            </div>
          </div>
        ) : null}
        <svg
          className="block w-full"
          style={{ height }}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`Biểu đồ ${series.map((itemSeries) => itemSeries.label).join(", ")}`}
          onMouseMove={(event) => selectNearestPoint(event.clientX, event.currentTarget)}
          onMouseLeave={() => setHoveredIndex(null)}
        >
          <defs>
            {series.map((itemSeries) => (
              <linearGradient
                key={itemSeries.key}
                id={`${chartId}-${itemSeries.key}-gradient`}
                x1="0"
                x2="0"
                y1="0"
                y2="1"
              >
                <stop offset="0%" stopColor={itemSeries.color} stopOpacity="0.16" />
                <stop offset="100%" stopColor={itemSeries.color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>

          {Array.from({ length: 5 }, (_, index) => {
            const value = (chart.maximum / 4) * (4 - index);
            const y = chart.padding.top + (chart.innerHeight / 4) * index;
            return (
              <g key={value}>
                <line
                  x1={chart.padding.left}
                  x2={chart.padding.left + chart.innerWidth}
                  y1={y}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeDasharray={index === 4 ? undefined : "4 5"}
                />
                <text
                  x={chart.padding.left - 9}
                  y={y + 4}
                  textAnchor="end"
                  fill="#64748b"
                  fontSize="11"
                >
                  {valueFormatter(value)}
                </text>
              </g>
            );
          })}

          {series.map((itemSeries) => {
            const itemPath = chart.paths[itemSeries.key];
            const firstPoint = itemPath.points[0];
            const lastPoint = itemPath.points[itemPath.points.length - 1];
            const areaPath = `${itemPath.path} L ${lastPoint.x} ${baseline} L ${firstPoint.x} ${baseline} Z`;
            return (
              <g key={itemSeries.key}>
                {showArea ? (
                  <path d={areaPath} fill={`url(#${chartId}-${itemSeries.key}-gradient)`} />
                ) : null}
                <path
                  d={itemPath.path}
                  fill="none"
                  stroke={itemSeries.color}
                  strokeWidth="2.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
                {itemPath.points.map((point, index) => (
                  <circle
                    key={`${itemSeries.key}-${data[index].label}`}
                    cx={point.x}
                    cy={point.y}
                    r={hoveredIndex === index ? "4.5" : "3"}
                    fill="white"
                    stroke={itemSeries.color}
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                    onMouseEnter={() => setHoveredIndex(index)}
                  >
                    <title>
                      {data[index].label}: {itemSeries.label} {valueFormatter(data[index].values[itemSeries.key] ?? 0)}
                    </title>
                  </circle>
                ))}
              </g>
            );
          })}

          {chart.labelIndexes.map((index) => (
            <text
              key={`${data[index].label}-${index}`}
              x={chart.xFor(index)}
              y={height - 15}
              textAnchor={index === 0 ? "start" : index === data.length - 1 ? "end" : "middle"}
              fill="#64748b"
              fontSize="11"
            >
              {data[index].label}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}
