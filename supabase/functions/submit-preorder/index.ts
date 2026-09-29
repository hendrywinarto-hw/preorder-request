import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const clean = (value: FormDataEntryValue | null, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > 27 * 1024 * 1024) return json({ error: "Request is too large." }, 413);
    const form = await req.formData();
    if (clean(form.get("website"), 100)) return json({ error: "Invalid submission." }, 400);

    const customerName = clean(form.get("name"), 100);
    const phone = clean(form.get("phone"), 30);
    const email = clean(form.get("email"), 150);
    const destinationAddress = clean(form.get("address"), 500);
    const totalItems = Number(clean(form.get("totalItems"), 4));
    const weightRaw = clean(form.get("totalKg"), 20);
    const estimatedWeightKg = weightRaw ? Number(weightRaw) : null;

    if (!customerName || phone.length < 6 || destinationAddress.length < 5 || !Number.isInteger(totalItems) || totalItems < 1 || totalItems > 999) return json({ error: "Please check the required fields." }, 400);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Please enter a valid email." }, 400);
    if (estimatedWeightKg !== null && (!Number.isFinite(estimatedWeightKg) || estimatedWeightKg <= 0 || estimatedWeightKg > 9999)) return json({ error: "Please enter a valid weight." }, 400);

    const photos = form.getAll("photos").filter((v): v is File => v instanceof File && v.size > 0);
    if (photos.length > 5) return json({ error: "Maximum 5 photos." }, 400);
    const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
    for (const photo of photos) if (!allowed.has(photo.type) || photo.size > 5 * 1024 * 1024) return json({ error: "Photos must be JPG, PNG or WebP and no larger than 5 MB each." }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const { data: requestRow, error: requestError } = await supabase.from("preorder_requests").insert({ customer_name: customerName, phone, email: email || null, destination_address: destinationAddress, total_items: totalItems, estimated_weight_kg: estimatedWeightKg }).select("id,request_number").single();
    if (requestError) throw requestError;

    const uploaded: string[] = [];
    try {
      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        const ext = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
        const path = `${requestRow.id}/${crypto.randomUUID()}-${i + 1}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("preorder-photos").upload(path, photo, { contentType: photo.type, upsert: false });
        if (uploadError) throw uploadError;
        uploaded.push(path);
        const { error: photoError } = await supabase.from("preorder_photos").insert({ preorder_request_id: requestRow.id, storage_path: path, original_filename: photo.name.slice(0, 255), mime_type: photo.type, size_bytes: photo.size });
        if (photoError) throw photoError;
      }
    } catch (photoFailure) {
      if (uploaded.length) await supabase.storage.from("preorder-photos").remove(uploaded);
      await supabase.from("preorder_requests").delete().eq("id", requestRow.id);
      throw photoFailure;
    }
    return json({ requestNumber: requestRow.request_number }, 201);
  } catch (error) {
    console.error("submit-preorder", error);
    return json({ error: "We couldn't submit your request. Please try again." }, 500);
  }
});
