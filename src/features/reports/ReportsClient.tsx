"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { StatusPill } from "@/components/ui/StatusPill";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterBar } from "@/components/ui/FilterBar";
import { ExportMenu } from "@/components/ui/ExportMenu";
import { AreaTrend, BarTrend, DonutChart } from "@/components/charts";
import { formatPKR, formatNumber, cn } from "@/lib/utils";
import { REPORTS, type ReportData, type ReportColumn, type ReportChart } from "./queries";

function fmt(kind: ReportColumn["kind"], v: unknown) {
  const n = Number(v);
  switch (kind) {
    case "pkr": return formatPKR(n);
    case "num": return formatNumber(n, Number.isInteger(n) ? 0 : 2);
    case "pct": return `${n.toFixed(1)}%`;
    default: return v == null ? "—" : String(v);
  }
}

export function ReportsClient({ reportKey, data }: { reportKey: string; data: ReportData }) {
  const params = useSearchParams();

  // tab links preserve the date range, reset per-report view
  const tabHref = (key: string) => {
    const next = new URLSearchParams();
    for (const k of ["preset", "from", "to"]) { const v = params.get(k); if (v) next.set(k, v); }
    next.set("report", key);
    return `/admin/reports?${next.toString()}`;
  };

  const columns: Column<Record<string, unknown> & { id: number }>[] = data.columns.map((c) => ({
    key: c.key,
    header: c.header,
    align: c.align,
    cell: (r) => c.kind === "pill"
      ? <StatusPill status={String(r[c.key]).toLowerCase()}>{String(r[c.key])}</StatusPill>
      : <span className={c.kind && c.kind !== "text" ? "tnum" : ""}>{fmt(c.kind, r[c.key])}</span>,
  }));
  const rows = data.rows.map((r, i) => ({ ...r, id: i }));

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Filter any period — figures reconstruct from the ledger"
        actions={
          <ExportMenu
            filename={`${data.key}-report`}
            title={`${data.title} · ${data.subtitle ?? ""}`}
            columns={data.columns.map((c) => ({ key: c.key, header: c.header }))}
            rows={data.rows.map((r) => {
              const out: Record<string, unknown> = {};
              for (const c of data.columns) out[c.key] = c.kind === "pkr" || c.kind === "num" || c.kind === "pct" ? fmt(c.kind, r[c.key]) : r[c.key];
              return out;
            })}
            summary={data.kpis.map((k) => ({ label: k.label, value: k.value }))}
          />
        }
      />

      {/* report tabs */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {REPORTS.map((r) => (
          <Link
            key={r.key}
            href={tabHref(r.key)}
            className={cn(
              "whitespace-nowrap rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
              r.key === reportKey ? "border-brand-500 bg-brand-500 text-white" : "border-border bg-surface text-text-secondary hover:bg-surface-2",
            )}
          >
            {r.label}
          </Link>
        ))}
      </div>

      <FilterBar dimensions={data.dimensions} className="mb-4" />

      {/* KPIs */}
      <div className={cn("mb-4 grid grid-cols-2 gap-4", data.kpis.length >= 6 ? "lg:grid-cols-6" : "lg:grid-cols-4")}>
        {data.kpis.map((k) => <StatTile key={k.label} label={k.label} value={k.value} icon={BarChart3} accent={k.accent} />)}
      </div>

      {/* charts */}
      {data.charts.length > 0 && (
        <div className={cn("mb-4 grid gap-4", data.charts.length > 1 ? "lg:grid-cols-2" : "")}>
          {data.charts.map((ch, i) => <ChartCard key={i} chart={ch} />)}
        </div>
      )}

      {/* table */}
      <Card>
        <CardHeader><CardTitle>{data.title}</CardTitle></CardHeader>
        {rows.length === 0
          ? <EmptyState icon={BarChart3} title="No data for this period" description="Adjust the date range or make some transactions." />
          : <DataTable columns={columns} rows={rows} />}
      </Card>
    </div>
  );
}

function ChartCard({ chart }: { chart: ReportChart }) {
  const empty = chart.data.length === 0;
  return (
    <Card>
      {chart.title && <CardHeader><CardTitle>{chart.title}</CardTitle></CardHeader>}
      <div className="px-2 pb-2">
        {empty ? (
          <div className="flex h-48 items-center justify-center text-sm text-text-tertiary">No data in range</div>
        ) : chart.type === "area" ? (
          <AreaTrend data={chart.data} dataKey={chart.dataKey ?? "value"} xKey={chart.xKey ?? "label"} accent={chart.accent ?? "blue"} />
        ) : chart.type === "bar" ? (
          <BarTrend data={chart.data} dataKey={chart.dataKey ?? "value"} xKey={chart.xKey ?? "label"} accent={chart.accent ?? "blue"} />
        ) : (
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
            <div className="w-full sm:w-1/2"><DonutChart data={chart.data as { name: string; value: number }[]} centerLabel={chart.centerLabel} centerValue={chart.centerValue} /></div>
            <ul className="w-full space-y-1.5 sm:w-1/2">
              {(chart.data as { name: string; value: number }[]).slice(0, 6).map((d, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-text-secondary"><span className="h-2.5 w-2.5 rounded-full" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />{d.name}</span>
                  <span className="tnum text-text-primary">{formatPKR(d.value)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

const DONUT_COLORS = ["#1863D5", "#0E9BC0", "#16A34A", "#D97706", "#7C3AED", "#E2615B"];
