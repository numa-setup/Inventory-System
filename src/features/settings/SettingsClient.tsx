"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Store, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { StatusPill } from "@/components/ui/StatusPill";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toast";
import { updateSettings, updateUserRole } from "./actions";

export interface SettingsData {
  store_name: string;
  costing_method: "WEIGHTED_AVERAGE" | "FIFO";
  tax_percent: number;
  currency: string;
}
export interface UserRow { id: string; full_name: string; role: string; active: boolean }

export function SettingsClient({
  data, users, isOwner, myId,
}: {
  data: SettingsData; users: UserRow[]; isOwner: boolean; myId: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState(data);
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!isOwner) { toast("Only the owner can change settings.", "error"); return; }
    setSaving(true);
    const res = await updateSettings({
      store_name: form.store_name,
      costing_method: form.costing_method,
      tax_percent: Number(form.tax_percent) || 0,
      currency: form.currency,
    });
    setSaving(false);
    if (res?.error) { toast(res.error, "error"); return; }
    toast("Settings saved");
    router.refresh();
  }

  async function changeRole(id: string, role: string) {
    const res = await updateUserRole(id, role as "owner" | "manager" | "cashier");
    if (res?.error) { toast(res.error, "error"); return; }
    toast("Role updated");
    router.refresh();
  }

  const userColumns: Column<UserRow>[] = [
    { key: "full_name", header: "User", cell: (u) => (
      <div className="flex items-center gap-2.5"><Avatar name={u.full_name} size={32} />
        <span className="font-medium text-text-primary">{u.full_name}{u.id === myId && <span className="ml-1 text-xs text-text-tertiary">(you)</span>}</span></div>
    ) },
    { key: "role", header: "Role", cell: (u) =>
      isOwner && u.id !== myId ? (
        <Select value={u.role} onChange={(e) => changeRole(u.id, e.target.value)} className="h-8 w-36">
          <option value="owner">Owner</option>
          <option value="manager">Manager</option>
          <option value="cashier">Cashier</option>
        </Select>
      ) : <StatusPill tone="blue">{u.role}</StatusPill>
    },
    { key: "active", header: "Status", align: "center", cell: (u) => <StatusPill status={u.active ? "confirmed" : "cancelled"}>{u.active ? "Active" : "Disabled"}</StatusPill> },
  ];

  return (
    <div>
      <PageHeader title="Settings" subtitle="Store configuration, costing & users" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Store className="h-4 w-4" /> Store</CardTitle></CardHeader>
          <CardBody>
            <form onSubmit={save} className="space-y-4">
              <div><Label>Store name</Label>
                <Input value={form.store_name} disabled={!isOwner} onChange={(e) => setForm((f) => ({ ...f, store_name: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Costing method</Label>
                  <Select value={form.costing_method} disabled={!isOwner} onChange={(e) => setForm((f) => ({ ...f, costing_method: e.target.value as "WEIGHTED_AVERAGE" | "FIFO" }))}>
                    <option value="WEIGHTED_AVERAGE">Weighted Average</option>
                    <option value="FIFO">FIFO</option>
                  </Select>
                </div>
                <div><Label>Currency</Label>
                  <Input value={form.currency} disabled={!isOwner} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} /></div>
              </div>
              <div><Label>Tax (%)</Label>
                <Input type="number" value={form.tax_percent} disabled={!isOwner} onChange={(e) => setForm((f) => ({ ...f, tax_percent: Number(e.target.value) }))} /></div>
              {isOwner && (
                <Button type="submit" disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Save Settings</Button>
              )}
              {!isOwner && <p className="text-xs text-text-tertiary">Only the owner can edit settings.</p>}
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-4 w-4" /> Users & Roles</CardTitle></CardHeader>
          <DataTable columns={userColumns} rows={users} />
        </Card>
      </div>
    </div>
  );
}
