import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
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

function StatCard({ icon, label, value, tone }: { icon: string; label: string; value: string; tone: "blue" | "gold" | "green" }) {
  return (
    <View style={s.statCard}>
      <View style={[s.statIcon, tone === "blue" ? s.blueIcon : tone === "gold" ? s.goldIcon : s.greenIcon]}>
        <Text style={[s.statIconText, tone === "blue" ? s.blueText : tone === "gold" ? s.goldText : s.greenText]}>{icon}</Text>
      </View>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValue}>{value}</Text>
    </View>
  );
}

function ManagementCard({ icon, title, description, onPress }: { icon: string; title: string; description: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.managementCard, pressed && s.pressed]}>
      <View style={s.managementTop}>
        <View style={s.managementIcon}><Text style={s.managementIconText}>{icon}</Text></View>
        <Text style={s.chevron}>›</Text>
      </View>
      <Text style={s.managementTitle}>{title}</Text>
      <Text style={s.managementDescription}>{description}</Text>
    </Pressable>
  );
}


type BusinessRow = {
  shop_id: string;
  business_name: string;
  owner_id: string;
  owner_email: string | null;
  created_at: string;
  member_count: number;
  plan_code: string;
  subscription_status: string;
  expires_at: string | null;
  total_count: number;
};

function BusinessDirectory({ onBack }: { onBack: () => void }) {
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
    <View style={s.directory}>
      <Pressable onPress={onBack} style={s.backButton}><Text style={s.backText}>‹  Rudi Platform Overview</Text></Pressable>
      <Text style={s.sectionEyebrow}>PLATFORM DIRECTORY</Text>
      <Text style={s.sectionTitle}>All Businesses</Text>
      <Text style={s.sectionCopy}>Orodha ya biashara zilizosajiliwa kwenye GUNX SMART BUSINESS. Taarifa hizi zinapatikana kwa akaunti ya Super Admin pekee.</Text>
      <View style={s.searchRow}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Tafuta jina la biashara au email ya mmiliki"
          placeholderTextColor="#8298AA"
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
        <View key={business.shop_id} style={s.businessCard}>
          <View style={s.businessHeading}>
            <View style={s.businessIcon}><Text style={s.businessIconText}>▣</Text></View>
            <View style={s.businessIdentity}>
              <Text style={s.businessName}>{business.business_name}</Text>
              <Text style={s.businessEmail}>{business.owner_email || "Email ya mmiliki haipo"}</Text>
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

export default function PlatformOwnerDashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("Inapakia takwimu za mfumo...");
  const [showNotice, setShowNotice] = useState(false);
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [drawer, setDrawer] = useState<{ title: string; message: string; accent: string } | null>(null);

  const load = useCallback(async () => {
    if (!supabase) {
      setMetrics(null);
      setNotice("Supabase haijaunganishwa. Takwimu za moja kwa moja hazipatikani.");
      setLoading(false);
      return;
    }
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

  const unavailable = "--";
  const openDrawer = (title: string, message: string, accent = "#1D4ED8") => setDrawer({ title, message, accent });
  const openModule = (name: string, message: string) => openDrawer(name, message);
  const showBusinesses = () => setSelectedModule("All Businesses");

  return (
    <View style={s.screen}>
      <View style={s.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Akaunti ya Mmiliki"
          onPress={() => openDrawer("Akaunti ya Mmiliki", "Akaunti kuu ya GUNX Super Admin (Mmiliki). Una mamlaka ya kusimamia biashara, watumiaji, vifurushi, usalama na mipangilio ya mfumo.", "#1E3A8A")}
          style={s.accountButton}
        >
          <Text style={s.accountIcon}>♙</Text>
        </Pressable>
        <View style={s.brandBlock}>
          <Image
            accessibilityLabel="GUNX SMART BUSINESS official logo"
            source={require("../../assets/GUNX20Smart20Business20Logo-1.jpg")}
            style={s.brandLogo}
            resizeMode="contain"
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Taarifa za Mfumo"
          onPress={() => setNotificationsOpen(value => !value)}
          style={s.bellButton}
        >
          <Text style={s.bell}>♧</Text>
          <View style={s.bellDot} />
        </Pressable>
      </View>

      {notificationsOpen && (
        <View style={s.notificationStrip}>
          <View style={s.notificationIcon}><Text style={s.notificationIconText}>i</Text></View>
          <View style={s.notificationCopy}>
            <Text style={s.notificationTitle}>Kituo cha Arifa</Text>
            <Text style={s.notificationMessage}>Arifa za mfumo zitaonekana hapa huduma ya notifications ikishawashwa.</Text>
          </View>
          <Pressable onPress={() => setNotificationsOpen(false)} style={s.notificationClose}>
            <Text style={s.notificationCloseText}>Funga</Text>
          </Pressable>
        </View>
      )}

      {selectedModule === "All Businesses" ? (
        <BusinessDirectory onBack={() => setSelectedModule(null)} />
      ) : (
        <>
          <Pressable
            onPress={() => openDrawer("Wasifu wa GUNX Super Admin", "Akaunti kuu ya Mmiliki wa mfumo wa GUNX SMART BUSINESS.", "#1E3A8A")}
            style={s.welcomeBanner}
          >
            <View style={s.welcomeAvatar}>
              <Text style={s.welcomeAvatarIcon}>♙</Text>
              <View style={s.crownBadge}><Text style={s.crownBadgeText}>♛</Text></View>
            </View>
            <View style={s.welcomeCopy}>
              <Text style={s.welcome}>Karibu Tena!</Text>
              <Text style={s.profileName}>GUNX Super Admin</Text>
              <View style={s.ownerBadge}><View style={s.ownerDot}/><Text style={s.ownerText}>Mmiliki</Text></View>
            </View>
          </Pressable>

          <View style={s.sectionHeading}>
            <Text style={s.sectionTitle}>Muhtasari wa Mfumo</Text>
          </View>
          {loading && <View style={s.loading}><ActivityIndicator color="#1D4ED8"/><Text style={s.loadingText}>Inasoma taarifa kutoka server...</Text></View>}

          <View style={s.statsGrid}>
            <StatCard icon="▣" label="Jumla ya Biashara" value={metrics ? metrics.total_shops.toLocaleString("en-US") : loading ? "…" : "--"} tone="blue"/>
            <StatCard icon="♙" label="Jumla ya Watumiaji" value={metrics ? metrics.registrations.toLocaleString("en-US") : loading ? "…" : "--"} tone="blue"/>
            <StatCard icon="↗" label="Jumla ya Mapato" value={unavailable} tone="blue"/>
            <StatCard icon="◈" label="Ufanisi wa Mfumo" value={unavailable} tone="blue"/>
          </View>
          <Text style={s.metricFootnote}>
            Watumiaji hai: {metrics ? metrics.active_7d.toLocaleString("en-US") + " (siku 7) · " + metrics.active_30d.toLocaleString("en-US") + " (siku 30)" : "Takwimu za shughuli zitaonekana baada ya server kurudisha data."}
          </Text>

          <View style={s.sectionHeading}>
            <Text style={s.sectionTitle}>Zana za Usimamizi</Text>
          </View>
          <View style={s.managementGrid}>
            <ManagementCard icon="▣" title="Biashara Zote" description="Orodha na usimamizi wa biashara." onPress={showBusinesses}/>
            <ManagementCard icon="♙" title="Usimamizi wa Watumiaji" description="Akaunti, majukumu na ruhusa." onPress={() => openModule("Usimamizi wa Watumiaji", "Dhibiti akaunti za watumiaji, majukumu na ruhusa za ufikiaji. Sehemu hii itawashwa baada ya kuunganishwa na huduma salama za usimamizi wa watumiaji.")}/>
            <ManagementCard icon="⬡" title="Vifurushi/Usajili" description="Vifurushi, muda na malipo." onPress={() => openModule("Vifurushi/Usajili", "Simamia vifurushi vya huduma, mipango ya usajili, muda wa matumizi na hali ya malipo ya biashara.")}/>
            <ManagementCard icon="⚙" title="Mipangilio ya Mfumo" description="Mipangilio ya jukwaa zima." onPress={() => openModule("Mipangilio ya Mfumo", "Rekebisha mipangilio ya mfumo mzima, sarafu, vigezo vya kiufundi na usanidi wa jukwaa.")}/>
            <ManagementCard icon="◈" title="Mlinzi wa Usalama" description="Uingiaji na kumbukumbu za usalama." onPress={() => openModule("Mlinzi wa Usalama", "Fuatilia usalama wa mfumo, kumbukumbu za kuingia, matukio ya kiusalama na shughuli za akaunti.")}/>
            <ManagementCard icon="▤" title="Ripoti" description="Ukuaji, mapato na matumizi." onPress={() => openModule("Ripoti", "Angalia ripoti za ukuaji wa jukwaa, biashara zilizosajiliwa, matumizi na mapato baada ya data ya kifedha kuunganishwa.")}/>
          </View>

          <Pressable
            onPress={() => openModule("Jopo la GUNX Super Admin", "Uko ndani ya Jopo la GUNX Super Admin kwa ajili ya usimamizi mkuu wa Mmiliki.", "#B45309")}
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

      <Modal visible={!!drawer} transparent animationType="slide" onRequestClose={() => setDrawer(null)}>
        <Pressable style={s.modalBackdrop} onPress={() => setDrawer(null)}>
          <Pressable style={s.drawer} onPress={() => undefined}>
            <View style={s.drawerHandle}/>
            <View style={s.drawerHeader}>
              <View style={[s.drawerIcon, { borderColor: drawer?.accent ?? "#1D4ED8" }]}><Text style={[s.drawerCrown, { color: drawer?.accent ?? "#1D4ED8" }]}>♛</Text></View>
              <View style={s.drawerHeadingCopy}>
                <Text style={s.drawerEyebrow}>GUNX SMART BUSINESS</Text>
                <Text style={s.drawerTitle}>{drawer?.title ?? "Sehemu"}</Text>
              </View>
              <Pressable onPress={() => setDrawer(null)} style={s.drawerClose}><Text style={s.drawerCloseText}>Funga</Text></Pressable>
            </View>
            <Text style={s.drawerMessage}>{drawer?.message}</Text>
            <Pressable onPress={() => setDrawer(null)} style={s.drawerReturn}><Text style={s.drawerReturnText}>Rudi Kwenye Dashboard</Text></Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  accountButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#1E3A8A", borderWidth: 2, borderColor: "#D4AF37", alignItems: "center", justifyContent: "center", elevation: 3 },
  accountIcon: { color: "#FFFFFF", fontSize: 25, fontWeight: "800" },
  notificationStrip: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: "#8FB5E3", backgroundColor: "#D3E4F8", marginBottom: 14 },
  notificationIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.7)", alignItems: "center", justifyContent: "center" },
  notificationIconText: { color: "#1D4ED8", fontSize: 19, fontWeight: "900" },
  notificationCopy: { flex: 1 },
  notificationTitle: { color: "#0F172A", fontSize: 11, fontWeight: "900" },
  notificationMessage: { color: "#1E293B", fontSize: 9, lineHeight: 13, marginTop: 2 },
  notificationClose: { paddingHorizontal: 9, paddingVertical: 7, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.7)" },
  notificationCloseText: { color: "#0F172A", fontSize: 9, fontWeight: "800" },
  welcomeBanner: { flexDirection: "row", alignItems: "center", gap: 14, padding: 15, borderRadius: 22, borderWidth: 1.5, borderColor: "#7BA9E4", backgroundColor: "#AFCBF0", marginBottom: 20, elevation: 2 },
  welcomeAvatar: { width: 66, height: 66, borderRadius: 33, backgroundColor: "#1E3A8A", borderWidth: 3, borderColor: "#EAB308", alignItems: "center", justifyContent: "center" },
  welcomeAvatarIcon: { color: "#FFFFFF", fontSize: 31, fontWeight: "800" },
  crownBadge: { position: "absolute", top: -5, right: -5, width: 25, height: 25, borderRadius: 13, backgroundColor: "#EAB308", borderWidth: 2, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  crownBadgeText: { color: "#0F172A", fontSize: 14, fontWeight: "900" },
  welcomeCopy: { flex: 1, minWidth: 0 },
  ownerDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#4ADE80" },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15,23,42,0.55)" },
  drawer: { width: "100%", maxWidth: 600, alignSelf: "center", backgroundColor: "#FFFFFF", borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, borderTopWidth: 1, borderColor: "#DCE5EC" },
  drawerHandle: { width: 42, height: 6, borderRadius: 4, backgroundColor: "#CBD5E1", alignSelf: "center", marginBottom: 18 },
  drawerHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  drawerIcon: { width: 44, height: 44, borderRadius: 13, backgroundColor: "#E6EFF8", borderWidth: 1, alignItems: "center", justifyContent: "center" },
  drawerCrown: { fontSize: 23, fontWeight: "900" },
  drawerHeadingCopy: { flex: 1 },
  drawerEyebrow: { color: "#64748B", fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  drawerTitle: { color: "#0F172A", fontSize: 17, fontWeight: "900", marginTop: 3 },
  drawerClose: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, backgroundColor: "#F1F5F9" },
  drawerCloseText: { color: "#334155", fontSize: 10, fontWeight: "800" },
  drawerMessage: { color: "#1E293B", fontSize: 12, lineHeight: 19, padding: 15, borderRadius: 16, backgroundColor: "#E6EFF8", borderWidth: 1, borderColor: "#8FB5E3", marginTop: 17 },
  drawerReturn: { backgroundColor: "#0F172A", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 14 },
  drawerReturnText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  screen: { position: "relative", overflow: "hidden", paddingHorizontal: 16, paddingTop: 10, paddingBottom: 34, maxWidth: 600, width: "100%", alignSelf: "center", backgroundColor: "#E6EFF8", minHeight: 500 },
  gridOverlay: { ...StyleSheet.absoluteFillObject, opacity: 0 },
  gridVertical: { position: "absolute", top: 0, bottom: 0, width: 1, backgroundColor: "#2A5367" },
  gridHorizontal: { position: "absolute", left: 0, right: 0, height: 1, backgroundColor: "#2A5367" },
  glowTop: { position: "absolute", top: -100, right: -100, width: 230, height: 230, borderRadius: 120, backgroundColor: "#FFFFFF", opacity: 0 },
  glowBottom: { position: "absolute", bottom: 140, left: -130, width: 250, height: 250, borderRadius: 130, backgroundColor: "#FFFFFF", opacity: 0 },
  header: { position: "relative", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 14, minHeight: 82, backgroundColor: "#E6EFF8" },
  brandBlock: { flex: 1, minWidth: 0, alignItems: "center", justifyContent: "center", backgroundColor: "transparent", padding: 0 },
  brandLogo: { width: 238, height: 78 },
  bellButton: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: "#93B8E4", backgroundColor: "#D2E3F7", alignItems: "center", justifyContent: "center" },
  bell: { color: "#1E3A8A", fontSize: 23, fontWeight: "800" },
  bellDot: { position: "absolute", width: 9, height: 9, borderRadius: 5, backgroundColor: "#DC2626", top: 8, right: 9, borderWidth: 1, borderColor: "#D2E3F7" },
  profileCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: "#DCE5EC", backgroundColor: "#F7FAFC", marginBottom: 22 },
  avatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: "#183C42", borderWidth: 2, borderColor: "#D8B86F", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#F4D994", fontSize: 17, fontWeight: "900" },
  profileCopy: { flex: 1 },
  welcome: { color: "#1E293B", fontSize: 14, fontWeight: "600" },
  profileName: { color: "#0F172A", fontSize: 21, fontWeight: "900", marginTop: 3 },
  ownerBadge: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6, backgroundColor: "#4E74A6", borderColor: "#4E74A6", borderWidth: 1, borderRadius: 20, paddingHorizontal: 15, paddingVertical: 5, marginTop: 8 },
  crown: { color: "#F1D18A", fontSize: 12 },
  ownerText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800", letterSpacing: 0.4 },
  accessPill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#123B35", borderRadius: 20, paddingHorizontal: 8, paddingVertical: 6 },
  accessDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#4BD5A1" },
  accessText: { color: "#75DDB8", fontSize: 7, fontWeight: "900" },
  sectionHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 4, marginBottom: 7 },
  sectionEyebrow: { color: "#16845D", fontSize: 8, fontWeight: "900", letterSpacing: 1.6 },
  sectionTitle: { color: "#0F172A", fontSize: 19, fontWeight: "900", marginTop: 3 },
  sectionCopy: { color: "#687B8D", fontSize: 11, lineHeight: 17, marginBottom: 12 },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#123A34", borderRadius: 18, paddingHorizontal: 9, paddingVertical: 6, marginBottom: 3 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#51D8A4" },
  liveText: { color: "#7DE0BC", fontSize: 7, fontWeight: "900", letterSpacing: 0.8 },
  loading: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, padding: 11, backgroundColor: "#D3E4F8", borderRadius: 10, marginBottom: 10 },
  loadingText: { color: "#1E293B", fontSize: 10 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  statCard: { width: "48%", minHeight: 116, padding: 12, borderRadius: 18, borderWidth: 1.5, borderColor: "#8FB5E3", backgroundColor: "#C7DCF4", justifyContent: "center" },
  statIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center", marginBottom: 9, backgroundColor: "rgba(255,255,255,0.62)" },
  blueIcon: { backgroundColor: "rgba(255,255,255,0.62)" },
  goldIcon: { backgroundColor: "rgba(255,255,255,0.62)" },
  greenIcon: { backgroundColor: "rgba(255,255,255,0.62)" },
  statIconText: { fontSize: 25, fontWeight: "900" },
  blueText: { color: "#1D4ED8" },
  goldText: { color: "#1D4ED8" },
  greenText: { color: "#1D4ED8" },
  statLabel: { color: "#1E293B", fontSize: 11, fontWeight: "700", letterSpacing: 0 },
  statValue: { color: "#0F172A", fontSize: 20, fontWeight: "900", marginTop: 5 },
  metricFootnote: { color: "#6B7D8E", fontSize: 9, lineHeight: 15, marginTop: 9, marginBottom: 17 },
  toolCount: { color: "#D9B96F", fontSize: 8, fontWeight: "900", letterSpacing: 1, marginBottom: 3 },
  managementGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 5 },
  managementCard: { width: "31%", minHeight: 112, borderRadius: 18, borderWidth: 1.5, borderColor: "#8FB5E3", backgroundColor: "#C8DCF3", padding: 9, justifyContent: "center" },
  pressed: { opacity: 0.75, borderColor: "#D8B86F" },
  managementTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 9 },
  managementIcon: { width: 43, height: 43, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.65)", alignItems: "center", justifyContent: "center" },
  managementIconText: { color: "#1D4ED8", fontSize: 25, fontWeight: "900" },
  chevron: { color: "#718B9E", fontSize: 23, marginTop: -4 },
  managementTitle: { color: "#0F172A", fontSize: 11, fontWeight: "900" },
  managementDescription: { color: "#1E293B", fontSize: 8, lineHeight: 12, marginTop: 5 },
  panelButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#E7B51C", borderWidth: 1.5, borderColor: "#B45309", borderRadius: 16, paddingVertical: 15, paddingHorizontal: 14, marginTop: 19, shadowColor: "#CA8A04", shadowOpacity: 0.2, shadowRadius: 10, elevation: 3 },
  panelButtonPressed: { opacity: 0.82 },
  panelCrown: { color: "#172536", fontSize: 19 },
  panelButtonText: { color: "#152436", fontSize: 13, fontWeight: "900", letterSpacing: 0.2 },
  panelArrow: { color: "#152436", fontSize: 22, fontWeight: "900" },
  notice: { backgroundColor: "#F4F8FB", borderColor: "#C69D48", borderWidth: 1, borderRadius: 11, padding: 12, marginTop: 12 },
  noticeText: { color: "#24394B", fontSize: 11, lineHeight: 17 },
  noticeDismiss: { color: "#E2C477", fontSize: 8, fontWeight: "900", marginTop: 8, textAlign: "right" },
  refresh: { alignItems: "center", padding: 11, marginTop: 9 },
  refreshText: { color: "#1D4ED8", fontSize: 10, fontWeight: "800" },
  footer: { color: "#8A6415", fontSize: 9, fontWeight: "900", letterSpacing: 1, textAlign: "center", marginTop: 13, padding: 10, borderRadius: 9, backgroundColor: "#FFF8E8", borderWidth: 1, borderColor: "#E8D6A8" },
  footerNote: { color: "#758596", fontSize: 8, lineHeight: 13, textAlign: "center", marginTop: 7 },
  directory: { marginTop: 5 },
  backButton: { alignSelf: "flex-start", paddingVertical: 9, paddingHorizontal: 12, borderRadius: 9, backgroundColor: "#EDF4F8", borderWidth: 1, borderColor: "#D5E0E8", marginBottom: 17 },
  backText: { color: "#176D54", fontSize: 11, fontWeight: "900" },
  searchRow: { flexDirection: "row", gap: 8, marginTop: 8, marginBottom: 12 },
  searchInput: { flex: 1, minWidth: 0, color: "#172B3D", backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#D5E0E8", borderRadius: 10, paddingHorizontal: 11, paddingVertical: 11, fontSize: 11 },
  searchButton: { backgroundColor: "#176B56", borderRadius: 10, justifyContent: "center", paddingHorizontal: 13 },
  searchButtonText: { color: "#EFFFF8", fontSize: 9, fontWeight: "900" },
  directorySummary: { padding: 13, borderRadius: 12, backgroundColor: "#F1F7FC", borderWidth: 1, borderColor: "#D8E5EF", marginBottom: 10 },
  directorySummaryLabel: { color: "#63788B", fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  directorySummaryValue: { color: "#8A6415", fontSize: 23, fontWeight: "900", marginTop: 4 },
  directorySummaryHint: { color: "#758596", fontSize: 8, marginTop: 3 },
  businessCard: { padding: 13, borderRadius: 13, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DCE5EC", marginBottom: 9 },
  businessHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  businessIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: "#153D60", alignItems: "center", justifyContent: "center" },
  businessIconText: { color: "#62B9F5", fontSize: 20 },
  businessIdentity: { flex: 1 },
  businessName: { color: "#172B3D", fontSize: 13, fontWeight: "900" },
  businessEmail: { color: "#6B7D8E", fontSize: 9, marginTop: 3 },
  businessMeta: { flexDirection: "row", gap: 8, marginTop: 12 },
  metaItem: { flex: 1, backgroundColor: "#F2F6F9", padding: 8, borderRadius: 8 },
  metaLabel: { color: "#718397", fontSize: 7, fontWeight: "900" },
  metaValue: { color: "#8A6415", fontSize: 10, fontWeight: "900", marginTop: 4 },
  businessDate: { color: "#687B8D", fontSize: 9, marginTop: 10 },
  businessId: { color: "#8191A0", fontSize: 7, marginTop: 5 },
  emptyBox: { padding: 20, borderRadius: 12, backgroundColor: "#F7FAFC", borderWidth: 1, borderColor: "#DCE5EC", alignItems: "center" },
  emptyTitle: { color: "#172B3D", fontSize: 13, fontWeight: "900", marginBottom: 5 },
  errorBox: { padding: 12, borderRadius: 10, backgroundColor: "#3A2025", borderWidth: 1, borderColor: "#8A4148", marginBottom: 10 },
  errorText: { color: "#FFD6D6", fontSize: 10, lineHeight: 15 }
});
