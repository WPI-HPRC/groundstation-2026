import { useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import type { ChartTimeMode } from "../../telemetry/timebase";
export type TimeSeriesLineDef = {
  label: string;
  color: string;
};

export type TimeSeriesChartProps = {
  title: string;
  t: number[]; // unix seconds (wall) or T+ seconds (mission)
  series: number[][]; // aligned with t
  defs: TimeSeriesLineDef[];
  yLabel?: string;
  timeMode?: ChartTimeMode;
};
export function TimeSeriesChart({
  title,
  t,
  series,
  defs,
  yLabel,
  timeMode = "wall",
}: TimeSeriesChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const plotRef = useRef<uPlot | null>(null);
  const defsKey = defs.map((d) => `${d.label}:${d.color}`).join("|");

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const width = el.clientWidth || 600;
    const height = el.clientHeight || 240;

    // Prevent the uPlot legend from affecting surrounding layout.
    el.style.position = "relative";
    el.style.overflow = "hidden";

    const updateDensityClass = () => {
      const compact = el.clientWidth < 560;
      const stacked = el.clientWidth < 430;
      el.classList.toggle("ts-chart-compact", compact);
      el.classList.toggle("ts-chart-stacked-legend", stacked);
    };

    updateDensityClass();

    const plot = new uPlot(
      {
        title,
        width,
        height,
        legend: { show: true },
        scales: { x: { time: timeMode === "wall" } },
        axes: [
          {
            stroke: "#c1c1c1",
            grid: { stroke: "rgba(193,193,193,0.18)" },
            label: timeMode === "wall" ? "Time" : "T+ (s)",
          },          {
            stroke: "#c1c1c1",
            grid: { stroke: "rgba(193,193,193,0.18)" },
            label: yLabel,
          },
        ],
        series: [
          // X label appears in uPlot's legend/hover readout.
          { label: timeMode === "wall" ? "Time" : "T+" },
          ...defs.map(({ label, color }) => ({
            label,
            stroke: color,
            width: 1.5,
          })),
        ],
      },
      [t, ...series] as uPlot.AlignedData,
      el,
    );

    const legend = el.querySelector(".u-legend") as HTMLElement | null;
    if (legend) {
      legend.style.position = "absolute";
      legend.style.left = "0";
      legend.style.top = "0";
      legend.style.right = "auto";
      legend.style.bottom = "auto";
      legend.style.background = "transparent";
      legend.style.backdropFilter = "";
      legend.style.padding = "2px 6px";
    }

    plotRef.current = plot;

    const ro = new ResizeObserver(() => {
      const nextW = el.clientWidth || 600;
      const nextH = el.clientHeight || 240;
      updateDensityClass();
      plot.setSize({ width: nextW, height: nextH });
    });

    ro.observe(el);

    return () => {
      ro.disconnect();
      plot.destroy();
      plotRef.current = null;
    };
  }, [title, yLabel, defsKey, timeMode]);
  useEffect(() => {
    plotRef.current?.setData([t, ...series] as uPlot.AlignedData);
  }, [t, series]);

  return (
    <div
      ref={containerRef}
      className="ts-chart"
      style={{ width: "100%", height: "100%", minHeight: 120 }}
    />
  );
}

