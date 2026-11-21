import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useShopContext } from "./AuthGate";
import { supabase } from "../lib/supabase";

type Subscription = {
  plan_code: "free" | "pro";
  status: "free" | "active" | "pending" | "expired" | "cancelled";
  price_tzs: number;
  product_limit: number | null;
  monthly_sales_limit: number | null;
  debtor_limit: number | null;
  expires_at: string | null;
  is_pro_active: boolean;
};

const statusText: Record<Subscription["status"], string> = {
  free: "Unatumia mpango wa BURE",
  active: "GUNX PRO iko hai",
  pending: "Malipo yanasubiri uhakiki",
  expired: "Muda wa PRO umeisha — umerudi Free",
  cancelled: "Usajili wa PRO umesitishwa",
};

export default function SubscriptionManagement() {
  const { shopId } = useShopContext();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("Inakagua mpango wa duka...");

  const load = useCallback(async () => {
    if (!supabase || !shopId) {
      setSubscription(null);
      setNotice("Unganisha Supabase na uchague duka ili kuona usajili halisi.");
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc("get_shop_subscription", { p_shop_id: shopId });
    if (error) {
      setNotice("Imeshindikana kusoma usajili: " + error.message + ". Hakikisha migration 0011 imetumika.");
      setSubscription(null);
    } else {
      setSubscription(data as Subscription);
      setNotice("Hali ya usajili imesasishwa kutoka database.");
    }
    setLoading(false);
  }, [shopId]);

  useEffect(() => { void load(); }, [load]);

  const expiry = subscription?.expires_at
    ? new Date(subscription.expires_at).toLocaleDateString("sw-TZ", { day: "numeric", month: "long", year: "numeric" })
    : null;

  return <View style={s.wrap}>
    <Text style={s.title}>Mipango ya GUNX</Text>
    <Text style={s.copy}>Chagua mpango unaolingana na ukubwa wa biashara yako. Bei zote ni TZS.</Text>
    {loading && <ActivityIndicator color="#43C99A" />}
    {subscription && <>
      <View style={s.current}>
        <Text style={s.eyebrow}>MPANGO WA SASA</Text>
        <Text style={s.plan}>{subscription.plan_code.toUpperCase()}</Text>
        <Text style={s.status}>{statusText[subscription.status]}</Text>
        {expiry && <Text style={s.copy}>Tarehe ya mwisho ya usajili: {expiry}</Text>}
      </View>
      <View style={s.card}>
        <Text style={s.plan}>FREE</Text>
        <Text style={s.price}>TZS 0</Text>
        <Text style={s.item}>• Bidhaa hadi {subscription.plan_code === "free" ? subscription.product_limit ?? 50 : 50}</Text>
        <Text style={s.item}>• Mauzo 100 kwa mwezi</Text>
        <Text style={s.item}>• Wateja wa deni hadi 10</Text>
        <Text style={s.item}>• Ripoti za msingi</Text>
      </View>
      <View style={s.cardPro}>
        <Text style={s.eyebrow}>BIASHARA INAYOKUA</Text>
        <Text style={s.plan}>GUNX PRO</Text>
        <Text style={s.price}>TZS 5,000<Text style={s.per}> / mwezi</Text></Text>
        <Text style={s.item}>• Bidhaa na mauzo bila kikomo</Text>
        <Text style={s.item}>• Madeni na historia ya stock bila kikomo</Text>
        <Text style={s.item}>• Ripoti na uchambuzi wa kina</Text>
        <Text style={s.item}>• Backup ya cloud na majukumu ya wafanyakazi</Text>
        <Text style={s.copy}>Muda wa Pro huisha kiotomatiki; akaunti hurudi Free na data za biashara hazifutwi.</Text>
      </View>
    </>}
    <View style={s.payment}>
      <Text style={s.heading}>Jinsi ya kuomba GUNX PRO</Text>
      <Text style={s.item}>HaloPesa: 0621665181</Text>
      <Text style={s.copy}>REORNADA BINARY RHESPICIOUS</Text>
      <Text style={s.item}>M-Pesa: 0797665181</Text>
      <Text style={s.copy}>ELIAS PAUL MARWA</Text>
      <Text style={s.warning}>Hizi ni namba za malipo ya mkono tu. Mfumo bado hauthibitishi miamala ya simu moja kwa moja. Usajili wa Pro utaanzishwa na msimamizi baada ya kuthibitisha malipo; kutuma pesa hakubadilishi mpango moja kwa moja.</Text>
    </View>
    <Pressable onPress={() => void load()} style={s.refresh}><Text style={s.refreshText}>↻ Sasisha hali ya usajili</Text></Pressable>
    <Text style={s.copy}>{notice}</Text>
  </View>;
}

const s = StyleSheet.create({
  wrap:{padding:16,paddingBottom:36,maxWidth:900,width:"100%",alignSelf:"center"},
  title:{color:"#F4F7FA",fontSize:24,fontWeight:"900"},
  eyebrow:{color:"#43C99A",fontSize:10,fontWeight:"900",letterSpacing:1.2},
  copy:{color:"#91A4B5",fontSize:12,lineHeight:18,marginTop:7},
  current:{backgroundColor:"#102D2C",borderColor:"#286451",borderWidth:1,borderRadius:14,padding:15,marginTop:15},
  plan:{color:"#FFF",fontSize:22,fontWeight:"900",marginTop:7},
  status:{color:"#75E0B8",fontSize:13,fontWeight:"800",marginTop:5},
  card:{backgroundColor:"#102438",borderColor:"#1D3A50",borderWidth:1,borderRadius:14,padding:15,marginTop:12},
  cardPro:{backgroundColor:"#132F31",borderColor:"#43A987",borderWidth:1,borderRadius:14,padding:15,marginTop:12},
  price:{color:"#F2D99F",fontSize:24,fontWeight:"900",marginVertical:7},
  per:{color:"#91A4B5",fontSize:12,fontWeight:"600"},
  item:{color:"#E6EEF4",fontSize:12,lineHeight:22,marginTop:4},
  payment:{backgroundColor:"#102438",borderColor:"#1D3A50",borderWidth:1,borderRadius:14,padding:15,marginTop:14},
  heading:{color:"#FFF",fontSize:16,fontWeight:"900",marginBottom:7},
  warning:{color:"#F2D99F",fontSize:11,lineHeight:17,marginTop:12},
  refresh:{alignSelf:"flex-start",backgroundColor:"#173D36",padding:11,borderRadius:9,marginTop:14},
  refreshText:{color:"#F4F7FA",fontWeight:"800",fontSize:12}
});
