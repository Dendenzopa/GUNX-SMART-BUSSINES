import React, { useState } from "react";
import { ActivityIndicator, Pressable, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { countSales, formatTZS } from "../domain/money";
import type { Sale, Expense } from "../domain/types";
import type { RefundRecord } from "../domain/money";

export type ReportPeriod = "today" | "7d" | "30d" | "year" | "all" | "custom";
type Props = {
  businessName: string; darkMode: boolean; period: ReportPeriod; fromDate: string; toDate: string;
  sales: Sale[]; expenses: Expense[]; refunds: RefundRecord[]; refundTotal: number | null;
  netSales: number; netProfit: number | null; expenseTotal: number; loading: boolean; notice: string;
  onPeriodChange: (period: ReportPeriod) => void; onApplyDates: (from: string, to: string) => void;
  onRefresh: () => void; onExport: (kind: "pdf" | "csv") => void;
};
const navy = "#070E1A", card = "#0D1B2A", surface = "#13263B", border = "#1E3A5A", green = "#10B981", gold = "#FBBF24", muted = "#CBD5E1";
const periods: { id: ReportPeriod; label: string }[] = [{id:"today",label:"Leo"},{id:"7d",label:"Siku 7"},{id:"30d",label:"Siku 30"},{id:"year",label:"Mwaka huu"},{id:"all",label:"Tangu mwanzo"}];
const money = (n: number | null) => n === null ? "Haijapatikana" : formatTZS(n);
function Action({label,onPress,accent="green",disabled=false}:{label:string;onPress:()=>void;accent?:"green"|"gold"|"neutral";disabled?:boolean}) {
 const bg=accent==="green"?"#059669":accent==="gold"?"#F59E0B":surface;
 const fg=accent==="gold"?navy:"#FFFFFF";
 return <Pressable disabled={disabled} onPress={onPress} style={({pressed})=>[s.action,{backgroundColor:bg,borderColor:accent==="gold"?gold:accent==="green"?green:border,opacity:disabled?0.5:pressed?0.82:1}]}><Text style={[s.actionText,{color:fg}]}>{label}</Text></Pressable>;
}
function Metric({label,value,detail,highlight}:{label:string;value:string;detail:string;highlight?:"green"|"gold"}) {
 return <View style={s.metric}><Text style={s.metricLabel}>{label}</Text><Text numberOfLines={2} style={[s.metricValue,highlight==="green"&&{color:"#6EE7B7"},highlight==="gold"&&{color:gold}]}>{value}</Text><Text style={s.detail}>{detail}</Text></View>;
}
export default function BusinessReports(p: Props) {
 const [customOpen,setCustomOpen]=useState(false);
 const [from,setFrom]=useState(p.fromDate); const [to,setTo]=useState(p.toDate);
 const [sharing,setSharing]=useState(false);
 const bg=p.darkMode?navy:"#F4F7FA"; const panel=p.darkMode?card:"#FFFFFF"; const line=p.darkMode?border:"#D8E2EA"; const primary=p.darkMode?"#FFFFFF":"#142D42"; const secondary=p.darkMode?muted:"#526579";
 const count=countSales(p.sales); const average=count?p.netSales/count:0;
 const shareSummary=async()=>{
  setSharing(true);
  try {
   const periodLabel=p.period==="custom"?(p.fromDate+" hadi "+p.toDate):(periods.find(x=>x.id===p.period)?.label??"Tangu mwanzo");
   const message=["GUNX SMART BUSINESS",p.businessName,"Ripoti ya biashara","Kipindi: "+periodLabel,"Mauzo baada ya refunds: "+money(p.refundTotal===null?null:p.netSales),"Idadi ya mauzo: "+count,"Refunds: "+money(p.refundTotal),"Gharama: "+formatTZS(p.expenseTotal),"Faida halisi (makadirio): "+money(p.netProfit),"Imetengenezwa kupitia GUNX SMART BUSINESS."].join("\n");
   await Share.share({message,title:"Ripoti ya Biashara"});
  } finally { setSharing(false); }
 };
 return <View style={[s.root,{backgroundColor:bg}]}>
  <View style={[s.header,{backgroundColor:panel,borderColor:line}]}>
   <View style={s.brandRow}><View style={s.logo}><Text style={s.logoText}>▤</Text></View><View style={{flex:1}}><Text style={s.brand}>GUNX SMART BUSINESS</Text><Text style={[s.business,{color:secondary}]} numberOfLines={1}>{p.businessName}</Text><Text style={[s.title,{color:primary}]}>Ripoti ya Biashara</Text></View>
    <Pressable accessibilityLabel="Sasisha ripoti" onPress={p.onRefresh} disabled={p.loading} style={[s.refresh,{borderColor:line}]}>{p.loading?<ActivityIndicator color={green}/>:<Text style={s.refreshText}>↻</Text>}<Text style={[s.refreshLabel,{color:primary}]}>Sasisha</Text></Pressable>
   </View>
  </View>
  <View style={[s.panel,{backgroundColor:panel,borderColor:line}]}>
   <View style={s.panelHead}><View style={{flex:1}}><Text style={[s.section,{color:primary}]}>CHAGUA KIPINDI</Text><Text style={[s.helper,{color:secondary}]}>Chagua muda wa taarifa unazotaka kuona.</Text></View><Pressable onPress={()=>setCustomOpen(v=>!v)} style={[s.customBtn,{borderColor:gold}]}><Text style={s.customText}>▦  Tarehe Maalum</Text></Pressable></View>
   <View style={s.periods}>{periods.map(item=><Pressable key={item.id} onPress={()=>p.onPeriodChange(item.id)} style={[s.period,p.period===item.id&&s.periodOn]}><Text style={[s.periodText,p.period===item.id&&{color:"#FFFFFF"}]}>{item.label}</Text></Pressable>)}</View>
   {customOpen&&<View style={[s.dateBox,{borderTopColor:line}]}><Text style={[s.helper,{color:secondary}]}>Tumia muundo wa YYYY-MM-DD</Text><View style={s.dateRow}><TextInput value={from} onChangeText={setFrom} placeholder="Kuanzia 2026-01-01" placeholderTextColor="#8194A5" style={[s.dateInput,{borderColor:line,color:primary,backgroundColor:surface}]}/><TextInput value={to} onChangeText={setTo} placeholder="Hadi 2026-01-31" placeholderTextColor="#8194A5" style={[s.dateInput,{borderColor:line,color:primary,backgroundColor:surface}]}/></View><Action label="Weka Tarehe Maalum" accent="gold" onPress={()=>p.onApplyDates(from.trim(),to.trim())}/></View>}
  </View>
  <View style={[s.panel,{backgroundColor:panel,borderColor:line}]}>
   <Text style={[s.section,{color:primary}]}>PAKUA / SHIRIKI RIPOTI</Text><Text style={[s.helper,{color:secondary}]}>PDF rasmi, CSV inayofunguka kwenye Excel, au muhtasari wa WhatsApp.</Text>
   <View style={s.actions}><Action label="Tengeneza PDF" onPress={()=>p.onExport("pdf")}/><Action label="Export Excel (CSV)" accent="neutral" onPress={()=>p.onExport("csv")}/><Action label={sharing?"Inashiriki...":"Shiriki / WhatsApp"} accent="gold" disabled={sharing} onPress={()=>void shareSummary()}/></View>
  </View>
  <View style={s.heroes}>
   <View style={[s.hero,{borderColor:green}]}><Text style={s.heroLabel}>MAUZO BAADA YA REFUNDS</Text><Text style={s.heroValue}>{money(p.refundTotal===null?null:p.netSales)}</Text><Text style={s.heroHint}>Jumla ya mauzo ukiondoa marejesho ya kipindi.</Text></View>
   <View style={[s.hero,{borderColor:gold}]}><Text style={[s.heroLabel,{color:gold}]}>FAIDA HALISI YA MAKADIRIO</Text><Text style={s.heroValue}>{money(p.netProfit)}</Text><Text style={s.heroHint}>Baada ya gharama za bidhaa, refunds na gharama za uendeshaji.</Text></View>
  </View>
  <View style={s.metrics}>
   <Metric label="IDADI YA MAUZO" value={String(count)} detail="Risiti zilizorekodiwa katika kipindi."/>
   <Metric label="REFUNDS ZA KIPINDI" value={money(p.refundTotal)} detail="Thamani ya marejesho yaliyothibitishwa." highlight="gold"/>
   <Metric label="GHARAMA ZA KIPINDI" value={formatTZS(p.expenseTotal)} detail="Gharama zilizoingizwa kwenye mfumo."/>
   <Metric label="WASTANI KWA MUAMALA" value={formatTZS(average)} detail="Mauzo halisi yakigawanywa kwa idadi ya risiti."/>
  </View>
  <View style={[s.panel,{backgroundColor:panel,borderColor:line}]}>
   <Text style={[s.section,{color:primary}]}>MUHTASARI WA TAARIFA</Text>
   <View style={s.summaryRow}><Text style={[s.summaryLabel,{color:secondary}]}>Mauzo yaliyopakiwa</Text><Text style={[s.summaryValue,{color:primary}]}>{p.sales.length}</Text></View>
   <View style={s.summaryRow}><Text style={[s.summaryLabel,{color:secondary}]}>Gharama zilizorekodiwa</Text><Text style={[s.summaryValue,{color:primary}]}>{p.expenses.length}</Text></View>
   <View style={s.summaryRow}><Text style={[s.summaryLabel,{color:secondary}]}>Hali ya refunds</Text><Text style={[s.summaryValue,{color:p.refundTotal===null?gold:green}]}>{p.refundTotal===null?"Inasubiri data":"Imepakiwa"}</Text></View>
   <Text style={[s.helper,{color:secondary,marginTop:12}]}>Mauzo yanayosubiri kusawazishwa hayahesabiwi. Faida ni makadirio; inaweza kutokamilika ikiwa gharama ya bidhaa haikurekodiwa.</Text>
  </View>
  {!!p.notice&&<Text style={[s.notice,{color:secondary}]}>{p.notice}</Text>}
 </View>;
}
const s=StyleSheet.create({
 root:{gap:14,paddingBottom:28},header:{borderBottomWidth:1,padding:14,borderRadius:17},brandRow:{flexDirection:"row",alignItems:"center",gap:11},logo:{width:44,height:44,borderRadius:14,backgroundColor:surface,borderWidth:1,borderColor:gold,alignItems:"center",justifyContent:"center"},logoText:{fontSize:24,color:gold,fontWeight:"900"},brand:{fontSize:10,fontWeight:"900",letterSpacing:1.3,color:gold},business:{fontSize:11,fontWeight:"700",marginTop:2},title:{fontSize:19,fontWeight:"900",marginTop:3},refresh:{borderWidth:1,borderRadius:12,minWidth:58,minHeight:48,alignItems:"center",justifyContent:"center",paddingHorizontal:8},refreshText:{fontSize:22,color:green,fontWeight:"900"},refreshLabel:{fontSize:9,fontWeight:"800"},panel:{borderWidth:1,borderRadius:17,padding:15,gap:10},panelHead:{flexDirection:"row",alignItems:"center",gap:8},section:{fontSize:12,fontWeight:"900",letterSpacing:1},helper:{fontSize:11,lineHeight:17},customBtn:{borderWidth:1,borderRadius:10,paddingHorizontal:10,paddingVertical:9},customText:{color:gold,fontSize:10,fontWeight:"900"},periods:{flexDirection:"row",flexWrap:"wrap",gap:7},period:{backgroundColor:surface,borderColor:border,borderWidth:1,borderRadius:10,paddingHorizontal:12,paddingVertical:10},periodOn:{backgroundColor:"#059669",borderColor:green},periodText:{fontSize:11,color:muted,fontWeight:"800"},dateBox:{borderTopWidth:1,paddingTop:10,gap:8},dateRow:{flexDirection:"row",gap:8},dateInput:{flex:1,minWidth:0,borderWidth:1,borderRadius:10,paddingHorizontal:10,paddingVertical:11,fontSize:11},actions:{gap:8},action:{borderWidth:1,borderRadius:11,paddingVertical:13,paddingHorizontal:12,alignItems:"center",justifyContent:"center"},actionText:{fontSize:11,fontWeight:"900"},heroes:{gap:10},hero:{backgroundColor:card,borderWidth:1,borderRadius:17,padding:17,gap:7},heroLabel:{color:"#A7F3D0",fontSize:10,fontWeight:"900",letterSpacing:1},heroValue:{color:"#FFFFFF",fontSize:25,fontWeight:"900"},heroHint:{color:muted,fontSize:11,lineHeight:16,borderTopWidth:1,borderTopColor:"#FFFFFF22",paddingTop:9},metrics:{flexDirection:"row",flexWrap:"wrap",gap:9},metric:{width:"48%",flexGrow:1,minHeight:112,backgroundColor:card,borderWidth:1,borderColor:border,borderRadius:15,padding:13,justifyContent:"space-between"},metricLabel:{fontSize:10,fontWeight:"900",letterSpacing:.5,color:muted},metricValue:{fontSize:17,fontWeight:"900",color:"#FFFFFF",marginTop:8},detail:{fontSize:10,color:"#A8B7C5",marginTop:6,lineHeight:14},summaryRow:{flexDirection:"row",justifyContent:"space-between",paddingVertical:8,borderBottomWidth:1,borderBottomColor:"#94A3B822"},summaryLabel:{fontSize:11},summaryValue:{fontSize:11,fontWeight:"900"},notice:{fontSize:11,lineHeight:17,paddingHorizontal:4}
});
