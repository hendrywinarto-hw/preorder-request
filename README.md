# Preorder Request

Mobile-first customer preorder request form backed by Supabase.

## V1
- Full name, phone, optional email
- Destination address
- Total item count and optional estimated weight
- Up to 5 item photos (JPG/PNG/WebP, max 5 MB each)
- Client + server validation
- Private photo storage
- Server-generated request references (`PR-000001`, ...)
- Success/reference state after submission

## Architecture
Static HTML/CSS/JS frontend → Supabase Edge Function → Postgres + private Storage.

The browser has no privileged database credential. `submit-preorder` validates the request, creates the database record, uploads photos with the server-side service role, records photo metadata, and rolls back the request/uploads if photo processing fails.

## Security
- RLS enabled on `preorder_requests` and `preorder_photos` with no public access policies (deny-by-default).
- `preorder-photos` is private, limited to JPG/PNG/WebP and 5 MB per object.
- Edge Function enforces field, item-count, weight, photo-count/type/size and overall request-size validation.
- Service-role credentials remain server-side only.

## Backend
Supabase project: `preorder-request` (`zxyqnfhvnzktadictfbe`)

Edge Function: `submit-preorder`

Schema changes are tracked in Supabase migrations and the deployed Edge Function source is mirrored under `supabase/functions/submit-preorder/`.
