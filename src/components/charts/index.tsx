"use client";

import dynamic from "next/dynamic";

/**
 * Lazy chart barrel. recharts is ~170 kB and was landing in the First Load
 * JS of every page that imported a chart (Dashboard 292 kB, Reports 229 kB).
 * Importing the charts through next/dynamic (ssr:false) splits recharts into
 * its own chunk that only downloads when a chart is actually rendered, so the
 * route shells stay light and become interactive sooner.
 */
const Pulse = ({ h = 240 }: { h?: number }) => (
  <div className="w-full animate-pulse rounded-xl bg-[var(--surface-2,#f1f3f5)]" style={{ height: h }} />
);

export const AreaTrend = dynamic(() => import("./AreaTrend").then((m) => m.AreaTrend), {
  ssr: false,
  loading: () => <Pulse />,
});

export const BarTrend = dynamic(() => import("./BarTrend").then((m) => m.BarTrend), {
  ssr: false,
  loading: () => <Pulse />,
});

export const DonutChart = dynamic(() => import("./DonutChart").then((m) => m.DonutChart), {
  ssr: false,
  loading: () => <Pulse h={200} />,
});
