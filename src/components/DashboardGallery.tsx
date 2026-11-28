import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

type RoleKey = "owner" | "manager" | "cashier" | "stockkeeper" | "superadmin";
const ROLES: { key: RoleKey; title: string; subtitle: string; icon: string; access: string[]; settings: string[]; metrics: string[]; nav: string[] }[] = [
  { key:"owner", title:"Boss / Business Owner", subtitle:"Dashboard ya mmiliki wa biashara", icon:"👑", access:["Muhtasari wa biashara yake tu","Mauzo, faida na mwenendo wa biashara yake","Bidhaa, stock, wafanyakazi na matawi","Ripoti na usajili wa biashara yake"], settings:["Jina na nembo ya biashara","Wafanyakazi na ruhusa za Manager","Mipangilio ya POS, stock na taarifa","Usajili na taarifa za biashara"], metrics:["Mauzo","Faida","Bidhaa","Wafanyakazi"], nav:["Dashboard","POS","Stock","Staff","Reports"] },
  { key:"manager", title:"Manager", subtitle:"Dashboard ya meneja kulingana na ruhusa za Boss", icon:"🧭", access:["Taarifa za biashara aliyopangiwa","Sehemu alizopewa ruhusa na Boss","Usimamizi wa kazi za kila siku","Nyaraka za wafanyakazi ikiwa ruhusa imetolewa"], settings:["Ruhusa za Manager hutolewa na Boss","Hakuna kubadilisha umiliki wa biashara","Hakuna kuona taarifa nje ya biashara yake","Nyaraka binafsi zinahitaji ruhusa maalumu"], metrics:["Kazi za leo","Bidhaa","Stock","Wafanyakazi"], nav:["Dashboard","POS*","Stock*","Staff*","Reports*"] },
  { key:"cashier", title:"Cashier", subtitle:"Dashboard ya mhudumu wa mauzo", icon:"🧾", access:["POS na bidhaa anazoruhusiwa kuuza","Mauzo anayoyafanya kulingana na ruhusa","Madeni au sync ikiwa amepewa ruhusa","Hakuna mipangilio ya biashara"], settings:["Akaunti na taarifa zake binafsi","Hakuna kusimamia roles","Hakuna kuona faida au ripoti za siri","Mipaka ya POS inadhibitiwa na Boss"], metrics:["Mauzo yangu","Risiti","Bidhaa","Sync"], nav:["Dashboard","POS","Madeni*","Sync*","Profile"] },
  { key:"stockkeeper", title:"Stockkeeper", subtitle:"Dashboard ya msimamizi wa stock", icon:"📦", access:["Stock na bidhaa kwa kazi za stoo","Kupokea stock na kuona viwango","Hakuna POS au taarifa za faida","Hakuna kusimamia wafanyakazi"], settings:["Akaunti na taarifa zake binafsi","Hakuna kubadilisha bei bila ruhusa","Hakuna kuona taarifa za fedha za siri","Ruhusa za stock zinasimamiwa na Boss"], metrics:["Bidhaa","Stock in","Low stock","Movements"], nav:["Dashboard","Stock","Profile"] },
  { key:"superadmin", title:"Super Admin", subtitle:"Usimamizi wa jukwaa zima la GUNX", icon:"🛡️", access:["Kuona muundo na hali ya dashboards zote","Mipangilio ya jukwaa, roles na vipengele","Takwimu za jumla na mapato ya GUNX","Hakuna ufikiaji wa kawaida wa data binafsi za tenant"], settings:["Mipangilio ya mfumo mzima","Usalama, uptime na audit","Vifurushi na usajili wa GUNX","Ufikiaji wa uchunguzi unahitaji idhini na audit"], metrics:["Biashara zote","Watumiaji","Mapato ya GUNX","Afya ya mfumo"], nav:["Overview","Businesses","Users","Subscriptions","Settings"] }
];
export default function DashboardGallery({ darkMode, onBack }: { darkMode:boolean; onBack:()=>void }) {
  const [selected,setSelected]=useState<RoleKey>("owner");
  const role=useMemo(()=>ROLES.find(item=>item.key===selected)!,[selected]);
  const [tab,setTab]=useState<"preview"|"settings">("preview");
  const bg=darkMode?"#081522":"#F4F7FA";
  const panel=darkMode?"#102438":"#FFFFFF";
  const text=darkMode?"#F4F7FA":"#142D42";
  const muted=darkMode?"#B9C9D6":"#526579";
  return <ScrollView style={[s.screen,{backgroundColor:bg}]} contentContainerStyle={s.content}>
    <Pressable onPress={onBack} style={s.back}><Text style={s.backText}>‹  Rudi Super Admin</Text></Pressable>
    <Text style={s.eyebrow}>GUNX SMART BUSINESS · GLOBAL CONTROL</Text>
    <Text style={[s.title,{color:text}]}>Dashboards Zote</Text>
    <Text style={[s.copy,{color:muted}]}>Chagua role kuona muundo wa dashboard na mipangilio yake. Huu ni mwonekano wa ukaguzi; hauingii kwenye akaunti ya biashara wala kuonyesha taarifa zake binafsi.</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.roleRow}>
      {ROLES.map(item=><Pressable key={item.key} onPress={()=>{setSelected(item.key);setTab("preview");}} style={[s.roleChip,{backgroundColor:panel,borderColor:selected===item.key?"#16A36F":(darkMode?"#2B4B61":"#D7E1E8")} ,selected===item.key&&s.roleChipActive]}>
        <Text style={s.roleIcon}>{item.icon}</Text><Text style={[s.roleName,{color:text}]}>{item.title}</Text>
      </Pressable>)}
    </ScrollView>
    <View style={[s.previewCard,{backgroundColor:panel,borderColor:darkMode?"#2B4B61":"#D7E1E8"}]}>
      <View style={s.previewHeader}>
        <View style={s.logoMark}><Text style={s.logoText}>G</Text></View>
        <View style={{flex:1}}><Text style={[s.brand,{color:text}]}>GUNX SMART BUSINESS</Text><Text style={[s.roleSubtitle,{color:muted}]}>{role.subtitle}</Text></View>
        <View style={s.status}><Text style={s.statusText}>PREVIEW</Text></View>
      </View>
      <View style={s.welcome}><Text style={s.welcomeSmall}>KARIBU</Text><Text style={s.welcomeTitle}>{role.title}</Text><Text style={s.welcomeCopy}>Muhtasari wa kazi na zana zako</Text></View>
      <View style={s.metricGrid}>{role.metrics.map((metric,index)=><View key={metric} style={[s.metric,{backgroundColor:darkMode?"#173247":"#F0F6F8",borderColor:darkMode?"#294A5F":"#DCE6EC"}]}><Text style={s.metricValue}>{["—","—","—","—"][index]}</Text><Text style={[s.metricLabel,{color:muted}]}>{metric}</Text></View>)}</View>
      <Text style={[s.sectionTitle,{color:text}]}>MENYU YA DASHBOARD</Text>
      <View style={s.navGrid}>{role.nav.map(item=><View key={item} style={[s.navItem,{backgroundColor:darkMode?"#173247":"#F0F6F8"}]}><Text style={s.navDot}>◆</Text><Text style={[s.navText,{color:text}]}>{item}</Text></View>)}</View>
      <Text style={[s.disclaimer,{color:muted}]}>* Sehemu zenye alama ya nyota huonekana tu pale Boss anapotoa ruhusa husika. Takwimu zimefichwa kwenye preview hii.</Text>
    </View>
    <View style={s.tabs}>
      <Pressable onPress={()=>setTab("preview")} style={[s.tab,tab==="preview"&&s.tabActive]}><Text style={[s.tabText,tab==="preview"&&s.tabTextActive]}>Muonekano</Text></Pressable>
      <Pressable onPress={()=>setTab("settings")} style={[s.tab,tab==="settings"&&s.tabActive]}><Text style={[s.tabText,tab==="settings"&&s.tabTextActive]}>Mipangilio & Ruhusa</Text></Pressable>
    </View>
    <View style={[s.infoCard,{backgroundColor:panel,borderColor:darkMode?"#2B4B61":"#D7E1E8"}]}>
      <Text style={[s.infoTitle,{color:text}]}>{tab==="preview"?"Dashboard access":"Mipangilio ya "+role.title}</Text>
      {(tab==="preview"?role.access:role.settings).map((item,index)=><View key={item} style={s.infoRow}><Text style={s.check}>{tab==="preview"?"✓":"⚙"}</Text><Text style={[s.infoText,{color:muted}]}>{item}</Text></View>)}
    </View>
    <View style={s.privacy}><Text style={s.privacyTitle}>🔐 Ulinzi wa faragha</Text><Text style={s.privacyText}>Super Admin anaweza kukagua muundo, mipangilio na afya ya dashboards. Mauzo binafsi, faida, miamala, wateja na nyaraka za biashara havionyeshwi hapa. Ufikiaji wa uchunguzi maalumu lazima uidhinishwe na kurekodiwa.</Text></View>
  </ScrollView>;
}
const s=StyleSheet.create({
 screen:{flex:1},content:{padding:16,paddingBottom:34},back:{alignSelf:"flex-start",paddingVertical:10,paddingHorizontal:12,backgroundColor:"#173D36",borderRadius:10,marginBottom:16},backText:{color:"#75E0B8",fontWeight:"900",fontSize:14},eyebrow:{fontSize:10,fontWeight:"900",letterSpacing:1.4,color:"#16A36F"},title:{fontSize:26,fontWeight:"900",marginTop:5},copy:{fontSize:13,lineHeight:20,marginTop:7},roleRow:{gap:9,paddingVertical:16},roleChip:{minWidth:128,borderWidth:1.5,borderRadius:14,padding:12,alignItems:"center"},roleChipActive:{borderColor:"#16A36F",backgroundColor:"#E8F7F0"},roleIcon:{fontSize:24},roleName:{fontSize:12,fontWeight:"900",marginTop:5,textAlign:"center"},previewCard:{borderWidth:1,borderRadius:20,padding:15},previewHeader:{flexDirection:"row",alignItems:"center",gap:10},logoMark:{width:38,height:38,borderRadius:12,backgroundColor:"#173D68",alignItems:"center",justifyContent:"center",borderWidth:2,borderColor:"#D7B56D"},logoText:{fontSize:24,fontWeight:"900",color:"#75E0B8"},brand:{fontSize:11,fontWeight:"900",letterSpacing:.7},roleSubtitle:{fontSize:10,marginTop:3},status:{backgroundColor:"#E8F7F0",paddingHorizontal:8,paddingVertical:5,borderRadius:7},statusText:{fontSize:9,fontWeight:"900",color:"#087F5B"},welcome:{backgroundColor:"#123D56",borderRadius:14,padding:15,marginTop:16},welcomeSmall:{color:"#75E0B8",fontSize:9,fontWeight:"900",letterSpacing:1.4},welcomeTitle:{color:"#FFFFFF",fontSize:20,fontWeight:"900",marginTop:5},welcomeCopy:{color:"#C9D9E4",fontSize:11,marginTop:4},metricGrid:{flexDirection:"row",flexWrap:"wrap",gap:8,marginTop:12},metric:{width:"48%",borderWidth:1,borderRadius:12,padding:12},metricValue:{fontSize:19,fontWeight:"900",color:"#16A36F"},metricLabel:{fontSize:10,fontWeight:"800",marginTop:3},sectionTitle:{fontSize:10,fontWeight:"900",letterSpacing:1,marginTop:18,marginBottom:9},navGrid:{flexDirection:"row",flexWrap:"wrap",gap:8},navItem:{width:"48%",borderRadius:10,padding:11,flexDirection:"row",alignItems:"center",gap:8},navDot:{color:"#D7B56D",fontSize:9},navText:{fontSize:11,fontWeight:"800"},disclaimer:{fontSize:10,lineHeight:16,marginTop:12},tabs:{flexDirection:"row",gap:8,marginTop:16},tab:{flex:1,padding:12,borderRadius:10,backgroundColor:"#E6EDF2",alignItems:"center"},tabActive:{backgroundColor:"#173D36"},tabText:{fontSize:12,fontWeight:"800",color:"#526579"},tabTextActive:{color:"#FFFFFF"},infoCard:{borderWidth:1,borderRadius:16,padding:15,marginTop:10},infoTitle:{fontSize:16,fontWeight:"900",marginBottom:10},infoRow:{flexDirection:"row",alignItems:"flex-start",gap:10,paddingVertical:8},check:{color:"#16A36F",fontSize:16,fontWeight:"900"},infoText:{flex:1,fontSize:12,lineHeight:19},privacy:{backgroundColor:"#FFF7E8",borderWidth:1,borderColor:"#E8C779",borderRadius:14,padding:14,marginTop:14},privacyTitle:{fontSize:13,fontWeight:"900",color:"#765416"},privacyText:{fontSize:11,lineHeight:18,color:"#725D32",marginTop:6}
});
