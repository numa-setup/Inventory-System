"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Boxes, Loader2, Wallet, PackageX, Layers } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, FieldError } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Drawer } from "@/components/ui/Drawer";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { StatusPill } from "@/components/ui/StatusPill";
import { StatTile } from "@/components/ui/StatTile";
import { useToast } from "@/components/ui/Toast";
import { formatPKR, formatNumber } from "@/lib/utils";
import { adjustStock } from "./actions";

export interface StockRow {
  id: string;
  sku: string;
  name: string;
  base_unit: string;
  reorder_point: number;
  on_hand: number;
  reserved: number;
  available: number;
  avg_cost: number;
  value: number;
}

export function StockClient({ rows }: { rows: StockRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [onlyLow, setOnlyLow] = useState(false);
  const [adjust, setAdjust] = useState<StockRow | null>(null);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyLow && r.available > r.reorder_point) return false;
      if (!term) return true;
      return r.name.toLowerCase().includes(term) || r.sku.toLowerCase().includes(term);
    });
  }, [rows, q, onlyLow]);

  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const lowCount = rows.filter((r) => r.available <= r.reorder_point).length;
  const skuCount = rows.length;

  const columns: Column<StockRow>[] = [
    {
      key: "name",
      header: "Product",
      cell: (r) => (
        <div>
          <div className="font-medium text-text-primary">{r.name}</div>
          <div className="text-xs text-text-tertiary">{r.sku}</div>
        </div>
      ),
    },
    { key: "on_hand", header: "On hand", align: "right", cell: (r) => <span className="tnum">{formatNumber(r.on_hand, 2)}</span> },
    { key: "reserved", header: "Reserved", align: "right", cell: (r) => <span className="tnum text-text-tertiary">{formatNumber(r.reserved, 2)}</span> },
    { key: "available", header: "Available", align: "right", cell: (r) => <span className="tnum font-medium text-text-primary">{formatNumber(r.available, 2)}</span> },
    { key: "avg_cost", header: "Avg cost", align: "right", cell: (r) => <span className="tnum">{formatPKR(r.avg_cost)}</span> },
    { key: "value", header: "Stock value", align: "right", cell: (r) => <span className="tnum text-text-primary">{formatPKR(r.value)}</span> },
    {
      key: "status",
      header: "Status",
      cell: (r) => (
        <StatusPill status={r.available <= 0 ? "out_of_stock" : r.available <= r.reorder_point ? "low_stock" : "in_stock"} />
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (r) => (
        <Button size="sm" variant="secondary" onClick={() => setAdjust(r)}>Adjust</Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Stock" subtitle="Live on-hand levels, derived from the ledger" />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Stock Value" value={formatPKR(totalValue, { compact: true })} icon={Wallet} accent="blue" />
        <StatTile label="Low-stock Items" value={lowCount} icon={PackageX} accent="amber" />
        <StatTile label="SKUs Tracked" value={skuCount} icon={Layers} accent="teal" />
      </div>

      <Card className="mb-4 flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products…" className="pl-9" />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
          <input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} className="h-4 w-4 rounded border-border" />
          Low stock only
        </label>
      </Card>

      <Card>
        <DataTable columns={columns} rows={filtered} empty={
          <span className="text-sm text-text-tertiary">No products match.</span>
        } />
      </Card>

      <AdjustDrawer
        row={adjust}
        onClose={() => setAdjust(null)}
        onSaved={() => { setAdjust(null); toast("Stock adjusted"); router.refresh(); }}
        onError={(m) => toast(m, "error")}
      />
    </div>
  );
}

function AdjustDrawer({
  row, onClose, onSaved, onError,
}: {
  row: StockRow | null;
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [cost, setCost] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string>();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!row) return;
    setErr(undefined);
    if (!qty || Number(qty) <= 0) { setErr("Enter a quantity."); return; }
    setSaving(true);
    const res = await adjustStock({
      product_id: row.id,
      direction,
      qty: Number(qty),
      reason: reason || (direction === "add" ? "Stock found / correction" : "Damage / loss"),
      unit_cost: cost ? Number(cost) : row.avg_cost,
    });
    setSaving(false);
    if (res?.error) { setErr(res.error); onError(res.error); return; }
    setQty(""); setReason(""); setCost(""); setDirection("add");
    onSaved();
  }

  return (
    <Drawer
      open={!!row}
      onClose={onClose}
      title={row ? `Adjust — ${row.name}` : "Adjust"}
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button form="adjust-form" type="submit" className="flex-1" disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Post Adjustment
          </Button>
        </div>
      }
    >
      {row && (
        <form id="adjust-form" onSubmit={submit} className="space-y-4">
          <div className="rounded-xl border border-border bg-surface-2 p-3 text-sm">
            <div className="flex justify-between"><span className="text-text-tertiary">Current on-hand</span><span className="tnum font-medium">{row.on_hand} {row.base_unit}</span></div>
            <div className="mt-1 flex justify-between"><span className="text-text-tertiary">Avg cost</span><span className="tnum">{formatPKR(row.avg_cost)}</span></div>
          </div>
          <div>
            <Label>Adjustment type</Label>
            <Select value={direction} onChange={(e) => setDirection(e.target.value as "add" | "remove")}>
              <option value="add">Add (found / correction up)</option>
              <option value="remove">Remove (damage / loss)</option>
            </Select>
          </div>
          <div>
            <Label>Quantity ({row.base_unit})</Label>
            <Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" />
          </div>
          {direction === "add" && (
            <div>
              <Label>Cost / unit (₨)</Label>
              <Input type="number" value={cost} onChange={(e) => setCost(e.target.value)} placeholder={String(row.avg_cost)} />
            </div>
          )}
          <div>
            <Label>Reason / note</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Broken during handling" />
          </div>
          <FieldError message={err} />
          <p className="text-[11px] text-text-tertiary">
            This posts an append-only ledger move ({direction === "add" ? "Adjustment → Main" : "Main → Loss"}). Stock is never edited directly.
          </p>
        </form>
      )}
    </Drawer>
  );
}
