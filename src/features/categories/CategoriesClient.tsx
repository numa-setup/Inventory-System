"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderTree, Plus, Pencil, Trash2, Check, X, Loader2, CornerDownRight } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { createCategory, updateCategory, deleteCategory } from "./actions";

export interface CategoryNode {
  id: string;
  name: string;
  parent_id: string | null;
  product_count: number;
}

export function CategoriesClient({ categories }: { categories: CategoryNode[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [addParent, setAddParent] = useState<string | null | undefined>(undefined); // undefined = idle, null = top-level
  const [addName, setAddName] = useState("");

  const tree = useMemo(() => {
    const parents = categories.filter((c) => !c.parent_id);
    const byParent = new Map<string, CategoryNode[]>();
    for (const c of categories) if (c.parent_id) {
      const arr = byParent.get(c.parent_id) ?? [];
      arr.push(c);
      byParent.set(c.parent_id, arr);
    }
    return parents.map((p) => ({ ...p, children: byParent.get(p.id) ?? [] }));
  }, [categories]);

  async function run<T extends { error?: string }>(fn: () => Promise<T>, ok: string) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (res?.error) { toast(res.error, "error"); return false; }
    toast(ok);
    router.refresh();
    return true;
  }

  async function submitAdd() {
    if (!addName.trim()) return;
    const done = await run(() => createCategory({ name: addName, parent_id: addParent ?? null }), addParent ? "Sub-category added" : "Category added");
    if (done) { setAddName(""); setAddParent(undefined); }
  }
  async function submitEdit() {
    if (!editId || !editName.trim()) return;
    const done = await run(() => updateCategory(editId, { name: editName }), "Renamed");
    if (done) setEditId(null);
  }

  return (
    <div className="min-w-0">
      <PageHeader
        title="Categories"
        subtitle="Organise products into categories and sub-categories"
        actions={
          <Button size="sm" onClick={() => { setAddParent(null); setAddName(""); }}>
            <Plus className="h-4 w-4" /> New category
          </Button>
        }
      />

      <Card className="min-w-0 max-w-full divide-y divide-border">
        {/* add top-level */}
        {addParent === null && (
          <AddRow
            placeholder="New category name"
            value={addName}
            onChange={setAddName}
            onSave={submitAdd}
            onCancel={() => setAddParent(undefined)}
            busy={busy}
          />
        )}

        {tree.length === 0 && addParent === undefined ? (
          <EmptyState icon={FolderTree} title="No categories yet" description="Create your first category to organise products." />
        ) : tree.map((p) => (
          <div key={p.id}>
            {/* parent row */}
            <Row
              node={p}
              isEditing={editId === p.id}
              editName={editName}
              setEditName={setEditName}
              onStartEdit={() => { setEditId(p.id); setEditName(p.name); }}
              onSaveEdit={submitEdit}
              onCancelEdit={() => setEditId(null)}
              onDelete={() => run(() => deleteCategory(p.id), "Category deleted")}
              onAddSub={() => { setAddParent(p.id); setAddName(""); }}
              busy={busy}
            />
            {/* children */}
            {p.children.map((c) => (
              <Row
                key={c.id}
                node={c}
                indent
                isEditing={editId === c.id}
                editName={editName}
                setEditName={setEditName}
                onStartEdit={() => { setEditId(c.id); setEditName(c.name); }}
                onSaveEdit={submitEdit}
                onCancelEdit={() => setEditId(null)}
                onDelete={() => run(() => deleteCategory(c.id), "Sub-category deleted")}
                busy={busy}
              />
            ))}
            {/* add sub under this parent */}
            {addParent === p.id && (
              <AddRow
                indent
                placeholder={`New sub-category under ${p.name}`}
                value={addName}
                onChange={setAddName}
                onSave={submitAdd}
                onCancel={() => setAddParent(undefined)}
                busy={busy}
              />
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}

function Row({
  node, indent, isEditing, editName, setEditName, onStartEdit, onSaveEdit, onCancelEdit, onDelete, onAddSub, busy,
}: {
  node: CategoryNode;
  indent?: boolean;
  isEditing: boolean;
  editName: string;
  setEditName: (v: string) => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onAddSub?: () => void;
  busy: boolean;
}) {
  return (
    <div className={`flex min-w-0 items-center gap-2 px-4 py-2.5 ${indent ? "pl-10" : ""}`}>
      {indent && <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />}
      {isEditing ? (
        <>
          <Input value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus className="h-8 max-w-xs"
            onKeyDown={(e) => { if (e.key === "Enter") onSaveEdit(); if (e.key === "Escape") onCancelEdit(); }} />
          <button onClick={onSaveEdit} disabled={busy} className="rounded-md p-1.5 text-green-text hover:bg-surface-2" title="Save"><Check className="h-4 w-4" /></button>
          <button onClick={onCancelEdit} className="rounded-md p-1.5 text-text-tertiary hover:bg-surface-2" title="Cancel"><X className="h-4 w-4" /></button>
        </>
      ) : (
        <>
          <span className={`truncate ${indent ? "text-sm text-text-secondary" : "font-medium text-text-primary"}`}>{node.name}</span>
          <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-text-tertiary">{node.product_count} {node.product_count === 1 ? "product" : "products"}</span>
          <div className="ml-auto flex shrink-0 items-center gap-0.5">
            {onAddSub && (
              <button onClick={onAddSub} className="rounded-md p-1.5 text-text-tertiary hover:bg-surface-2" title="Add sub-category"><Plus className="h-4 w-4" /></button>
            )}
            <button onClick={onStartEdit} className="rounded-md p-1.5 text-text-tertiary hover:bg-surface-2" title="Rename"><Pencil className="h-4 w-4" /></button>
            <button onClick={onDelete} disabled={busy} className="rounded-md p-1.5 text-coral-text hover:bg-coral-tile" title="Delete"><Trash2 className="h-4 w-4" /></button>
          </div>
        </>
      )}
    </div>
  );
}

function AddRow({
  indent, placeholder, value, onChange, onSave, onCancel, busy,
}: {
  indent?: boolean;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <div className={`flex min-w-0 items-center gap-2 bg-surface-2/40 px-4 py-2.5 ${indent ? "pl-10" : ""}`}>
      {indent && <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />}
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoFocus className="h-8 max-w-xs"
        onKeyDown={(e) => { if (e.key === "Enter") onSave(); if (e.key === "Escape") onCancel(); }} />
      <Button size="sm" onClick={onSave} disabled={busy || !value.trim()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Add</Button>
      <button onClick={onCancel} className="rounded-md p-1.5 text-text-tertiary hover:bg-surface-2" title="Cancel"><X className="h-4 w-4" /></button>
    </div>
  );
}
