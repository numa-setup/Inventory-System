"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

async function requireManager() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "owner" && user.role !== "manager")) return null;
  return user;
}

function revalidate() {
  revalidatePath("/categories");
  revalidatePath("/products");
}

async function nameClashes(
  db: ReturnType<typeof createAdminClient>,
  name: string,
  parentId: string | null,
  excludeId?: string,
) {
  let q = db.from("categories").select("id").ilike("name", name);
  q = parentId ? q.eq("parent_id", parentId) : q.is("parent_id", null);
  if (excludeId) q = q.neq("id", excludeId);
  const { data } = await q.limit(1).maybeSingle();
  return Boolean(data);
}

/** Create a category, or a sub-category when parent_id is given (one level deep). */
export async function createCategory(input: { name: string; parent_id?: string | null }) {
  if (!(await requireManager())) return { error: "Not authorized." };
  const name = input.name.trim();
  if (!name) return { error: "Please enter a name." };
  const parentId = input.parent_id || null;
  const db = createAdminClient();

  if (parentId) {
    const { data: parent } = await db.from("categories").select("id, parent_id").eq("id", parentId).maybeSingle();
    if (!parent) return { error: "Parent category not found." };
    if (parent.parent_id) return { error: "Sub-categories can only be one level deep." };
  }
  if (await nameClashes(db, name, parentId)) return { error: "A category with this name already exists here." };

  const { error } = await db.from("categories").insert({ name, parent_id: parentId });
  if (error) return { error: error.message };
  revalidate();
  return { ok: true as const };
}

/** Rename a category (parent stays fixed to keep the tree one level deep). */
export async function updateCategory(id: string, input: { name: string }) {
  if (!(await requireManager())) return { error: "Not authorized." };
  const name = input.name.trim();
  if (!name) return { error: "Please enter a name." };
  const db = createAdminClient();

  const { data: cat } = await db.from("categories").select("id, parent_id").eq("id", id).maybeSingle();
  if (!cat) return { error: "Category not found." };
  if (await nameClashes(db, name, cat.parent_id as string | null, id)) {
    return { error: "A category with this name already exists here." };
  }

  const { error } = await db.from("categories").update({ name }).eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true as const };
}

/** Delete a category — blocked while it still has sub-categories or products. */
export async function deleteCategory(id: string) {
  if (!(await requireManager())) return { error: "Not authorized." };
  const db = createAdminClient();

  const head = { count: "exact" as const, head: true };
  const [{ count: children }, { count: products }] = await Promise.all([
    db.from("categories").select("id", head).eq("parent_id", id),
    db.from("products").select("id", head).eq("category_id", id),
  ]);
  if ((children ?? 0) > 0) return { error: "This category still has sub-categories. Delete or move them first." };
  if ((products ?? 0) > 0) return { error: `This category is used by ${products} product${products === 1 ? "" : "s"}. Reassign them first.` };

  const { error } = await db.from("categories").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true as const };
}
