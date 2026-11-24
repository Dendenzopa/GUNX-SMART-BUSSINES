import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { supabase } from "../lib/supabase";

type Metrics = {
  total_installs: number;
  installs_7d: number;
  installs_30d: number;
  registrations: number;
  active_7d: number;
  active_30d: number;
  total_shops: number;
};

function Metric({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return <View style={[s.metric, accent && s.metricAccent]}>
    <Text style={s.metricLabel}>{label}</Text>
    <Text style={s.metricValue}>{value.toLocaleString("en-US")}</Text>
  </View>;
}

function Module({ icon, title, description, status = "IN PREPARATION" }: { icon: string; title: string; description: string; status?: string }) {
  return <View style={s.module}>
    <View style={s.moduleIcon}><Text style={s.moduleIconText}>{icon}</Text></View>
    <View style={s.moduleCopy}><Text style={s.moduleTitle}>{title}</Text><Text style={s.moduleDescription}>{description}</Text></View>
    <Text style={s.moduleStatus}>{status}</Text>
  </View>;
}

export default function PlatformOwnerDashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("Inapakia takwimu za mfumo...");

  const load = useCallback(async () => {
    if (!supabase) { setNotice("Supabase haijaunganishwa."); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase.rpc("get_platform_metrics");
    if (error) {
      setMetrics(null);
      setNotice("Takwimu hazijapatikana: " + error.message + ". Hakikisha migration 0018 imetumika na akaunti imepewa Platform Admin.");
    } else {
      setMetrics(data as Metrics);
      setNotice("Takwimu zimechukuliwa moja kwa moja kutoka Supabase.");
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  return <View style={s.wrap}>
    <View style={s.brandRow}>
      <Image accessibilityLabel="GUNX SMART BUSINESS official logo" source={require("../../assets/GUNX20Smart20Business20Logo-1.jpg")} style={s.brandLogo} resizeMode="contain"/>
      <View><Text style={s.brandName}>GUNX <Text style={s.brandGold}>SMART</Text></Text><Text style={s.brandSub}>BUSINESS · PLATFORM CONTROL</Text></View>
    </View>

    <View style={s.headingBlock}>
      <Text style={s.eyebrow}>SUPER ADMINISTRATOR</Text>
      <Text style={s.title}>Platform Overview</Text>
      <Text style={s.copy}>Usimamizi wa mfumo mzima wa GUNX SMART BUSINESS. Takwimu hapa ni za majukwaa yote, si za biashara moja.</Text>
    </View>

    <View style={s.sectionHeading}><Text style={s.sectionTitle}>Platform statistics</Text><Text style={s.liveTag}>LIVE DATA</Text></View>
    {loading && <View style={s.loading}><ActivityIndicator color="#43C99A"/><Text style={s.copy}>Inasoma taarifa kutoka server...</Text></View>}
    {metrics && <>
      <View style={s.grid}>
        <Metric label="TOTAL BUSINESSES" value={metrics.total_shops} accent/>
        <Metric label="REGISTERED USERS" value={metrics.registrations}/>
        <Metric label="ACTIVE USERS · 7 DAYS" value={metrics.active_7d}/>
        <Metric label="ACTIVE USERS · 30 DAYS" value={metrics.active_30d}/>
        <Metric label="APP INSTALLS · TOTAL" value={metrics.total_installs}/>
        <Metric label="NEW INSTALLS · 7 DAYS" value={metrics.installs_7d}/>
        <Metric label="NEW INSTALLS · 30 DAYS" value={metrics.installs_30d}/>
      </View>
      <Text style={s.footnote}>Installations huhesabiwa pale app inapofunguliwa na akaunti kuthibitishwa na server; si idadi halisi ya APK zilizopakuliwa.</Text>
    </>}

    <View style={s.sectionHeading}><Text style={s.sectionTitle}>Platform management</Text></View>
    <Module icon="▦" title="Businesses" description="Orodha ya biashara zote zilizosajiliwa na taarifa za akaunti." status="NEXT MODULE"/>
    <Module icon="♙" title="User accounts & roles" description="Watumiaji, Super Admin, Boss na Staff pamoja na ruhusa zao." status="NEXT MODULE"/>
    <Module icon="◇" title="Subscriptions & billing" description="Mipango ya Free/Pro, malipo na hali ya usajili." status="NEXT MODULE"/>
    <Module icon="↗" title="Platform revenue · TZS" description="Mapato ya mfumo na mwenendo wa malipo yaliyothibitishwa." status="NEXT MODULE"/>
    <Module icon="◉" title="System health & security" description="Hali ya huduma, uptime, matukio na kumbukumbu za usalama." status="NEXT MODULE"/>

    <Pressable onPress={() => void load()} style={s.refresh}><Text style={s.refreshText}>↻  Refresh platform data</Text></Pressable>
    <Text style={s.notice}>{notice}</Text>
    <Text style={s.disclaimer}>Vipengele vilivyoandikwa NEXT MODULE bado havijaunganishwa na data/action za moja kwa moja. Havijaonyeshwa kama vimekamilika.</Text>
  </View>;
}

const s = StyleSheet.create({
  wrap: { padding: 16, paddingBottom: 38, maxWidth: 900, width: "100%", alignSelf: "center" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 11, padding: 13, backgroundColor: "#102438", borderWidth: 1, borderColor: "#1D3A50", borderRadius: 15, marginBottom: 18 },
  brandLogo: { width: 66, height: 48 },
  brandName: { color: "#F4F7FA", fontSize: 17, fontWeight: "900", letterSpacing: 1 },
  brandGold: { color: "#D7B56D" },
  brandSub: { color: "#75E0B8", fontSize: 8, fontWeight: "900", letterSpacing: 1.5, marginTop: 3 },
  headingBlock: { marginBottom: 16 },
  eyebrow: { color: "#43C99A", fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  title: { color: "#F4F7FA", fontSize: 27, fontWeight: "900", marginTop: 6 },
  copy: { color: "#91A4B5", fontSize: 12, lineHeight: 19, marginTop: 7 },
  sectionHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12, marginBottom: 10 },
  sectionTitle: { color: "#F4F7FA", fontSize: 15, fontWeight: "900" },
  liveTag: { color: "#75E0B8", backgroundColor: "#173D36", paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20, fontSize: 8, fontWeight: "900" },
  loading: { padding: 18, alignItems: "center", backgroundColor: "#102438", borderRadius: 13 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  metric: { width: "48%", minHeight: 91, padding: 13, backgroundColor: "#102438", borderRadius: 13, borderWidth: 1, borderColor: "#1D3A50", justifyContent: "center" },
  metricAccent: { borderColor: "#43C99A", backgroundColor: "#12332F" },
  metricLabel: { color: "#91A4B5", fontSize: 9, fontWeight: "900", letterSpacing: 0.4 },
  metricValue: { color: "#F4F7FA", fontSize: 23, fontWeight: "900", marginTop: 8 },
  footnote: { color: "#8194A5", fontSize: 10, lineHeight: 16, marginTop: 10 },
  module: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, backgroundColor: "#102438", borderRadius: 13, borderWidth: 1, borderColor: "#1D3A50", marginTop: 8 },
  moduleIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: "#173D36", alignItems: "center", justifyContent: "center" },
  moduleIconText: { color: "#D7B56D", fontSize: 20, fontWeight: "900" },
  moduleCopy: { flex: 1 },
  moduleTitle: { color: "#F4F7FA", fontSize: 12, fontWeight: "900" },
  moduleDescription: { color: "#91A4B5", fontSize: 10, lineHeight: 15, marginTop: 3 },
  moduleStatus: { color: "#D7B56D", fontSize: 7, fontWeight: "900", maxWidth: 72, textAlign: "right" },
  refresh: { backgroundColor: "#16785C", padding: 13, borderRadius: 11, alignItems: "center", marginTop: 16 },
  refreshText: { color: "#F5FFFA", fontSize: 12, fontWeight: "900" },
  notice: { color: "#75E0B8", backgroundColor: "#102D2C", padding: 12, borderRadius: 10, fontSize: 11, marginTop: 12 },
  disclaimer: { color: "#8194A5", fontSize: 10, lineHeight: 15, marginTop: 10 }
});
