import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Product } from "../domain/types";
import type { PendingSale } from "../services/offlineSales";
import { formatTZS } from "../domain/money";
import { supabase } from "../lib/supabase";

type StaffRole = "cashier" | "stockkeeper";
type StaffSale = { id: string; receiptNumber: string; createdAt: string; total: number; status: string; itemCount: number };

type Props = {
  shopId: string | null;
  userId: string;
  role: StaffRole;
  products: Product[];
  pendingSales: PendingSale[];
  online: boolean | null;
  notice: string;
  onNavigate: (screen: "POS" | "Stock" | "Sync") => void;
};

export default function StaffDashboard({ shopId, userId, role, products, pendingSales, online, notice, onNavigate }: Props) {
  const [staffName, setStaffName] = useState("Mfanyakazi");
  const [businessName, setBusinessName] = useState("Biashara Yangu");
  const [mySales, setMySales] = useState<StaffSale[]>([]);
  const [loadingSales, setLoadingSales] = useState(role === "cashier");
  const [salesError, setSalesError] = useState("");

  useEffect(() => {
    let active = true;
    async function loadIdentity() {
      if (!supabase || !shopId) return;
      const [{ data: auth }, { data: shop }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from("shops").select("name").eq("id", shopId).maybeSingle(),
      ]);
      if (!active) return;
      const user = auth.user;
      const metadata = user?.user_metadata ?? {};
      const name = metadata.full_name ?? metadata.name ?? metadata.display_name;
      setStaffName(typeof name === "string" && name.trim() ? name.trim() : (user?.email?.split("@")[0] || "Mfanyakazi"));
      if (shop?.name) setBusinessName(shop.name);
    }
    void loadIdentity();
    return () => { active = false; };
  }, [shopId]);

  useEffect(() => {
    let active = true;
    async function loadOwnSales() {
      if (role !== "cashier" || !supabase || !shopId) {
        setLoadingSales(false);
        return;
      }
      setLoadingSales(true);
      setSalesError("");
      const { data, error } = await supabase
        .from("sales")
        .select("id,receipt_number,created_at,total,status,sale_items(quantity)")
        .eq("shop_id", shopId)
        .eq("created_by", userId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (!active) return;
      if (error) {
        setSalesError("Mauzo yako hayakuweza kupakiwa. Ruhusa za database zimeendelea kulinda taarifa zako.");
        setMySales([]);
      } else {
        setMySales((data ?? []).map((sale: any) => ({
          id: sale.id,
          receiptNumber: sale.receipt_number,
          createdAt: sale.created_at,
          total: Number(sale.total),
          status: sale.status,
          itemCount: (sale.sale_items ?? []).reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0),
        })));
      }
      setLoadingSales(false);
    }
    void loadOwnSales();
    return () => { active = false; };
  }, [role, shopId, userId]);

  const todaySales = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return mySales.filter(sale => new Date(sale.createdAt) >= start && sale.status !== "refunded" && sale.status !== "voided");
  }, [mySales]);
  const todayTotal = todaySales.reduce((sum, sale) => sum + sale.total, 0);
  const activeProducts = products.filter(product => product.active);
  const lowStock = activeProducts.filter(product => product.stockQuantity <= product.reorderLevel);

  const tile = (icon: string, title: string, detail: string, target: "POS" | "Stock" | "Sync", color: string) => (
    <Pressable key={target} onPress={() => onNavigate(target)} style={[s.tile, { borderColor: color }]}>
      <Text style={[s.tileIcon, { color }]}>{icon}</Text>
      <Text style={s.tileTitle}>{title}</Text>
      <Text style={s.tileDetail}>{detail}</Text>
    </Pressable>
  );

  return <ScrollView style={s.container} contentContainerStyle={s.content}>
    <View style={s.hero}>
      <View style={s.heroTop}>
        <View style={s.brandMark}><Text style={s.brandMarkText}>G</Text></View>
        <View style={s.heroIdentity}>
          <Text style={s.business}>{businessName}</Text>
          <Text style={s.brand}>GUNX SMART BUSINESS</Text>
        </View>
        <View style={[s.status, online === false ? s.offline : s.online]}>
          <View style={[s.dot, online === false ? s.dotOff : s.dotOn]}/>
          <Text style={s.statusText}>{online === false ? "Offline" : online === true ? "Online" : "..."}</Text>
        </View>
      </View>
      <Text style={s.welcome}>Karibu, {staffName}</Text>
      <Text style={s.role}>{role === "cashier" ? "CASHIER · MFANYAKAZI" : "STOCKKEEPER · MFANYAKAZI"}</Text>
      <Text style={s.privacy}>Unaona taarifa na vitendo vinavyoruhusiwa kwa nafasi yako pekee.</Text>
    </View>

    <Text style={s.sectionTitle}>Muhtasari wa kazi</Text>
    {role === "cashier" ? <>
      <View style={s.metrics}>
        <View style={s.metric}><Text style={s.metricLabel}>Mauzo yako leo</Text><Text style={s.metricValue}>{formatTZS(todayTotal)}</Text></View>
        <View style={s.metric}><Text style={s.metricLabel}>Risiti leo</Text><Text style={s.metricValue}>{String(todaySales.length)}</Text></View>
        <View style={s.metric}><Text style={s.metricLabel}>Bidhaa ulizouza</Text><Text style={s.metricValue}>{String(todaySales.reduce((sum, sale) => sum + sale.itemCount, 0))}</Text></View>
        <View style={s.metric}><Text style={s.metricLabel}>Mauzo offline</Text><Text style={s.metricValue}>{String(pendingSales.length)}</Text></View>
      </View>
    </> : <>
      <View style={s.metrics}>
        <View style={s.metric}><Text style={s.metricLabel}>Bidhaa zinazofuatiliwa</Text><Text style={s.metricValue}>{String(activeProducts.length)}</Text></View>
        <View style={s.metric}><Text style={s.metricLabel}>Stock ndogo</Text><Text style={s.metricValue}>{String(lowStock.length)}</Text></View>
      </View>
      <Text style={s.helper}>Taarifa za mauzo, faida, gharama na madeni hazionyeshwi kwenye dashboard ya Stockkeeper.</Text>
    </>}

    <Text style={s.sectionTitle}>Vitendo vya haraka</Text>
    <View style={s.tiles}>
      {role === "cashier"
        ? <>{tile("＋", "Mauzo mapya", "Fungua POS na uza bidhaa", "POS", "#D7B56D")}{tile("▤", "Mauzo yangu", "Risiti zako 50 za mwisho", "Sync", "#43C99A")}</>
        : <>{tile("▦", "Angalia stock", "Bidhaa na kiasi kilichopo", "Stock", "#43C99A")}</>}
    </View>

    {role === "cashier" && <>
      <View style={s.sectionHeader}><Text style={s.sectionTitle}>Mauzo yangu ya hivi karibuni</Text><Text style={s.count}>Hadi 50</Text></View>
      {loadingSales ? <ActivityIndicator color="#43C99A" style={s.loader}/> : salesError ? <Text style={s.helper}>{salesError}</Text> : mySales.length === 0 ? <Text style={s.empty}>Bado hakuna mauzo yaliyohusishwa na akaunti yako.</Text> :
        mySales.slice(0, 8).map(sale => <View key={sale.id} style={s.saleRow}>
          <View style={s.saleCopy}><Text style={s.saleReceipt}>Risiti {sale.receiptNumber}</Text><Text style={s.saleMeta}>{new Date(sale.createdAt).toLocaleString("sw-TZ")} · {sale.itemCount} bidhaa</Text></View>
          <View style={s.saleAmount}><Text style={s.saleTotal}>{formatTZS(sale.total)}</Text><Text style={s.saleStatus}>{sale.status === "completed" ? "Imekamilika" : sale.status}</Text></View>
        </View>)
      }
    </>}

    {role === "stockkeeper" && lowStock.length > 0 && <>
      <Text style={s.sectionTitle}>Tahadhari ya stock</Text>
      {lowStock.slice(0, 6).map(product => <View key={product.id} style={s.stockRow}>
        <View style={s.saleCopy}><Text style={s.saleReceipt}>{product.name}</Text><Text style={s.saleMeta}>Kiwango cha chini: {product.reorderLevel} {product.unit}</Text></View>
        <Text style={s.lowStock}>{product.stockQuantity} {product.unit}</Text>
      </View>)}
    </>}

    {!!notice && <Text style={s.notice}>{notice}</Text>}
    <Text style={s.footer}>GUNX SMART BUSINESS · Biashara Yako, Mafanikio Yetu</Text>
  </ScrollView>;
}

const s = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 14, paddingBottom: 34, maxWidth: 900, width: "100%", alignSelf: "center" },
  hero: { backgroundColor: "#0B1F4A", borderRadius: 18, borderWidth: 1, borderColor: "#D7B56D", padding: 16, marginBottom: 16 },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 9 },
  brandMark: { width: 42, height: 42, borderRadius: 12, backgroundColor: "#123B35", borderWidth: 1, borderColor: "#D7B56D", alignItems: "center", justifyContent: "center" },
  brandMarkText: { color: "#F2D99F", fontSize: 24, fontWeight: "900" },
  heroIdentity: { flex: 1 },
  business: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  brand: { color: "#D7B56D", fontSize: 9, fontWeight: "900", letterSpacing: 1, marginTop: 3 },
  status: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 20 },
  online: { backgroundColor: "#123B35" },
  offline: { backgroundColor: "#553A22" },
  dot: { width: 7, height: 7, borderRadius: 4 },
  dotOn: { backgroundColor: "#43C99A" },
  dotOff: { backgroundColor: "#F5A524" },
  statusText: { color: "#FFFFFF", fontSize: 9, fontWeight: "800" },
  welcome: { color: "#FFFFFF", fontSize: 21, fontWeight: "900", marginTop: 18 },
  role: { color: "#F2D99F", fontSize: 10, fontWeight: "900", letterSpacing: 1, marginTop: 5 },
  privacy: { color: "#D7E4F0", fontSize: 11, lineHeight: 17, marginTop: 9 },
  sectionTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "900", marginTop: 12, marginBottom: 9 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  metric: { width: "48%", flexGrow: 1, minHeight: 82, padding: 12, backgroundColor: "#102438", borderRadius: 13, borderWidth: 1, borderColor: "#1D3A50", justifyContent: "center" },
  metricLabel: { color: "#C1CED8", fontSize: 10, fontWeight: "800" },
  metricValue: { color: "#F2D99F", fontSize: 18, fontWeight: "900", marginTop: 6 },
  helper: { color: "#C1CED8", fontSize: 11, lineHeight: 18, marginTop: 8 },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: { flex: 1, minWidth: "46%", minHeight: 108, backgroundColor: "#102438", borderWidth: 1, borderRadius: 14, padding: 13, justifyContent: "center" },
  tileIcon: { fontSize: 24, fontWeight: "900", marginBottom: 6 },
  tileTitle: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  tileDetail: { color: "#C1CED8", fontSize: 10, lineHeight: 15, marginTop: 4 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  count: { color: "#D7B56D", fontSize: 10, fontWeight: "800" },
  loader: { marginVertical: 18 },
  empty: { color: "#C1CED8", backgroundColor: "#102438", borderRadius: 12, padding: 14, fontSize: 12, marginTop: 4 },
  saleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, backgroundColor: "#102438", borderWidth: 1, borderColor: "#1D3A50", borderRadius: 12, padding: 12, marginTop: 8 },
  saleCopy: { flex: 1 },
  saleReceipt: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  saleMeta: { color: "#91A4B5", fontSize: 10, marginTop: 4 },
  saleAmount: { alignItems: "flex-end" },
  saleTotal: { color: "#F2D99F", fontSize: 12, fontWeight: "900" },
  saleStatus: { color: "#75E0B8", fontSize: 9, marginTop: 3 },
  stockRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, backgroundColor: "#102438", borderRadius: 11, padding: 12, marginTop: 7 },
  lowStock: { color: "#F2D99F", fontSize: 12, fontWeight: "900" },
  notice: { color: "#75E0B8", backgroundColor: "#102D2C", padding: 12, borderRadius: 10, fontSize: 11, lineHeight: 17, marginTop: 14 },
  footer: { color: "#91A4B5", fontSize: 9, fontWeight: "800", textAlign: "center", marginTop: 20 },
});
