import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Product, Sale, Expense, DebtEntry } from "../domain/types";
import type { PendingSale } from "../services/offlineSales";
import { supabase } from "../lib/supabase";
import { formatTZS, netProfit, totalSales } from "../domain/money";

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

function Metric({ label, value, helper, tone = "light" }: { label: string; value: string; helper?: string; tone?: "light" | "green" | "gold" }) {
  return <View style={[s.metric, tone === "green" && s.metricGreen, tone === "gold" && s.metricGold]}>
    <Text style={s.metricLabel}>{label}</Text>
    <Text style={s.metricValue}>{value}</Text>
    {!!helper && <Text style={s.metricHelper}>{helper}</Text>}
  </View>;
}

export default function OwnerBusinessDashboard({ shopId, sales, products, expenses, debts, pendingSales, notice, online, onNavigate }: Props) {
  const [businessName, setBusinessName] = useState("Biashara Yangu");
  useEffect(() => {
    let active = true;
    if (!supabase || !shopId) return;
    supabase.from("shops").select("name").eq("id", shopId).maybeSingle().then(({ data }) => {
      if (active && data?.name) setBusinessName(data.name);
    });
    return () => { active = false; };
  }, [shopId]);

  const confirmedSales = useMemo(() => sales.filter(item => item.status !== "pending_sync"), [sales]);
  const revenue = totalSales(confirmedSales);
  const profit = netProfit(confirmedSales, expenses);
  const lowStock = products.filter(item => item.active && item.stockQuantity <= item.reorderLevel);
  const outstanding = debts.reduce((sum, item) => sum + item.balance, 0);
  const week = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today);
      date.setHours(0, 0, 0, 0);
      date.setDate(today.getDate() - (6 - index));
      const next = new Date(date); next.setDate(date.getDate() + 1);
      const amount = confirmedSales.filter(sale => {
        const created = new Date(sale.createdAt);
        return created >= date && created < next;
      }).reduce((sum, sale) => sum + sale.total, 0);
      return { label: date.toLocaleDateString("sw-TZ", { weekday: "short" }), amount };
    });
  }, [confirmedSales]);
  const maxDay = Math.max(1, ...week.map(day => day.amount));
  const recentSales = confirmedSales.slice(0, 4);

  return <View style={s.container}>
    <View style={s.hero}>
      <View style={s.heroTop}>
        <View style={s.brandMark}><Text style={s.brandMarkText}>G</Text></View>
        <View style={s.onlinePill}><View style={[s.onlineDot, online === false && s.offlineDot]}/><Text style={s.onlineText}>{online === false ? "OFFLINE" : online === true ? "ONLINE" : "INAANGALIA"}</Text></View>
      </View>
      <Text style={s.eyebrow}>DASHBOARD YA MMILIKI</Text>
      <Text style={s.businessName}>{businessName}</Text>
      <Text style={s.heroCopy}>Muhtasari wa biashara yako, mauzo, stock na fedha.</Text>
      <View style={s.heroFooter}><Text style={s.heroFooterText}>TAARIFA ZA BIASHARA HII PEKEE</Text><Text style={s.heroFooterText}>{new Date().toLocaleDateString("sw-TZ")}</Text></View>
    </View>

    <View style={s.sectionHeading}><Text style={s.sectionTitle}>Muhtasari wa fedha</Text><Text style={s.sectionHint}>Mauzo yaliyothibitishwa</Text></View>
    <View style={s.metricGrid}>
      <Metric label="JUMLA YA MAUZO" value={formatTZS(revenue)} helper={confirmedSales.length + " miamala"} tone="green"/>
      <Metric label="FAIDA YA MAKADIRIO" value={formatTZS(profit)} helper="Baada ya gharama zilizoingizwa" tone="gold"/>
      <Metric label="GHARAMA" value={formatTZS(expenses.reduce((sum, item) => sum + item.amount, 0))}/>
      <Metric label="MADENI YALIYOBAKI" value={formatTZS(outstanding)} helper={debts.length + " rekodi"}/>
    </View>

    <View style={s.sectionHeading}><Text style={s.sectionTitle}>Mwenendo wa mauzo</Text><Text style={s.sectionHint}>Siku 7 zilizopita</Text></View>
    <View style={s.chartCard}>
      <View style={s.chartTop}><Text style={s.chartTitle}>Mauzo kwa siku</Text><Text style={s.chartTotal}>{formatTZS(week.reduce((sum, day) => sum + day.amount, 0))}</Text></View>
      <View style={s.bars}>
        {week.map((day, index) => <View key={day.label + index} style={s.barColumn}>
          <Text style={s.barValue}>{day.amount > 0 ? (day.amount >= 1000000 ? (day.amount / 1000000).toFixed(1) + "M" : day.amount >= 1000 ? Math.round(day.amount / 1000) + "k" : String(day.amount)) : "—"}</Text>
          <View style={s.barTrack}><View style={[s.barFill, { height: Math.max(day.amount > 0 ? 7 : 3, day.amount / maxDay * 86) }]}/></View>
          <Text style={s.barLabel}>{day.label}</Text>
        </View>)}
      </View>
    </View>

    <View style={s.sectionHeading}><Text style={s.sectionTitle}>Hali ya biashara</Text></View>
    <View style={s.statusGrid}>
      <Pressable onPress={() => onNavigate("Stock")} style={s.statusCard}><Text style={s.statusIcon}>▦</Text><Text style={s.statusValue}>{products.filter(item => item.active).length}</Text><Text style={s.statusLabel}>Bidhaa hai</Text><Text style={s.statusSub}>{lowStock.length} stock ndogo</Text></Pressable>
      <Pressable onPress={() => onNavigate("Staff")} style={s.statusCard}><Text style={s.statusIcon}>♙</Text><Text style={s.statusValue}>Wafanyakazi</Text><Text style={s.statusLabel}>Usimamizi wa timu</Text><Text style={s.statusSub}>Angalia ruhusa na majukumu</Text></Pressable>
      <Pressable onPress={() => onNavigate("Debts")} style={s.statusCard}><Text style={s.statusIcon}>▤</Text><Text style={s.statusValue}>{debts.length}</Text><Text style={s.statusLabel}>Rekodi za madeni</Text><Text style={s.statusSub}>{formatTZS(outstanding)} bado</Text></Pressable>
      <Pressable onPress={() => onNavigate("Subscription")} style={s.statusCard}><Text style={s.statusIcon}>✦</Text><Text style={s.statusValue}>GUNX PRO</Text><Text style={s.statusLabel}>Mpango wa biashara</Text><Text style={s.statusSub}>Angalia usajili</Text></Pressable>
    </View>

    {lowStock.length > 0 && <View style={s.alertCard}>
      <View style={s.alertHeader}><Text style={s.alertTitle}>Tahadhari ya stock</Text><Text style={s.alertCount}>{lowStock.length}</Text></View>
      {lowStock.slice(0, 4).map(product => <View key={product.id} style={s.lowStockRow}><Text style={s.lowStockName}>{product.name}</Text><Text style={s.lowStockQty}>{product.stockQuantity} {product.unit} · kiwango {product.reorderLevel}</Text></View>)}
      <Pressable onPress={() => onNavigate("Stock")}><Text style={s.alertAction}>Fungua usimamizi wa stock →</Text></Pressable>
    </View>}

    <View style={s.sectionHeading}><Text style={s.sectionTitle}>Miamala ya hivi karibuni</Text><Pressable onPress={() => onNavigate("Reports")}><Text style={s.link}>Ripoti zote →</Text></Pressable></View>
    <View style={s.recentCard}>
      {recentSales.length === 0 ? <Text style={s.emptyText}>Bado hakuna mauzo yaliyothibitishwa kwenye kipindi hiki.</Text> : recentSales.map(sale => <View key={sale.id} style={s.saleRow}>
        <View style={s.saleIcon}><Text style={s.saleIconText}>↗</Text></View>
        <View style={s.saleCopy}><Text style={s.saleReceipt}>{sale.receiptNumber}</Text><Text style={s.saleDate}>{new Date(sale.createdAt).toLocaleString("sw-TZ")}</Text></View>
        <Text style={s.saleAmount}>{formatTZS(sale.total)}</Text>
      </View>)}
    </View>

    <View style={s.quickActions}>
      <Pressable onPress={() => onNavigate("POS")} style={s.primaryAction}><Text style={s.primaryActionText}>＋  Anza mauzo</Text></Pressable>
      <Pressable onPress={() => onNavigate("Reports")} style={s.secondaryAction}><Text style={s.secondaryActionText}>Ripoti za biashara</Text></Pressable>
      <Pressable onPress={() => onNavigate("Expenses")} style={s.secondaryAction}><Text style={s.secondaryActionText}>Ongeza gharama</Text></Pressable>
    </View>
    {!!pendingSales.length && <View style={s.syncNotice}><Text style={s.syncNoticeText}>{pendingSales.length} mauzo yanasubiri kusawazishwa. Hayajahesabiwa kama mauzo yaliyothibitishwa.</Text></View>}
    {!!notice && <Text style={s.notice}>{notice}</Text>}
    <Text style={s.disclaimer}>Faida ni makadirio kutokana na mauzo na gharama zilizopakiwa. Hakiki ripoti kabla ya maamuzi rasmi ya fedha.</Text>
  </View>;
}

const s = StyleSheet.create({
  container: { gap: 12, paddingBottom: 20 },
  hero: { backgroundColor: "#102438", borderColor: "#D7B56D", borderWidth: 1, borderRadius: 19, padding: 18, marginBottom: 3 },
  heroTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  brandMark: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#173D36", borderWidth: 1, borderColor: "#43C99A", alignItems: "center", justifyContent: "center" },
  brandMarkText: { color: "#F2D99F", fontSize: 23, fontWeight: "900" },
  onlinePill: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "#173D36", paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20 },
  onlineDot: { width: 7, height: 7, borderRadius: 5, backgroundColor: "#43C99A" },
  offlineDot: { backgroundColor: "#E4A34A" },
  onlineText: { color: "#CFF7E8", fontSize: 10, fontWeight: "900" },
  eyebrow: { color: "#75E0B8", fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  businessName: { color: "#FFFFFF", fontSize: 25, fontWeight: "900", marginTop: 7 },
  heroCopy: { color: "#C1CED8", fontSize: 14, lineHeight: 21, marginTop: 6 },
  heroFooter: { borderTopWidth: 1, borderTopColor: "#2B4B61", marginTop: 17, paddingTop: 11, flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap", gap: 6 },
  heroFooterText: { color: "#D7B56D", fontSize: 9, fontWeight: "900", letterSpacing: .5 },
  sectionHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 7 },
  sectionTitle: { color: "#FFFFFF", fontSize: 17, fontWeight: "900" },
  sectionHint: { color: "#C1CED8", fontSize: 11, fontWeight: "700" },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  metric: { width: "48.5%", minHeight: 102, borderRadius: 14, borderWidth: 1, borderColor: "#24445A", backgroundColor: "#102438", padding: 13, justifyContent: "center" },
  metricGreen: { borderColor: "#278B6A", backgroundColor: "#10352F" },
  metricGold: { borderColor: "#8B7549", backgroundColor: "#302A1C" },
  metricLabel: { color: "#C1CED8", fontSize: 10, fontWeight: "900" },
  metricValue: { color: "#FFFFFF", fontSize: 16, fontWeight: "900", marginTop: 8 },
  metricHelper: { color: "#B7C5D0", fontSize: 10, lineHeight: 15, marginTop: 5 },
  chartCard: { backgroundColor: "#102438", borderColor: "#24445A", borderWidth: 1, borderRadius: 15, padding: 14 },
  chartTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 5 },
  chartTitle: { color: "#F4F7FA", fontSize: 13, fontWeight: "800" },
  chartTotal: { color: "#F2D99F", fontSize: 13, fontWeight: "900" },
  bars: { height: 126, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 12, gap: 5 },
  barColumn: { flex: 1, alignItems: "center", justifyContent: "flex-end", height: "100%" },
  barValue: { color: "#B7C5D0", fontSize: 8, marginBottom: 5 },
  barTrack: { width: "65%", height: 88, justifyContent: "flex-end", backgroundColor: "#0B1B2A", borderRadius: 7, overflow: "hidden" },
  barFill: { width: "100%", backgroundColor: "#43C99A", borderRadius: 7 },
  barLabel: { color: "#C1CED8", fontSize: 9, marginTop: 6, textTransform: "capitalize" },
  statusGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  statusCard: { width: "48.5%", minHeight: 115, backgroundColor: "#102438", borderColor: "#24445A", borderWidth: 1, borderRadius: 14, padding: 13 },
  statusIcon: { color: "#D7B56D", fontSize: 20, fontWeight: "900" },
  statusValue: { color: "#FFFFFF", fontSize: 17, fontWeight: "900", marginTop: 5 },
  statusLabel: { color: "#C1CED8", fontSize: 11, fontWeight: "800", marginTop: 3 },
  statusSub: { color: "#91A4B5", fontSize: 10, marginTop: 5, lineHeight: 14 },
  alertCard: { backgroundColor: "#2C2519", borderColor: "#8B7549", borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 2 },
  alertHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  alertTitle: { color: "#F2D99F", fontSize: 14, fontWeight: "900" },
  alertCount: { color: "#1D1A13", backgroundColor: "#D7B56D", overflow: "hidden", borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, fontWeight: "900", fontSize: 11 },
  lowStockRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#55462A", gap: 3 },
  lowStockName: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  lowStockQty: { color: "#E3D2AD", fontSize: 11 },
  alertAction: { color: "#F2D99F", fontSize: 12, fontWeight: "900", marginTop: 11 },
  link: { color: "#75E0B8", fontSize: 12, fontWeight: "900" },
  recentCard: { backgroundColor: "#102438", borderColor: "#24445A", borderWidth: 1, borderRadius: 14, paddingHorizontal: 13 },
  saleRow: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, borderBottomColor: "#24445A" },
  saleIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: "#173D36", alignItems: "center", justifyContent: "center" },
  saleIconText: { color: "#75E0B8", fontSize: 17, fontWeight: "900" },
  saleCopy: { flex: 1 },
  saleReceipt: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  saleDate: { color: "#B7C5D0", fontSize: 10, marginTop: 4 },
  saleAmount: { color: "#F2D99F", fontSize: 12, fontWeight: "900" },
  emptyText: { color: "#C1CED8", fontSize: 13, paddingVertical: 18, lineHeight: 20 },
  quickActions: { gap: 8, marginTop: 4 },
  primaryAction: { backgroundColor: "#16785C", borderRadius: 12, padding: 14, alignItems: "center" },
  primaryActionText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  secondaryAction: { backgroundColor: "#173247", borderColor: "#2B4B61", borderWidth: 1, borderRadius: 12, padding: 13, alignItems: "center" },
  secondaryActionText: { color: "#EAF2F7", fontSize: 12, fontWeight: "800" },
  syncNotice: { backgroundColor: "#2C2519", borderColor: "#8B7549", borderWidth: 1, borderRadius: 11, padding: 11 },
  syncNoticeText: { color: "#F2D99F", fontSize: 11, lineHeight: 17 },
  notice: { color: "#75E0B8", backgroundColor: "#102D2C", padding: 12, borderRadius: 10, fontSize: 12, lineHeight: 18 },
  disclaimer: { color: "#B7C5D0", fontSize: 11, lineHeight: 17, marginTop: 2 }
});
