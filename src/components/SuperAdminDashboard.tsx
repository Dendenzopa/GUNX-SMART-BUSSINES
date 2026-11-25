import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Image, Pressable, SafeAreaView, ScrollView,
  StatusBar, StyleSheet, Text, TextInput, View
} from "react-native";
import { supabase } from "../lib/supabase";

type AdminTab = "Overview" | "Businesses" | "Users" | "Payments" | "Audit" | "System" | "Settings";
type Row = Record<string, any>;

function money(value: unknown) {
  const amount = Number(value ?? 0);
  return "TZS " + (Number.isFinite(amount) ? amount.toLocaleString("en-TZ", { maximumFractionDigits: 0 }) : "0");
}
function date(value: unknown) {
  if (!value) return "—";
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString("sw-TZ");
}
function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return <View style={s.metric}><Text style={s.metricLabel}>{label}</Text><Text style={s.metricValue}>{value}</Text>{!!note && <Text style={s.muted}>{note}</Text>}</View>;
}
function ActionButton({ label, onPress, quiet = false }: { label: string; onPress: () => void; quiet?: boolean }) {
  return <Pressable onPress={onPress} style={[s.button, quiet && s.buttonQuiet]}><Text style={s.buttonText}>{label}</Text></Pressable>;
}
function RecordCard({ title, subtitle, lines = [] }: { title: string; subtitle?: string; lines?: string[] }) {
  return <View style={s.card}><Text style={s.recordTitle}>{title || "—"}</Text>{!!subtitle && <Text style={s.muted}>{subtitle}</Text>}{lines.filter(Boolean).map((line, index) => <Text key={index} style={s.recordLine}>{line}</Text>)}</View>;
}

export default function SuperAdminDashboard({ onOpenBusiness }: { onOpenBusiness?: () => void }) {
  const [tab, setTab] = useState<AdminTab>("Overview");
  const [metrics, setMetrics] = useState<Row>({});
  const [subscriptions, setSubscriptions] = useState<Row>({});
  const [businesses, setBusinesses] = useState<Row[]>([]);
  const [users, setUsers] = useState<Row[]>([]);
  const [payments, setPayments] = useState<Row[]>([]);
  const [logs, setLogs] = useState<Row[]>([]);
  const [health, setHealth] = useState<Row[]>([]);
  const [settings, setSettings] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!supabase) { setError("Supabase haijaunganishwa."); return; }
    setLoading(true);
    setError("");
    try {
      if (tab === "Overview") {
        const [m, sub, b, a, h] = await Promise.all([
          supabase.rpc("get_platform_metrics"),
          supabase.rpc("get_platform_subscription_metrics"),
          supabase.rpc("get_platform_businesses", { p_search: null, p_limit: 5, p_offset: 0 }),
          supabase.rpc("get_platform_audit_logs", { p_limit: 5 }),
          supabase.rpc("get_platform_health_checks", { p_limit: 5 }),
        ]);
        const firstError = [m, sub, b, a, h].find(result => result.error)?.error;
        if (firstError) throw firstError;
        setMetrics(m.data ?? {});
        setSubscriptions(sub.data ?? {});
        setBusinesses(Array.isArray(b.data) ? b.data : []);
        setLogs(Array.isArray(a.data) ? a.data : []);
        setHealth(Array.isArray(h.data) ? h.data : []);
      } else if (tab === "Businesses") {
        const { data, error: rpcError } = await supabase.rpc("get_platform_businesses", { p_search: search.trim() || null, p_limit: 50, p_offset: 0 });
        if (rpcError) throw rpcError;
        setBusinesses(Array.isArray(data) ? data : []);
      } else if (tab === "Users") {
        const { data, error: rpcError } = await supabase.rpc("get_platform_admin_users", { p_search: search.trim() || null, p_limit: 50, p_offset: 0 });
        if (rpcError) throw rpcError;
        setUsers(Array.isArray(data) ? data : []);
      } else if (tab === "Payments") {
        const { data, error: rpcError } = await supabase.rpc("get_platform_payment_requests", { p_status: null, p_limit: 50, p_offset: 0 });
        if (rpcError) throw rpcError;
        setPayments(Array.isArray(data) ? data : []);
      } else if (tab === "Audit") {
        const { data, error: rpcError } = await supabase.rpc("get_platform_audit_logs", { p_limit: 100 });
        if (rpcError) throw rpcError;
        setLogs(Array.isArray(data) ? data : []);
      } else if (tab === "System") {
        const { data, error: rpcError } = await supabase.rpc("get_platform_health_checks", { p_limit: 50 });
        if (rpcError) throw rpcError;
        setHealth(Array.isArray(data) ? data : []);
      } else if (tab === "Settings") {
        const { data, error: rpcError } = await supabase.rpc("get_platform_settings");
        if (rpcError) throw rpcError;
        setSettings(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Imeshindikana kupakia taarifa za Super Admin.");
    } finally {
      setLoading(false);
    }
  }, [tab, search]);

  useEffect(() => { void load(); }, [load]);

  function renderOverview() {
    return <>
      <View style={s.hero}>
        <Text style={s.eyebrow}>PLATFORM CONTROL CENTER</Text>
        <Text style={s.heroTitle}>Super Admin</Text>
        <Text style={s.muted}>Usimamizi wa GUNX yote kwa takwimu za jukwaa pekee.</Text>
      </View>
      <View style={s.grid}>
        <Metric label="BUSINESSES" value={String(metrics.total_shops ?? 0)} />
        <Metric label="REGISTERED USERS" value={String(metrics.registrations ?? 0)} />
        <Metric label="ACTIVE USERS · 7D" value={String(metrics.active_7d ?? 0)} />
        <Metric label="APP INSTALLS" value={String(metrics.total_installs ?? 0)} />
        <Metric label="ACTIVE PRO" value={String(subscriptions.active_pro ?? 0)} />
        <Metric label="PENDING GUNX PAYMENTS" value={String(subscriptions.pending_payments ?? 0)} />
        <Metric label="VERIFIED GUNX REVENUE" value={money(subscriptions.verified_revenue_tzs)} note="Malipo ya subscription ya GUNX pekee" />
        <Metric label="VERIFIED PAYMENTS" value={String(subscriptions.verified_payments ?? 0)} />
      </View>
      <Text style={s.sectionTitle}>Biashara zilizosajiliwa hivi karibuni</Text>
      {businesses.length ? businesses.map((b, i) => <RecordCard key={String(b.shop_id ?? i)} title={String(b.business_name ?? "Biashara")} subtitle={String(b.owner_email ?? "Mmiliki")} lines={["Plan: " + (b.plan_code ?? "free") + " · " + (b.subscription_status ?? "free"), "Wanachama: " + (b.member_count ?? 0), "Imesajiliwa: " + date(b.created_at)]} />) : <Text style={s.muted}>Hakuna biashara ya kuonyesha.</Text>}
      <Text style={s.sectionTitle}>Hali ya mfumo</Text>
      {health.length ? health.map((h, i) => <RecordCard key={String(h.id ?? i)} title={String(h.service ?? "Service")} subtitle={"Hali: " + String(h.status ?? "unknown")} lines={["Response: " + (h.response_time_ms == null ? "—" : h.response_time_ms + " ms"), "Ukaguzi: " + date(h.checked_at)]} />) : <Text style={s.muted}>Hakuna health check iliyorekodiwa. Hali ya uptime haijathibitishwa.</Text>}
      <Text style={s.sectionTitle}>Matukio ya hivi karibuni</Text>
      {logs.length ? logs.map((l, i) => <RecordCard key={String(l.id ?? i)} title={String(l.action ?? "Activity")} subtitle={String(l.target_type ?? "platform")} lines={[date(l.created_at)]} />) : <Text style={s.muted}>Hakuna audit event ya kuonyesha.</Text>}
    </>;
  }

  function renderBusinesses() {
    return <>
      <Text style={s.pageTitle}>Business Directory</Text>
      <Text style={s.muted}>Taarifa za usajili na subscription pekee. Hakuna mauzo, faida, gharama au wateja wanaoonyeshwa.</Text>
      <View style={s.searchRow}><TextInput value={search} onChangeText={setSearch} onSubmitEditing={() => void load()} placeholder="Tafuta jina la biashara au email ya mmiliki" placeholderTextColor="#8194A5" style={s.searchInput}/><ActionButton label="Tafuta" onPress={() => void load()} /></View>
      {businesses.map((b, i) => <RecordCard key={String(b.shop_id ?? i)} title={String(b.business_name ?? "Biashara")} subtitle={String(b.owner_email ?? "Mmiliki")} lines={["Business ID: " + String(b.shop_id ?? "—"), "Owner ID: " + String(b.owner_id ?? "—"), "Members: " + String(b.member_count ?? 0), "Plan: " + String(b.plan_code ?? "free") + " · " + String(b.subscription_status ?? "free"), "Expiry: " + date(b.expires_at), "Created: " + date(b.created_at)]} />)}
      {!businesses.length && <Text style={s.muted}>Hakuna matokeo.</Text>}
    </>;
  }

  function renderUsers() {
    return <>
      <Text style={s.pageTitle}>Platform Users</Text>
      <Text style={s.muted}>Akaunti na roles za jukwaa/uanachama pekee; hakuna rekodi za wateja au miamala ya biashara.</Text>
      <View style={s.searchRow}><TextInput value={search} onChangeText={setSearch} onSubmitEditing={() => void load()} placeholder="Tafuta email au User ID" placeholderTextColor="#8194A5" style={s.searchInput}/><ActionButton label="Tafuta" onPress={() => void load()} /></View>
      {users.map((u, i) => <RecordCard key={String(u.user_id ?? i)} title={String(u.email ?? "User account")} subtitle={"User ID: " + String(u.user_id ?? "—")} lines={["Business memberships: " + String(u.shop_count ?? 0), "Roles: " + ((u.roles ?? []) as string[]).join(", "), "Registered: " + date(u.created_at)]} />)}
      {!users.length && <Text style={s.muted}>Hakuna watumiaji wa kuonyesha.</Text>}
    </>;
  }

  function renderPayments() {
    return <>
      <Text style={s.pageTitle}>GUNX Subscription Payments</Text>
      <Text style={s.muted}>Hapa ni malipo ya GUNX PRO pekee, si mauzo au malipo ya wateja wa biashara.</Text>
      {payments.map((p, i) => <RecordCard key={String(p.request_id ?? i)} title={String(p.business_name ?? "Business")} subtitle={money(p.amount_tzs) + " · " + String(p.provider ?? "—")} lines={["Status: " + String(p.status ?? "pending"), "Reference: " + String(p.transaction_reference ?? "—"), "Submitted: " + date(p.submitted_at), "Verified: " + date(p.verified_at)]} />)}
      {!payments.length && <Text style={s.muted}>Hakuna malipo ya GUNX yanayoonekana.</Text>}
    </>;
  }

  function renderAudit() {
    return <>
      <Text style={s.pageTitle}>Platform Audit Logs</Text>
      <Text style={s.muted}>Kumbukumbu za vitendo vya wasimamizi wa jukwaa. Hazipaswi kuwa na taarifa za siri za biashara.</Text>
      {logs.map((l, i) => <RecordCard key={String(l.id ?? i)} title={String(l.action ?? "Activity")} subtitle={String(l.target_type ?? "platform") + " · " + String(l.target_id ?? "—")} lines={["Actor: " + String(l.actor_id ?? "system"), "Time: " + date(l.created_at), "Details: " + JSON.stringify(l.metadata ?? {})]} />)}
      {!logs.length && <Text style={s.muted}>Hakuna audit logs.</Text>}
    </>;
  }

  function renderSystem() {
    return <>
      <Text style={s.pageTitle}>System Monitoring</Text>
      <Text style={s.muted}>Hali inategemea health checks halisi zilizorekodiwa. Hakuna uptime ya kubuni.</Text>
      {health.map((h, i) => <RecordCard key={String(h.id ?? i)} title={String(h.service ?? "Service")} subtitle={"Status: " + String(h.status ?? "unknown")} lines={["Response time: " + (h.response_time_ms == null ? "—" : h.response_time_ms + " ms"), "Checked: " + date(h.checked_at), "Details: " + JSON.stringify(h.details ?? {})]} />)}
      {!health.length && <Text style={s.notice}>Hakuna health checks zilizorekodiwa bado. Uptime, backup status na API latency hazijathibitishwa.</Text>}
    </>;
  }

  function renderSettings() {
    return <>
      <Text style={s.pageTitle}>Global Settings</Text>
      <Text style={s.muted}>Mipangilio ya jukwaa iliyopo kwenye database. Mabadiliko ya settings yataongezwa baada ya kila setting kupewa validation na audit rule.</Text>
      {settings.map((item, i) => <RecordCard key={String(item.key ?? i)} title={String(item.key ?? "Setting")} subtitle={String(item.description ?? "")} lines={["Value: " + JSON.stringify(item.value ?? {}), "Updated: " + date(item.updated_at)]} />)}
      {!settings.length && <Text style={s.muted}>Hakuna settings zilizowekwa.</Text>}
    </>;
  }

  const tabs: AdminTab[] = ["Overview", "Businesses", "Users", "Payments", "Audit", "System", "Settings"];
  return <SafeAreaView style={s.safe}>
    <StatusBar barStyle="light-content" backgroundColor="#081522" />
    <View style={s.header}>
      <View style={s.brandRow}>
        <Image source={require("../../assets/GUNX20Smart20Business20Logo-1.jpg")} style={s.logo} resizeMode="contain" />
        <View style={s.brandCopy}><Text style={s.eyebrow}>GUNX PLATFORM</Text><Text style={s.brand}>SUPER ADMIN</Text><Text style={s.muted}>Platform Control Center</Text></View>
      </View>
      <ActionButton label="Refresh" quiet onPress={() => void load()} />
    </View>
    <View style={s.privacy}><Text style={s.privacyTitle}>Your Business, Your Data, Your Privacy.</Text><Text style={s.privacyCopy}>Super Admin huona takwimu za jukwaa na taarifa za GUNX subscriptions pekee. Mauzo, faida, gharama na wateja wa biashara binafsi havionyeshwi.</Text></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.navScroll}><View style={s.nav}>{tabs.map(item => <Pressable key={item} onPress={() => { setTab(item); setError(""); }} style={[s.navItem, tab === item && s.navActive]}><Text style={[s.navText, tab === item && s.navTextActive]}>{item}</Text></Pressable>)}</View></ScrollView>
    <ScrollView contentContainerStyle={s.content}>
      {loading && <View style={s.loading}><ActivityIndicator color="#43C99A" /><Text style={s.muted}>Inapakia taarifa salama...</Text></View>}
      {!!error && <Text style={s.error}>{error}</Text>}
      {!!notice && <Text style={s.notice}>{notice}</Text>}
      {!loading && tab === "Overview" && renderOverview()}
      {!loading && tab === "Businesses" && renderBusinesses()}
      {!loading && tab === "Users" && renderUsers()}
      {!loading && tab === "Payments" && renderPayments()}
      {!loading && tab === "Audit" && renderAudit()}
      {!loading && tab === "System" && renderSystem()}
      {!loading && tab === "Settings" && renderSettings()}
      {!!onOpenBusiness && <View style={s.switchBox}><Text style={s.muted}>Unaweza pia kufungua biashara yako binafsi bila kuchanganya dashboard za roles.</Text><ActionButton label="Open my Business Dashboard" quiet onPress={onOpenBusiness} /></View>}
      <Text style={s.footer}>GUNX SMART BUSINESS · Your Business, Your Data, Your Privacy.</Text>
    </ScrollView>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#081522" },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  logo: { width: 62, height: 52 },
  brandCopy: { flex: 1 },
  brand: { color: "#F4F7FA", fontSize: 19, fontWeight: "900", letterSpacing: 0.7 },
  eyebrow: { color: "#43C99A", fontSize: 9, fontWeight: "900", letterSpacing: 1.4 },
  muted: { color: "#91A4B5", fontSize: 11, lineHeight: 17, marginTop: 3 },
  privacy: { marginHorizontal: 14, marginBottom: 10, borderWidth: 1, borderColor: "#92743D", backgroundColor: "#17283A", borderRadius: 13, padding: 13 },
  privacyTitle: { color: "#E6C77D", fontSize: 14, fontWeight: "900", textAlign: "center" },
  privacyCopy: { color: "#C4D0D9", fontSize: 11, lineHeight: 17, textAlign: "center", marginTop: 5 },
  navScroll: { maxHeight: 48 },
  nav: { flexDirection: "row", gap: 7, paddingHorizontal: 14, paddingBottom: 7 },
  navItem: { paddingHorizontal: 13, paddingVertical: 10, borderRadius: 10, backgroundColor: "#102438" },
  navActive: { backgroundColor: "#174A40", borderWidth: 1, borderColor: "#43C99A" },
  navText: { color: "#91A4B5", fontSize: 11, fontWeight: "800" },
  navTextActive: { color: "#75E0B8" },
  content: { padding: 14, paddingBottom: 38, width: "100%", maxWidth: 1000, alignSelf: "center" },
  hero: { backgroundColor: "#102438", borderColor: "#1D3A50", borderWidth: 1, borderRadius: 16, padding: 17, marginBottom: 12 },
  heroTitle: { color: "#F4F7FA", fontSize: 25, fontWeight: "900", marginTop: 5 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  metric: { width: "48%", minHeight: 86, padding: 12, backgroundColor: "#102438", borderWidth: 1, borderColor: "#1D3A50", borderRadius: 13, justifyContent: "center", flexGrow: 1 },
  metricLabel: { color: "#91A4B5", fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  metricValue: { color: "#F2D99F", fontSize: 20, fontWeight: "900", marginTop: 7 },
  sectionTitle: { color: "#F4F7FA", fontSize: 16, fontWeight: "900", marginTop: 18, marginBottom: 8 },
  pageTitle: { color: "#F4F7FA", fontSize: 23, fontWeight: "900", marginBottom: 4 },
  card: { backgroundColor: "#102438", borderWidth: 1, borderColor: "#1D3A50", borderRadius: 12, padding: 13, marginTop: 8 },
  recordTitle: { color: "#F4F7FA", fontSize: 13, fontWeight: "900" },
  recordLine: { color: "#C4D0D9", fontSize: 11, lineHeight: 17, marginTop: 4 },
  searchRow: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 12, marginBottom: 7 },
  searchInput: { flex: 1, backgroundColor: "#0B1B2A", borderWidth: 1, borderColor: "#2B4B61", borderRadius: 10, color: "#F4F7FA", paddingHorizontal: 11, paddingVertical: 10, fontSize: 11 },
  button: { backgroundColor: "#16785C", paddingHorizontal: 13, paddingVertical: 10, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  buttonQuiet: { backgroundColor: "#173247", borderWidth: 1, borderColor: "#2B4B61" },
  buttonText: { color: "#F5FFFA", fontSize: 10, fontWeight: "900" },
  loading: { alignItems: "center", padding: 18, gap: 7 },
  error: { color: "#FFD2D2", backgroundColor: "#512A34", padding: 12, borderRadius: 10, marginBottom: 10, fontSize: 11 },
  notice: { color: "#F2D99F", backgroundColor: "#3C3423", padding: 12, borderRadius: 10, marginTop: 10, fontSize: 11, lineHeight: 16 },
  switchBox: { borderTopWidth: 1, borderTopColor: "#1D3A50", marginTop: 20, paddingTop: 14, gap: 8 },
  footer: { color: "#71869A", fontSize: 10, textAlign: "center", marginTop: 22 }
});
