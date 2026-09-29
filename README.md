# Preorder Request

Mobile-first customer preorder request form.

## V1 scope
- Full name, phone, optional email
- Destination address
- Total item count and optional estimated weight
- Up to 5 item photos (JPG/PNG/WebP, max 5 MB each)
- Client-side validation and mobile photo-picker UX
- Human-readable request reference after successful submission
- Backend-ready integration boundary

## Architecture
Static HTML/CSS/JS frontend. The intended backend is a dedicated Supabase project using Postgres + Storage. Submission should go through a controlled server/API boundary so database writes, request-number generation and file handling can be validated server-side rather than trusting the browser.

## Supabase phase
When the dedicated free Supabase project is available:
1. Create `preorder_requests` and `preorder_photos` tables.
2. Create a private `preorder-photos` Storage bucket.
3. Add RLS/policies so public users cannot enumerate or read requests/photos.
4. Add the submission API/Edge Function and server-side validation.
5. Generate request numbers server-side (for example `PR-000001`).
6. Connect `config.js` to the deployed submission endpoint.
7. Test create + multi-photo upload end-to-end.

Do not commit Supabase service-role credentials to this repository.
