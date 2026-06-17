-- ------------------------------------------------------------
-- Product images: a public storage bucket for product photos.
-- ------------------------------------------------------------
-- Uploads go through the service-role server action (bypasses RLS); the bucket
-- is public so the photo URLs render on the admin and the storefront without
-- auth. products.image_url holds the primary photo (used by catalog_index and
-- store_catalog).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880,
        array['image/png','image/jpeg','image/jpg','image/webp','image/avif'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
