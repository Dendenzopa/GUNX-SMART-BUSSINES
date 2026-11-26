import React, { useEffect, useMemo, useState } from "react";
import { GUNX_OFFICIAL_LOGO } from "../branding";
import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import type { Product, Sale, Expense, DebtEntry } from "../domain/types";
import type { PendingSale } from "../services/offlineSales";
import { supabase } from "../lib/supabase";
import { formatTZS, totalSales } from "../domain/money";

type Props = {
  shopId: string | null;
  sales: Sale[];
  products: Product[];
  expenses: Expense[];
  debts: DebtEntry[];
  pendingSales: PendingSale[];
  notice: string;
  online: boolean | null;
  onNavigate: (screen: "POS" | "Stock" | "Staff" | "Reports" | "Debts" | "Expenses" | "Subscription") => void;
};
type HeroMediaType = "owner_photo" | "business_logo";
type ChartSale = { id: string; createdAt: string; total: number; status: string };

function profileFromUser(user: any) {
  const identity = user?.identities?.find((item: any) => item.provider === "google")?.identity_data ?? {};
  const metadata = user?.user_metadata ?? {};
  const given = identity.given_name ?? metadata.given_name ?? "";
  const family = identity.family_name ?? metadata.family_name ?? "";
  const displayName = identity.name ?? identity.full_name ?? identity.display_name ??
    metadata.full_name ?? metadata.name ?? metadata.display_name ??
    [given, family].filter(Boolean).join(" ");
  return {
    name: typeof displayName === "string" && displayName.trim() ? displayName.trim() : (user?.email ?? "Mmiliki wa Biashara"),
    email: user?.email ?? "",
    photo: identity.picture ?? metadata.avatar_url ?? metadata.picture ?? null,
  };
}


function smoothLinePoints(points: Array<{ x: number; y: number }>) {
  if (points.length < 3) return points;
  const result = [points[0]];
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[Math.max(0, index - 1)];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[Math.min(points.length - 1, index + 2)];
    for (let step = 1; step <= 5; step += 1) {
      const t = step / 5;
      const t2 = t * t;
      const t3 = t2 * t;
      const interpolate = (a: number, b: number, d: number, e: number) =>
        0.5 * ((2 * b) + (-a + d) * t + (2 * a - 5 * b + 4 * d - e) * t2 + (-a + 3 * b - 3 * d + e) * t3);
      result.push({ x: interpolate(p0.x, p1.x, p2.x, p3.x), y: interpolate(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  return result;
}

export default function OwnerBusinessDashboard({ shopId, sales, products, expenses, debts, pendingSales, notice, online, onNavigate }: Props) {
  const [businessName, setBusinessName] = useState("Biashara Yangu");
  const [ownerName, setOwnerName] = useState("Mmiliki wa Biashara");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [googlePhoto, setGooglePhoto] = useState<string | null>(null);
  const [staffCount, setStaffCount] = useState<number | null>(null);
  const [period, setPeriod] = useState<"Leo" | "Wiki">("Leo");
  const [periodMenu, setPeriodMenu] = useState(false);
  const [heroMediaType, setHeroMediaType] = useState<HeroMediaType | null>(null);
  const [heroMediaUrl, setHeroMediaUrl] = useState<string | null>(null);
  const [chartLiveSales, setChartLiveSales] = useState<ChartSale[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const mediaKey = "@gunx-owner-hero-media:" + (shopId ?? "local");

  useEffect(() => {
    let active = true;
    const applyProfile = (user: any) => {
      const profile = profileFromUser(user);
      if (!active) return;
      setOwnerName(profile.name);
      setOwnerEmail(profile.email);
      setGooglePhoto(profile.photo);
    };
    if (supabase) {
      supabase.auth.getSession().then(({ data }) => { if (active && data.session?.user) applyProfile(data.session.user); });
      const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) applyProfile(session.user);
        else if (active) { setOwnerName("Mmiliki wa Biashara"); setOwnerEmail(""); setGooglePhoto(null); }
      });
      void AsyncStorage.getItem(mediaKey).then(raw => {
        if (!active || !raw) return;
        try { const saved = JSON.parse(raw); if (saved?.uri && (saved.type === "owner_photo" || saved.type === "business_logo")) { setHeroMediaUrl(saved.uri); setHeroMediaType(saved.type); } } catch {}
      }).catch(() => {});
      if (shopId) {
        supabase.from("shops").select("name,hero_media_type,hero_media_url").eq("id", shopId).maybeSingle().then(({ data }) => {
          if (!active || !data) return;
          if (data.name) setBusinessName(data.name);
          if (data.hero_media_type === "owner_photo" || data.hero_media_type === "business_logo") setHeroMediaType(data.hero_media_type);
          if (typeof data.hero_media_url === "string" && data.hero_media_url) setHeroMediaUrl(data.hero_media_url);
        });
        supabase.from("shop_members").select("user_id,role").eq("shop_id", shopId).neq("role", "owner").then(({ data, error }) => {
          if (active && !error) setStaffCount((data ?? []).length);
        });
      }
      return () => { active = false; authListener.subscription.unsubscribe(); };
    }
    return () => { active = false; };
  }, [shopId, mediaKey]);

  useEffect(() => {
    if (!supabase || !shopId) return;
    let active = true;
    const loadChartSales = async () => {
      const { data, error } = await supabase!.from("sales").select("id,created_at,total,status").eq("shop_id", shopId).order("created_at", { ascending: false });
      if (!active || error || !data) return;
      setChartLiveSales(data.map((row: any) => ({ id: row.id, createdAt: row.created_at, total: Number(row.total), status: row.status })));
    };
    void loadChartSales();
    const channel = supabase.channel("owner-sales-chart-" + shopId)
      .on("postgres_changes", { event: "*", schema: "public", table: "sales", filter: "shop_id=eq." + shopId }, () => { void loadChartSales(); })
      .subscribe();
    return () => { active = false; void supabase!.removeChannel(channel); };
  }, [shopId]);

  const chartSales = useMemo(() => {
    const merged = new Map<string, ChartSale>();
    sales.forEach(item => merged.set(item.id, { id: item.id, createdAt: item.createdAt, total: item.total, status: item.status }));
    chartLiveSales.forEach(item => merged.set(item.id, item));
    return Array.from(merged.values()).filter(item => item.status !== "pending_sync" && item.status !== "refunded" && item.status !== "voided");
  }, [sales, chartLiveSales]);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todaySales = chartSales.filter(item => new Date(item.createdAt) >= todayStart);
  const lowStock = products.filter(item => item.active && item.stockQuantity <= item.reorderLevel);
  const activeProducts = products.filter(item => item.active).length;
  const stockValue = products.filter(item => item.active).reduce((sum, item) => sum + item.costPrice * item.stockQuantity, 0);
  const chartPoints = useMemo(() => {
    if (period === "Leo") {
      return Array.from({ length: 7 }, (_, index) => {
        const start = new Date(); start.setHours(8 + index * 2, 0, 0, 0);
        const end = new Date(start); end.setHours(end.getHours() + 2);
        const amount = chartSales.filter(item => { const date = new Date(item.createdAt); return date >= start && date < end; }).reduce((sum, item) => sum + item.total, 0);
        return { label: String(8 + index * 2).padStart(2, "0") + ":00", amount };
      });
    }
    return Array.from({ length: 7 }, (_, index) => {
      const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (6 - index));
      const end = new Date(start); end.setDate(end.getDate() + 1);
      const amount = chartSales.filter(item => { const date = new Date(item.createdAt); return date >= start && date < end; }).reduce((sum, item) => sum + item.total, 0);
      return { label: start.toLocaleDateString("sw-TZ", { weekday: "short" }), amount };
    });
  }, [chartSales, period]);
  const chartMax = Math.max(1, ...chartPoints.map(point => point.amount));
  const chartTotal = chartPoints.reduce((sum, point) => sum + point.amount, 0);
  const growing = chartPoints[chartPoints.length - 1].amount >= chartPoints[0].amount;
  const chartColor = growing ? "#159A70" : "#D69E0B";
  const chartCoords = chartPoints.map((point, index) => ({
    x: 7 + index * (126 / Math.max(1, chartPoints.length - 1)),
    y: 91 - (point.amount / chartMax) * 68,
  }));

  const smoothCoords = smoothLinePoints(chartCoords);

  const pickHeroMedia = async (type: HeroMediaType) => {
    setMenuOpen(false);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.85 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setMediaBusy(true);
    try {
      let publicUrl = asset.uri;
      if (supabase && shopId) {
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        const extension = (asset.mimeType?.split("/")[1] ?? "jpg").replace("jpeg", "jpg");
        const path = shopId + "/" + type + "-" + Date.now() + "." + extension;
        const { error: uploadError } = await supabase.storage.from("shop-branding").upload(path, blob, { contentType: asset.mimeType ?? "image/jpeg", upsert: true });
        if (uploadError) throw uploadError;
        publicUrl = supabase.storage.from("shop-branding").getPublicUrl(path).data.publicUrl;
        const { error: updateError } = await supabase.from("shops").update({ hero_media_type: type, hero_media_url: publicUrl }).eq("id", shopId);
        if (updateError) throw updateError;
      } else {
        await AsyncStorage.setItem(mediaKey, JSON.stringify({ type, uri: publicUrl }));
      }
      setHeroMediaType(type);
      setHeroMediaUrl(publicUrl);
    } catch (error) {
      console.warn("Unable to save business hero media", error);
    } finally { setMediaBusy(false); }
  };
  const clearHeroMedia = async () => {
    if (supabase && shopId) {
      const { error } = await supabase.from("shops").update({ hero_media_type: null, hero_media_url: null }).eq("id", shopId);
      if (error) return;
    } else {
      try { await AsyncStorage.removeItem(mediaKey); } catch {}
    }
    setHeroMediaType(null); setHeroMediaUrl(null); setMenuOpen(false);
  };

  return <View style={s.container}>
    <View style={s.hero}>
      <View style={s.topBar}>
        <Pressable accessibilityLabel="Fungua menyu ya mmiliki" onPress={() => setMenuOpen(true)} style={s.headerIcon}>
          <Text style={s.headerIconText}>☰</Text>
        </Pressable>
        <Image source={GUNX_OFFICIAL_LOGO} resizeMode="contain" style={s.brandLogo} />
        <Pressable accessibilityLabel="Arifa za biashara" onPress={() => setNotificationsOpen(true)} style={s.headerIcon}>
          <Text style={s.headerIconText}>♧</Text>{(lowStock.length > 0 || pendingSales.length > 0) && <View style={s.notificationDot} />}
        </Pressable>
      </View>
      <View style={s.heroIdentity}>
        <Pressable accessibilityLabel="Ongeza nembo ya biashara" onPress={() => void pickHeroMedia("business_logo")} style={s.logoUploadBanner}>
          <View style={s.logoPreview}>
            {heroMediaUrl && heroMediaType === "business_logo" ? <Image source={{ uri: heroMediaUrl }} style={s.heroImage} resizeMode="contain" /> : <Text style={s.heroPlaceholder}>＋</Text>}
          </View>
          <View style={s.logoUploadCopy}>
            <Text style={s.logoUploadTitle}>{mediaBusy ? "Inahifadhi..." : "Add Photo"}</Text>
            <Text style={s.logoUploadSubtitle}>(Your Business Logo)</Text>
            <Text numberOfLines={1} style={s.businessName}>{businessName}</Text>
          </View>
          <View style={s.verifiedPill}><Text style={s.verifiedCheck}>✓</Text><Text style={s.verifiedText}>Biashara Yako</Text></View>
        </Pressable>
        <Text style={s.onlineText}>{online === false ? "● OFFLINE" : online === true ? "● ONLINE" : "● INAANGALIA MUUNGANISHO"}</Text>
      </View>
    </View>

    <View style={s.lowerContent}>
      <View style={s.serviceGrid}>
        <Pressable onPress={() => onNavigate("POS")} style={[s.serviceTile, { backgroundColor: "#155EEF" }]}>
          <Text style={s.serviceIcon}>🛒</Text><Text style={s.serviceLabel}>Mauzo ya Leo</Text>
        </Pressable>
        <Pressable onPress={() => onNavigate("Stock")} style={[s.serviceTile, { backgroundColor: "#15803D" }]}>
          <Text style={s.serviceIcon}>📦</Text><Text style={s.serviceLabel}>Stock Kuu</Text>
        </Pressable>
        <Pressable onPress={() => onNavigate("Staff")} style={[s.serviceTile, { backgroundColor: "#7C3AED" }]}>
          <Text style={s.serviceIcon}>👥</Text><Text style={s.serviceLabel}>Wafanyakazi</Text>
        </Pressable>
        <Pressable onPress={() => onNavigate("Reports")} style={[s.serviceTile, { backgroundColor: "#D69E0B" }]}>
          <Text style={s.serviceIcon}>📄</Text><Text style={s.serviceLabel}>Ripoti</Text>
        </Pressable>
      </View>

      <View style={s.summarySection}>
        <View style={s.summaryHeading}><Text style={s.summaryIcon}>▥</Text><Text style={s.summaryTitle}>Muhtasari wa Biashara</Text><Text style={s.summaryPeriod}>Leo</Text></View>
        <View style={s.summaryGrid}>
          <View style={s.summaryTile}><Text style={s.summaryTileIcon}>🛒</Text><Text style={s.summaryTileLabel}>Mauzo ya Leo</Text><Text numberOfLines={1} style={s.summaryTileValue}>{formatTZS(totalSales(todaySales))}</Text></View>
          <View style={s.summaryTile}><Text style={s.summaryTileIcon}>📦</Text><Text style={s.summaryTileLabel}>Bidhaa Hai</Text><Text style={s.summaryTileValue}>{activeProducts}</Text></View>
          <View style={s.summaryTile}><Text style={s.summaryTileIcon}>👛</Text><Text style={s.summaryTileLabel}>Madeni</Text><Text numberOfLines={1} style={s.summaryTileValue}>{formatTZS(debts.reduce((sum, item) => sum + item.balance, 0))}</Text></View>
          <View style={s.summaryTile}><Text style={s.summaryTileIcon}>💰</Text><Text style={s.summaryTileLabel}>Thamani ya Stock</Text><Text numberOfLines={1} style={s.summaryTileValue}>{formatTZS(stockValue)}</Text></View>
        </View>
      </View>

      <View style={s.midSection}>
        <View style={[s.chartCard, s.splitCard]}>
          <View style={s.cardHeader}>
            <View style={s.chartTitleRow}><Text style={s.chartTitleIcon}>▥</Text><Text style={s.cardTitle}>Muhtasari wa Mauzo</Text></View>
            <Pressable onPress={() => setPeriodMenu(value => !value)} style={s.periodSelect}>
              <Text style={s.periodSelectText}>{period}⌄</Text>
            </Pressable>
          </View>
          {periodMenu && <View style={s.periodOptions}>
            {(["Leo", "Wiki"] as const).map(option => <Pressable key={option} onPress={() => { setPeriod(option); setPeriodMenu(false); }} style={s.periodOption}><Text style={s.periodOptionText}>{option}</Text></Pressable>)}
          </View>}
          <Text numberOfLines={1} style={s.chartTotal}>{formatTZS(chartTotal)}</Text>
          <View style={s.chartLegend}><Text style={s.chartSubLabel}>Mauzo {period.toLowerCase()}</Text><Text style={[s.trendPill, { color: chartColor }]}>{growing ? "↗ Mwenendo chanya" : "↘ Mwelekeo umeshuka"}</Text></View>
          <View style={s.chartPlot}>
            <View style={[s.chartGridLine, { top: 22 }]} /><View style={[s.chartGridLine, { top: 57 }]} />
            <View style={s.chartYAxis}><Text style={s.axisSmall}>{formatTZS(chartMax)}</Text><Text style={s.axisSmall}>0</Text></View>
            {chartPoints.map((point, index) => {
              const coord = chartCoords[index];
              const barHeight = Math.max(2, (point.amount / chartMax) * 70);
              return <View key={"fill-" + point.label} style={[s.areaColumn, { left: coord.x - 5, height: barHeight, backgroundColor: chartColor }]} />;
            })}
            {smoothCoords.slice(1).map((point, index) => {
              const previous = smoothCoords[index];
              const dx = point.x - previous.x; const dy = point.y - previous.y;
              return <View key={"line-" + index} style={[s.lineSegment, { left: previous.x, top: previous.y, width: Math.sqrt(dx * dx + dy * dy), backgroundColor: chartColor, transform: [{ rotate: Math.atan2(dy, dx) * 180 / Math.PI + "deg" }] }]} />;
            })}
            {chartCoords.map((point, index) => <View key={"dot-" + index} style={[s.chartDot, { left: point.x - 3.5, top: point.y - 3.5, borderColor: chartColor }]} />)}
            <View style={[s.chartCallout, { left: Math.min(92, Math.max(4, chartCoords[chartCoords.length - 1].x - 20)), borderColor: chartColor }]}><Text style={[s.chartCalloutText, { color: chartColor }]}>{formatTZS(chartPoints[chartPoints.length - 1].amount)}</Text></View>
          </View>
          <View style={s.chartAxis}>{chartPoints.map(point => <Text key={point.label} style={s.axisText}>{period === "Leo" ? point.label.slice(0, 2) : point.label.slice(0, 3)}</Text>)}</View>
          <Text style={s.chartFoot}>Hujisasisha mauzo yanapoingia · {chartLiveSales.length} rekodi za moja kwa moja</Text>
        </View>

        <View style={[s.quickCard, s.splitCard]}>
          <View style={s.quickTitleRow}><Text style={s.quickBolt}>ϟ</Text><Text style={s.cardTitle}>Vitendo vya Haraka</Text></View>
          <Pressable onPress={() => onNavigate("Stock")} style={s.quickRow}><Text style={[s.quickBadge, { backgroundColor: "#16A34A" }]}>＋</Text><Text style={s.quickLabel}>Ongeza Bidhaa</Text><Text style={s.chevron}>›</Text></Pressable>
          <Pressable onPress={() => onNavigate("Staff")} style={s.quickRow}><Text style={[s.quickBadge, { backgroundColor: "#2563EB" }]}>♟</Text><Text style={s.quickLabel}>Ongeza Mfanyakazi</Text><Text style={s.chevron}>›</Text></Pressable>
          <Pressable onPress={() => onNavigate("Reports")} style={s.quickRow}><Text style={[s.quickBadge, { backgroundColor: "#D69E0B" }]}>▥</Text><Text style={s.quickLabel}>Angalia Ripoti</Text><Text style={s.chevron}>›</Text></Pressable>
          <Pressable onPress={() => onNavigate("Stock")} style={s.quickRow}><Text style={[s.quickBadge, { backgroundColor: "#2563EB" }]}>↓</Text><Text style={s.quickLabel}>Dhibiti Stock</Text><Text style={s.chevron}>›</Text></Pressable>
        </View>
      </View>

      <View style={s.systemCard}>
        <View style={s.systemHeading}><Text style={s.systemBell}>♧</Text><Text style={s.cardTitle}>Taarifa za Mfumo</Text></View>
        {lowStock.length > 0 && <View style={s.systemRow}><View style={[s.systemDot,{backgroundColor:"#F59E0B"}]}/><Text style={s.systemText}>{lowStock.length} bidhaa zinahitaji kuongezewa stock</Text><Text style={s.chevron}>›</Text></View>}
        {pendingSales.length > 0 && <View style={s.systemRow}><View style={[s.systemDot,{backgroundColor:"#2563EB"}]}/><Text style={s.systemText}>{pendingSales.length} mauzo yanasubiri kusawazishwa</Text><Text style={s.chevron}>›</Text></View>}
        {online === false && <View style={s.systemRow}><View style={[s.systemDot,{backgroundColor:"#EA580C"}]}/><Text style={s.systemText}>Hakuna muunganisho wa intaneti kwa sasa</Text><Text style={s.chevron}>›</Text></View>}
        {lowStock.length === 0 && pendingSales.length === 0 && online !== false && <View style={s.systemRow}><View style={[s.systemDot,{backgroundColor:"#16A34A"}]}/><Text style={s.systemText}>Biashara yako iko tayari — hakuna tahadhari mpya</Text><Text style={s.chevron}>›</Text></View>}
        {!!notice && <View style={s.systemRow}><View style={[s.systemDot,{backgroundColor:"#7C3AED"}]}/><Text style={s.systemText}>{notice}</Text><Text style={s.chevron}>›</Text></View>}
      </View>
      {lowStock.length > 0 && <View style={s.stockAlert}>
        <Text style={s.alertTitle}>Tahadhari ya Stock · {lowStock.length}</Text>
        {lowStock.slice(0, 3).map(item => <Text key={item.id} style={s.alertText}>{item.name} — {item.stockQuantity} {item.unit}</Text>)}
        <Pressable onPress={() => onNavigate("Stock")}><Text style={s.alertLink}>Fungua Stock →</Text></Pressable>
      </View>}
      <View style={s.bottomNav}>
        <Pressable onPress={() => onNavigate("POS")} style={[s.bottomNavItem, { backgroundColor: "#155EEF" }]}><Text style={s.bottomNavIcon}>🛒</Text><Text style={s.bottomNavLabel}>Mauzo (POS)</Text></Pressable>
        <Pressable onPress={() => onNavigate("Stock")} style={[s.bottomNavItem, { backgroundColor: "#15803D" }]}><Text style={s.bottomNavIcon}>📦</Text><Text style={s.bottomNavLabel}>Stock</Text></Pressable>
        <Pressable onPress={() => onNavigate("Staff")} style={[s.bottomNavItem, { backgroundColor: "#7C3AED" }]}><Text style={s.bottomNavIcon}>👥</Text><Text style={s.bottomNavLabel}>Wafanyakazi</Text></Pressable>
        <Pressable onPress={() => onNavigate("Reports")} style={[s.bottomNavItem, { backgroundColor: "#D69E0B" }]}><Text style={s.bottomNavIcon}>📄</Text><Text style={s.bottomNavLabel}>Ripoti</Text></Pressable>
      </View>
      <View style={s.footer}><Text style={s.footerLogo}>G</Text><View style={s.footerCopy}><Text style={s.footerName}>{businessName}</Text><Text style={s.footerTag}>Smart Business Better Future</Text><Text style={s.footerPrivacy}>Your Business, Your Data, Your Privacy.</Text></View><Text style={s.footerValue}>{formatTZS(stockValue)}</Text></View>
      <View style={s.goalCard}>
        <View style={s.goalHeading}><Text style={s.goalIcon}>◎</Text><Text style={s.goalTitle}>Malengo ya Biashara</Text></View>
        <Text style={s.goalMessage}>Pamoja Tunaijenga Biashara Yako</Text>
        <View style={s.goalBottom}>
          <Pressable onPress={() => onNavigate("Reports")} style={s.goalButton}><Text style={s.goalButtonText}>Anza Sasa →</Text></Pressable>
          <View style={s.goalChart} accessibilityLabel="Grafu ya ukuaji wa biashara">
            <View style={[s.goalBar,{height:22,backgroundColor:"#2563EB"}]}/>
            <View style={[s.goalBar,{height:34,backgroundColor:"#1D8CE0"}]}/>
            <View style={[s.goalBar,{height:47,backgroundColor:"#16A085"}]}/>
            <View style={[s.goalBar,{height:62,backgroundColor:"#16A34A"}]}/>
            <Text style={s.goalArrow}>↗</Text>
          </View>
        </View>
      </View>
      {!!pendingSales.length && <Text style={s.notice}>{pendingSales.length} mauzo yanasubiri kusawazishwa.</Text>}
      {!!notice && <Text style={s.notice}>{notice}</Text>}
    </View>

    <Modal visible={menuOpen} transparent animationType="slide" onRequestClose={() => setMenuOpen(false)}>
      <Pressable style={s.modalBackdrop} onPress={() => setMenuOpen(false)}>
        <Pressable style={s.drawer} onPress={() => {}}>
          <View style={s.drawerHandle} /><View style={s.drawerHeader}><Text style={s.drawerTitle}>Menyu ya Mmiliki</Text><Pressable onPress={() => setMenuOpen(false)}><Text style={s.closeText}>✕</Text></Pressable></View>
          <Text style={s.drawerBusiness}>{businessName}</Text><Text style={s.drawerSection}>NEMBO YA BIASHARA</Text>
          
          <Pressable style={s.drawerRow} disabled={mediaBusy} onPress={() => void pickHeroMedia("business_logo")}><Text style={s.drawerRowText}>Weka logo ya biashara</Text><Text style={s.drawerChevron}>›</Text></Pressable>
          {!!heroMediaUrl && <Pressable style={s.drawerRow} onPress={() => void clearHeroMedia()}><Text style={s.drawerRowText}>Ondoa picha ya banner</Text><Text style={s.drawerChevron}>›</Text></Pressable>}
          <Text style={s.drawerFoot}>{mediaBusy ? "Inahifadhi picha..." : "Picha huhifadhiwa kwenye mipangilio ya biashara."}</Text>
        </Pressable>
      </Pressable>
    </Modal>
    <Modal visible={notificationsOpen} transparent animationType="fade" onRequestClose={() => setNotificationsOpen(false)}>
      <Pressable style={s.modalBackdrop} onPress={() => setNotificationsOpen(false)}>
        <Pressable style={s.notificationPanel} onPress={() => {}}>
          <View style={s.drawerHeader}><Text style={s.drawerTitle}>Arifa za Biashara</Text><Pressable onPress={() => setNotificationsOpen(false)}><Text style={s.closeText}>✕</Text></Pressable></View>
          {lowStock.length === 0 && pendingSales.length === 0 && !notice ? <Text style={s.emptyNotice}>Hakuna arifa mpya kwa sasa.</Text> : <>
            {lowStock.length > 0 && <Pressable onPress={() => { setNotificationsOpen(false); onNavigate("Stock"); }} style={s.noticeRow}><Text style={s.noticeHeading}>Stock inakaribia kuisha</Text><Text style={s.noticeBody}>{lowStock.length} bidhaa ziko chini ya kiwango cha kuagiza.</Text></Pressable>}
            {pendingSales.length > 0 && <View style={s.noticeRow}><Text style={s.noticeHeading}>Mauzo yanasubiri kusawazishwa</Text><Text style={s.noticeBody}>{pendingSales.length} mauzo yanasubiri muunganisho wa mtandao.</Text></View>}
            {!!notice && <View style={s.noticeRow}><Text style={s.noticeHeading}>Taarifa ya mfumo</Text><Text style={s.noticeBody}>{notice}</Text></View>}
          </>}
        </Pressable>
      </Pressable>
    </Modal>
  </View>;
}

const s = StyleSheet.create({
  container: { backgroundColor: "#FFFFFF", paddingBottom: 20, gap: 0 },
  hero: { backgroundColor: "#0B1F4A", paddingHorizontal: 13, paddingTop: 13, paddingBottom: 15, borderBottomLeftRadius: 17, borderBottomRightRadius: 17, elevation: 3 },
  topBar: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", minHeight: 56, gap: 5 },
  
  
  
  
  
  
  
  brandLogo: { width: 116, height: 73 },
  headerIcon: { width: 34, height: 34, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" },
  headerIconText: { color: "#FFFFFF", fontSize: 22, fontWeight: "900" },
  notificationDot: { position: "absolute", right: 4, top: 4, width: 7, height: 7, borderRadius: 4, backgroundColor: "#FACC15", borderWidth: 1, borderColor: "#FFFFFF" },
  heroIdentity: { flexDirection: "column", alignItems: "stretch", marginTop: 12, gap: 7 },
  logoUploadBanner: { width: "100%", minHeight: 82, flexDirection: "row", alignItems: "center", gap: 12, padding: 10, borderRadius: 13, borderWidth: 1, borderStyle: "dashed", borderColor: "rgba(255,255,255,0.8)", backgroundColor: "rgba(37,99,235,0.42)" },
  logoPreview: { width: 58, height: 58, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  logoUploadCopy: { flex: 1, minWidth: 0 },
  logoUploadTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  logoUploadSubtitle: { color: "#DBEAFE", fontSize: 9, marginTop: 2 },
  heroCopy: { flex: 1 },
  ownerEmailText: { color: "#CBD5E1", fontSize: 8, marginTop: 2 },
  verifiedPill: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", backgroundColor: "#15803D", borderRadius: 20, paddingHorizontal: 7, paddingVertical: 3, marginTop: 5, gap: 4 },
  verifiedCheck: { color: "#15803D", backgroundColor: "#FFFFFF", width: 13, height: 13, borderRadius: 7, textAlign: "center", fontSize: 9, fontWeight: "900", overflow: "hidden" },
  verifiedText: { color: "#FFFFFF", fontSize: 8, fontWeight: "900" },
  businessName: { color: "#FFFFFF", fontSize: 20, fontWeight: "900" },
  heroTag: { color: "#E0F2FE", fontSize: 10, fontWeight: "800", marginTop: 4 },
  onlineText: { color: "#D1FAE5", fontSize: 9, fontWeight: "900", marginTop: 7 },
  heroMedia: { width: 76, height: 76, borderRadius: 15, borderWidth: 2, borderColor: "#F2D99F", backgroundColor: "#075985", alignItems: "center", justifyContent: "center" },
  heroImage: { width: 72, height: 72, borderRadius: 13 },
  heroPlaceholder: { color: "#FFFFFF", fontSize: 27, fontWeight: "900" },
  cameraBadge: { position: "absolute", right: -5, bottom: -5, width: 21, height: 21, borderRadius: 11, backgroundColor: "#15803D", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#FFFFFF" },
  cameraBadgeText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  lowerContent: { backgroundColor: "#FFFFFF", paddingHorizontal: 11, paddingTop: 13, gap: 12 },
  serviceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "space-between" },
  serviceTile: { width: "48%", aspectRatio: 1.5, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, justifyContent: "center", alignItems: "center", elevation: 2 },
  serviceIcon: { color: "#FFFFFF", fontSize: 23, fontWeight: "900" },
  serviceLabel: { color: "#FFFFFF", fontSize: 10, fontWeight: "900", marginTop: 5, textAlign: "center" },
  
  summarySection: { gap: 8 },
  summaryHeading: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "#155EEF", paddingHorizontal: 11, paddingVertical: 9, borderRadius: 10 },
  summaryIcon: { color: "#FFFFFF", fontSize: 17, fontWeight: "900" },
  summaryTitle: { color: "#FFFFFF", fontSize: 12, fontWeight: "900", flex: 1 },
  summaryPeriod: { color: "#155EEF", backgroundColor: "#FFFFFF", borderRadius: 14, overflow: "hidden", paddingHorizontal: 10, paddingVertical: 4, fontSize: 9, fontWeight: "900" },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "space-between" },
  summaryTile: { width: "48%", minHeight: 78, backgroundColor: "#F0F7FF", borderRadius: 11, borderWidth: 1, borderColor: "#DBEAFE", padding: 9, justifyContent: "center" },
  summaryTileIcon: { fontSize: 17 },
  summaryTileLabel: { color: "#64748B", fontSize: 9, fontWeight: "800", marginTop: 3 },
  summaryTileValue: { color: "#0B1F4A", fontSize: 11, fontWeight: "900", marginTop: 3 },
  systemCard: { backgroundColor: "#FFFFFF", borderRadius: 13, padding: 11, borderWidth: 1, borderColor: "#E2E8F0", elevation: 1, gap: 2 },
  systemHeading: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 3 },
  systemBell: { color: "#155EEF", fontSize: 18, fontWeight: "900" },
  systemRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 9, borderTopWidth: 1, borderTopColor: "#F1F5F9" },
  systemDot: { width: 8, height: 8, borderRadius: 5 },
  systemText: { flex: 1, color: "#334155", fontSize: 10, fontWeight: "700" },
  midSection: { flexDirection: "column", alignItems: "stretch", gap: 10 },
  splitCard: { width: "100%", minWidth: 0 },
  chartCard: { backgroundColor: "#FFFFFF", borderRadius: 13, padding: 9, borderWidth: 1, borderColor: "#E2E8F0", elevation: 1 },
  quickCard: { backgroundColor: "#FFFFFF", borderRadius: 13, padding: 9, borderWidth: 1, borderColor: "#E2E8F0", elevation: 1 },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 3 },
  cardTitle: { color: "#0B1F4A", fontSize: 11, fontWeight: "900", flexShrink: 1 },
  chartTitleRow: { flexDirection: "row", alignItems: "center", gap: 4, flex: 1 },
  chartTitleIcon: { color: "#0B1F4A", fontSize: 17, fontWeight: "900" },
  quickTitleRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 2 },
  quickBolt: { color: "#D69E0B", fontSize: 19, fontWeight: "900" },
  periodSelect: { backgroundColor: "#EFF6FF", paddingHorizontal: 7, paddingVertical: 5, borderRadius: 7 },
  periodSelectText: { color: "#155EEF", fontSize: 9, fontWeight: "900" },
  periodOptions: { position: "absolute", zIndex: 5, right: 8, top: 35, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DBEAFE", borderRadius: 7, elevation: 4 },
  periodOption: { paddingHorizontal: 12, paddingVertical: 7 },
  periodOptionText: { color: "#0B1F4A", fontSize: 10, fontWeight: "800" },
  chartTotal: { color: "#0B1F4A", fontSize: 13, fontWeight: "900", marginTop: 8 },
  chartLegend: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 3, marginTop: 2 },
  chartSubLabel: { color: "#64748B", fontSize: 8 },
  trendPill: { fontSize: 7, fontWeight: "900" },
  chartPlot: { height: 105, marginTop: 7, position: "relative", overflow: "hidden" },
  chartGridLine: { position: "absolute", left: 0, right: 0, borderTopWidth: 1, borderColor: "#E8EEF5", borderStyle: "dashed" },
  chartYAxis: { position: "absolute", left: 0, top: 0, bottom: 0, justifyContent: "space-between", zIndex: 3 },
  axisSmall: { color: "#94A3B8", fontSize: 7 },
  areaColumn: { position: "absolute", bottom: 5, width: 21, opacity: 0.13, borderTopLeftRadius: 5, borderTopRightRadius: 5 },
  lineSegment: { position: "absolute", height: 2.5, borderRadius: 3, zIndex: 2 },
  chartDot: { position: "absolute", width: 7, height: 7, borderRadius: 4, backgroundColor: "#FFFFFF", borderWidth: 2, zIndex: 3 },
  chartCallout: { position: "absolute", top: 1, backgroundColor: "#FFFFFF", borderWidth: 1, borderRadius: 8, paddingHorizontal: 4, paddingVertical: 2, zIndex: 4 },
  chartCalloutText: { fontSize: 7, fontWeight: "900" },
  chartAxis: { flexDirection: "row", justifyContent: "space-between", paddingLeft: 12 },
  axisText: { color: "#64748B", fontSize: 7 },
  chartFoot: { color: "#94A3B8", fontSize: 7, marginTop: 6 },
  quickRow: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  quickBadge: { width: 25, height: 25, borderRadius: 13, color: "#FFFFFF", fontSize: 15, fontWeight: "900", textAlign: "center", textAlignVertical: "center", overflow: "hidden" },
  quickLabel: { flex: 1, color: "#243B53", fontSize: 9, fontWeight: "800" },
  chevron: { color: "#94A3B8", fontSize: 16 },
  stockAlert: { backgroundColor: "#FFF8E8", borderColor: "#F4D58A", borderWidth: 1, borderRadius: 12, padding: 12 },
  alertTitle: { color: "#8A5A00", fontSize: 12, fontWeight: "900", marginBottom: 5 },
  alertText: { color: "#5B4826", fontSize: 11, paddingVertical: 3 },
  alertLink: { color: "#8A5A00", fontSize: 11, fontWeight: "900", marginTop: 5 },
  bottomNav: { flexDirection: "row", gap: 7, justifyContent: "space-between" },
  bottomNavItem: { flex: 1, minWidth: 0, minHeight: 68, borderRadius: 11, alignItems: "center", justifyContent: "center", paddingVertical: 7, paddingHorizontal: 3, elevation: 2 },
  bottomNavIcon: { color: "#FFFFFF", fontSize: 23 },
  bottomNavLabel: { color: "#FFFFFF", fontSize: 8, fontWeight: "900", textAlign: "center", marginTop: 3 },
  footer: { backgroundColor: "#0B1F4A", borderRadius: 12, padding: 11, flexDirection: "row", alignItems: "center", gap: 9 },
  footerLogo: { color: "#F2D99F", fontSize: 23, fontWeight: "900" },
  footerCopy: { flex: 1 },
  footerName: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  footerTag: { color: "#D7B56D", fontSize: 8, marginTop: 3 },
  footerValue: { color: "#F2D99F", fontSize: 9, fontWeight: "900" },
  goalCard: { width: "100%", backgroundColor: "#F8FBFF", borderRadius: 16, padding: 15, borderWidth: 1, borderColor: "#BFDBFE", elevation: 3, overflow: "hidden" },
  goalHeading: { flexDirection: "row", alignItems: "center", gap: 8 },
  goalIcon: { color: "#155EEF", fontSize: 25, fontWeight: "900" },
  goalTitle: { color: "#0B1F4A", fontSize: 15, fontWeight: "900" },
  goalMessage: { color: "#0B1F4A", fontSize: 17, fontWeight: "900", marginTop: 9 },
  goalBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, minHeight: 76 },
  goalButton: { backgroundColor: "#159A70", borderRadius: 22, paddingHorizontal: 19, paddingVertical: 10, elevation: 2 },
  goalButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  goalChart: { flexDirection: "row", alignItems: "flex-end", gap: 6, height: 72, paddingRight: 15 },
  goalBar: { width: 13, borderTopLeftRadius: 5, borderTopRightRadius: 5 },
  goalArrow: { position: "absolute", right: -2, top: -2, color: "#159A70", fontSize: 25, fontWeight: "900" },
  footerPrivacy: { color: "#FFFFFF", fontSize: 7, marginTop: 3 },

  notice: { color: "#166534", backgroundColor: "#DCFCE7", padding: 10, borderRadius: 9, fontSize: 10 },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(5,15,35,0.58)" },
  drawer: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 23, borderTopRightRadius: 23, padding: 19, paddingBottom: 30, borderTopWidth: 3, borderColor: "#D7B56D" },
  drawerHandle: { width: 42, height: 5, borderRadius: 4, backgroundColor: "#CBD5E1", alignSelf: "center", marginBottom: 17 },
  drawerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  drawerTitle: { color: "#0B1F4A", fontSize: 19, fontWeight: "900" },
  closeText: { color: "#334155", fontSize: 17, fontWeight: "900" },
  drawerBusiness: { color: "#64748B", fontSize: 12, fontWeight: "700", marginTop: 5, marginBottom: 15 },
  drawerSection: { color: "#64748B", fontSize: 10, fontWeight: "900", letterSpacing: 1.1, marginTop: 9, marginBottom: 4 },
  drawerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "#EEF2F7" },
  drawerRowText: { color: "#243B53", fontSize: 13, fontWeight: "800" },
  drawerChevron: { color: "#94A3B8", fontSize: 21 },
  drawerFoot: { color: "#8A6415", fontSize: 10, fontWeight: "800", textAlign: "center", marginTop: 17 },
  notificationPanel: { backgroundColor: "#FFFFFF", margin: 18, borderRadius: 18, padding: 17, borderTopWidth: 3, borderColor: "#D7B56D" },
  noticeRow: { backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 11, padding: 12, marginTop: 10 },
  noticeHeading: { color: "#0B1F4A", fontSize: 13, fontWeight: "900" },
  noticeBody: { color: "#475569", fontSize: 12, lineHeight: 18, marginTop: 4 },
  emptyNotice: { color: "#64748B", fontSize: 13, paddingVertical: 22, textAlign: "center" },
});
