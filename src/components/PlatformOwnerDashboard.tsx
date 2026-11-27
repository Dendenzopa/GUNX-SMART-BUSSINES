import React, { useCallback, useEffect, useState } from "react";
import { GUNX_OFFICIAL_LOGO } from "../branding";
import { BackHandler } from "react-native";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../lib/supabase";
import { useShopContext } from "./AuthGate";

type SubscriptionMetrics = {
  total_subscriptions:number;
  active_pro:number;
  pending_payments:number;
  verified_payments:number;
  rejected_payments:number;
  verified_revenue_tzs:number;
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

function StatCard({ icon, label, value, tone, onPress, darkMode }: { icon: string; label: string; value: string; tone: "blue" | "gold" | "green"; onPress: () => void; darkMode: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [[s.statCard, tone === "blue" ? s.statBlueCard : tone === "gold" ? s.statGoldCard : s.statGreenCard, darkMode&&{backgroundColor:"#102438",borderColor:"#2B4B61"}], pressed && s.pressed]}>
      <View style={[s.statIcon, tone === "blue" ? s.blueIcon : tone === "gold" ? s.goldIcon : s.greenIcon]}>
        <Text style={[s.statIconText, tone === "blue" ? s.blueText : tone === "gold" ? s.goldText : s.greenText]}>{icon}</Text>
      </View>
      <Text style={[s.statValue,darkMode&&{color:"#F4F7FA"}]}>{value}</Text>
      <Text style={[s.statLabel,darkMode&&{color:"#C1CED8"}]}>{label}</Text>
    </Pressable>
  );
}

function ManagementCard({ icon, title, description, onPress, darkMode }: { icon: string; title: string; description: string; onPress: () => void; darkMode: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.managementCard, darkMode&&{backgroundColor:"#102438",borderColor:"#2B4B61"}, pressed && s.pressed]}>
      <View style={s.managementIcon}><Text style={s.managementIconText}>{icon}</Text></View>
      <Text style={[s.managementTitle,darkMode&&{color:"#F4F7FA"}]}>{title}</Text>
      <Text style={[s.managementDescription,darkMode&&{color:"#C1CED8"}]}>{description}</Text>
    </Pressable>
  );
}


type BusinessRow = {
  shop_id: string;
  business_name: string;
  created_at: string;
  member_count: number;
  plan_code: string;
  subscription_status: string;
  expires_at: string | null;
  total_count: number;
};

function BusinessDirectory({ onBack, darkMode }: { onBack: () => void; darkMode: boolean }) {
  const [rows, setRows] = useState<BusinessRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [total, setTotal] = useState(0);

  const loadBusinesses = useCallback(async (term = "") => {
    if (!supabase) {
      setError("Supabase haijaunganishwa.");
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const { data, error: rpcError } = await supabase.rpc("get_platform_businesses", {
      p_search: term.trim() || null,
      p_limit: 100,
      p_offset: 0
    });
    if (rpcError) {
      setRows([]);
      setTotal(0);
      setError("Imeshindikana kupata biashara: " + rpcError.message);
    } else {
      const result = (data ?? []) as BusinessRow[];
      setRows(result);
      setTotal(result.length ? Number(result[0].total_count) : 0);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void loadBusinesses(""); }, [loadBusinesses]);

  return (
    <View style={[s.directory,darkMode&&{backgroundColor:"#081522"}]}>
      <Pressable onPress={onBack} style={s.backButton}><Text style={s.backText}>‹  Rudi Platform Overview</Text></Pressable>
      <Text style={s.sectionEyebrow}>PLATFORM DIRECTORY</Text>
      <Text style={s.sectionTitle}>All Businesses</Text>
      <Text style={s.sectionCopy}>Orodha ya biashara zilizosajiliwa kwenye GUNX SMART BUSINESS. Taarifa hizi zinapatikana kwa akaunti ya Super Admin pekee.</Text>
      <View style={s.searchRow}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Tafuta jina la biashara"
          placeholderTextColor="#526A7E"
          autoCapitalize="none"
          style={s.searchInput}
          onSubmitEditing={() => void loadBusinesses(search)}
          returnKeyType="search"
        />
        <Pressable onPress={() => void loadBusinesses(search)} style={s.searchButton}><Text style={s.searchButtonText}>TAFUTA</Text></Pressable>
      </View>
      <View style={s.directorySummary}>
        <Text style={s.directorySummaryLabel}>BIASHARA ZILIZOPATIKANA</Text>
        <Text style={s.directorySummaryValue}>{total.toLocaleString("en-US")}</Text>
        <Text style={s.directorySummaryHint}>Inaonyesha hadi biashara 100 kwa ukurasa.</Text>
      </View>
      {loading && <View style={s.loading}><ActivityIndicator color="#42D6A0"/><Text style={s.loadingText}>Inapakia orodha ya biashara...</Text></View>}
      {!!error && <View style={s.errorBox}><Text style={s.errorText}>{error}</Text></View>}
      {!loading && !error && rows.length === 0 && <View style={s.emptyBox}><Text style={s.emptyTitle}>Hakuna biashara iliyopatikana</Text><Text style={s.managementDescription}>Biashara mpya zitaonekana hapa baada ya kusajiliwa.</Text></View>}
      {rows.map((business) => (
        <View key={business.shop_id} style={[s.businessCard,darkMode&&{backgroundColor:"#102438",borderColor:"#2B4B61"}]}>
          <View style={s.businessHeading}>
            <View style={s.businessIcon}><Text style={s.businessIconText}>▣</Text></View>
            <View style={s.businessIdentity}>
              <Text style={[s.businessName,darkMode&&{color:"#F4F7FA"}]}>{business.business_name}</Text>
            </View>
          </View>
          <View style={s.businessMeta}>
            <View style={s.metaItem}><Text style={s.metaLabel}>PLAN</Text><Text style={s.metaValue}>{business.plan_code.toUpperCase()}</Text></View>
            <View style={s.metaItem}><Text style={s.metaLabel}>SUBSCRIPTION</Text><Text style={s.metaValue}>{business.subscription_status.toUpperCase()}</Text></View>
            <View style={s.metaItem}><Text style={s.metaLabel}>MEMBERS</Text><Text style={s.metaValue}>{Number(business.member_count).toLocaleString("en-US")}</Text></View>
          </View>
          <Text style={s.businessDate}>Imesajiliwa: {new Date(business.created_at).toLocaleDateString("sw-TZ")}</Text>
          <Text style={s.businessId}>ID: {business.shop_id}</Text>
        </View>
      ))}
      <Pressable onPress={() => void loadBusinesses(search)} style={s.refresh}><Text style={s.refreshText}>↻  Refresh business directory</Text></Pressable>
      <Text style={s.footerNote}>Kwa sasa ukurasa huu ni wa kutazama na kutafuta. Kusimamisha au kufuta biashara kutahitaji status workflow, audit log na uthibitisho wa ziada wa kiusalama.</Text>
    </View>
  );
}


type ModulePageData = {
  icon: string;
  title: string;
  subtitle: string;
  status: string;
  sections: { heading: string; body: string; items: string[] }[];
};

const MODULE_PAGES: Record<string, ModulePageData> = {
  Users: {
    icon: "👥", title: "Usimamizi wa Watumiaji",
    subtitle: "Akaunti za jukwaa, idadi ya biashara zinazohusishwa na majukumu.",
    status: "Orodha inaonyesha User ID, idadi ya biashara, majukumu na tarehe ya usajili pekee. Email, simu na rekodi binafsi za biashara hazionyeshwi.",
    sections: [
      { heading: "Usimamizi wa akaunti", body: "Hapa ndipo Super Admin ataangalia watumiaji wa jukwaa kwa ujumla.", items: ["Tafuta kwa User ID pale inapohitajika", "Angalia idadi ya biashara zinazohusishwa na majukumu", "Angalia tarehe ya usajili bila kufungua data binafsi ya tenant"] },
      { heading: "Majukumu na ruhusa", body: "Majukumu ya biashara yanabaki ndani ya biashara husika; ruhusa za Super Admin ni za jukwaa zima.", items: ["Business Owner", "Manager", "Cashier", "Stockkeeper", "Platform Super Admin"] }
    ]
  },
  Subscriptions: {
    icon: "🛡️", title: "Vifurushi na Usajili",
    subtitle: "Dhibiti mipango ya Free na Pro, muda wa usajili na uthibitishaji wa malipo.",
    status: "Muhtasari unaonyesha biashara, provider, kiasi, status na tarehe ya ombi pekee. Kuthibitisha au kukataa malipo kutahitaji utaratibu salama wa uhakiki na audit trail.",
    sections: [
      { heading: "Mipango ya huduma", body: "Muhtasari wa vifurushi vinavyotumika kwenye GUNX SMART BUSINESS.", items: ["FREE — matumizi ya msingi kulingana na mipaka ya mpango", "PRO — huduma za ziada kwa usajili unaotumika", "Usajili ulioisha muda hurudi Free bila kufuta data ya biashara"] },
      { heading: "Uthibitishaji wa malipo", body: "Malipo ya Pro yanahitaji kuhakikiwa kabla ya kuwasha huduma.", items: ["M-Pesa, HaloPesa, Mixx, Airtel Money au Benki", "Kiasi kinachotarajiwa: TZS 5,000", "Hali za ombi: Pending, Verified au Rejected"] }
    ]
  },
  Settings: {
    icon: "⚙️", title: "Mipangilio ya Mfumo",
    subtitle: "Vigezo vya jukwaa zima na usanidi wa GUNX SMART BUSINESS.",
    status: "Mipangilio nyeti haibadilishwi kutoka ukurasa huu bado. Inahitaji jedwali la platform settings, uthibitishaji wa Super Admin na kumbukumbu ya kila badiliko.",
    sections: [
      { heading: "Mipangilio ya msingi", body: "Vigezo vilivyowekwa kwa mfumo kwa sasa.", items: ["Sarafu ya biashara: TZS", "Saa za mfumo: Africa/Dar_es_Salaam", "Lugha ya kiolesura: Kiswahili / English"] },
      { heading: "Udhibiti wa jukwaa", body: "Mabadiliko haya yatahitaji kuhifadhiwa kwa usalama na kufuatiliwa.", items: ["Mipaka ya mpango wa Free na Pro", "Matengenezo ya mfumo na matoleo", "Mipangilio ya arifa na mawasiliano"] }
    ]
  },
  Security: {
    icon: "🔐", title: "Mlinzi wa Usalama",
    subtitle: "Ufuatiliaji wa uingiaji, ruhusa, matukio na usalama wa tenant.",
    status: "RLS na jedwali la platform_admins vipo. Jedwali maalum la audit/security events halijaonekana kwenye schema ya sasa; kwa hiyo hakuna historia ya matukio itakayobuniwa.",
    sections: [
      { heading: "Ulinzi wa data", body: "Msingi wa usalama unaotumika kwenye mfumo.", items: ["Row Level Security imewashwa kwenye jedwali za biashara", "Biashara zinatenganishwa kwa shop_id", "Vitendo vya Super Admin vinapaswa kuthibitisha platform_admins"] },
      { heading: "Kumbukumbu za usalama", body: "Audit trail itaonyesha nani alifanya nini, lini na kwa akaunti gani.", items: ["Majaribio ya kuingia na kutoka", "Mabadiliko ya majukumu na usajili", "Vitendo vya uthibitishaji wa malipo", "Tahadhari za matumizi yasiyo ya kawaida"] }
    ]
  },
  Reports: {
    icon: "📄", title: "Ripoti za Jukwaa",
    subtitle: "Ukuaji wa biashara, watumiaji, usajili, matumizi na mapato.",
    status: "Takwimu za biashara na watumiaji zinapatikana kupitia get_platform_metrics. Ripoti za mapato halisi na matumizi ya jukwaa zitaonyesha data baada ya ledger ya mapato kuunganishwa.",
    sections: [
      { heading: "Ripoti zinazolengwa", body: "Ripoti za jumla za jukwaa kwa mmiliki wa GUNX.", items: ["Ukuaji wa biashara zilizosajiliwa", "Watumiaji wapya na watumiaji hai", "Idadi ya installations kwa siku 7 na siku 30", "Muhtasari wa usajili wa Free na Pro"] },
      { heading: "Ripoti za fedha", body: "Mapato yatahesabiwa kutokana na malipo yaliyothibitishwa pekee.", items: ["Mapato ya Pro yaliyothibitishwa", "Malipo yanayosubiri uhakiki", "Marejesho na marekebisho ya fedha", "Export ya PDF na CSV baada ya ledger kuunganishwa"] }
    ]
  },
  Revenue: {
    icon: "📈", title: "Mapato ya Jukwaa",
    subtitle: "Mapato ya usajili wa GUNX PRO na malipo yaliyothibitishwa.",
    status: "Mapato halisi bado hayajaunganishwa na ledger ya platform. Mfumo hautachukulia maombi ya malipo yanayosubiri kuwa mapato yaliyopokelewa.",
    sections: [
      { heading: "Vyanzo vya mapato", body: "Mapato ya jukwaa yatatokana na huduma za kulipia.", items: ["Usajili wa GUNX PRO", "Malipo yaliyothibitishwa tu", "Muhtasari wa provider na malipo yaliyothibitishwa; transaction reference kamili haionyeshwi"] },
      { heading: "Udhibiti wa fedha", body: "Kila uthibitisho au marekebisho lazima yawe na kumbukumbu.", items: ["Jumla ya mapato kwa siku, mwezi na mwaka", "Malipo yanayosubiri na yaliyokataliwa", "Historia ya uthibitishaji wa malipo"] }
    ]
  },
  Health: {
    icon: "🛡️", title: "Afya na Ufanisi wa Mfumo",
    subtitle: "Hali ya huduma, database, API na upatikanaji wa jukwaa.",
    status: "Asilimia ya uptime haiwezi kuonyeshwa bila health-check monitoring yenye vipimo vya muda. Namba ya kubuni haitaonyeshwa.",
    sections: [
      { heading: "Vipimo vya ufuatiliaji", body: "Vipimo vinavyohitajika ili kutoa hali sahihi ya mfumo.", items: ["API availability na response time", "Database connectivity na latency", "Makosa ya server na edge functions", "Uptime kwa saa 24, siku 7 na siku 30"] },
      { heading: "Matukio ya mfumo", body: "Matukio yatapangwa kwa kiwango cha athari.", items: ["Operational", "Warning", "Critical", "Resolved"] }
    ]
  },
  Account: {
    icon: "♙", title: "Akaunti ya Super Admin",
    subtitle: "Wasifu wa mmiliki na mamlaka ya usimamizi wa jukwaa.",
    status: "Akaunti hii inatambuliwa kupitia uthibitisho wa platform_admins. Mabadiliko ya wasifu na usalama wa session yataunganishwa kwenye hatua inayofuata.",
    sections: [
      { heading: "Mamlaka ya akaunti", body: "Super Admin ana uwezo wa kusimamia jukwaa zima, si tenant moja tu.", items: ["Muhtasari wa idadi ya biashara na hali za usajili", "Watumiaji na majukumu ya jukwaa bila data binafsi za tenant", "Usajili, mipango na malipo", "Ripoti na usalama wa mfumo"] },
      { heading: "Usalama wa akaunti", body: "Vitendo nyeti vitahitaji uthibitisho wa ziada.", items: ["Uthibitishaji wa akaunti", "Usimamizi wa session na vifaa", "Historia ya mabadiliko ya akaunti"] }
    ]
  },
  Notifications: {
    icon: "🔔", title: "Kituo cha Arifa",
    subtitle: "Arifa muhimu za biashara, usajili, malipo na afya ya mfumo.",
    status: "Huduma ya kuhifadhi na kusambaza arifa bado haijaunganishwa. Kituo hiki hakitaonyesha arifa za kubuni.",
    sections: [
      { heading: "Aina za arifa", body: "Arifa zitapangwa kwa umuhimu na chanzo.", items: ["Maombi mapya ya usajili wa Pro", "Biashara au watumiaji wapya", "Tahadhari za usalama", "Matatizo ya huduma au database"] },
      { heading: "Udhibiti wa arifa", body: "Super Admin ataweza kuchuja na kufuatilia arifa.", items: ["Zote", "Hazijasomwa", "Muhimu", "Zilizofungwa"] }
    ]
  }
};


type PlatformUserRow = { user_id:string; created_at:string; shop_count:number; roles:string[]; total_count:number };
type PlatformPaymentRow = { request_id:string; shop_id:string; business_name:string; provider:string; amount_tzs:number; status:string; submitted_at:string; verified_at:string|null; total_count:number };
type PlatformSettingRow = { key:string; value:any; description:string|null; updated_at:string; updated_by:string|null };
type PlatformAuditRow = { id:string; actor_id:string|null; action:string; target_type:string; target_id:string|null; metadata:any; created_at:string };
type PlatformNotificationRow = { id:string; title:string; message:string; severity:string; source:string; read_at:string|null; created_at:string };
type PlatformHealthRow = { id:string; service:string; status:string; response_time_ms:number|null; details:any; checked_at:string };

function ModulePage({ moduleKey, metrics, onBack, darkMode }: { moduleKey: string; metrics: Metrics | null; onBack: () => void; darkMode: boolean }) {
  const page = MODULE_PAGES[moduleKey];
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [users,setUsers]=useState<PlatformUserRow[]>([]);
  const [payments,setPayments]=useState<PlatformPaymentRow[]>([]);
  const [subscriptionMetrics,setSubscriptionMetrics]=useState<any>(null);
  const [settings,setSettings]=useState<PlatformSettingRow[]>([]);
  const [audit,setAudit]=useState<PlatformAuditRow[]>([]);
  const [notifications,setNotifications]=useState<PlatformNotificationRow[]>([]);
  const [health,setHealth]=useState<PlatformHealthRow[]>([]);
  const [userSearch,setUserSearch]=useState("");
  const [settingDrafts,setSettingDrafts]=useState<Record<string,string>>({});
  const [selectedLanguage,setSelectedLanguage]=useState<"sw"|"en">("sw");
  useEffect(()=>{ void AsyncStorage.getItem("@gunx/interface-language").then(value=>{if(value==="sw"||value==="en")setSelectedLanguage(value);}).catch(()=>{}); },[]);
  const chooseLanguage=async (language:"sw"|"en")=>{setSelectedLanguage(language);try{await AsyncStorage.setItem("@gunx/interface-language",language);}catch{setError("Chaguo la lugha halikuweza kuhifadhiwa kwenye kifaa.");}};
  const loadPage = async () => {
    if (!supabase) { setError("Supabase haijaunganishwa."); return; }
    setBusy(true); setError("");
    try {
      if (moduleKey === "Users") {
        const {data,error:err}=await supabase.rpc("get_platform_admin_users",{p_search:userSearch.trim()||null,p_limit:100,p_offset:0});
        if(err) throw err;
        setUsers((data??[]) as PlatformUserRow[]);
      } else if (moduleKey === "Subscriptions" || moduleKey === "Revenue" || moduleKey === "Reports") {
        const [stats,pay]=await Promise.all([
          supabase.rpc("get_platform_subscription_metrics"),
          supabase.rpc("get_platform_payment_requests",{p_status:null,p_limit:100,p_offset:0})
        ]);
        if(stats.error) throw stats.error;
        if(pay.error) throw pay.error;
        setSubscriptionMetrics(stats.data);
        setPayments((pay.data??[]) as PlatformPaymentRow[]);
      } else if (moduleKey === "Settings") {
        const {data,error:err}=await supabase.rpc("get_platform_settings");
        if(err) throw err;
        const rows=(data??[]) as PlatformSettingRow[];
        setSettings(rows);
        setSettingDrafts(Object.fromEntries(rows.map(row=>[row.key,JSON.stringify(row.value)])));
      } else if (moduleKey === "Security") {
        const {data,error:err}=await supabase.rpc("get_platform_audit_logs",{p_limit:50});
        if(err) throw err; setAudit((data??[]) as PlatformAuditRow[]);
      } else if (moduleKey === "Notifications") {
        const {data,error:err}=await supabase.rpc("get_platform_notifications",{p_limit:50});
        if(err) throw err; setNotifications((data??[]) as PlatformNotificationRow[]);
      } else if (moduleKey === "Health") {
        const {data,error:err}=await supabase.rpc("get_platform_health_checks",{p_limit:50});
        if(err) throw err; setHealth((data??[]) as PlatformHealthRow[]);
      }
    } catch(e:any) { setError(e?.message || "Imeshindikana kupakia taarifa."); }
    finally { setBusy(false); }
  };

  useEffect(()=>{ void loadPage(); },[moduleKey]);

  const saveSetting = async (key:string) => {
    if(!supabase) return;
    setBusy(true); setError("");
    try {
      const raw=settingDrafts[key]??"";
      let parsed:any;
      try { parsed=JSON.parse(raw); } catch { parsed=raw; }
      const {error:err}=await supabase.rpc("save_platform_setting",{p_key:key,p_value:parsed,p_description:null});
      if(err) throw err;
      await loadPage();
    } catch(e:any) { setError(e?.message || "Mipangilio haijahifadhiwa."); }
    finally { setBusy(false); }
  };

  const markRead = async (id:string) => {
    if(!supabase) return;
    const {error:err}=await supabase.rpc("mark_platform_notification_read",{p_notification_id:id});
    if(err) setError(err.message); else setNotifications(rows=>rows.map(row=>row.id===id?{...row,read_at:new Date().toISOString()}:row));
  };

  if (!page) return null;

    const money=(value:number)=>"TZS "+Number(value||0).toLocaleString("en-US");
  return (
    <View style={[s.modulePage,darkMode&&{backgroundColor:"#081522"}]}>
      <Pressable onPress={onBack} style={s.backButton}><Text style={s.backText}>‹  Rudi Dashboard</Text></Pressable>
      <View style={[s.moduleHero,darkMode&&{backgroundColor:"#102438",borderColor:"#2B4B61"}]}>
        <View style={s.moduleHeroIcon}><Text style={s.moduleHeroIconText}>{page.icon}</Text></View>
        <Text style={s.moduleEyebrow}>GUNX SMART BUSINESS · SUPER ADMIN</Text>
        <Text style={[s.moduleTitle,darkMode&&{color:"#F4F7FA"}]}>{page.title}</Text>
        <Text style={[s.moduleSubtitle,darkMode&&{color:"#C1CED8"}]}>{page.subtitle}</Text>
      </View>
      {busy && <View style={s.loading}><ActivityIndicator color="#176B56"/><Text style={s.loadingText}>Inapakia taarifa halisi...</Text></View>}
      {!!error && <View style={s.errorBox}><Text style={s.errorText}>{error}</Text></View>}

      {moduleKey==="Users" && <>
        <View style={s.dataToolbar}>
          <TextInput value={userSearch} onChangeText={setUserSearch} placeholder="Tafuta kwa User ID" placeholderTextColor="#526A7E" style={s.searchInput} autoCapitalize="none"/>
          <Pressable onPress={()=>void loadPage()} style={s.searchButton}><Text style={s.searchButtonText}>TAFUTA</Text></Pressable>
        </View>
        <Text style={s.dataCount}>Watumiaji: {users.length ? Number(users[0].total_count).toLocaleString("en-US") : "0"}</Text>
        {users.map(user=><View key={user.user_id} style={s.dataCard}>
          <Text style={s.dataTitle}>Akaunti ya mtumiaji</Text>
          <View style={s.dataMetaRow}><Text style={s.dataMeta}>Biashara: {user.shop_count}</Text><Text style={s.dataMeta}>Majukumu: {user.roles?.join(", ")||"Hakuna"}</Text></View>
          <Text style={s.dataSub}>Amesajiliwa: {new Date(user.created_at).toLocaleDateString("sw-TZ")}</Text>
        </View>)}
        {!busy&&users.length===0&&<View style={s.emptyBox}><Text style={s.emptyTitle}>Hakuna mtumiaji aliyepatikana</Text></View>}
      </>}

      {(moduleKey==="Subscriptions"||moduleKey==="Revenue"||moduleKey==="Reports") && <>
        <View style={s.moduleMetrics}>
          <View style={s.moduleMetric}><Text style={s.moduleMetricValue}>{subscriptionMetrics?.total_subscriptions??"—"}</Text><Text style={s.moduleMetricLabel}>Subscriptions</Text></View>
          <View style={s.moduleMetric}><Text style={s.moduleMetricValue}>{subscriptionMetrics?.active_pro??"—"}</Text><Text style={s.moduleMetricLabel}>PRO hai</Text></View>
          <View style={s.moduleMetric}><Text style={s.moduleMetricValue}>{subscriptionMetrics?.pending_payments??"—"}</Text><Text style={s.moduleMetricLabel}>Malipo pending</Text></View>
        </View>
        <View style={s.dataCard}>
          <Text style={s.dataSub}>MAPATO YALIYOTHIBITISHWA PEKEE</Text>
          <Text style={s.revenueValue}>{money(subscriptionMetrics?.verified_revenue_tzs??0)}</Text>
          <Text style={s.dataSub}>Malipo yaliyothibitishwa: {subscriptionMetrics?.verified_payments??0} · Yaliyokataliwa: {subscriptionMetrics?.rejected_payments??0}</Text>
        </View>
        <Text style={s.dataSectionTitle}>Maombi ya malipo ya PRO</Text>
        {payments.map(payment=><View key={payment.request_id} style={s.dataCard}>
          <View style={s.dataMetaRow}><Text style={s.dataTitle}>{payment.business_name}</Text><Text style={[s.statusPill,payment.status==="verified"?s.statusGood:payment.status==="rejected"?s.statusBad:s.statusPending]}>{payment.status.toUpperCase()}</Text></View>
          <Text style={s.dataSub}>Njia ya malipo: {payment.provider.toUpperCase()}</Text>
          <Text style={s.dataTitle}>{money(payment.amount_tzs)}</Text>
          <Text style={s.dataSub}>Tarehe ya ombi: {new Date(payment.submitted_at).toLocaleString("sw-TZ")}</Text>
        </View>)}
        {!busy&&payments.length===0&&<View style={s.emptyBox}><Text style={s.emptyTitle}>Hakuna maombi ya malipo</Text></View>}
        <Text style={s.footerNote}>Ukurasa huu unaonyesha rekodi halisi. Vitufe vya ku-verify/reject vitafunguliwa baada ya kuweka uthibitisho wa server-side na audit trail kwa kila hatua.</Text>
      </>}

      {moduleKey==="Settings" && <>
        <View style={s.languageCard}>
          <Text style={s.languageTitle}>Change Language / Badilisha Lugha</Text>
          <Text style={s.languageHint}>Chagua lugha ya kiolesura cha GUNX SMART BUSINESS.</Text>
          {[{code:"sw" as const,title:"Kiswahili",subtitle:"Lugha ya Kiswahili",flag:"🇹🇿"},{code:"en" as const,title:"English",subtitle:"English language",flag:"🇬🇧"}].map(option=><Pressable key={option.code} accessibilityRole="radio" accessibilityState={{selected:selectedLanguage===option.code}} onPress={()=>void chooseLanguage(option.code)} style={[s.languageOption,selectedLanguage===option.code&&s.languageOptionSelected]}>
            <Text style={s.languageFlag}>{option.flag}</Text><View style={s.languageCopy}><Text style={s.languageOptionTitle}>{option.title}</Text><Text style={s.languageOptionSubtitle}>{option.subtitle}</Text></View><View style={[s.languageCheck,selectedLanguage===option.code&&s.languageCheckSelected]}>{selectedLanguage===option.code&&<Text style={s.languageCheckMark}>✓</Text>}</View>
          </Pressable>)}
          <Text style={s.languageSaved}>✓  {selectedLanguage==="sw"?"Lugha iliyochaguliwa: Kiswahili":"Selected language: English"}</Text>
        </View>
        <Text style={s.dataSectionTitle}>Mipangilio iliyohifadhiwa</Text>
        {settings.map(setting=><View key={setting.key} style={s.dataCard}>
          <Text style={s.dataTitle}>{setting.key}</Text>
          {!!setting.description&&<Text style={s.dataSub}>{setting.description}</Text>}
          <TextInput value={settingDrafts[setting.key]??JSON.stringify(setting.value)} onChangeText={value=>setSettingDrafts(prev=>({...prev,[setting.key]:value}))} style={s.searchInput} placeholder="Thamani ya JSON au maandishi" placeholderTextColor="#526A7E" autoCapitalize="none"/>
          <Pressable onPress={()=>void saveSetting(setting.key)} style={s.searchButton}><Text style={s.searchButtonText}>HIFADHI MABADILIKO</Text></Pressable>
          <Text style={s.dataSub}>Ilisasishwa: {new Date(setting.updated_at).toLocaleString("sw-TZ")}</Text>
        </View>)}
        {!busy&&settings.length===0&&<View style={s.emptyBox}><Text style={s.emptyTitle}>Hakuna mipangilio iliyohifadhiwa bado</Text><Text style={s.managementDescription}>Jedwali liko tayari; funguo za mfumo zitaongezwa kwa hatua maalum baada ya kukubaliana thamani zake.</Text></View>}
      </>}

      {moduleKey==="Security" && <>
        <Text style={s.dataSectionTitle}>Audit trail · Matukio 50 ya mwisho</Text>
        {audit.map(item=><View key={item.id} style={s.dataCard}>
          <Text style={s.dataTitle}>{item.action}</Text>
          <Text style={s.dataSub}>Aina: {item.target_type} · ID: {item.target_id||"—"}</Text>
          <Text style={s.dataSub}>Actor: {item.actor_id||"System"} · {new Date(item.created_at).toLocaleString("sw-TZ")}</Text>
          <Text style={s.dataSub}>{JSON.stringify(item.metadata)}</Text>
        </View>)}
        {!busy&&audit.length===0&&<View style={s.emptyBox}><Text style={s.emptyTitle}>Hakuna matukio yaliyorekodiwa bado</Text></View>}
      </>}

      {moduleKey==="Notifications" && <>
        <Text style={s.dataSectionTitle}>Arifa zilizohifadhiwa</Text>
        {notifications.map(item=><Pressable key={item.id} onPress={()=>!item.read_at&&void markRead(item.id)} style={s.dataCard}>
          <View style={s.dataMetaRow}><Text style={s.dataTitle}>{item.title}</Text><Text style={[s.statusPill,item.severity==="critical"?s.statusBad:item.severity==="warning"?s.statusPending:s.statusGood]}>{item.severity.toUpperCase()}</Text></View>
          <Text style={s.dataSub}>{item.message}</Text>
          <Text style={s.dataSub}>{new Date(item.created_at).toLocaleString("sw-TZ")} · {item.read_at?"Imesomwa":"Haijasomwa — gusa kuweka imesomwa"}</Text>
        </Pressable>)}
        {!busy&&notifications.length===0&&<View style={s.emptyBox}><Text style={s.emptyTitle}>Hakuna arifa zilizohifadhiwa bado</Text></View>}
      </>}

      {moduleKey==="Health" && <>
        <Text style={s.dataSectionTitle}>Vipimo vya afya vilivyorekodiwa</Text>
        {health.map(item=><View key={item.id} style={s.dataCard}>
          <View style={s.dataMetaRow}><Text style={s.dataTitle}>{item.service}</Text><Text style={[s.statusPill,item.status==="operational"?s.statusGood:item.status==="outage"?s.statusBad:s.statusPending]}>{item.status.toUpperCase()}</Text></View>
          <Text style={s.dataSub}>Response: {item.response_time_ms==null?"—":item.response_time_ms+" ms"} · {new Date(item.checked_at).toLocaleString("sw-TZ")}</Text>
          <Text style={s.dataSub}>{JSON.stringify(item.details)}</Text>
        </View>)}
        {!busy&&health.length===0&&<View style={s.emptyBox}><Text style={s.emptyTitle}>Hakuna health checks zilizorekodiwa</Text><Text style={s.managementDescription}>Uptime haitabuniwa. Inahitaji monitor inayotuma vipimo kwenye jedwali hili.</Text></View>}
      </>}

      {moduleKey==="Reports" && metrics && <View style={s.moduleMetrics}>
        <View style={s.moduleMetric}><Text style={s.moduleMetricValue}>{metrics.total_shops}</Text><Text style={s.moduleMetricLabel}>Biashara</Text></View>
        <View style={s.moduleMetric}><Text style={s.moduleMetricValue}>{metrics.registrations}</Text><Text style={s.moduleMetricLabel}>Usajili</Text></View>
        <View style={s.moduleMetric}><Text style={s.moduleMetricValue}>{metrics.active_7d}</Text><Text style={s.moduleMetricLabel}>Hai siku 7</Text></View>
      </View>}

      {page.sections.map(section => (
        <View key={section.heading} style={s.moduleSection}>
          <Text style={[s.moduleSectionTitle,darkMode&&{color:"#F4F7FA"}]}>{section.heading}</Text>
          <Text style={[s.moduleBody,darkMode&&{color:"#C1CED8"}]}>{section.body}</Text>
          {section.items.map(item => <View key={item} style={s.moduleItem}><Text style={s.moduleBullet}>✓</Text><Text style={[s.moduleItemText,darkMode&&{color:"#DCE6EF"}]}>{item}</Text></View>)}
        </View>
      ))}
      <Pressable onPress={()=>void loadPage()} style={s.refresh}><Text style={s.refreshText}>↻  Sasisha taarifa</Text></Pressable>
      <View style={s.moduleStatus}>
        <Text style={s.moduleStatusTitle}>HALI YA HUDUMA</Text>
        <Text style={s.moduleStatusText}>{page.status}</Text>
      </View>
    </View>
  );
}

export default function PlatformOwnerDashboard({ darkMode, onToggleTheme }: { darkMode: boolean; onToggleTheme: () => void }) {
  const { signOut } = useShopContext();
  const [accountName, setAccountName] = useState("Super Admin");
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [subscriptionMetrics, setSubscriptionMetrics] = useState<SubscriptionMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("Inapakia takwimu za mfumo...");
  const [showNotice, setShowNotice] = useState(false);
  const [selectedModule, setSelectedModule] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedModule) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      setSelectedModule(null);
      return true;
    });
    return () => subscription.remove();
  }, [selectedModule]);


  const load = useCallback(async () => {
    if (!supabase) {
      setMetrics(null);
      setNotice("Supabase haijaunganishwa. Takwimu za moja kwa moja hazipatikani.");
      setLoading(false);
      return;
    }
    setLoading(true);
    const [platformResult, subscriptionResult] = await Promise.all([
      supabase.rpc("get_platform_metrics"),
      supabase.rpc("get_platform_subscription_metrics")
    ]);
    if (platformResult.error) {
      setMetrics(null);
      setNotice("Takwimu hazijapatikana: " + platformResult.error.message + ". Hakikisha akaunti imepewa Platform Admin.");
    } else {
      setMetrics(platformResult.data as Metrics);
      setNotice("Takwimu zimechukuliwa moja kwa moja kutoka Supabase.");
    }
    if (subscriptionResult.error) setSubscriptionMetrics(null);
    else setSubscriptionMetrics(subscriptionResult.data as SubscriptionMetrics);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    let active = true;
    void supabase?.auth.getUser().then(({ data }) => {
      if (!active || !data.user) return;
      const metadata = data.user.user_metadata ?? {};
      const googleName = metadata.full_name || metadata.name || metadata.display_name;
      const emailAddress = data.user.email?.toLowerCase();
      const emailName = emailAddress === "eliaspaulmarwa505@gmail.com" ? "Elias PAUL MARWA" : data.user.email?.split("@")[0]?.replace(/[._-]+/g, " ");
      setAccountName(String(googleName || emailName || "Super Admin").trim());
      const picture = metadata.avatar_url || metadata.picture;
      if (typeof picture === "string" && picture.startsWith("https://")) setAvatarUri(picture);
    });
    return () => { active = false; };
  }, []);

  const changeProfilePhoto = async () => {
    setAvatarBusy(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setNotice("Ruhusu GUNX kufikia picha zako ili ubadilishe picha ya wasifu.");
        setShowNotice(true);
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.85
      });
      if (!result.canceled && result.assets[0]?.uri) setAvatarUri(result.assets[0].uri);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Imeshindikana kufungua Gallery.");
      setShowNotice(true);
    } finally { setAvatarBusy(false); }
  };

  const unavailable = "--";
  const verifiedRevenue = subscriptionMetrics ? "TZS " + Number(subscriptionMetrics.verified_revenue_tzs || 0).toLocaleString("en-US") : loading ? "…" : unavailable;
  const openModule = (name: string) => setSelectedModule(name);
  const showBusinesses = () => setSelectedModule("All Businesses");

  return (
    <View style={[s.screen,darkMode&&{backgroundColor:"#081522"}]}>
      <View style={[s.header,darkMode&&{backgroundColor:"#081522"}]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Akaunti ya Mmiliki"
          onPress={() => openModule("Account")}
          style={s.accountButton}
        >
          <Text style={s.accountIcon}>♙</Text>
        </Pressable>
        <View style={s.brandBlock}>
          <Image
            accessibilityLabel="GUNX SMART BUSINESS official logo"
            source={GUNX_OFFICIAL_LOGO}
            style={s.brandLogo}
            resizeMode="contain"
          />
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={darkMode?"Washa Light Mode":"Washa Dark Mode"} onPress={onToggleTheme} style={[s.accountButton,{marginLeft:8,backgroundColor:darkMode?"#173D36":"#E8EEF5"}]}><Text style={[s.accountIcon,{color:darkMode?"#75E0B8":"#173247"}]}>{darkMode?"☀":"☾"}</Text></Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Taarifa za Mfumo"
          onPress={() => openModule("Notifications")}
          style={s.bellButton}
        >
          <Text style={s.bell}>🔔</Text>
          <View style={s.bellDot} />
        </Pressable>
      </View>
      <Pressable accessibilityRole="button" onPress={() => void signOut()} style={s.logoutBar}>
        <Text style={s.logoutBarText}>⇥  TOKA KWENYE AKAUNTI</Text>
      </Pressable>

      {selectedModule === "All Businesses" ? (
        <BusinessDirectory darkMode={darkMode} onBack={() => setSelectedModule(null)} />
      ) : selectedModule ? (
        <ModulePage moduleKey={selectedModule} metrics={metrics} darkMode={darkMode} onBack={() => setSelectedModule(null)} />
      ) : (
        <>
          <View style={[s.welcomeBanner,darkMode&&{backgroundColor:"#102438",borderColor:"#D7B56D"}]}>
            <Pressable accessibilityRole="button" accessibilityLabel="Badilisha picha ya wasifu" onPress={() => void changeProfilePhoto()} style={s.avatarPicker}>
              <View style={s.welcomeAvatar}>
                {avatarUri ? <Image source={{ uri: avatarUri }} style={s.avatarPhoto} /> : <Text style={s.welcomeAvatarIcon}>👤</Text>}
                <View style={s.crownBadge}><Text style={s.crownBadgeText}>♛</Text></View>
              </View>
              <View style={s.cameraBadge}><Text style={s.cameraBadgeText}>{avatarBusy ? "…" : "📷"}</Text></View>
            </Pressable>
            <View style={s.welcomeCopy}>
              <Text style={s.welcome}>Karibu Tena!</Text>
              <Text style={s.profileName}>{accountName}</Text>
              <View style={s.ownerBadge}><View style={s.ownerDot}/><Text style={s.ownerText}>SUPER ADMIN</Text></View>
            </View>
          </View>

          <View style={s.sectionHeading}>
            <Text style={s.sectionTitle}>Muhtasari wa Mfumo</Text>
          </View>
          {loading && <View style={s.loading}><ActivityIndicator color="#1D4ED8"/><Text style={s.loadingText}>Inasoma taarifa kutoka server...</Text></View>}

          <View style={s.statsGrid}>
            <StatCard icon="🏪" label="Jumla ya Biashara" value={metrics ? metrics.total_shops.toLocaleString("en-US") : loading ? "…" : "--"} tone="blue" darkMode={darkMode} onPress={() => openModule("All Businesses")}/>
            <StatCard icon="👥" label="Jumla ya Watumiaji" value={metrics ? metrics.registrations.toLocaleString("en-US") : loading ? "…" : "--"} tone="blue" darkMode={darkMode} onPress={() => openModule("Users")}/>
            <StatCard icon="📈" label="Mapato Yaliyothibitishwa" value={verifiedRevenue} tone="gold" darkMode={darkMode} onPress={() => openModule("Revenue")}/>
            <StatCard icon="🛡️" label="Ufanisi wa Mfumo" value={unavailable} tone="green" darkMode={darkMode} onPress={() => openModule("Health")}/>
          </View>
          <Text style={s.metricFootnote}>
            Watumiaji hai: {metrics ? metrics.active_7d.toLocaleString("en-US") + " (siku 7) · " + metrics.active_30d.toLocaleString("en-US") + " (siku 30)" : "Takwimu za shughuli zitaonekana baada ya server kurudisha data."}
          </Text>

          <View style={s.sectionHeading}>
            <Text style={s.sectionTitle}>Zana za Usimamizi</Text>
          </View>
          <View style={s.managementGrid}>
            <ManagementCard icon="🏪" title="Biashara Zote" description="Orodha na usimamizi wa biashara." darkMode={darkMode} onPress={showBusinesses}/>
            <ManagementCard icon="👥" title="Usimamizi wa Watumiaji" description="Akaunti, majukumu na ruhusa." darkMode={darkMode} onPress={() => openModule("Users")}/>
            <ManagementCard icon="🛡️" title="Vifurushi/Usajili" description="Vifurushi, muda na malipo." darkMode={darkMode} onPress={() => openModule("Subscriptions")}/>
            <ManagementCard icon="⚙️" title="Mipangilio ya Mfumo" description="Mipangilio ya jukwaa zima." darkMode={darkMode} onPress={() => openModule("Settings")}/>
            <ManagementCard icon="🛡️" title="Mlinzi wa Usalama" description="Uingiaji na kumbukumbu za usalama." darkMode={darkMode} onPress={() => openModule("Security")}/>
            <ManagementCard icon="📄" title="Ripoti" description="Ukuaji, mapato na matumizi." darkMode={darkMode} onPress={() => openModule("Reports")}/>
          </View>

          <Pressable
            onPress={() => setSelectedModule(null)}
            style={({ pressed }) => [s.panelButton, pressed && s.panelButtonPressed]}
          >
            <Text style={s.panelCrown}>♛</Text>
            <Text style={s.panelButtonText}>Jopo la GUNX Super Admin</Text>
          </Pressable>
          {showNotice && <Pressable onPress={() => setShowNotice(false)} style={s.notice}><Text style={s.noticeText}>{notice}</Text><Text style={s.noticeDismiss}>GUSA KUFUNGA</Text></Pressable>}
          <Pressable onPress={() => void load()} style={s.refresh}><Text style={s.refreshText}>↻  Sasisha takwimu za mfumo</Text></Pressable>
          <Text style={s.footer}>WEWE – SUPER ADMIN (MMILIKI WA APP)</Text>
          <Text style={s.footerNote}>Mapato na ufanisi wa mfumo vitaonyeshwa baada ya huduma husika kuunganishwa. Hakuna takwimu za kubuni.</Text>
        </>
      )}

    </View>
  );
}

const s = StyleSheet.create({
   languageCard:{backgroundColor:"#F0F7F5",borderColor:"#8BCDB5",borderWidth:1.5,borderRadius:16,padding:15,marginBottom:18},
   languageTitle:{color:"#102A43",fontSize:19,fontWeight:"900"},
   languageHint:{color:"#40566B",fontSize:15,lineHeight:22,marginTop:5,marginBottom:12},
   languageOption:{flexDirection:"row",alignItems:"center",backgroundColor:"#FFFFFF",borderWidth:1.5,borderColor:"#D2DEE7",borderRadius:13,padding:13,marginTop:9,minHeight:70},
   languageOptionSelected:{borderColor:"#16835F",backgroundColor:"#E8F7F0"},
   languageFlag:{fontSize:26,marginRight:12},
   languageCopy:{flex:1},
   languageOptionTitle:{color:"#142D42",fontSize:17,fontWeight:"900"},
   languageOptionSubtitle:{color:"#40566B",fontSize:14,marginTop:3},
   languageCheck:{width:27,height:27,borderRadius:14,borderWidth:2,borderColor:"#91A4B5",alignItems:"center",justifyContent:"center"},
   languageCheckSelected:{backgroundColor:"#16835F",borderColor:"#16835F"},
   languageCheckMark:{color:"#FFFFFF",fontSize:17,fontWeight:"900"},
   languageSaved:{color:"#126347",fontSize:14,fontWeight:"900",marginTop:13},
   modulePage: { paddingBottom: 28 },
  logoutBar:{alignSelf:"flex-end",backgroundColor:"#173D36",borderWidth:1,borderColor:"#43C99A",borderRadius:10,paddingHorizontal:15,paddingVertical:10,marginBottom:12},
  logoutBarText:{color:"#75E0B8",fontSize:14,fontWeight:"900"},

  dataToolbar:{flexDirection:"row",gap:8,marginBottom:10},
  dataCount:{color:"#52697C",fontSize: 14,fontWeight:"800",marginBottom:8},
  dataCard:{padding:13,borderRadius:13,backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#DCE5EC",marginBottom:9,gap:6},
  dataTitle:{color:"#172B3D",fontSize: 16,fontWeight:"900"},
  dataSub:{color:"#334B61",fontSize: 15,lineHeight: 22},
  dataMetaRow:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:8},
  dataMeta:{color:"#425A70",fontSize: 13,fontWeight:"800",flex:1},
  dataSectionTitle:{color:"#163D63",fontSize: 18,fontWeight:"900",marginTop:9,marginBottom:9},
  revenueValue:{color:"#8A6415",fontSize: 23,fontWeight:"900"},
  statusPill:{overflow:"hidden",paddingHorizontal:8,paddingVertical:4,borderRadius:10,fontSize: 12,fontWeight:"900",color:"#334155"},
  statusGood:{backgroundColor:"#DCFCE7",color:"#166534"},
  statusBad:{backgroundColor:"#FEE2E2",color:"#991B1B"},
  statusPending:{backgroundColor:"#FEF3C7",color:"#92400E"},

   moduleHero: { padding: 19, borderRadius: 18, backgroundColor: "#DCEBFA", borderWidth: 1, borderColor: "#A9C9EB", marginBottom: 13 },
   moduleHeroIcon: { width: 58, height: 58, borderRadius: 17, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", marginBottom: 12 },
   moduleHeroIconText: { fontSize: 68 },
   moduleEyebrow: { color: "#315F91", fontSize: 12, fontWeight: "900", letterSpacing: 1 },
   moduleTitle: { color: "#102A43", fontSize: 22, fontWeight: "900", marginTop: 5 },
   moduleSubtitle: { color: "#29465F", fontSize: 16, lineHeight: 24, marginTop: 7 },
   moduleMetrics: { flexDirection: "row", gap: 8, marginBottom: 12 },
   moduleMetric: { flex: 1, minWidth: 0, padding: 11, borderRadius: 12, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#D8E5EF" },
   moduleMetricValue: { color: "#163D63", fontSize: 22, fontWeight: "900" },
   moduleMetricLabel: { color: "#40566B", fontSize: 12, fontWeight: "800", marginTop: 4 },
   moduleSection: { padding: 15, borderRadius: 14, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DCE5EC", marginBottom: 10 },
   moduleSectionTitle: { color: "#163D63", fontSize: 18, fontWeight: "900" },
   moduleBody: { color: "#334B61", fontSize: 16, lineHeight: 23, marginTop: 6, marginBottom: 10 },
   moduleItem: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: "#EEF2F6" },
   moduleBullet: { color: "#16835F", fontSize: 16, fontWeight: "900" },
   moduleItemText: { flex: 1, color: "#243B50", fontSize: 16, lineHeight: 23 },
   moduleStatus: { padding: 13, borderRadius: 12, backgroundColor: "#FFF8E8", borderWidth: 1, borderColor: "#E7D5A8", marginTop: 2 },
   moduleStatusTitle: { color: "#8A6415", fontSize: 12, fontWeight: "900", letterSpacing: 1 },
   moduleStatusText: { color: "#66532E", fontSize: 13, lineHeight: 18, marginTop: 5 },

  accountButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#1E3A8A", borderWidth: 2, borderColor: "#D4AF37", alignItems: "center", justifyContent: "center", elevation: 3 },
  accountIcon: { color: "#FFFFFF", fontSize: 50, fontWeight: "800" },
  notificationStrip: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: "#8FB5E3", backgroundColor: "#D3E4F8", marginBottom: 14 },
  notificationIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.7)", alignItems: "center", justifyContent: "center" },
  notificationIconText: { color: "#1D4ED8", fontSize: 22, fontWeight: "900" },
  notificationCopy: { flex: 1 },
  notificationTitle: { color: "#0F172A", fontSize: 14, fontWeight: "900" },
  notificationMessage: { color: "#1E293B", fontSize: 13, lineHeight: 16, marginTop: 2 },
  notificationClose: { paddingHorizontal: 9, paddingVertical: 7, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.7)" },
  notificationCloseText: { color: "#0F172A", fontSize: 13, fontWeight: "800" },
  welcomeBanner: { flexDirection: "row", alignItems: "center", gap: 16, padding: 19, minHeight: 142, borderRadius: 22, borderWidth: 1.5, borderColor: "#C6A64A", backgroundColor: "#102A4C", marginBottom: 20, elevation: 4, shadowColor: "#102A4C", shadowOpacity: 0.2, shadowRadius: 9, shadowOffset: { width: 0, height: 4 } },
  avatarPicker: { position: "relative" },
  avatarPhoto: { width: 76, height: 76, borderRadius: 38 },
  cameraBadge: { position: "absolute", right: -2, bottom: -3, width: 30, height: 30, borderRadius: 15, backgroundColor: "#0C9B72", borderWidth: 2, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  cameraBadgeText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  welcomeAvatar: { width: 82, height: 82, borderRadius: 41, overflow: "visible", backgroundColor: "#173F70", borderWidth: 3, borderColor: "#D8B65A", alignItems: "center", justifyContent: "center" },
  welcomeAvatarIcon: { color: "#FFFFFF", fontSize: 42, fontWeight: "800" },
  crownBadge: { position: "absolute", top: -5, right: -5, width: 25, height: 25, borderRadius: 13, backgroundColor: "#EAB308", borderWidth: 2, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  crownBadgeText: { color: "#0F172A", fontSize: 18, fontWeight: "900" },
  welcomeCopy: { flex: 1, minWidth: 0 },
  ownerDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#4ADE80" },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15,23,42,0.55)" },
  drawer: { width: "100%", maxWidth: 600, alignSelf: "center", backgroundColor: "#FFFFFF", borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, borderTopWidth: 1, borderColor: "#DCE5EC" },
  drawerHandle: { width: 42, height: 6, borderRadius: 4, backgroundColor: "#CBD5E1", alignSelf: "center", marginBottom: 18 },
  drawerHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  drawerIcon: { width: 44, height: 44, borderRadius: 13, backgroundColor: "#E6EFF8", borderWidth: 1, alignItems: "center", justifyContent: "center" },
  drawerCrown: { fontSize: 23, fontWeight: "900" },
  drawerHeadingCopy: { flex: 1 },
  drawerEyebrow: { color: "#40566B", fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  drawerTitle: { color: "#0F172A", fontSize: 20, fontWeight: "900", marginTop: 3 },
  drawerClose: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, backgroundColor: "#F1F5F9" },
  drawerCloseText: { color: "#334155", fontSize: 14, fontWeight: "800" },
  drawerMessage: { color: "#1E293B", fontSize: 16, lineHeight: 24, padding: 15, borderRadius: 16, backgroundColor: "#E6EFF8", borderWidth: 1, borderColor: "#8FB5E3", marginTop: 17 },
  drawerReturn: { backgroundColor: "#0F172A", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 14 },
  drawerReturnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
  screen: { position: "relative", overflow: "hidden", paddingHorizontal: 18, paddingTop: 12, paddingBottom: 38, width: "100%", alignSelf: "stretch", backgroundColor: "#FFFFFF", minHeight: "100%" },
  gridOverlay: { ...StyleSheet.absoluteFillObject, opacity: 0 },
  gridVertical: { position: "absolute", top: 0, bottom: 0, width: 1, backgroundColor: "#2A5367" },
  gridHorizontal: { position: "absolute", left: 0, right: 0, height: 1, backgroundColor: "#2A5367" },
  glowTop: { position: "absolute", top: -100, right: -100, width: 230, height: 230, borderRadius: 120, backgroundColor: "#FFFFFF", opacity: 0 },
  glowBottom: { position: "absolute", bottom: 140, left: -130, width: 250, height: 250, borderRadius: 130, backgroundColor: "#FFFFFF", opacity: 0 },
  header: { position: "relative", flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 20, minHeight: 274, paddingVertical: 12, backgroundColor: "#FFFFFF" },
  brandBlock: { flex: 1, flexBasis: "100%", minWidth: 0, alignItems: "center", justifyContent: "center", backgroundColor: "transparent", padding: 0 },
  brandLogo: { width: 400, height: 250 },
  bellButton: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: "#93B8E4", backgroundColor: "#D2E3F7", alignItems: "center", justifyContent: "center" },
  bell: { color: "#1E3A8A", fontSize: 46, fontWeight: "800" },
  bellDot: { position: "absolute", width: 9, height: 9, borderRadius: 5, backgroundColor: "#DC2626", top: 8, right: 9, borderWidth: 1, borderColor: "#D2E3F7" },
  profileCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: "#DCE5EC", backgroundColor: "#F7FAFC", marginBottom: 22 },
  avatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: "#183C42", borderWidth: 2, borderColor: "#D8B86F", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#F4D994", fontSize: 20, fontWeight: "900" },
  profileCopy: { flex: 1 },
  welcome: { color: "#E9C96D", fontSize: 17, fontWeight: "900", letterSpacing: 0.5 },
  profileName: { color: "#FFFFFF", fontSize: 21, fontWeight: "900", marginTop: 4, letterSpacing: 0.2 },
  ownerBadge: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6, backgroundColor: "#0B6B55", borderColor: "#41D5A2", borderWidth: 1, borderRadius: 20, paddingHorizontal: 13, paddingVertical: 6, marginTop: 9 },
  crown: { color: "#F1D18A", fontSize: 16 },
  ownerText: { color: "#D9FFEF", fontSize: 13, fontWeight: "900", letterSpacing: 1.1 },
  accessPill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#123B35", borderRadius: 20, paddingHorizontal: 8, paddingVertical: 6 },
  accessDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#4BD5A1" },
  accessText: { color: "#75DDB8", fontSize: 12, fontWeight: "900" },
  sectionHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 4, marginBottom: 7 },
  sectionEyebrow: { color: "#16845D", fontSize: 12, fontWeight: "900", letterSpacing: 1.6 },
  sectionTitle: { color: "#0F172A", fontSize: 22, fontWeight: "900", marginTop: 3 },
  sectionCopy: { color: "#40566B", fontSize: 14, lineHeight: 21, marginBottom: 12 },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#123A34", borderRadius: 18, paddingHorizontal: 9, paddingVertical: 6, marginBottom: 3 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#51D8A4" },
  liveText: { color: "#7DE0BC", fontSize: 12, fontWeight: "900", letterSpacing: 0.8 },
  loading: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, padding: 11, backgroundColor: "#D3E4F8", borderRadius: 10, marginBottom: 10 },
  loadingText: { color: "#1E293B", fontSize: 14 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  statCard: { width: "48%", minHeight: 188, padding: 16, borderRadius: 18, borderWidth: 1.5, borderColor: "#8FB5E3", justifyContent: "center" },
  statBlueCard: { backgroundColor: "#C7DCF4" },
  statGoldCard: { backgroundColor: "#FFFFFF", borderColor: "#D9B96F" },
  statGreenCard: { backgroundColor: "#FFFFFF", borderColor: "#7CC9A5" },
  statIcon: { width: 92, height: 92, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 9, backgroundColor: "rgba(255,255,255,0.62)" },
  blueIcon: { backgroundColor: "rgba(255,255,255,0.62)" },
  goldIcon: { backgroundColor: "rgba(255,255,255,0.62)" },
  greenIcon: { backgroundColor: "rgba(255,255,255,0.62)" },
  statIconText: { fontSize: 84, fontWeight: "900" },
  blueText: { color: "#1D4ED8" },
  goldText: { color: "#1D4ED8" },
  greenText: { color: "#1D4ED8" },
  statLabel: { color: "#1E293B", fontSize: 14, fontWeight: "700", letterSpacing: 0 },
  statValue: { color: "#0F172A", fontSize: 25, fontWeight: "900", marginTop: 7 },
  metricFootnote: { color: "#334B61", fontSize: 15, lineHeight: 22, marginTop: 10, marginBottom: 18 },
  toolCount: { color: "#D9B96F", fontSize: 12, fontWeight: "900", letterSpacing: 1, marginBottom: 3 },
  managementGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 5 },
  managementCard: { width: "47%", minHeight: 210, borderRadius: 18, borderWidth: 1.5, borderColor: "#8FB5E3", backgroundColor: "#C8DCF3", padding: 9, justifyContent: "center" },
  pressed: { opacity: 0.75, borderColor: "#D8B86F" },
  managementTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 9 },
  managementIcon: { width: 96, height: 96, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.65)", alignItems: "center", justifyContent: "center" },
  managementIconText: { color: "#1D4ED8", fontSize: 88, fontWeight: "900" },
  chevron: { color: "#526A7E", fontSize: 23, marginTop: -4 },
  managementTitle: { color: "#0F172A", fontSize: 14, fontWeight: "900" },
  managementDescription: { color: "#1E293B", fontSize: 12, lineHeight: 15, marginTop: 5 },
  panelButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#E7B51C", borderWidth: 1.5, borderColor: "#B45309", borderRadius: 16, paddingVertical: 15, paddingHorizontal: 14, marginTop: 19, shadowColor: "#CA8A04", shadowOpacity: 0.2, shadowRadius: 10, elevation: 3 },
  panelButtonPressed: { opacity: 0.82 },
  panelCrown: { color: "#172536", fontSize: 30 },
  panelButtonText: { color: "#152436", fontSize: 17, fontWeight: "900", letterSpacing: 0.2 },
  panelArrow: { color: "#152436", fontSize: 22, fontWeight: "900" },
  notice: { backgroundColor: "#F4F8FB", borderColor: "#C69D48", borderWidth: 1, borderRadius: 11, padding: 12, marginTop: 12 },
  noticeText: { color: "#24394B", fontSize: 14, lineHeight: 21 },
  noticeDismiss: { color: "#E2C477", fontSize: 12, fontWeight: "900", marginTop: 8, textAlign: "right" },
  refresh: { alignItems: "center", padding: 11, marginTop: 9 },
  refreshText: { color: "#1D4ED8", fontSize: 14, fontWeight: "800" },
  footer: { color: "#8A6415", fontSize: 13, fontWeight: "900", letterSpacing: 1, textAlign: "center", marginTop: 13, padding: 10, borderRadius: 9, backgroundColor: "#FFF8E8", borderWidth: 1, borderColor: "#E8D6A8" },
  footerNote: { color: "#40566B", fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 8 },
  directory: { marginTop: 5 },
  backButton: { alignSelf: "flex-start", paddingVertical: 9, paddingHorizontal: 12, borderRadius: 9, backgroundColor: "#EDF4F8", borderWidth: 1, borderColor: "#D5E0E8", marginBottom: 17 },
  backText: { color: "#176D54", fontSize: 14, fontWeight: "900" },
  searchRow: { flexDirection: "row", gap: 8, marginTop: 8, marginBottom: 12 },
  searchInput: { flex: 1, minWidth: 0, color: "#172B3D", backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#D5E0E8", borderRadius: 10, paddingHorizontal: 11, paddingVertical: 11, fontSize: 14 },
  searchButton: { backgroundColor: "#176B56", borderRadius: 10, justifyContent: "center", paddingHorizontal: 13 },
  searchButtonText: { color: "#EFFFF8", fontSize: 13, fontWeight: "900" },
  directorySummary: { padding: 13, borderRadius: 12, backgroundColor: "#F1F7FC", borderWidth: 1, borderColor: "#D8E5EF", marginBottom: 10 },
  directorySummaryLabel: { color: "#63788B", fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  directorySummaryValue: { color: "#8A6415", fontSize: 23, fontWeight: "900", marginTop: 4 },
  directorySummaryHint: { color: "#526A7E", fontSize: 12, marginTop: 3 },
  businessCard: { padding: 13, borderRadius: 13, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DCE5EC", marginBottom: 9 },
  businessHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  businessIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: "#153D60", alignItems: "center", justifyContent: "center" },
  businessIconText: { color: "#62B9F5", fontSize: 40 },
  businessIdentity: { flex: 1 },
  businessName: { color: "#172B3D", fontSize: 17, fontWeight: "900" },
  businessEmail: { color: "#40566B", fontSize: 13, marginTop: 3 },
  businessMeta: { flexDirection: "row", gap: 8, marginTop: 12 },
  metaItem: { flex: 1, backgroundColor: "#F2F6F9", padding: 8, borderRadius: 8 },
  metaLabel: { color: "#40566B", fontSize: 12, fontWeight: "900" },
  metaValue: { color: "#8A6415", fontSize: 14, fontWeight: "900", marginTop: 4 },
  businessDate: { color: "#40566B", fontSize: 13, marginTop: 10 },
  businessId: { color: "#526A7E", fontSize: 12, marginTop: 5 },
  emptyBox: { padding: 20, borderRadius: 12, backgroundColor: "#F7FAFC", borderWidth: 1, borderColor: "#DCE5EC", alignItems: "center" },
  emptyTitle: { color: "#172B3D", fontSize: 17, fontWeight: "900", marginBottom: 5 },
  errorBox: { padding: 12, borderRadius: 10, backgroundColor: "#3A2025", borderWidth: 1, borderColor: "#8A4148", marginBottom: 10 },
  errorText: { color: "#FFD6D6", fontSize: 14, lineHeight: 19 }
});
