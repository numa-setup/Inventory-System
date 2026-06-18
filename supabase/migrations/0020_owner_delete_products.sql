-- ------------------------------------------------------------
-- Round 4 / Fix 1 — owner-only permanent product delete (RLS, defense in depth)
-- ------------------------------------------------------------
-- The privileged server action already checks role and gates on transaction
-- history, and runs as service_role (bypasses RLS). This RESTRICTIVE policy is a
-- second line of defence: any non-service-role DELETE on products is AND-ed with
-- is_owner(), so a manager (or any other authenticated path) can't delete a
-- product even though they can otherwise write to it.

drop policy if exists "owner only delete products" on public.products;
create policy "owner only delete products" on public.products
  as restrictive for delete to authenticated
  using (is_owner());
