import React from "react";
import { SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View } from "react-native";

const tools = [
  ["POS", "Point of Sale", "Record sales and issue receipts"],
  ["STK", "Products & Stock", "Products, stock levels and movements"],
  ["CRM", "Customers & Debts", "Customer balances and credit book"],
  ["EXP", "Expenses", "Track operating costs"],
  ["RPT", "Reports", "Sales, costs and net profit"],
  ["TEAM", "Staff", "Team access and roles"]
];

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;
}

export default function App() {
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#081522" />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View><Text style={styles.eyebrow}>GUNX BUSINESS SUITE</Text><Text style={styles.brand}>GUNX <Text style={styles.gold}>SMART</Text></Text><Text style={styles.brand}>BUSINESS</Text></View>
          <View style={styles.avatar}><Text style={styles.avatarText}>GX</Text></View>
        </View>
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>BUSINESS OVERVIEW</Text>
          <Text style={styles.heroTitle}>Welcome back</Text>
          <Text style={styles.muted}>Your business, all in one place.</Text>
        </View>
        <View style={styles.row}><Metric label="TODAY'S SALES" value="TZS 0" /><Metric label="NET PROFIT" value="TZS 0" /></View>
        <View style={styles.row}><Metric label="LOW STOCK" value="0 items" /><Metric label="CUSTOMER DEBT" value="TZS 0" /></View>
        <View style={styles.section}><Text style={styles.sectionTitle}>Business tools</Text><Text style={styles.muted}>Manage your operations</Text></View>
        <View style={styles.grid}>
          {tools.map(([mark, title, subtitle]) => <View key={mark} style={styles.tool}>
            <View style={styles.mark}><Text style={styles.markText}>{mark}</Text></View>
            <Text style={styles.toolTitle}>{title}</Text><Text style={styles.toolSubtitle}>{subtitle}</Text>
          </View>)}
        </View>
        <View style={styles.footer}><Text style={styles.footerTitle}>GUNX SMART BUSINESS</Text><Text style={styles.muted}>Starter dashboard · Demo figures only</Text></View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:{flex:1,backgroundColor:"#081522"},
  container:{padding:20,paddingBottom:40,maxWidth:900,width:"100%",alignSelf:"center"},
  header:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginBottom:30},
  eyebrow:{color:"#43C99A",fontSize:10,fontWeight:"800",letterSpacing:2},
  brand:{color:"#F4F7FA",fontSize:25,fontWeight:"900",letterSpacing:1},
  gold:{color:"#D7B56D"},
  avatar:{width:46,height:46,borderRadius:16,backgroundColor:"#123C37",alignItems:"center",justifyContent:"center",borderWidth:1,borderColor:"#43C99A"},
  avatarText:{color:"#75E0B8",fontWeight:"900"},
  hero:{backgroundColor:"#102438",borderColor:"#1D3A50",borderWidth:1,padding:22,borderRadius:20,marginBottom:16},
  heroLabel:{color:"#D7B56D",fontSize:10,fontWeight:"800",letterSpacing:1.5},
  heroTitle:{color:"#FFF",fontSize:26,fontWeight:"800",marginTop:9},
  muted:{color:"#91A4B5",fontSize:13,marginTop:5},
  row:{flexDirection:"row",gap:12,marginBottom:12},
  metric:{flex:1,minHeight:100,backgroundColor:"#102438",borderWidth:1,borderColor:"#1D3A50",borderRadius:16,padding:16,justifyContent:"center"},
  metricLabel:{color:"#91A4B5",fontSize:10,fontWeight:"800",letterSpacing:1},
  metricValue:{color:"#F4F7FA",fontSize:21,fontWeight:"800",marginTop:10},
  section:{marginTop:24,marginBottom:14},
  sectionTitle:{color:"#FFF",fontSize:19,fontWeight:"800"},
  grid:{flexDirection:"row",flexWrap:"wrap",gap:12},
  tool:{flexBasis:"47%",flexGrow:1,minWidth:140,backgroundColor:"#102438",borderColor:"#1D3A50",borderWidth:1,borderRadius:16,padding:16,minHeight:145},
  mark:{width:38,height:32,borderRadius:10,backgroundColor:"#123C37",alignItems:"center",justifyContent:"center",marginBottom:14},
  markText:{color:"#75E0B8",fontSize:10,fontWeight:"900"},
  toolTitle:{color:"#F4F7FA",fontSize:15,fontWeight:"800"},
  toolSubtitle:{color:"#91A4B5",fontSize:11,lineHeight:16,marginTop:6},
  footer:{alignItems:"center",marginTop:30,paddingTop:18,borderTopWidth:1,borderTopColor:"#1D3A50"},
  footerTitle:{color:"#D7B56D",fontWeight:"800",letterSpacing:1}
});
