import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { supabase } from "../lib/supabase";

type PaymentRequest = {\n  request_id: string; shop_id: string; shop_name: string; submitted_by: string;\n  provider: string; amount_tzs: number; transaction_reference: string; payer_phone: string | null;\n  status: "pending" | "verified" | "rejected"; submitted_at: string; verified_at: string | null; admin_note: string | null;\n};\n\ntype Metrics = {
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
  const [notice, setNotice] = useState("Inapakia takwimu za mfumo...");\n  const [requests, setRequests] = useState<PaymentRequest[]>([]);\n  const [reviewingId, setReviewingId] = useState<string | null>(null);\n  const [paymentNote, setPaymentNote] = useState("");

  const loadRequests = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc("get_platform_payment_requests", { p_status: "pending", p_limit: 50 });
    if (error) { setRequests([]); setNotice("Orodha ya malipo haijapatikana: " + error.message); return; }
    setRequests((data ?? []) as PaymentRequest[]);
  }, []);

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

  useEffect(() => { void load(); }, [load]);\n\n  async function reviewPayment(requestId: string, approve: boolean) {
    if (!supabase) return;
    setReviewingId(requestId);
    const { error } = await supabase.rpc("review_platform_pro_payment", {
      p_payment_request_id: requestId,
      p_approve: approve,
      p_admin_note: paymentNote.trim() || null
    });
    setReviewingId(null);
    if (error) {
      setNotice("Uhakiki wa malipo umeshindikana: " + error.message);
      return;
    }
    setPaymentNote("");
    await load();
    setNotice(approve
      ? "Malipo yamethibitishwa. GUNX PRO imewashwa kwa siku 30."
      : "Ombi la malipo limekataliwa na kurekodiwa.");
  }



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
    <View style={s.paymentQueue}>
      <Text style={s.queueTitle}>Uhakiki wa malipo ya GUNX PRO</Text>
      <Text style={s.copy}>Ombi la malipo ya TZS 5,000 litabaki pending hadi uthibitishe kumbukumbu kwa njia ya malipo husika. Kuidhinisha huongeza siku 30 za PRO; kukataa hakuwashi usajili.</Text>
      <Text style={s.queueCount}>Maombi yanayosubiri: {requests.length}</Text>
      <Text style={s.formLabel}>Maelezo ya msimamizi (hiari)</Text>
      <TextInput value={paymentNote} onChangeText={setPaymentNote} placeholder="Andika kumbukumbu ya uhakiki..." placeholderTextColor="#71869A" style={s.noteInput}/>
      {requests.map(request => <View key={request.request_id} style={s.requestCard}>
        <Text style={s.requestShop}>{request.shop_name}</Text>
        <Text style={s.requestLine}>Kiasi: TZS {Number(request.amount_tzs).toLocaleString("en-US")} · Mtandao: {request.provider}</Text>
        <Text style={s.requestLine}>Transaction ID: {request.transaction_reference}</Text>
        <Text style={s.requestLine}>Simu ya mtumaji: {request.payer_phone || "Haijawekwa"}</Text>
        <Text style={s.requestLine}>Tarehe: {new Date(request.submitted_at).toLocaleString("sw-TZ")}</Text>
        <Text style={s.requestLine}>Shop ID: {request.shop_id}</Text>
        <View style={s.actionRow}>
          <Pressable disabled={reviewingId !== null} onPress={() => void reviewPayment(request.request_id, true)} style={[s.approveButton, reviewingId !== null && {opacity:0.5}]}>
            <Text style={s.buttonText}>{reviewingId === request.request_id ? "Inahakiki..." : "Thibitisha PRO"}</Text>
          </Pressable>
          <Pressable disabled={reviewingId !== null} onPress={() => void reviewPayment(request.request_id, false)} style={[s.rejectButton, reviewingId !== null && {opacity:0.5}]}>
            <Text style={s.buttonText}>Kataa ombi</Text>
          </Pressable>
        </View>
      </View>)}
      {requests.length === 0 && <Text style={s.copy}>Hakuna maombi ya malipo yanayosubiri kwa sasa.</Text>}
    </View>
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
  paymentQueue: { backgroundColor:"#102438", borderColor:"#1D3A50", borderWidth:1, borderRadius:14, padding:14, marginTop:18 },
  queueTitle: { color:"#F4F7FA", fontSize:16, fontWeight:"900" },
  queueCount: { color:"#F2D99F", fontSize:12, fontWeight:"900", marginTop:12 },
  formLabel: { color:"#D8E3EC", fontSize:11, fontWeight:"800", marginTop:12, marginBottom:6 },
  noteInput: { backgroundColor:"#0B1C2B", borderColor:"#31536A", borderWidth:1, borderRadius:9, padding:11, color:"#FFF", fontSize:12 },
  requestCard: { backgroundColor:"#0B1C2B", borderColor:"#31536A", borderWidth:1, borderRadius:11, padding:12, marginTop:11 },
  requestShop: { color:"#75E0B8", fontSize:14, fontWeight:"900" },
  requestLine: { color:"#D8E3EC", fontSize:11, lineHeight:18, marginTop:3 },
  actionRow: { flexDirection:"row", gap:8, marginTop:11 },
  approveButton: { flex:1, backgroundColor:"#16785C", padding:11, borderRadius:9, alignItems:"center" },
  rejectButton: { flex:1, backgroundColor:"#8A3E42", padding:11, borderRadius:9, alignItems:"center" },
  notice: { color: "#75E0B8", backgroundColor: "#102D2C", padding: 12, borderRadius: 10, fontSize: 12, marginTop: 14 }
});
