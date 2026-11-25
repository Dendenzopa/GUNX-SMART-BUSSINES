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
  const [ownerName, setOwnerName] = useState("Mmiliki wa Biashara");
  const [period, setPeriod] = useState<"Leo" | "Wiki">("Leo");
  useEffect(() => {
    let active = true;
    if (supabase) supabase.auth.getUser().then(({ data }) => { const m=data.user?.user_metadata ?? {}; const n=m.full_name || m.name || m.display_name || [m.given_name,m.family_name].filter(Boolean).join(" "); if(active && typeof n==="string" && n.trim()) setOwnerName(n.trim()); });
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
  return <View style={s.container}>
    <View style={s.hero}>
      <View style={s.heroTop}><Text style={s.logoWord}>GUNX  SMART BUSINESS</Text><Text style={s.onlineText}>{online===false?"OFFLINE":online===true?"ONLINE":"INAANGALIA"}</Text></View>
      <View style={s.identityRow}><View style={s.ownerMedia}><Text style={s.ownerInitial}>{ownerName.charAt(0).toUpperCase()}</Text></View><View style={s.identityCopy}><Text style={s.businessName}>{businessName}</Text><Text style={s.ownerName}>{ownerName}</Text><Text style={s.verified}>✓  Biashara Yako</Text></View></View>
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
    {!!pendingSales.length&&<Text style={s.helper}>{pendingSales.length} mauzo yanasubiri kusawazishwa.</Text>}
    {!!notice&&<Text style={s.notice}>{notice}</Text>}
  </View>;
}

const s=StyleSheet.create({
 container:{gap:11,paddingBottom:18,backgroundColor:"#F8FAFC"},
 hero:{backgroundColor:"#0B1F4A",borderRadius:18,padding:16,borderWidth:1,borderColor:"#D7B56D",elevation:3},
 heroTop:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:13},
 logoWord:{color:"#F2D99F",fontSize:13,fontWeight:"900",letterSpacing:.6},
 onlineText:{color:"#75E0B8",fontSize:10,fontWeight:"900"},
 identityRow:{flexDirection:"row",alignItems:"center",gap:12},
 ownerMedia:{width:66,height:66,borderRadius:15,backgroundColor:"#173D36",borderWidth:2,borderColor:"#D7B56D",alignItems:"center",justifyContent:"center"},
 ownerInitial:{color:"#FFFFFF",fontSize:28,fontWeight:"900"},
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
 notice:{color:"#166534",backgroundColor:"#DCFCE7",padding:11,borderRadius:9,fontSize:12}
});
