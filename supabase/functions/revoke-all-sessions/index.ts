import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const allowedOrigin = Deno.env.get("APP_ALLOWED_ORIGIN");
  const headers = {
    ...corsHeaders,
    ...(origin && allowedOrigin && origin === allowedOrigin ? { "Access-Control-Allow-Origin": origin } : {}),
  };

  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const authorization = req.headers.get("Authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    return new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401, headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Recovery service is not configured" }), {
      status: 503, headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await callerClient.auth.getUser(token);
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: "Invalid or expired session" }), {
      status: 401, headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const writeEvent = async (eventType: string) => {
    const { error } = await admin.from("account_security_events").insert({
      user_id: userData.user.id,
      event_type: eventType,
    });
    return error;
  };

  const auditStartError = await writeEvent("all_sessions_revocation_requested");
  if (auditStartError) {
    return new Response(JSON.stringify({ error: "Could not write security audit event; no sessions were revoked" }), {
      status: 500, headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  // Global scope intentionally revokes every session for this authenticated user.
  // It is not a per-device revocation API. The user must sign in again on the trusted device.
  const { error: revokeError } = await admin.auth.admin.signOut(token, "global");
  if (revokeError) {
    await writeEvent("all_sessions_revocation_failed");
    return new Response(JSON.stringify({ error: "Could not revoke sessions. Please retry or contact support." }), {
      status: 502, headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const auditFinishError = await writeEvent("all_sessions_revocation_succeeded");
  if (auditFinishError) {
    // Revocation has already happened. Do not report it as failed.
    return new Response(JSON.stringify({
      success: true,
      auditWarning: "Sessions were revoked, but the completion audit event could not be written.",
    }), {
      status: 200, headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({
    success: true,
    message: "All sessions have been revoked. Sign in again on your trusted device.",
  }), {
    status: 200, headers: { ...headers, "Content-Type": "application/json" },
  });
});
