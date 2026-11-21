import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
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

function Metric({ label, value }: { label: string; value: number }) {
  return <View style={s.metric}><Text style={s.label}>{label}</Text><Text style={s.value}>{value.toLocaleString("en-US")}</Text></View>;
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
      setNotice("Takwimu hazijapatikana: " + error.message + ". Hakikisha migration 0018 imetumika na akaunti yako imepewa Platform Admin.");
    } else {
      setMetrics(data as Metrics);
      setNotice("Takwimu zimechukuliwa moja kwa moja kutoka Supabase.");
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  return <View style={s.wrap}>
    <Text style={s.eyebrow}>GUNX SMART BUSINESS · CONTROL CENTRE</Text>
    <Text style={s.title}>Platform Owner</Text>
    <Text style={s.copy}>Takwimu za matumizi ya mfumo mzima. Installation huhesabiwa baada ya mtumiaji kuingia na kuthibitishwa na server; kila akaunti huhesabiwa mara moja tu. Hizi si idadi ya APK zilizopakuliwa.</Text>
    {loading && <ActivityIndicator color="#43C99A" />}
    {metrics && <>
      <View style={s.grid}>
        <Metric label="INSTALLS ZILIZOTHIBITISHWA" value={metrics.total_installs} />
        <Metric label="INSTALLS · SIKU 7" value={metrics.installs_7d} />
        <Metric label="INSTALLS · SIKU 30" value={metrics.installs_30d} />
        <Metric label="AKAUNTI ZILIZOSAJILIWA" value={metrics.registrations} />
        <Metric label="ACTIVE USERS · SIKU 7" value={metrics.active_7d} />
        <Metric label="ACTIVE USERS · SIKU 30" value={metrics.active_30d} />
        <Metric label="BIASHARA ZOTE" value={metrics.total_shops} />
      </View>
      <Text style={s.copy}>Ulinzi huu huzuia wageni wasioingia na akaunti moja kuongeza idadi ya installs kwa kutuma IDs nyingi. Hata hivyo, si uthibitisho wa kifaa halisi; kwa uthibitisho wa kifaa na APK rasmi tutahitaji Android Play Integrity na signing key iliyohifadhiwa salama.</Text>
    </>}
    <Pressable onPress={() => void load()} style={s.button}><Text style={s.buttonText}>↻ Sasisha takwimu</Text></Pressable>
    <Text style={s.notice}>{notice}</Text>
  </View>;
}

const s = StyleSheet.create({
  wrap: { padding: 16, paddingBottom: 36, maxWidth: 900, width: "100%", alignSelf: "center" },
  eyebrow: { color: "#43C99A", fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: "#F4F7FA", fontSize: 25, fontWeight: "900", marginTop: 8 },
  copy: { color: "#91A4B5", fontSize: 12, lineHeight: 19, marginTop: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginTop: 14 },
  metric: { width: "48%", minHeight: 88, padding: 13, backgroundColor: "#102438", borderRadius: 13, borderWidth: 1, borderColor: "#1D3A50", justifyContent: "center" },
  label: { color: "#91A4B5", fontSize: 9, fontWeight: "800" },
  value: { color: "#F4F7FA", fontSize: 22, fontWeight: "900", marginTop: 8 },
  button: { alignSelf: "flex-start", backgroundColor: "#16785C", padding: 12, borderRadius: 10, marginTop: 15 },
  buttonText: { color: "#F5FFFA", fontSize: 12, fontWeight: "800" },
  notice: { color: "#75E0B8", backgroundColor: "#102D2C", padding: 12, borderRadius: 10, fontSize: 12, marginTop: 14 }
});
