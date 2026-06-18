-- ------------------------------------------------------------
-- Round 6 / Part 3 — storage bucket for generated receipt PDFs
-- ------------------------------------------------------------
-- WhatsApp's Cloud API fetches the document from a public URL, so the bucket is
-- public; filenames include the receipt number + timestamp (unguessable enough
-- for a store) and the PDF stays available for the customer to re-open.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', true, 2097152, array['application/pdf'])
on conflict (id) do nothing;
