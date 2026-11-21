// Trusted manual GUNX PRO activation endpoint.
// Configure GUNX_PRO_ADMIN_TOKEN as a Supabase Edge Function secret.
// Verify the payment in the provider/bank statement before calling this endpoint.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-gunx-admin-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const expectedToken = Deno.env.get("GUNX_PRO_ADMIN_TOKEN");
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!expectedToken || !url || !serviceKey) return json({ error: "Server configuration incomplete" }, 500);

  const suppliedToken = req.headers.get("x-gunx-admin-token") ?? "";
  if (suppliedToken.length !== expectedToken.length) return json({ error: "Unauthorized" }, 401);
  let tokenDiff = 0;
  for (let i = 0; i < expectedToken.length; i += 1) tokenDiff |= expectedToken.charCodeAt(i) ^ suppliedToken.charCodeAt(i);
  if (tokenDiff !== 0) return json({ error: "Unauthorized" }, 401);

  let body: { paymentRequestId?: string; adminNote?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!body.paymentRequestId || !uuid.test(body.paymentRequestId)) return json({ error: "Valid paymentRequestId required" }, 400);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await admin.rpc("admin_activate_pro", {
    p_payment_request_id: body.paymentRequestId,
    p_admin_note: body.adminNote?.slice(0, 500) ?? null,
  });
  if (error) return json({ error: error.message }, 400);
  return json(data);
});
