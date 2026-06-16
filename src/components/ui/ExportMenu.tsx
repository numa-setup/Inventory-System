"use client";

import { useState, useRef, useEffect } from "react";
import { Download, FileText, FileSpreadsheet, FileDown, ChevronDown } from "lucide-react";
import { Button } from "./Button";

export interface ExportColumn { key: string; header: string }

function esc(v: unknown) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function download(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/**
 * Shared export menu: CSV (full), Excel (.xls), and a print-to-PDF summary.
 * No external deps — Excel is an HTML-table workbook, PDF uses the print dialog.
 */
export function ExportMenu({
  filename, columns, rows, title, summary,
}: {
  filename: string;
  columns: ExportColumn[];
  rows: Record<string, unknown>[];
  title?: string;
  summary?: { label: string; value: string }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function toCSV() {
    const head = columns.map((c) => esc(c.header)).join(",");
    const body = rows.map((r) => columns.map((c) => esc(r[c.key])).join(",")).join("\n");
    download(`${head}\n${body}`, `${filename}.csv`, "text/csv;charset=utf-8");
    setOpen(false);
  }

  function tableHTML() {
    const head = `<tr>${columns.map((c) => `<th style="background:#f1f3f7;text-align:left;padding:6px;border:1px solid #ccc">${c.header}</th>`).join("")}</tr>`;
    const body = rows.map((r) =>
      `<tr>${columns.map((c) => `<td style="padding:6px;border:1px solid #ddd">${r[c.key] ?? ""}</td>`).join("")}</tr>`,
    ).join("");
    return `<table style="border-collapse:collapse;font-family:Arial;font-size:12px">${head}${body}</table>`;
  }

  function toExcel() {
    const html = `<html><head><meta charset="utf-8"></head><body>${title ? `<h3>${title}</h3>` : ""}${tableHTML()}</body></html>`;
    download(html, `${filename}.xls`, "application/vnd.ms-excel");
    setOpen(false);
  }

  function toPDF() {
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return;
    const kpis = summary?.length
      ? `<div style="display:flex;gap:16px;flex-wrap:wrap;margin:12px 0">${summary.map((s) =>
          `<div style="border:1px solid #e5e7eb;border-radius:8px;padding:10px 14px"><div style="font-size:11px;color:#667085">${s.label}</div><div style="font-size:18px;font-weight:700">${s.value}</div></div>`).join("")}</div>`
      : "";
    w.document.write(`<html><head><title>${title ?? filename}</title></head>
      <body style="font-family:Arial;padding:24px;color:#101828">
        <h2 style="margin:0">${title ?? "Report"}</h2>
        <p style="color:#667085;font-size:12px">Hamza General Store · generated ${new Date().toLocaleString("en-PK")}</p>
        ${kpis}${tableHTML()}
        <script>window.onload=function(){window.print();}</script>
      </body></html>`);
    w.document.close();
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <Button variant="secondary" size="sm" onClick={() => setOpen((o) => !o)}>
        <Download className="h-4 w-4" /> Export <ChevronDown className="h-3.5 w-3.5" />
      </Button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-48 overflow-hidden rounded-lg border border-border bg-surface shadow-drawer">
          <button onClick={toPDF} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2">
            <FileText className="h-4 w-4 text-coral-icon" /> Summary PDF
          </button>
          <button onClick={toExcel} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2">
            <FileSpreadsheet className="h-4 w-4 text-green-icon" /> Full Excel
          </button>
          <button onClick={toCSV} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2">
            <FileDown className="h-4 w-4 text-blue-icon" /> CSV
          </button>
        </div>
      )}
    </div>
  );
}
