"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2, Store, Users, ShieldCheck, Boxes, Receipt, Plug, Palette, Database,
  Plus, KeyRound, Moon, Sun, Upload, Download,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, FieldError } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Drawer } from "@/components/ui/Drawer";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { StatusPill } from "@/components/ui/StatusPill";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toast";
import { useTheme } from "@/components/theme/ThemeProvider";
import { cn } from "@/lib/utils";
import {
  updateStoreProfile, updateInventorySettings, updateSalesSettings, updateIntegrations,
  inviteUser, updateUserRole, setUserActive, resetUserPassword, changePassword,
  importProductsCSV, exportProductsCSV,
} from "./actions";

export interface SettingsData {
  store_name: string; costing_method: "WEIGHTED_AVERAGE" | "FIFO"; tax_percent: number; currency: string;
  address: string; phone: string; ntn: string; receipt_header: string; receipt_footer: string; logo_url: string;
  low_stock_default: number; barcode_format: string; default_unit: string;
  rounding: string; receipt_template: string; allow_discounts: boolean;
  courier: Record<string, string>; resend_key: string; whatsapp_key: string; notif_prefs: Record<string, unknown>;
}
export interface UserRow { id: string; full_name: string; role: string; active: boolean; email: string }

const SECTIONS = [
  { key: "store", label: "Store profile", icon: Store },
  { key: "users", label: "Users & roles", icon: Users },
  { key: "security", label: "Security", icon: ShieldCheck },
  { key: "inventory", label: "Inventory", icon: Boxes },
  { key: "sales", label: "Sales", icon: Receipt },
  { key: "integrations", label: "Integrations", icon: Plug },
  { key: "appearance", label: "Appearance", icon: Palette },
  { key: "data", label: "Data", icon: Database },
] as const;
type SectionKey = typeof SECTIONS[number]["key"];

export function SettingsClient({ data, users, isOwner, myId }: { data: SettingsData; users: UserRow[]; isOwner: boolean; myId: string }) {
  const [section, setSection] = useState<SectionKey>("store");

  return (
    <div>
      <PageHeader title="Settings" subtitle="Store configuration, users, security and integrations" />
      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <nav className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-surface p-2 lg:flex-col lg:overflow-visible">
          {SECTIONS.map((s) => (
            <button key={s.key} onClick={() => setSection(s.key)}
              className={cn("flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                section === s.key ? "bg-brand-500 text-white" : "text-text-secondary hover:bg-surface-2")}>
              <s.icon className="h-4 w-4" /> {s.label}
            </button>
          ))}
        </nav>

        <div>
          {section === "store" && <StoreSection data={data} isOwner={isOwner} />}
          {section === "users" && <UsersSection users={users} isOwner={isOwner} myId={myId} />}
          {section === "security" && <SecuritySection />}
          {section === "inventory" && <InventorySection data={data} isOwner={isOwner} />}
          {section === "sales" && <SalesSection data={data} isOwner={isOwner} />}
          {section === "integrations" && <IntegrationsSection data={data} isOwner={isOwner} />}
          {section === "appearance" && <AppearanceSection />}
          {section === "data" && <DataSection isOwner={isOwner} />}
        </div>
      </div>
    </div>
  );
}

function useSaver() {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  async function run(fn: () => Promise<{ ok?: boolean; error?: string } | undefined>, okMsg = "Saved") {
    setSaving(true);
    const res = await fn();
    setSaving(false);
    if (res?.error) { toast(res.error, "error"); return false; }
    toast(okMsg); router.refresh(); return true;
  }
  return { saving, run };
}

function OwnerNote({ isOwner }: { isOwner: boolean }) {
  if (isOwner) return null;
  return <p className="text-xs text-text-tertiary">Only the owner can edit these settings.</p>;
}

/* ---------------- Store profile ---------------- */
function StoreSection({ data, isOwner }: { data: SettingsData; isOwner: boolean }) {
  const { saving, run } = useSaver();
  const [f, setF] = useState(data);
  const set = (k: keyof SettingsData) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Store className="h-4 w-4" /> Store profile</CardTitle></CardHeader>
      <CardBody>
        <form onSubmit={(e) => { e.preventDefault(); run(() => updateStoreProfile({ store_name: f.store_name, currency: f.currency, tax_percent: Number(f.tax_percent) || 0, address: f.address, phone: f.phone, ntn: f.ntn, receipt_header: f.receipt_header, receipt_footer: f.receipt_footer, logo_url: f.logo_url })); }} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Store name</Label><Input value={f.store_name} disabled={!isOwner} onChange={set("store_name")} /></div>
            <div><Label>Phone</Label><Input value={f.phone} disabled={!isOwner} onChange={set("phone")} /></div>
          </div>
          <div><Label>Address</Label><Input value={f.address} disabled={!isOwner} onChange={set("address")} /></div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><Label>Currency</Label><Input value={f.currency} disabled={!isOwner} onChange={set("currency")} /></div>
            <div><Label>Tax / GST (%)</Label><Input type="number" value={f.tax_percent} disabled={!isOwner} onChange={set("tax_percent")} /></div>
            <div><Label>NTN / Tax #</Label><Input value={f.ntn} disabled={!isOwner} onChange={set("ntn")} /></div>
          </div>
          <div><Label>Logo URL</Label><Input value={f.logo_url} disabled={!isOwner} onChange={set("logo_url")} placeholder="https://…" /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Receipt header</Label><Input value={f.receipt_header} disabled={!isOwner} onChange={set("receipt_header")} /></div>
            <div><Label>Receipt footer</Label><Input value={f.receipt_footer} disabled={!isOwner} onChange={set("receipt_footer")} placeholder="Thank you!" /></div>
          </div>
          {isOwner ? <Button type="submit" disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Save profile</Button> : <OwnerNote isOwner={isOwner} />}
        </form>
      </CardBody>
    </Card>
  );
}

/* ---------------- Users & roles ---------------- */
function UsersSection({ users, isOwner, myId }: { users: UserRow[]; isOwner: boolean; myId: string }) {
  const { run } = useSaver();
  const toast = useToast();
  const [invite, setInvite] = useState(false);
  const [resetFor, setResetFor] = useState<UserRow | null>(null);

  const cols: Column<UserRow>[] = [
    { key: "full_name", header: "User", cell: (u) => (
      <div className="flex items-center gap-2.5"><Avatar name={u.full_name} size={32} />
        <div><div className="font-medium text-text-primary">{u.full_name}{u.id === myId && <span className="ml-1 text-xs text-text-tertiary">(you)</span>}</div>
          {u.email && <div className="text-xs text-text-tertiary">{u.email}</div>}</div></div>
    ) },
    { key: "role", header: "Role", cell: (u) => isOwner && u.id !== myId
      ? <Select value={u.role} onChange={(e) => run(() => updateUserRole(u.id, e.target.value as "owner" | "manager" | "cashier"), "Role updated")} className="h-8 w-32"><option value="owner">Owner</option><option value="manager">Manager</option><option value="cashier">Cashier</option></Select>
      : <StatusPill tone="blue">{u.role}</StatusPill> },
    { key: "active", header: "Status", cell: (u) => <StatusPill status={u.active ? "confirmed" : "cancelled"}>{u.active ? "Active" : "Disabled"}</StatusPill> },
    { key: "actions", header: "", align: "right", cell: (u) => isOwner ? (
      <div className="flex justify-end gap-1">
        <button onClick={() => setResetFor(u)} className="rounded-md p-1.5 text-text-tertiary hover:bg-surface-2" title="Reset password"><KeyRound className="h-4 w-4" /></button>
        {u.id !== myId && <Button size="sm" variant="secondary" onClick={() => run(() => setUserActive(u.id, !u.active), u.active ? "Deactivated" : "Activated")}>{u.active ? "Disable" : "Enable"}</Button>}
      </div>
    ) : null },
  ];

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="flex items-center gap-2"><Users className="h-4 w-4" /> Users & roles</CardTitle>
        {isOwner && <Button size="sm" onClick={() => setInvite(true)}><Plus className="h-4 w-4" /> Add staff</Button>}
      </CardHeader>
      <DataTable columns={cols} rows={users} />

      {invite && <InviteDrawer onClose={() => setInvite(false)} onDone={() => { setInvite(false); }} />}
      {resetFor && <ResetPwDrawer user={resetFor} onClose={() => setResetFor(null)} onDone={(m) => { setResetFor(null); toast(m); }} />}
    </Card>
  );
}

function InviteDrawer({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { saving, run } = useSaver();
  const [f, setF] = useState({ email: "", full_name: "", role: "cashier", password: "" });
  const [err, setErr] = useState<string>();
  return (
    <Drawer open onClose={onClose} title="Add staff member" footer={
      <div className="flex gap-2"><Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button form="invite-form" type="submit" className="flex-1" disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Create</Button></div>
    }>
      <form id="invite-form" onSubmit={async (e) => { e.preventDefault(); setErr(undefined); const ok = await run(() => inviteUser({ email: f.email, full_name: f.full_name, role: f.role as "owner" | "manager" | "cashier", password: f.password }), "Staff added"); if (ok) onDone(); }} className="space-y-4">
        <div><Label>Full name</Label><Input value={f.full_name} onChange={(e) => setF((s) => ({ ...s, full_name: e.target.value }))} /></div>
        <div><Label>Email</Label><Input type="email" value={f.email} onChange={(e) => setF((s) => ({ ...s, email: e.target.value }))} /></div>
        <div><Label>Role</Label><Select value={f.role} onChange={(e) => setF((s) => ({ ...s, role: e.target.value }))}><option value="cashier">Cashier</option><option value="manager">Manager</option><option value="owner">Owner</option></Select></div>
        <div><Label>Temporary password</Label><Input type="text" value={f.password} onChange={(e) => setF((s) => ({ ...s, password: e.target.value }))} placeholder="min 8 chars" /></div>
        <p className="text-[11px] text-text-tertiary">Share this temporary password with the staff member; they can change it after signing in.</p>
        <FieldError message={err} />
      </form>
    </Drawer>
  );
}

function ResetPwDrawer({ user, onClose, onDone }: { user: UserRow; onClose: () => void; onDone: (m: string) => void }) {
  const [pw, setPw] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string>();
  return (
    <Drawer open onClose={onClose} title={`Reset password · ${user.full_name}`} footer={
      <div className="flex gap-2"><Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button form="reset-form" type="submit" className="flex-1" disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Reset</Button></div>
    }>
      <form id="reset-form" onSubmit={async (e) => { e.preventDefault(); setErr(undefined); setSaving(true); const res = await resetUserPassword(user.id, pw); setSaving(false); if (res?.error) { setErr(res.error); return; } onDone("Password reset"); }} className="space-y-4">
        <div><Label>New temporary password</Label><Input type="text" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="min 8 chars" /></div>
        <FieldError message={err} />
      </form>
    </Drawer>
  );
}

/* ---------------- Security (change own password) ---------------- */
function SecuritySection() {
  const toast = useToast();
  const [f, setF] = useState({ current: "", next: "", confirm: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string>();
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(undefined);
    if (f.next !== f.confirm) { setErr("New passwords don’t match."); return; }
    if (f.next.length < 8) { setErr("New password must be at least 8 characters."); return; }
    setSaving(true);
    const res = await changePassword(f.current, f.next);
    setSaving(false);
    if (res?.error) { setErr(res.error); return; }
    setF({ current: "", next: "", confirm: "" });
    toast("Password changed");
  }
  return (
    <Card className="max-w-md">
      <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Change password</CardTitle></CardHeader>
      <CardBody>
        <form onSubmit={submit} className="space-y-4">
          <div><Label>Current password</Label><Input type="password" value={f.current} onChange={(e) => setF((s) => ({ ...s, current: e.target.value }))} autoComplete="current-password" /></div>
          <div><Label>New password</Label><Input type="password" value={f.next} onChange={(e) => setF((s) => ({ ...s, next: e.target.value }))} autoComplete="new-password" /></div>
          <div><Label>Confirm new password</Label><Input type="password" value={f.confirm} onChange={(e) => setF((s) => ({ ...s, confirm: e.target.value }))} autoComplete="new-password" /></div>
          <FieldError message={err} />
          <Button type="submit" disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Update password</Button>
        </form>
      </CardBody>
    </Card>
  );
}

/* ---------------- Inventory ---------------- */
function InventorySection({ data, isOwner }: { data: SettingsData; isOwner: boolean }) {
  const { saving, run } = useSaver();
  const [f, setF] = useState(data);
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Boxes className="h-4 w-4" /> Inventory settings</CardTitle></CardHeader>
      <CardBody>
        <form onSubmit={(e) => { e.preventDefault(); run(() => updateInventorySettings({ costing_method: f.costing_method, low_stock_default: Number(f.low_stock_default) || 0, barcode_format: f.barcode_format, default_unit: f.default_unit })); }} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Costing method</Label><Select value={f.costing_method} disabled={!isOwner} onChange={(e) => setF((s) => ({ ...s, costing_method: e.target.value as "WEIGHTED_AVERAGE" | "FIFO" }))}><option value="WEIGHTED_AVERAGE">Weighted Average</option><option value="FIFO">FIFO</option></Select></div>
            <div><Label>Default low-stock threshold</Label><Input type="number" value={f.low_stock_default} disabled={!isOwner} onChange={(e) => setF((s) => ({ ...s, low_stock_default: Number(e.target.value) }))} /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Barcode / label format</Label><Select value={f.barcode_format} disabled={!isOwner} onChange={(e) => setF((s) => ({ ...s, barcode_format: e.target.value }))}><option value="EAN">EAN-13</option><option value="UPC">UPC</option><option value="INTERNAL">Internal</option><option value="WEIGHT_EMBEDDED">Weight-embedded</option></Select></div>
            <div><Label>Default unit</Label><Input value={f.default_unit} disabled={!isOwner} onChange={(e) => setF((s) => ({ ...s, default_unit: e.target.value }))} /></div>
          </div>
          {isOwner ? <Button type="submit" disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Save inventory settings</Button> : <OwnerNote isOwner={isOwner} />}
        </form>
      </CardBody>
    </Card>
  );
}

/* ---------------- Sales ---------------- */
function SalesSection({ data, isOwner }: { data: SettingsData; isOwner: boolean }) {
  const { saving, run } = useSaver();
  const [f, setF] = useState(data);
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Receipt className="h-4 w-4" /> Sales settings</CardTitle></CardHeader>
      <CardBody>
        <form onSubmit={(e) => { e.preventDefault(); run(() => updateSalesSettings({ tax_percent: Number(f.tax_percent) || 0, rounding: f.rounding, receipt_template: f.receipt_template, allow_discounts: f.allow_discounts })); }} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div><Label>Tax (%)</Label><Input type="number" value={f.tax_percent} disabled={!isOwner} onChange={(e) => setF((s) => ({ ...s, tax_percent: Number(e.target.value) }))} /></div>
            <div><Label>Rounding</Label><Select value={f.rounding} disabled={!isOwner} onChange={(e) => setF((s) => ({ ...s, rounding: e.target.value }))}><option value="none">None</option><option value="nearest_1">Nearest ₨1</option><option value="nearest_5">Nearest ₨5</option></Select></div>
            <div><Label>Receipt template</Label><Select value={f.receipt_template} disabled={!isOwner} onChange={(e) => setF((s) => ({ ...s, receipt_template: e.target.value }))}><option value="standard">Standard</option><option value="compact">Compact</option></Select></div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
            <input type="checkbox" checked={f.allow_discounts} disabled={!isOwner} onChange={(e) => setF((s) => ({ ...s, allow_discounts: e.target.checked }))} className="h-4 w-4 rounded border-border" /> Allow discounts at POS
          </label>
          {isOwner ? <Button type="submit" disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Save sales settings</Button> : <OwnerNote isOwner={isOwner} />}
        </form>
      </CardBody>
    </Card>
  );
}

/* ---------------- Integrations ---------------- */
function IntegrationsSection({ data, isOwner }: { data: SettingsData; isOwner: boolean }) {
  const { saving, run } = useSaver();
  const [f, setF] = useState({
    postex: data.courier.postex ?? "", leopards: data.courier.leopards ?? "", trax: data.courier.trax ?? "",
    resend: data.resend_key, whatsapp: data.whatsapp_key,
    notify_low_stock: Boolean((data.notif_prefs.low_stock as boolean) ?? true),
    notify_new_order: Boolean((data.notif_prefs.new_order as boolean) ?? true),
  });
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Plug className="h-4 w-4" /> Integrations</CardTitle></CardHeader>
      <CardBody>
        <form onSubmit={(e) => { e.preventDefault(); run(() => updateIntegrations({ courier: { postex: f.postex, leopards: f.leopards, trax: f.trax }, resend_key: f.resend, whatsapp_key: f.whatsapp, notif_prefs: { low_stock: f.notify_low_stock, new_order: f.notify_new_order } })); }} className="space-y-4">
          <p className="text-xs font-medium text-text-secondary">Courier API keys</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><Label>PostEx</Label><Input value={f.postex} disabled={!isOwner} onChange={(e) => setF((s) => ({ ...s, postex: e.target.value }))} /></div>
            <div><Label>Leopards</Label><Input value={f.leopards} disabled={!isOwner} onChange={(e) => setF((s) => ({ ...s, leopards: e.target.value }))} /></div>
            <div><Label>Trax</Label><Input value={f.trax} disabled={!isOwner} onChange={(e) => setF((s) => ({ ...s, trax: e.target.value }))} /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Resend (email) key</Label><Input value={f.resend} disabled={!isOwner} onChange={(e) => setF((s) => ({ ...s, resend: e.target.value }))} /></div>
            <div><Label>WhatsApp key</Label><Input value={f.whatsapp} disabled={!isOwner} onChange={(e) => setF((s) => ({ ...s, whatsapp: e.target.value }))} /></div>
          </div>
          <p className="text-xs font-medium text-text-secondary">Notify admins when</p>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-text-secondary"><input type="checkbox" checked={f.notify_low_stock} disabled={!isOwner} onChange={(e) => setF((s) => ({ ...s, notify_low_stock: e.target.checked }))} className="h-4 w-4 rounded border-border" /> Stock falls below reorder point</label>
            <label className="flex items-center gap-2 text-sm text-text-secondary"><input type="checkbox" checked={f.notify_new_order} disabled={!isOwner} onChange={(e) => setF((s) => ({ ...s, notify_new_order: e.target.checked }))} className="h-4 w-4 rounded border-border" /> A new online order arrives</label>
          </div>
          {isOwner ? <Button type="submit" disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Save integrations</Button> : <OwnerNote isOwner={isOwner} />}
        </form>
      </CardBody>
    </Card>
  );
}

/* ---------------- Appearance ---------------- */
function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  return (
    <Card className="max-w-md">
      <CardHeader><CardTitle className="flex items-center gap-2"><Palette className="h-4 w-4" /> Appearance</CardTitle></CardHeader>
      <CardBody>
        <Label>Theme</Label>
        <div className="mt-2 grid grid-cols-2 gap-3">
          {(["light", "dark"] as const).map((t) => (
            <button key={t} onClick={() => setTheme(t)}
              className={cn("flex items-center gap-2 rounded-xl border-2 px-4 py-3 text-sm font-medium capitalize transition-colors",
                theme === t ? "border-brand-500 bg-brand-50/40 text-text-primary" : "border-border text-text-secondary hover:bg-surface-2")}>
              {t === "light" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />} {t}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-text-tertiary">Saved on this device.</p>
      </CardBody>
    </Card>
  );
}

/* ---------------- Data (import / export) ---------------- */
function DataSection({ isOwner }: { isOwner: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function doExport() {
    setBusy(true);
    const res = await exportProductsCSV();
    setBusy(false);
    if ("error" in res) { toast(res.error, "error"); return; }
    const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "products-backup.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) { toast("CSV looks empty", "error"); return; }
    const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const idx = (name: string) => header.indexOf(name);
    const rows = lines.slice(1).map((ln) => {
      const c = ln.split(",");
      return {
        name: c[idx("name")]?.trim() ?? "", sku: c[idx("sku")]?.trim() ?? "",
        barcode: idx("barcode") >= 0 ? c[idx("barcode")]?.trim() : "",
        price: Number(c[idx("price")] ?? c[idx("sale_price")] ?? 0) || 0,
        cost: Number(c[idx("cost")] ?? 0) || 0, qty: Number(c[idx("qty")] ?? c[idx("on_hand")] ?? 0) || 0,
      };
    }).filter((r) => r.name && r.sku);
    setBusy(true);
    const res = await importProductsCSV(rows);
    setBusy(false);
    e.target.value = "";
    if ("error" in res && res.error) { toast(res.error, "error"); return; }
    toast(`Imported ${res.created} products${res.errors?.length ? `, ${res.errors.length} skipped` : ""}`);
    router.refresh();
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Download className="h-4 w-4" /> Export / backup</CardTitle></CardHeader>
        <CardBody>
          <p className="mb-3 text-sm text-text-secondary">Download all products, SKUs, barcodes, costs, prices and on-hand quantities as a CSV.</p>
          <Button variant="secondary" disabled={busy || !isOwner} onClick={doExport}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export products CSV</Button>
        </CardBody>
      </Card>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Upload className="h-4 w-4" /> Import products</CardTitle></CardHeader>
        <CardBody>
          <p className="mb-3 text-sm text-text-secondary">Upload a CSV with columns <code className="rounded bg-surface-2 px-1">name, sku, barcode, cost, price, qty</code>. Each row creates a product with opening stock.</p>
          <label className={cn("inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface-2 px-4 py-2 text-sm font-medium", (!isOwner || busy) && "pointer-events-none opacity-50")}>
            <Upload className="h-4 w-4" /> Choose CSV
            <input type="file" accept=".csv" className="hidden" onChange={onFile} disabled={!isOwner || busy} />
          </label>
        </CardBody>
      </Card>
    </div>
  );
}
