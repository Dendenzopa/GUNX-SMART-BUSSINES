import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Sale, Expense } from "../domain/types";
import type { RefundRecord } from "../domain/money";
import { formatTZS } from "../domain/money";

type Props = { darkMode: boolean; sales: Sale[]; expenses: Expense[]; refunds: RefundRecord[]; refundsLoaded: boolean; onBack: () => void; onRefresh: () => void };
const navy = "#071120", mid = "#0B192C", green = "#10B981", gold = "#D4AF37";
const money = (value: number, hidden: boolean) => hidden ? "TSh •••••••" : formatTZS(Math.max(0, value));
export default function OwnerDailySales({ darkMode, sales, expenses, refunds, refundsLoaded, onBack, onRefresh }: Props) {
  const [hidden, setHidden] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const now = new Date(); const start = new Date(now); start.setHours(0,0,0,0);
  const today = useMemo(() => sales.filter(s => { const d = new Date(s.createdAt); return d >= start && d <= now && s.status !== "voided" && s.status !== "pending_sync"; }), [sales]);
  const todayRefunds = refunds.filter(r => new Date(r.createdAt) >= start && new Date(r.createdAt) <= now);
  const refundTotal = todayRefunds.reduce((a,r)=>a+r.amount,0);
  const total = today.reduce((a,s)=>a+s.total,0)-refundTotal;
  const receiptCount = today.length;
  const profit = today.reduce((a,s)=>a+s.lines.reduce((b,l)=>b+(l.unitPrice-l.unitCost)*l.quantity,0),0)-todayRefunds.reduce((a,r)=>a+r.returnedCost,0);
  const credit = today.reduce((a,s)=>a+s.balance,0);
  const average = receiptCount ? total / receiptCount : 0;
  const yesterdayStart = new Date(start); yesterdayStart.setDate(yesterdayStart.getDate()-1);
  const yesterday = sales.filter(s=>{const d=new Date(s.createdAt);return d>=yesterdayStart&&d<start&&s.status!=="voided"&&s.status!=="pending_sync";}).reduce((a,s)=>a+s.total,0);
  const change = yesterday > 0 ? ((total-yesterday)/yesterday)*100 : total>0?100:0;
  const payments = [
    { label:"Cash (Taslimu)", key:"cash", color:navy, amount:today.filter(s=>s.paymentMethod==="cash").reduce((a,s)=>a+s.amountPaid,0) },
    { label:"M-Pesa / Simu", key:"mobile", color:green, amount:today.filter(s=>s.paymentMethod!=="cash"&&s.paymentMethod!=="credit"&&s.paymentMethod!=="mixed").reduce((a,s)=>a+s.amountPaid,0) },
    { label:"Mkopo (Deni)", key:"credit", color:"#F59E0B", amount:credit },
  ];
  const paymentTotal = payments.reduce((a,p)=>a+p.amount,0);
  const hourly = Array.from({length:7},(_,i)=>{const h=8+i*2;return {label:String(h).padStart(2,"0")+":00", amount:today.filter(s=>new Date(s.createdAt).getHours()>=h&&new Date(s.createdAt).getHours()<h+2).reduce((a,s)=>a+s.total,0)};});
  const maxHour = Math.max(1,...hourly.map(x=>x.amount));
  const surface = darkMode ? "#102438" : "#FFFFFF", text = darkMode ? "#F4F7FA" : navy, muted = darkMode ? "#AFC0CE" : "#64748B";
  const refresh = async()=>{setRefreshing(true);try{await onRefresh();}finally{setTimeout(()=>setRefreshing(false),500);}};
  return <ScrollView style={{flex:1,backgroundColor:darkMode?"#081522":"#F1F5F9"}} contentContainerStyle={s.page}>
    <View style={s.header}>
      <Pressable onPress={onBack} style={s.iconBtn}><Text style={s.iconText}>‹</Text></Pressable>
      <View style={{flex:1,minWidth:0}}><Text style={s.brand}>GUNX SMART BUSINESS</Text><Text style={s.title}>Mauzo ya Leo</Text><Text style={s.date}>{now.toLocaleDateString("sw-TZ",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</Text></View>
      <Pressable onPress={()=>setHidden(v=>!v)} style={s.iconBtn}><Text style={s.gold}>{hidden?"◉":"◎"}</Text></Pressable>
      <Pressable onPress={()=>void refresh()} style={s.refresh}><Text style={{color:"#FFFFFF",fontWeight:"800"}}>{refreshing?"…":"↻"}</Text></Pressable>
    </View>
    <View style={s.topGrid}>
      <View style={s.hero}><Text style={s.heroLabel}>JUMLA YA MAUZO YA LEO</Text><Text style={s.heroValue}>{refundsLoaded?money(total,hidden):"Inapakia…"}</Text><View style={s.heroBottom}><Text style={s.compare}>{change>=0?"↗":"↘"} {Math.round(Math.abs(change))}% dhidi ya jana</Text><Text style={s.tagline}>Think Big, Build Smart, Grow beyond</Text></View></View>
      <View style={s.metrics}>
        {[[ "Idadi ya Risiti",String(receiptCount),"▤",navy],["Faida ya Makadirio",refundsLoaded?money(profit,hidden):"—","↗",green],["Mauzo ya Mkopo",money(credit,hidden),"◷","#D97706"],["Wastani kwa Risiti",money(average,hidden),"▦",navy]].map(([label,value,ico,color])=><View key={label} style={[s.metric,{backgroundColor:surface,borderColor:darkMode?"#29475D":"#E2E8F0"}]}><View style={s.metricHead}><Text style={[s.metricLabel,{color:muted}]}>{label}</Text><Text style={{color,fontSize:18,fontWeight:"900"}}>{ico}</Text></View><Text style={[s.metricValue,{color:text}]}>{value}</Text></View>)}
      </View>
    </View>
    <View style={s.middle}>
      <View style={[s.card,{backgroundColor:surface,borderColor:darkMode?"#29475D":"#E2E8F0"}]}><Text style={[s.cardTitle,{color:text}]}>Mgawanyo wa Malipo</Text><View style={s.track}>{payments.map(p=><View key={p.key} style={{flex:p.amount||0.01,backgroundColor:p.color}}/>)}</View>{payments.map(p=><View key={p.key} style={s.paymentRow}><View style={{flexDirection:"row",alignItems:"center",gap:8,flex:1}}><View style={{width:10,height:10,borderRadius:5,backgroundColor:p.color}}/><Text style={{color:text,fontWeight:"700",fontSize:12}}>{p.label}</Text></View><Text style={{color:text,fontWeight:"800",fontSize:12}}>{money(p.amount,hidden)}</Text><Text style={{color:muted,fontSize:11,width:42,textAlign:"right"}}>{paymentTotal?Math.round(p.amount/paymentTotal*100):0}%</Text></View>)}</View>
      <View style={[s.card,{backgroundColor:surface,borderColor:darkMode?"#29475D":"#E2E8F0"}]}><Text style={[s.cardTitle,{color:text}]}>Mwenendo wa Mauzo kwa Saa</Text><Text style={{color:muted,fontSize:11,marginTop:3}}>Kuanzia asubuhi hadi usiku</Text><View style={s.chart}>{hourly.map(p=><View key={p.label} style={s.barCol}><Text style={{fontSize:9,color:muted}}>{p.amount?money(p.amount,hidden):""}</Text><View style={[s.bar,{height:Math.max(5,p.amount/maxHour*100),backgroundColor:p.amount?green:"#DCE3EA"}]}/><Text style={{fontSize:9,color:muted,marginTop:5}}>{p.label.slice(0,2)}</Text></View>)}</View></View>
    </View>
    {!refundsLoaded&&<Text style={{color:muted,fontSize:12,marginTop:8}}>Inapakia historia ya marejesho; takwimu zinaweza kukamilika baada ya muda mfupi.</Text>}
    <Text style={{color:muted,fontSize:10,textAlign:"center",marginTop:8}}>Takwimu zinahusu biashara hii pekee. Faida ni makadirio kabla ya gharama za uendeshaji.</Text>
  </ScrollView>;
}
const s=StyleSheet.create({
 page:{padding:14,paddingBottom:35,gap:14},header:{backgroundColor:navy,borderRadius:16,padding:13,flexDirection:"row",alignItems:"center",gap:9,borderBottomWidth:2,borderBottomColor:gold},
 iconBtn:{width:38,height:38,borderRadius:11,backgroundColor:"#132642",borderWidth:1,borderColor:"#D4AF3766",alignItems:"center",justifyContent:"center"},iconText:{color:"#FFFFFF",fontSize:28,lineHeight:30},gold:{color:gold,fontSize:20},refresh:{width:38,height:38,borderRadius:11,backgroundColor:"#0B192C",borderWidth:1,borderColor:green,alignItems:"center",justifyContent:"center"},
 brand:{fontSize:9,color:gold,fontWeight:"900",letterSpacing:1.4},title:{fontSize:19,color:"#FFFFFF",fontWeight:"900"},date:{fontSize:10,color:"#CBD5E1",marginTop:2},
 topGrid:{gap:12},hero:{backgroundColor:navy,borderRadius:17,padding:20,borderWidth:1,borderColor:gold, minHeight:155,justifyContent:"space-between"},heroLabel:{color:"#CBD5E1",fontSize:11,fontWeight:"800",letterSpacing:1},heroValue:{color:"#FFFFFF",fontSize:30,fontWeight:"900",marginVertical:13},heroBottom:{borderTopWidth:1,borderTopColor:"#FFFFFF22",paddingTop:12,gap:6},compare:{color:"#6EE7B7",fontSize:11,fontWeight:"800"},tagline:{color:gold,fontSize:10,fontStyle:"italic"},
 metrics:{flexDirection:"row",flexWrap:"wrap",gap:9},metric:{width:"48%",minHeight:100,borderRadius:15,borderWidth:1,padding:12,justifyContent:"space-between"},metricHead:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:5},metricLabel:{fontSize:11,fontWeight:"700",flex:1},metricValue:{fontSize:17,fontWeight:"900",marginTop:10},
 middle:{gap:12},card:{borderRadius:16,borderWidth:1,padding:15},cardTitle:{fontSize:15,fontWeight:"900",marginBottom:12},track:{height:12,borderRadius:9,overflow:"hidden",flexDirection:"row",gap:2,backgroundColor:"#E2E8F0",marginBottom:12},paymentRow:{flexDirection:"row",alignItems:"center",paddingVertical:10,borderBottomWidth:1,borderBottomColor:"#94A3B822",gap:5},chart:{height:145,flexDirection:"row",alignItems:"flex-end",justifyContent:"space-between",gap:5,marginTop:10},barCol:{flex:1,alignItems:"center",justifyContent:"flex-end",height:"100%"},bar:{width:"70%",borderTopLeftRadius:7,borderTopRightRadius:7,minHeight:5}
});
