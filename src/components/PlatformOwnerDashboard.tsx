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

export default function PlatformOwnerDashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("Inapakia takwimu za mfumo...");
  const [showNotice, setShowNotice] = useState(false);

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

  const unavailable = "Haijaunganishwa";
  const openModule = (name: string) => {
    setNotice(name + " bado inaandaliwa. Itafunguliwa baada ya kuunganishwa na huduma salama za mfumo.");
    setShowNotice(true);
  };

  return (
    <View style={s.screen}>
      <View pointerEvents="none" style={s.gridOverlay}>
        {Array.from({ length: 13 }, (_, i) => <View key={"v" + i} style={[s.gridVertical, { left: (i * 8.333) + "%" }]} />)}
        {Array.from({ length: 18 }, (_, i) => <View key={"h" + i} style={[s.gridHorizontal, { top: (i * 34) }]} />)}
      </View>
      <View pointerEvents="none" style={s.glowTop} />
      <View pointerEvents="none" style={s.glowBottom} />

      <View style={s.header}>
        <View style={s.brandBlock}>
          <Image
            accessibilityLabel="GUNX SMART BUSINESS official logo"
            source={require("../../assets/GUNX20Smart20Business20Logo-1.jpg")}
            style={s.brandLogo}
            resizeMode="contain"
          />
          <View style={s.brandCopy}>
            <Text style={s.brandName}>GUNX <Text style={s.brandGold}>SMART BUSINESS</Text></Text>
            <Text style={s.brandSub}>PLATFORM CONTROL CENTER</Text>
          </View>
        </View>
        <Pressable onPress={() => { setNotice("Arifa za mfumo zitaonekana hapa baada ya notification service kuunganishwa."); setShowNotice(true); }} style={s.bellButton}>
          <Text style={s.bell}>♧</Text>
          <View style={s.bellDot} />
        </Pressable>
      </View>

      <View style={s.profileCard}>
        <View style={s.avatar}><Text style={s.avatarText}>GA</Text></View>
        <View style={s.profileCopy}>
          <Text style={s.welcome}>WELCOME BACK!</Text>
          <Text style={s.profileName}>GUNX Super Admin</Text>
          <View style={s.ownerBadge}><Text style={s.crown}>♛</Text><Text style={s.ownerText}>OWNER</Text></View>
        </View>
        <View style={s.accessPill}><View style={s.accessDot}/><Text style={s.accessText}>ROOT ACCESS</Text></View>
      </View>

      <View style={s.sectionHeading}>
        <View>
          <Text style={s.sectionEyebrow}>SYSTEM-WIDE CONTROL</Text>
          <Text style={s.sectionTitle}>Platform Overview</Text>
        </View>
        <View style={s.liveBadge}><View style={s.liveDot}/><Text style={s.liveText}>PLATFORM</Text></View>
      </View>
      <Text style={s.sectionCopy}>Muhtasari wa biashara na watumiaji wote waliosajiliwa kwenye GUNX SMART BUSINESS.</Text>

      {loading && <View style={s.loading}><ActivityIndicator color="#42D6A0"/><Text style={s.loadingText}>Inasoma taarifa kutoka server...</Text></View>}

      <View style={s.statsGrid}>
        <StatCard icon="▣" label="TOTAL BUSINESSES" value={metrics ? metrics.total_shops.toLocaleString("en-US") : loading ? "…" : "—"} tone="blue"/>
        <StatCard icon="♙" label="TOTAL USERS" value={metrics ? metrics.registrations.toLocaleString("en-US") : loading ? "…" : "—"} tone="blue"/>
        <StatCard icon="↗" label="TOTAL REVENUE" value={unavailable} tone="gold"/>
        <StatCard icon="⬡" label="SYSTEM UPTIME" value={unavailable} tone="green"/>
      </View>
      <Text style={s.metricFootnote}>Active users: {metrics ? metrics.active_7d.toLocaleString("en-US") + " (siku 7) · " + metrics.active_30d.toLocaleString("en-US") + " (siku 30)" : "Takwimu za shughuli zitaonekana baada ya server kurudisha data."}</Text>

      <View style={s.sectionHeading}>
        <View>
          <Text style={s.sectionEyebrow}>ADMINISTRATION</Text>
          <Text style={s.sectionTitle}>Management Tools</Text>
        </View>
        <Text style={s.toolCount}>06 MODULES</Text>
      </View>
      <View style={s.managementGrid}>
        <ManagementCard icon="▣" title="All Businesses" description="Hakiki na simamia biashara zote." onPress={() => openModule("All Businesses")}/>
        <ManagementCard icon="♙" title="Users Management" description="Akaunti, majukumu na ruhusa." onPress={() => openModule("Users Management")}/>
        <ManagementCard icon="⬡" title="Subscriptions" description="Vifurushi, muda na malipo." onPress={() => openModule("Subscriptions")}/>
        <ManagementCard icon="⚙" title="System Settings" description="Mipangilio ya jukwaa zima." onPress={() => openModule("System Settings")}/>
        <ManagementCard icon="◈" title="Security Monitor" description="Uingiaji, matukio na security logs." onPress={() => openModule("Security Monitor")}/>
        <ManagementCard icon="▤" title="Reports" description="Ukuaji, mapato na matumizi." onPress={() => openModule("Reports")}/>
      </View>

      <Pressable onPress={() => openModule("GUNX Super Admin Panel")} style={({ pressed }) => [s.panelButton, pressed && s.panelButtonPressed]}>
        <Text style={s.panelCrown}>♛</Text>
        <Text style={s.panelButtonText}>GUNX Super Admin Panel</Text>
        <Text style={s.panelArrow}>›</Text>
      </Pressable>

      {showNotice && <Pressable onPress={() => setShowNotice(false)} style={s.notice}><Text style={s.noticeText}>{notice}</Text><Text style={s.noticeDismiss}>GUSA KUFUNGA</Text></Pressable>}
      <Pressable onPress={() => void load()} style={s.refresh}><Text style={s.refreshText}>↻  Refresh platform data</Text></Pressable>
      <Text style={s.footer}>WEWE – SUPER ADMIN (MMILIKI WA APP)</Text>
      <Text style={s.footerNote}>Revenue, uptime, arifa na kurasa za usimamizi zitaonyesha taarifa halisi baada ya huduma husika kuunganishwa.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { position: "relative", overflow: "hidden", padding: 16, paddingBottom: 34, maxWidth: 900, width: "100%", alignSelf: "center", backgroundColor: "#071523" },
  gridOverlay: { ...StyleSheet.absoluteFillObject, opacity: 0.16 },
  gridVertical: { position: "absolute", top: 0, bottom: 0, width: 1, backgroundColor: "#2A5367" },
  gridHorizontal: { position: "absolute", left: 0, right: 0, height: 1, backgroundColor: "#2A5367" },
  glowTop: { position: "absolute", top: -100, right: -100, width: 230, height: 230, borderRadius: 120, backgroundColor: "#0D5A4A", opacity: 0.14 },
  glowBottom: { position: "absolute", bottom: 140, left: -130, width: 250, height: 250, borderRadius: 130, backgroundColor: "#80652D", opacity: 0.10 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 17 },
  brandBlock: { flexDirection: "row", alignItems: "center", flex: 1, gap: 10 },
  brandLogo: { width: 68, height: 55 },
  brandCopy: { flex: 1 },
  brandName: { color: "#F7F8FA", fontSize: 14, fontWeight: "900", letterSpacing: 0.3 },
  brandGold: { color: "#D8B86F" },
  brandSub: { color: "#78DDB8", fontSize: 8, fontWeight: "900", letterSpacing: 1.4, marginTop: 4 },
  bellButton: { width: 42, height: 42, borderRadius: 13, borderWidth: 1, borderColor: "#29475B", backgroundColor: "#102638", alignItems: "center", justifyContent: "center" },
  bell: { color: "#F2D99A", fontSize: 23, fontWeight: "800" },
  bellDot: { position: "absolute", width: 7, height: 7, borderRadius: 4, backgroundColor: "#E6B94F", top: 8, right: 9 },
  profileCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: "#31485A", backgroundColor: "#102437", marginBottom: 22 },
  avatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: "#183C42", borderWidth: 2, borderColor: "#D8B86F", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#F4D994", fontSize: 17, fontWeight: "900" },
  profileCopy: { flex: 1 },
  welcome: { color: "#8EA4B6", fontSize: 8, fontWeight: "900", letterSpacing: 1.4 },
  profileName: { color: "#FFFFFF", fontSize: 16, fontWeight: "900", marginTop: 3 },
  ownerBadge: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 4, backgroundColor: "#493B20", borderColor: "#B8954D", borderWidth: 1, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, marginTop: 6 },
  crown: { color: "#F1D18A", fontSize: 12 },
  ownerText: { color: "#F1D18A", fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  accessPill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#123B35", borderRadius: 20, paddingHorizontal: 8, paddingVertical: 6 },
  accessDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#4BD5A1" },
  accessText: { color: "#75DDB8", fontSize: 7, fontWeight: "900" },
  sectionHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 4, marginBottom: 7 },
  sectionEyebrow: { color: "#52CFA1", fontSize: 8, fontWeight: "900", letterSpacing: 1.6 },
  sectionTitle: { color: "#F7F8FA", fontSize: 21, fontWeight: "900", marginTop: 3 },
  sectionCopy: { color: "#93A7B8", fontSize: 11, lineHeight: 17, marginBottom: 12 },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#123A34", borderRadius: 18, paddingHorizontal: 9, paddingVertical: 6, marginBottom: 3 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#51D8A4" },
  liveText: { color: "#7DE0BC", fontSize: 7, fontWeight: "900", letterSpacing: 0.8 },
  loading: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, padding: 11, backgroundColor: "#102638", borderRadius: 10, marginBottom: 10 },
  loadingText: { color: "#A8B8C5", fontSize: 10 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  statCard: { width: "48%", minHeight: 122, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: "#263F52", backgroundColor: "#102437", justifyContent: "center" },
  statIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 9 },
  blueIcon: { backgroundColor: "#153D60" },
  goldIcon: { backgroundColor: "#4B4025" },
  greenIcon: { backgroundColor: "#153F37" },
  statIconText: { fontSize: 18, fontWeight: "900" },
  blueText: { color: "#62B9F5" },
  goldText: { color: "#F1CC68" },
  greenText: { color: "#62D8A8" },
  statLabel: { color: "#91A6B8", fontSize: 8, fontWeight: "900", letterSpacing: 0.6 },
  statValue: { color: "#F7F8FA", fontSize: 17, fontWeight: "900", marginTop: 6 },
  metricFootnote: { color: "#8299AA", fontSize: 9, lineHeight: 15, marginTop: 9, marginBottom: 17 },
  toolCount: { color: "#D9B96F", fontSize: 8, fontWeight: "900", letterSpacing: 1, marginBottom: 3 },
  managementGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginTop: 5 },
  managementCard: { width: "48%", minHeight: 120, borderRadius: 14, borderWidth: 1, borderColor: "#294357", backgroundColor: "#102638", padding: 12 },
  pressed: { opacity: 0.75, borderColor: "#D8B86F" },
  managementTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 9 },
  managementIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: "#173C3B", alignItems: "center", justifyContent: "center" },
  managementIconText: { color: "#D9B96F", fontSize: 19, fontWeight: "900" },
  chevron: { color: "#718B9E", fontSize: 23, marginTop: -4 },
  managementTitle: { color: "#F4F7FA", fontSize: 12, fontWeight: "900" },
  managementDescription: { color: "#8FA5B6", fontSize: 9, lineHeight: 14, marginTop: 5 },
  panelButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#C69D48", borderWidth: 1, borderColor: "#F1D58E", borderRadius: 13, paddingVertical: 14, paddingHorizontal: 14, marginTop: 19, shadowColor: "#C69D48", shadowOpacity: 0.18, shadowRadius: 10, elevation: 3 },
  panelButtonPressed: { opacity: 0.82 },
  panelCrown: { color: "#172536", fontSize: 19 },
  panelButtonText: { color: "#152436", fontSize: 13, fontWeight: "900", letterSpacing: 0.2 },
  panelArrow: { color: "#152436", fontSize: 22, fontWeight: "900" },
  notice: { backgroundColor: "#172F3F", borderColor: "#C69D48", borderWidth: 1, borderRadius: 11, padding: 12, marginTop: 12 },
  noticeText: { color: "#F0F4F6", fontSize: 11, lineHeight: 17 },
  noticeDismiss: { color: "#E2C477", fontSize: 8, fontWeight: "900", marginTop: 8, textAlign: "right" },
  refresh: { alignItems: "center", padding: 11, marginTop: 9 },
  refreshText: { color: "#79DDB8", fontSize: 10, fontWeight: "800" },
  footer: { color: "#E2C477", fontSize: 9, fontWeight: "900", letterSpacing: 1, textAlign: "center", marginTop: 13, padding: 10, borderRadius: 9, backgroundColor: "#172B3A", borderWidth: 1, borderColor: "#55472B" },
  footerNote: { color: "#748B9D", fontSize: 8, lineHeight: 13, textAlign: "center", marginTop: 7 }
});
