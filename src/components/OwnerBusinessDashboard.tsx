import React, { useEffect, useMemo, useState } from "react";
import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
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
  const [ownerName, setOwnerName] = useState("Mmiliki wa Biashara");
  const [period, setPeriod] = useState<"Leo" | "Wiki">("Leo");
  const [heroMediaType, setHeroMediaType] = useState<"owner_photo" | "business_logo" | null>(null);
  const [heroMediaUrl, setHeroMediaUrl] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const mediaKey = "@gunx-owner-hero-media:" + (shopId ?? "local");
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(mediaKey).then(raw => { if (!active || !raw) return; try { const saved = JSON.parse(raw); if (saved && saved.uri && (saved.type === "owner_photo" || saved.type === "business_logo")) { setHeroMediaUrl(saved.uri); setHeroMediaType(saved.type); } } catch {} }).catch(() => {});
    if (supabase) supabase.auth.getUser().then(({ data }) => { const m=data.user?.user_metadata ?? {}; const n=m.full_name || m.name || m.display_name || [m.given_name,m.family_name].filter(Boolean).join(" "); if(active && typeof n==="string" && n.trim()) setOwnerName(n.trim()); });
    if (!supabase || !shopId) return;
    supabase.from("shops").select("name").eq("id", shopId).maybeSingle().then(({ data }) => {
      if (active && data?.name) setBusinessName(data.name);
    });
    return () => { active = false; };
  }, [shopId, mediaKey]);

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
  const recentSales = confirmedSales.slice(0, 4);
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const todaySales = confirmedSales.filter(s => new Date(s.createdAt)>=todayStart);
  const points = useMemo(() => Array.from({length:period==="Leo"?6:7},(_,i)=>{
    const start=new Date();
    if(period==="Leo") start.setHours(8+i*2,0,0,0);
    else {start.setHours(0,0,0,0);start.setDate(start.getDate()-(6-i));}
    const end=new Date(start); if(period==="Leo") end.setHours(end.getHours()+2); else end.setDate(end.getDate()+1);
    const amount=confirmedSales.filter(s=>{const d=new Date(s.createdAt);return d>=start&&d<end;}).reduce((sum,s)=>sum+s.total,0);
    return {label:period==="Leo"?(8+i*2)+":00":start.toLocaleDateString("sw-TZ",{weekday:"short"}),amount};
  }),[confirmedSales,period]);
  const max=Math.max(1,...points.map(p=>p.amount));
  const coords=points.map((p,i)=>({x:8+i*(284/Math.max(1,points.length-1)),y:100-(p.amount/max)*76}));
  const activeProducts=products.filter(p=>p.active).length;
  const pickHeroMedia = async (type: "owner_photo" | "business_logo") => {
    setMenuOpen(false);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.85 });
    if (result.canceled || !result.assets || !result.assets[0]) return;
    const uri = result.assets[0].uri;
    setHeroMediaType(type); setHeroMediaUrl(uri);
    try { await AsyncStorage.setItem(mediaKey, JSON.stringify({ type, uri })); } catch {}
  };
  const clearHeroMedia = async () => { setHeroMediaType(null); setHeroMediaUrl(null); try { await AsyncStorage.removeItem(mediaKey); } catch {} setMenuOpen(false); };
  return <View style={s.container}>
    <View style={s.hero}>
      <View style={s.heroTop}>
        <Pressable accessibilityLabel="Fungua menyu" onPress={()=>setMenuOpen(true)} style={s.headerIcon}><Text style={s.headerIconText}>☰</Text></Pressable>
        <Text style={s.logoWord}>GUNX  SMART BUSINESS</Text>
        <Pressable accessibilityLabel="Arifa" onPress={()=>setNotificationsOpen(true)} style={s.headerIcon}><Text style={s.headerIconText}>♧</Text>{(lowStock.length>0||pendingSales.length>0)&&<View style={s.notificationDot}/>}</Pressable>
      </View>
      <Text style={s.onlineText}>{online===false?"● OFFLINE":online===true?"● ONLINE":"● INAANGALIA MUUNGANISHO"}</Text>
      <View style={s.identityRow}><Pressable onPress={()=>setMenuOpen(true)} style={s.ownerMedia}>
        {heroMediaUrl ? <Image source={{uri:heroMediaUrl}} style={s.ownerImage}/> : <Text style={s.ownerInitial}>{ownerName.charAt(0).toUpperCase()}</Text>}
        <View style={s.cameraBadge}><Text style={s.cameraBadgeText}>✎</Text></View>
      </Pressable><View style={s.identityCopy}><Text style={s.businessName}>{businessName}</Text><Text style={s.ownerName}>{ownerName}</Text><Text style={s.verified}>✓  Biashara Yako</Text></View></View>
      <Text style={s.heroTag}>Biashara Yako, Mafanikio Yetu</Text>
    </View>
    <View style={s.summaryRow}>
      <Pressable onPress={()=>onNavigate("POS")} style={[s.summaryCard,{backgroundColor:"#155EEF"}]}><Text style={s.summaryIcon}>🛒</Text><Text style={s.summaryLabel}>Mauzo ya Leo</Text></Pressable>
      <Pressable onPress={()=>onNavigate("Stock")} style={[s.summaryCard,{backgroundColor:"#15803D"}]}><Text style={s.summaryIcon}>▣</Text><Text style={s.summaryLabel}>Stock Kuu</Text></Pressable>
      <Pressable onPress={()=>onNavigate("Staff")} style={[s.summaryCard,{backgroundColor:"#6B21A8"}]}><Text style={s.summaryIcon}>♟</Text><Text style={s.summaryLabel}>Wafanyakazi</Text></Pressable>
    </View>
    <View style={s.chartCard}>
      <View style={s.sectionHead}><Text style={s.sectionTitle}>▥  Muhtasari wa Mauzo</Text><View style={s.period}><Pressable onPress={()=>setPeriod("Leo")} style={[s.periodBtn,period==="Leo"&&s.periodActive]}><Text style={s.periodText}>Leo</Text></Pressable><Pressable onPress={()=>setPeriod("Wiki")} style={[s.periodBtn,period==="Wiki"&&s.periodActive]}><Text style={s.periodText}>Wiki</Text></Pressable></View></View>
      <Text style={s.chartTotal}>{formatTZS(period==="Leo"?totalSales(todaySales):week.reduce((sum,d)=>sum+d.amount,0))}</Text>
      <View style={s.lineChart}><View style={[s.gridLine,{top:24}]}/><View style={[s.gridLine,{top:62}]}/>{coords.slice(1).map((p,i)=>{const q=coords[i],dx=p.x-q.x,dy=p.y-q.y;return <View key={i} style={[s.lineSegment,{left:q.x,top:q.y,width:Math.sqrt(dx*dx+dy*dy),transform:[{rotate:(Math.atan2(dy,dx)*180/Math.PI)+"deg"}]}]}/>;})}{coords.map((p,i)=><View key={i} style={[s.dot,{left:p.x-4,top:p.y-4}]}/>)}</View>
      <View style={s.axis}>{points.map((p,i)=><Text key={i} style={s.axisText}>{p.label}</Text>)}</View>
      <Text style={s.helper}>Grafu husasishwa mauzo mapya yanapoingia.</Text>
    </View>
    <View style={s.quickCard}><Text style={s.sectionTitle}>⚡  Vitendo vya Haraka</Text>
      <Pressable onPress={()=>onNavigate("Stock")} style={s.quickRow}><Text style={[s.quickIcon,{backgroundColor:"#16A34A"}]}>＋</Text><Text style={s.quickText}>Ongeza Bidhaa</Text><Text style={s.chevron}>›</Text></Pressable>
      <Pressable onPress={()=>onNavigate("Staff")} style={s.quickRow}><Text style={[s.quickIcon,{backgroundColor:"#2563EB"}]}>♟</Text><Text style={s.quickText}>Ongeza Mfanyakazi</Text><Text style={s.chevron}>›</Text></Pressable>
      <Pressable onPress={()=>onNavigate("Reports")} style={s.quickRow}><Text style={[s.quickIcon,{backgroundColor:"#D69E0B"}]}>▥</Text><Text style={s.quickText}>Angalia Ripoti</Text><Text style={s.chevron}>›</Text></Pressable>
      <Pressable onPress={()=>onNavigate("Stock")} style={s.quickRow}><Text style={[s.quickIcon,{backgroundColor:"#2563EB"}]}>↓</Text><Text style={s.quickText}>Dhibiti Stock</Text><Text style={s.chevron}>›</Text></Pressable>
    </View>
    <View style={s.sectionHead}><Text style={s.sectionTitle}>Hali ya Biashara</Text><Text style={s.helper}>{activeProducts} bidhaa hai</Text></View>
    {lowStock.length>0&&<View style={s.alert}><Text style={s.alertTitle}>Tahadhari ya stock · {lowStock.length}</Text>{lowStock.slice(0,3).map(p=><Text key={p.id} style={s.alertText}>{p.name} — {p.stockQuantity} {p.unit}</Text>)}<Pressable onPress={()=>onNavigate("Stock")}><Text style={s.alertLink}>Fungua Stock →</Text></Pressable></View>}
    <View style={s.bottomActions}>
      <Pressable onPress={()=>onNavigate("POS")} style={[s.bottomBtn,{backgroundColor:"#155EEF"}]}><Text style={s.bottomIcon}>🛒</Text><Text style={s.bottomText}>Mauzo</Text></Pressable>
      <Pressable onPress={()=>onNavigate("Stock")} style={[s.bottomBtn,{backgroundColor:"#15803D"}]}><Text style={s.bottomIcon}>▣</Text><Text style={s.bottomText}>Stock</Text></Pressable>
      <Pressable onPress={()=>onNavigate("Staff")} style={[s.bottomBtn,{backgroundColor:"#6B21A8"}]}><Text style={s.bottomIcon}>♟</Text><Text style={s.bottomText}>Wafanyakazi</Text></Pressable>
      <Pressable onPress={()=>onNavigate("Reports")} style={[s.bottomBtn,{backgroundColor:"#D69E0B"}]}><Text style={s.bottomIcon}>▤</Text><Text style={s.bottomText}>Ripoti</Text></Pressable>
    </View>
    <View style={s.footer}><Text style={s.crown}>♛</Text><View><Text style={s.footerName}>{businessName}</Text><Text style={s.footerTag}>Biashara Yako, Mafanikio Yetu</Text></View></View>
    <Modal visible={menuOpen} transparent animationType="slide" onRequestClose={()=>setMenuOpen(false)}>
      <Pressable style={s.modalBackdrop} onPress={()=>setMenuOpen(false)}>
        <Pressable style={s.drawer} onPress={()=>{}}>
          <View style={s.drawerHandle}/>
          <View style={s.drawerHeader}><Text style={s.drawerTitle}>Menyu ya Mmiliki</Text><Pressable onPress={()=>setMenuOpen(false)} style={s.closeButton}><Text style={s.closeText}>✕</Text></Pressable></View>
          <Text style={s.drawerBusiness}>{businessName}</Text>
          <Text style={s.drawerSection}>PICHA YA DASHBOARD</Text>
          <Pressable style={s.drawerRow} onPress={()=>void pickHeroMedia("owner_photo")}><Text style={s.drawerRowIcon}>◉</Text><Text style={s.drawerRowText}>Weka picha ya mmiliki</Text><Text style={s.drawerChevron}>›</Text></Pressable>
          <Pressable style={s.drawerRow} onPress={()=>void pickHeroMedia("business_logo")}><Text style={s.drawerRowIcon}>▣</Text><Text style={s.drawerRowText}>Weka logo ya biashara</Text><Text style={s.drawerChevron}>›</Text></Pressable>
          {!!heroMediaUrl&&<Pressable style={s.drawerRow} onPress={()=>void clearHeroMedia()}><Text style={s.drawerRowIcon}>↺</Text><Text style={s.drawerRowText}>Rudisha herufi ya mmiliki</Text></Pressable>}
          <Text style={s.drawerSection}>USIMAMIZI WA BIASHARA</Text>
          <Pressable style={s.drawerRow} onPress={()=>{setMenuOpen(false);onNavigate("POS");}}><Text style={s.drawerRowIcon}>🛒</Text><Text style={s.drawerRowText}>Mauzo na POS</Text><Text style={s.drawerChevron}>›</Text></Pressable>
          <Pressable style={s.drawerRow} onPress={()=>{setMenuOpen(false);onNavigate("Stock");}}><Text style={s.drawerRowIcon}>▣</Text><Text style={s.drawerRowText}>Bidhaa na Stock</Text><Text style={s.drawerChevron}>›</Text></Pressable>
          <Pressable style={s.drawerRow} onPress={()=>{setMenuOpen(false);onNavigate("Staff");}}><Text style={s.drawerRowIcon}>♟</Text><Text style={s.drawerRowText}>Wafanyakazi</Text><Text style={s.drawerChevron}>›</Text></Pressable>
          <Pressable style={s.drawerRow} onPress={()=>{setMenuOpen(false);onNavigate("Reports");}}><Text style={s.drawerRowIcon}>▤</Text><Text style={s.drawerRowText}>Ripoti za biashara</Text><Text style={s.drawerChevron}>›</Text></Pressable>
          <Text style={s.drawerFoot}>GUNX SMART BUSINESS · Biashara Yako, Mafanikio Yetu</Text>
        </Pressable>
      </Pressable>
    </Modal>
    <Modal visible={notificationsOpen} transparent animationType="fade" onRequestClose={()=>setNotificationsOpen(false)}>
      <Pressable style={s.modalBackdrop} onPress={()=>setNotificationsOpen(false)}>
        <Pressable style={s.notificationPanel} onPress={()=>{}}>
          <View style={s.drawerHeader}><Text style={s.drawerTitle}>Arifa za Biashara</Text><Pressable onPress={()=>setNotificationsOpen(false)} style={s.closeButton}><Text style={s.closeText}>✕</Text></Pressable></View>
          {lowStock.length===0&&pendingSales.length===0&&!notice ? <Text style={s.emptyNotice}>Hakuna arifa mpya kwa sasa.</Text> : <>
            {lowStock.length>0&&<Pressable onPress={()=>{setNotificationsOpen(false);onNavigate("Stock");}} style={s.noticeRow}><Text style={s.noticeHeading}>Stock inakaribia kuisha</Text><Text style={s.noticeBody}>{lowStock.length} bidhaa ziko chini ya kiwango cha kuagiza. Gusa kuangalia stock.</Text></Pressable>}
            {pendingSales.length>0&&<View style={s.noticeRow}><Text style={s.noticeHeading}>Mauzo yanasubiri kusawazishwa</Text><Text style={s.noticeBody}>{pendingSales.length} mauzo yanasubiri muunganisho wa mtandao.</Text></View>}
            {!!notice&&<View style={s.noticeRow}><Text style={s.noticeHeading}>Taarifa ya mfumo</Text><Text style={s.noticeBody}>{notice}</Text></View>}
          </>}
        </Pressable>
      </Pressable>
    </Modal>
    {!!pendingSales.length&&<Text style={s.helper}>{pendingSales.length} mauzo yanasubiri kusawazishwa.</Text>}
    {!!notice&&<Text style={s.notice}>{notice}</Text>}
  </View>;
}

const s=StyleSheet.create({
 container:{gap:11,paddingBottom:18,backgroundColor:"#F8FAFC"},
 hero:{backgroundColor:"#0B1F4A",borderRadius:18,padding:16,borderWidth:1,borderColor:"#D7B56D",elevation:3},
 heroTop:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:7},
 headerIcon:{width:34,height:34,borderRadius:10,backgroundColor:"#17345F",borderWidth:1,borderColor:"#D7B56D",alignItems:"center",justifyContent:"center"},headerIconText:{color:"#FFFFFF",fontSize:19,fontWeight:"900"},notificationDot:{position:"absolute",right:5,top:5,width:7,height:7,borderRadius:4,backgroundColor:"#EF4444",borderWidth:1,borderColor:"#FFFFFF"},
 logoWord:{color:"#F2D99F",fontSize:13,fontWeight:"900",letterSpacing:.6},
 onlineText:{color:"#75E0B8",fontSize:10,fontWeight:"900"},
 identityRow:{flexDirection:"row",alignItems:"center",gap:12},
 ownerMedia:{width:66,height:66,borderRadius:15,backgroundColor:"#173D36",borderWidth:2,borderColor:"#D7B56D",alignItems:"center",justifyContent:"center"},
 ownerInitial:{color:"#FFFFFF",fontSize:28,fontWeight:"900"},ownerImage:{width:66,height:66,borderRadius:13},cameraBadge:{position:"absolute",right:-4,bottom:-4,width:22,height:22,borderRadius:11,backgroundColor:"#168653",borderWidth:1,borderColor:"#FFFFFF",alignItems:"center",justifyContent:"center"},cameraBadgeText:{color:"#FFFFFF",fontSize:12,fontWeight:"900"},
 identityCopy:{flex:1},businessName:{color:"#FFFFFF",fontSize:20,fontWeight:"900"},ownerName:{color:"#E5EDF5",fontSize:13,fontWeight:"700",marginTop:5},
 verified:{alignSelf:"flex-start",color:"#FFFFFF",backgroundColor:"#168653",paddingHorizontal:10,paddingVertical:5,borderRadius:20,overflow:"hidden",fontSize:10,fontWeight:"900",marginTop:7},
 heroTag:{color:"#D7B56D",fontSize:11,fontWeight:"800",marginTop:12},
 summaryRow:{flexDirection:"row",gap:8},summaryCard:{flex:1,minHeight:92,borderRadius:13,padding:11,justifyContent:"space-between",elevation:2},
 summaryIcon:{fontSize:26,color:"#FFFFFF"},summaryLabel:{fontSize:11,color:"#FFFFFF",fontWeight:"900"},
 chartCard:{backgroundColor:"#FFFFFF",borderRadius:15,padding:13,borderWidth:1,borderColor:"#E2E8F0",elevation:2},
 sectionHead:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:8},sectionTitle:{color:"#0B1F4A",fontSize:14,fontWeight:"900"},
 period:{flexDirection:"row",backgroundColor:"#F1F5F9",padding:3,borderRadius:8},periodBtn:{paddingHorizontal:9,paddingVertical:5,borderRadius:6},periodActive:{backgroundColor:"#155EEF"},periodText:{color:"#334155",fontSize:10,fontWeight:"800"},
 chartTotal:{color:"#155EEF",fontSize:15,fontWeight:"900"},lineChart:{height:116,marginTop:8,position:"relative",overflow:"hidden"},
 gridLine:{position:"absolute",left:0,right:0,borderTopWidth:1,borderColor:"#E8EEF5",borderStyle:"dashed"},
 lineSegment:{position:"absolute",height:3,backgroundColor:"#155EEF",borderRadius:3},dot:{position:"absolute",width:8,height:8,borderRadius:5,backgroundColor:"#FFFFFF",borderWidth:2,borderColor:"#155EEF",zIndex:2},
 axis:{flexDirection:"row",justifyContent:"space-between"},axisText:{fontSize:9,color:"#64748B"},helper:{fontSize:10,color:"#64748B",marginTop:8},
 quickCard:{backgroundColor:"#FFFFFF",borderRadius:15,padding:13,borderWidth:1,borderColor:"#E2E8F0",elevation:2},
 quickRow:{flexDirection:"row",alignItems:"center",gap:10,paddingVertical:10,borderBottomWidth:1,borderBottomColor:"#F1F5F9"},
 quickIcon:{width:27,height:27,borderRadius:14,textAlign:"center",textAlignVertical:"center",overflow:"hidden",color:"#FFFFFF",fontWeight:"900",fontSize:16},
 quickText:{flex:1,color:"#243B53",fontSize:12,fontWeight:"800"},chevron:{color:"#94A3B8",fontSize:22},
 alert:{backgroundColor:"#FFF8E8",borderColor:"#F4D58A",borderWidth:1,borderRadius:13,padding:13},alertTitle:{color:"#8A5A00",fontSize:13,fontWeight:"900",marginBottom:6},alertText:{color:"#5B4826",fontSize:12,paddingVertical:4},alertLink:{color:"#8A5A00",fontSize:12,fontWeight:"900",marginTop:6},
 bottomActions:{flexDirection:"row",gap:7},bottomBtn:{flex:1,minHeight:68,borderRadius:11,alignItems:"center",justifyContent:"center",gap:4},bottomIcon:{color:"#FFFFFF",fontSize:22},bottomText:{color:"#FFFFFF",fontSize:10,fontWeight:"900"},
 footer:{backgroundColor:"#0B1F4A",borderRadius:12,padding:13,flexDirection:"row",alignItems:"center",gap:12},crown:{color:"#EAB308",fontSize:24},footerName:{color:"#FFFFFF",fontSize:12,fontWeight:"900"},footerTag:{color:"#D7B56D",fontSize:10,marginTop:3},
 notice:{color:"#166534",backgroundColor:"#DCFCE7",padding:11,borderRadius:9,fontSize:12},
 modalBackdrop:{flex:1,justifyContent:"flex-end",backgroundColor:"rgba(5,15,35,0.58)"},
 drawer:{backgroundColor:"#FFFFFF",borderTopLeftRadius:23,borderTopRightRadius:23,padding:19,paddingBottom:30,borderTopWidth:3,borderColor:"#D7B56D"},
 drawerHandle:{width:42,height:5,borderRadius:4,backgroundColor:"#CBD5E1",alignSelf:"center",marginBottom:17},
 drawerHeader:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
 drawerTitle:{color:"#0B1F4A",fontSize:19,fontWeight:"900"},
 closeButton:{width:34,height:34,borderRadius:10,backgroundColor:"#F1F5F9",alignItems:"center",justifyContent:"center"},
 closeText:{color:"#334155",fontSize:17,fontWeight:"900"},
 drawerBusiness:{color:"#64748B",fontSize:12,fontWeight:"700",marginTop:5,marginBottom:15},
 drawerSection:{color:"#64748B",fontSize:10,fontWeight:"900",letterSpacing:1.1,marginTop:9,marginBottom:4},
 drawerRow:{flexDirection:"row",alignItems:"center",gap:11,paddingVertical:12,borderBottomWidth:1,borderBottomColor:"#EEF2F7"},
 drawerRowIcon:{width:30,textAlign:"center",color:"#168653",fontSize:19},
 drawerRowText:{flex:1,color:"#243B53",fontSize:13,fontWeight:"800"},
 drawerChevron:{color:"#94A3B8",fontSize:21},
 drawerFoot:{color:"#8A6415",fontSize:10,fontWeight:"800",textAlign:"center",marginTop:17},
 notificationPanel:{backgroundColor:"#FFFFFF",margin:18,borderRadius:18,padding:17,borderTopWidth:3,borderColor:"#D7B56D"},
 noticeRow:{backgroundColor:"#F8FAFC",borderWidth:1,borderColor:"#E2E8F0",borderRadius:11,padding:12,marginTop:10},
 noticeHeading:{color:"#0B1F4A",fontSize:13,fontWeight:"900"},
 noticeBody:{color:"#475569",fontSize:12,lineHeight:18,marginTop:4},
 emptyNotice:{color:"#64748B",fontSize:13,paddingVertical:22,textAlign:"center"}
});
