// Supabase Edge Function: invite a staff member by email.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return new Response(JSON.stringify({ error: "Server configuration incomplete" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Authentication required" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const { data: authData, error: authError } = await callerClient.auth.getUser();
  if (authError || !authData.user) return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  let body: { shopId?: string; email?: string; role?: string };
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
  const shopId = body.shopId?.trim();
  const email = body.email?.trim().toLowerCase();
  const role = body.role;
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!shopId || !uuidPattern.test(shopId) || !email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !["manager", "cashier", "stockkeeper"].includes(role ?? "")) {
    return new Response(JSON.stringify({ error: "Provide a valid shop, email and staff role" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: ownerMembership, error: ownerError } = await admin.from("shop_members").select("role").eq("shop_id", shopId).eq("user_id", authData.user.id).maybeSingle();
  if (ownerError || ownerMembership?.role !== "owner") return new Response(JSON.stringify({ error: "Only the shop owner can invite staff" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email);
  if (inviteError || !inviteData.user) return new Response(JSON.stringify({ error: inviteError?.message ?? "Invitation could not be created" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const { error: memberError } = await admin.from("shop_members").upsert(
    { shop_id: shopId, user_id: inviteData.user.id, role },
    { onConflict: "shop_id,user_id", ignoreDuplicates: true },
  );
  if (memberError) return new Response(JSON.stringify({ error: "Invitation sent but membership could not be saved. Contact the shop owner/support." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  return new Response(JSON.stringify({ invited: true, email, role }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
