import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { supabase } from "../lib/supabase";

type PaymentRequest = {
  request_id: string;
  shop_id: string;
  shop_name: string;
  submitted_by: string;
  provider: string;
  amount_tzs: number;
  transaction_reference: string;
  payer_phone: string | null;
  status: "pending" | "verified" | "rejected";
  submitted_at: string;
  verified_at: string | null;
  admin_note: string | null;
};

type ShopAccount = {
  shop_id: string; shop_name: string; owner_user_id: string; shop_created_at: string;
  plan_code: string; subscription_status: string; expires_at: string | null; pending_payment_count: number;
  is_suspended: boolean; suspension_reason: string | null;
};

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
  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [shops, setShops] = useState<ShopAccount[]>([]);
  const [directorySearch, setDirectorySearch] = useState("");
  const [suspensionReason, setSuspensionReason] = useState("");
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState("Mfumo unafanyiwa maboresho. Tafadhali jaribu tena baadaye.");
  const [announcementMessage, setAnnouncementMessage] = useState("");
  const [supportPhone, setSupportPhone] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [paymentNote, setPaymentNote] = useState("");
  const [notice, setNotice] = useState("Inapakia takwimu za mfumo...");

  const loadRequests = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc("get_platform_payment_requests", {
      p_status: "pending",
      p_limit: 50
    });
    if (error) {
      setRequests([]);
      setNotice("Orodha ya malipo haijapatikana: " + error.message);
      return;
    }
    setRequests((data ?? []) as PaymentRequest[]);
  }, []);

  const loadDirectory = useCallback(async (search: string) => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc("get_platform_shop_directory", {
      p_search: search.trim() || null,
      p_limit: 100
    });
    if (error) {
      setShops([]);
      setNotice("Orodha ya biashara haijapatikana: " + error.message);
      return;
    }
    setShops((data ?? []) as ShopAccount[]);
  }, []);


  const loadControlSettings = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc("get_platform_control_settings");
    if (error) { setNotice("Mipangilio haijapatikana: " + error.message); return; }
    const values = (data ?? {}) as Record<string, unknown>;
    setMaintenanceMode(values.maintenance_mode === true);
    setMaintenanceMessage(typeof values.maintenance_message === "string" ? values.maintenance_message : "");
    setAnnouncementMessage(typeof values.announcement_message === "string" ? values.announcement_message : "");
    setSupportPhone(typeof values.support_phone === "string" ? values.support_phone : "");
    setSupportEmail(typeof values.support_email === "string" ? values.support_email : "");
  }, []);

  async function saveControlSettings() {
    if (!supabase) return;
    setSavingSettings(true);
    const { error } = await supabase.rpc("update_platform_control_settings", {
      p_maintenance_mode: maintenanceMode,
      p_maintenance_message: maintenanceMessage,
      p_announcement_message: announcementMessage,
      p_support_phone: supportPhone,
      p_support_email: supportEmail
    });
    setSavingSettings(false);
    if (error) { setNotice("Mipangilio haijahifadhiwa: " + error.message); return; }
    setNotice("Mipangilio ya mfumo imehifadhiwa.");
  }

  function confirmShopSuspension(shop: ShopAccount) {
    const next = !shop.is_suspended;
    Alert.alert(
      next ? "Sitisha biashara?" : "Rejesha huduma ya biashara?",
      next ? "Wanachama wa biashara hii hawataweza kutumia data na shughuli za duka hadi huduma irejeshwe." : "Wanachama wa biashara hii watapata tena ruhusa zao za kawaida.",
      [
        { text: "Ghairi", style: "cancel" },
        { text: next ? "Sitisha" : "Rejesha", style: next ? "destructive" : "default", onPress: () => { void updateShopSuspension(shop, next); } }
      ]
    );
  }

  async function updateShopSuspension(shop: ShopAccount, suspend: boolean) {
    if (!supabase) return;
    const { error } = await supabase.rpc("set_platform_shop_suspension", {
      p_shop_id: shop.shop_id,
      p_suspend: suspend,
      p_reason: suspensionReason.trim() || (suspend ? "Imesitishwa na Platform Admin" : null)
    });
    if (error) { setNotice("Hali ya biashara haijabadilishwa: " + error.message); return; }
    setSuspensionReason("");
    await loadDirectory(directorySearch);
    setNotice(suspend ? "Biashara imesitishwa; ufikiaji wa shop umefungwa." : "Huduma ya biashara imerejeshwa.");
  }

  const load = useCallback(async () => {
    if (!supabase) {
      setNotice("Supabase haijaunganishwa.");
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc("get_platform_metrics");
    if (error) {
      setMetrics(null);
      setRequests([]);
      setNotice("Takwimu hazijapatikana: " + error.message + ". Hakikisha migration 0018 imetumika na akaunti yako imepewa Platform Admin.");
    } else {
      setMetrics(data as Metrics);
      await Promise.all([loadRequests(), loadDirectory(""), loadControlSettings()]);
      setNotice("Takwimu, maombi ya malipo na akaunti za biashara zimechukuliwa kutoka Supabase.");
    }
    setLoading(false);
  }, [loadRequests, loadDirectory, loadControlSettings]);

  useEffect(() => { void load(); }, [load]);

  async function reviewPayment(requestId: string, approve: boolean) {
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
      <View style={s.paymentQueue}>
        <Text style={s.queueTitle}>Uhakiki wa malipo ya GUNX PRO</Text>
        <Text style={s.copy}>Ombi la TZS 5,000 litabaki pending hadi uthibitishe kumbukumbu kwa njia ya malipo husika. Kuidhinisha huongeza siku 30 za PRO; kukataa hakuwashi usajili.</Text>
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
    </>}
      <View style={s.directory}>
        <Text style={s.queueTitle}>Akaunti na usajili wa biashara</Text>
        <Text style={s.copy}>Orodha inaonyesha maduka 100 ya karibuni zaidi. Tafuta kwa jina la biashara, Owner UUID au Shop UUID.</Text>
        <TextInput value={directorySearch} onChangeText={setDirectorySearch} autoCapitalize="none" placeholder="Tafuta biashara au UUID..." placeholderTextColor="#71869A" style={s.noteInput}/>
        <Text style={s.formLabel}>Sababu ya kusitisha (hiari)</Text>
        <TextInput value={suspensionReason} onChangeText={setSuspensionReason} placeholder="Mfano: ukiukaji wa masharti..." placeholderTextColor="#71869A" style={s.noteInput}/>
        <Pressable onPress={() => void loadDirectory(directorySearch)} style={s.searchButton}><Text style={s.buttonText}>Tafuta biashara</Text></Pressable>
        {shops.map(shop => <View key={shop.shop_id} style={s.requestCard}>
          <Text style={s.requestShop}>{shop.shop_name}</Text>
          <Text style={s.requestLine}>Mpango: {shop.plan_code.toUpperCase()} · Hali: {shop.subscription_status}</Text>
          <Text style={s.requestLine}>Mwisho wa Pro: {shop.expires_at ? new Date(shop.expires_at).toLocaleDateString("sw-TZ") : "Hakuna / Free"}</Text>
          <Text style={s.requestLine}>Maombi yanayosubiri: {Number(shop.pending_payment_count).toLocaleString("en-US")}</Text>
          <Text style={s.requestLine}>Owner UUID: {shop.owner_user_id}</Text>
          <Text style={s.requestLine}>Shop UUID: {shop.shop_id}</Text>
          <Text style={s.requestLine}>Hali ya huduma: {shop.is_suspended ? "IMESITISHWA" : "INAENDELEA"}</Text>
          {!!shop.suspension_reason && <Text style={s.requestLine}>Sababu: {shop.suspension_reason}</Text>}
          <Pressable onPress={() => confirmShopSuspension(shop)} style={[s.searchButton, shop.is_suspended && s.restoreButton]}>
            <Text style={s.buttonText}>{shop.is_suspended ? "Rejesha huduma" : "Sitisha biashara"}</Text>
          </Pressable>
          <Text style={s.requestLine}>Ilifunguliwa: {new Date(shop.shop_created_at).toLocaleDateString("sw-TZ")}</Text>
        </View>)}
        {shops.length === 0 && <Text style={s.copy}>Hakuna biashara iliyopatikana kwa utafutaji huu.</Text>}
      </View>

    <View style={s.directory}>
      <Text style={s.queueTitle}>Mipangilio mikuu ya mfumo</Text>
      <Text style={s.copy}>Dhibiti taarifa za matengenezo, tangazo la mfumo na mawasiliano ya msaada. Hifadhi mabadiliko baada ya kuyakagua.</Text>
      <View style={s.switchRow}>
        <View style={{flex:1}}>
          <Text style={s.requestShop}>Maintenance mode</Text>
          <Text style={s.requestLine}>{maintenanceMode ? "IMEWASHWA" : "IMEZIMWA"}</Text>
        </View>
        <Switch value={maintenanceMode} onValueChange={setMaintenanceMode} trackColor={{false:"#536779",true:"#16785C"}} thumbColor="#F4F7FA"/>
      </View>
      <Text style={s.formLabel}>Ujumbe wa matengenezo</Text>
      <TextInput value={maintenanceMessage} onChangeText={setMaintenanceMessage} multiline placeholder="Ujumbe kwa watumiaji..." placeholderTextColor="#71869A" style={s.noteInput}/>
      <Text style={s.formLabel}>Tangazo kwa watumiaji</Text>
      <TextInput value={announcementMessage} onChangeText={setAnnouncementMessage} multiline placeholder="Tangazo la hiari..." placeholderTextColor="#71869A" style={s.noteInput}/>
      <Text style={s.formLabel}>Namba ya msaada</Text>
      <TextInput value={supportPhone} onChangeText={setSupportPhone} keyboardType="phone-pad" placeholder="+255..." placeholderTextColor="#71869A" style={s.noteInput}/>
      <Text style={s.formLabel}>Email ya msaada</Text>
      <TextInput value={supportEmail} onChangeText={setSupportEmail} autoCapitalize="none" keyboardType="email-address" placeholder="support@example.com" placeholderTextColor="#71869A" style={s.noteInput}/>
      <Pressable disabled={savingSettings} onPress={() => void saveControlSettings()} style={s.searchButton}>
        <Text style={s.buttonText}>{savingSettings ? "Inahifadhi..." : "Hifadhi mipangilio"}</Text>
      </Pressable>
    </View>
    <Pressable onPress={() => void load()} disabled={loading} style={s.button}><Text style={s.buttonText}>↻ Sasisha takwimu, malipo na biashara</Text></Pressable>
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
  paymentQueue: { backgroundColor: "#102438", borderColor: "#1D3A50", borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 18 },
  directory: { backgroundColor: "#102438", borderColor: "#1D3A50", borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 18 },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, paddingVertical: 8 },
  restoreButton: { backgroundColor: "#176247" },
  searchButton: { alignSelf: "flex-start", backgroundColor: "#176247", padding: 10, borderRadius: 9, marginTop: 9 },
  queueTitle: { color: "#F4F7FA", fontSize: 16, fontWeight: "900" },
  queueCount: { color: "#F2D99F", fontSize: 12, fontWeight: "900", marginTop: 12 },
  formLabel: { color: "#D8E3EC", fontSize: 11, fontWeight: "800", marginTop: 12, marginBottom: 6 },
  noteInput: { backgroundColor: "#0B1C2B", borderColor: "#31536A", borderWidth: 1, borderRadius: 9, padding: 11, color: "#FFF", fontSize: 12 },
  requestCard: { backgroundColor: "#0B1C2B", borderColor: "#31536A", borderWidth: 1, borderRadius: 11, padding: 12, marginTop: 11 },
  requestShop: { color: "#75E0B8", fontSize: 14, fontWeight: "900" },
  requestLine: { color: "#D8E3EC", fontSize: 11, lineHeight: 18, marginTop: 3 },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 11 },
  approveButton: { flex: 1, backgroundColor: "#16785C", padding: 11, borderRadius: 9, alignItems: "center" },
  rejectButton: { flex: 1, backgroundColor: "#8A3E42", padding: 11, borderRadius: 9, alignItems: "center" },
  notice: { color: "#75E0B8", backgroundColor: "#102D2C", padding: 12, borderRadius: 10, fontSize: 12, marginTop: 14 }
});
