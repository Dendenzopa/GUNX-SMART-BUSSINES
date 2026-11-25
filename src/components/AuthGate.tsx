import React, { createContext, useContext, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View, Image } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "../lib/supabase";

type ShopRole = "owner" | "manager" | "cashier" | "stockkeeper";
const ShopContext = createContext<{ shopId: string | null; role: ShopRole | null; shopName: string; userEmail: string; userId: string | null }>({ shopId: null, role: null, shopName: "", userEmail: "", userId: null });
export function useShopContext() { return useContext(ShopContext); }

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [shopName, setShopName] = useState("");
  const [needsShop, setNeedsShop] = useState(false);
  const [shopId, setShopId] = useState<string | null>(null);
  const [role, setRole] = useState<ShopRole | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");

  useEffect(() => {
    if (!supabaseConfigured || !supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) setMessage(error.message);
      setSession(data.session);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) { setNeedsShop(false); setShopId(null); setRole(null); setShopName(""); }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!session || !client) return;
    let active = true;
    client.from("shop_members").select("shop_id,role").eq("user_id", session.user.id).limit(1).maybeSingle()
      .then(async ({ data, error }) => {
        if (!active) return;
        if (error) setMessage("Imeshindikana kusoma duka: " + error.message);
        setNeedsShop(!data && !error);
        setShopId(data?.shop_id ?? null);
        const validRole = data?.role === "owner" || data?.role === "manager" || data?.role === "cashier" || data?.role === "stockkeeper" ? data.role : null;
        setRole(validRole);
        if (data?.shop_id) {
          const { data: shop, error: shopError } = await client.from("shops").select("name").eq("id", data.shop_id).maybeSingle();
          if (!active) return;
          if (shopError) setMessage("Jina la biashara halijapakiwa: " + shopError.message);
          setShopName(shop?.name ?? "");
        }
      });
    return () => { active = false; };
  }, [session]);

  async function authenticate() {
    if (!supabase) return;
    if (!email.trim() || password.length < 8) { setMessage("Weka email na password yenye angalau herufi 8."); return; }
    setBusy(true); setMessage("");
    const result = mode === "signup"
      ? await supabase.auth.signUp({ email: email.trim(), password })
      : await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (result.error) setMessage(result.error.message);
    else if (mode === "signup" && !result.data.session) setMessage("Akaunti imetengenezwa. Thibitisha email yako kisha ingia.");
  }

  async function createShop() {
    if (!supabase || shopName.trim().length < 2) { setMessage("Jina la duka liwe na angalau herufi 2."); return; }
    setBusy(true); setMessage("");
    const { error } = await supabase.rpc("create_shop", { p_name: shopName.trim() });
    setBusy(false);
    if (error) setMessage("Duka halikuundwa: " + error.message);
    else { const { data } = await supabase.from("shop_members").select("shop_id,role").eq("user_id", (await supabase.auth.getUser()).data.user?.id).limit(1).maybeSingle(); setShopId(data?.shop_id ?? null); setNeedsShop(!data); setRole(data?.role === "owner" || data?.role === "manager" || data?.role === "cashier" || data?.role === "stockkeeper" ? data.role : null); if(data?.shop_id){ const {data:shop}=await supabase.from("shops").select("name").eq("id",data.shop_id).maybeSingle(); setShopName(shop?.name ?? ""); } }
  }

  if (!supabaseConfigured) return <>{children}</>;
  if (loading) return <SafeAreaView style={a.safe}><ActivityIndicator color="#43C99A" size="large"/></SafeAreaView>;
  if (!session) return <SafeAreaView style={a.safe}><View style={a.glowTop}/><View style={a.card}><View style={a.brandPanel}><Image source={require("../../assets/GUNX20Smart20Business20Logo-1.jpg")} style={a.logoImage} resizeMode="contain"/></View><View style={a.brandTag}><Text style={a.brandTagText}>SMART BUSINESS PLATFORM</Text></View><Text style={a.title}>{mode === "login" ? "Karibu tena" : "Fungua akaunti"}</Text><Text style={a.copy}>{mode === "login" ? "Ingia kusimamia biashara yako kwa urahisi na usalama." : "Tengeneza akaunti yako ya GUNX Smart Business."}</Text><Text style={a.fieldLabel}>BARUA PEPE</Text><TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="Weka barua pepe yako" placeholderTextColor="#91A4B5" style={a.input}/><Text style={a.fieldLabel}>NENOSIRI</Text><TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder="Weka nenosiri (angalau herufi 8)" placeholderTextColor="#91A4B5" style={a.input}/><Pressable disabled={busy} onPress={authenticate} style={({pressed})=>[a.button,pressed&&a.buttonPressed,busy&&a.buttonDisabled]}><Text style={a.buttonText}>{busy ? "INASINDIKIA..." : mode === "login" ? "INGIA KWENYE AKAUNTI  →" : "TENGENEZA AKAUNTI  →"}</Text></Pressable><View style={a.separator}/><Pressable onPress={()=>{setMode(mode === "login" ? "signup" : "login");setMessage("");}}><Text style={a.link}>{mode === "login" ? "Huna akaunti?  Jisajili hapa" : "Tayari una akaunti?  Ingia hapa"}</Text></Pressable>{!!message&&<Text style={a.message}>{message}</Text>}<Text style={a.footer}>SALAMA  •  RAHISI  •  IMEJENGWA KWA BIASHARA</Text></View></SafeAreaView>;
  if (needsShop) return <SafeAreaView style={a.safe}><View style={a.card}><Text style={a.brand}>GUNX SMART BUSINESS</Text><Text style={a.title}>Unda duka lako</Text><Text style={a.copy}>Akaunti yako imeingia. Weka jina la biashara ili kuanzisha workspace.</Text><TextInput value={shopName} onChangeText={setShopName} placeholder="Jina la duka / biashara" placeholderTextColor="#8194A5" style={a.input}/><Pressable disabled={busy} onPress={createShop} style={a.button}><Text style={a.buttonText}>{busy ? "Inaunda..." : "Unda duka"}</Text></Pressable>{!!message&&<Text style={a.message}>{message}</Text>}<Pressable onPress={()=>supabase?.auth.signOut()}><Text style={a.link}>Toka kwenye akaunti</Text></Pressable></View></SafeAreaView>;
  return <ShopContext.Provider value={{ shopId, role, shopName, userEmail: session.user.email ?? "", userId: session.user.id }}>{children}</ShopContext.Provider>;
}

const a = StyleSheet.create({
  safe:{flex:1,backgroundColor:"#06183F",justifyContent:"center",paddingHorizontal:20,paddingVertical:28,overflow:"hidden"},
  glowTop:{position:"absolute",top:-150,left:-100,width:330,height:330,borderRadius:180,backgroundColor:"#0D3D71",opacity:0.55},
  card:{width:"100%",maxWidth:440,alignSelf:"center",backgroundColor:"#0B2050",borderColor:"#D7B56D",borderWidth:1.5,borderRadius:26,paddingHorizontal:24,paddingTop:22,paddingBottom:20,shadowColor:"#000",shadowOpacity:0.28,shadowRadius:22,elevation:12},
  brandPanel:{alignItems:"center",justifyContent:"center",minHeight:112},
  logoImage:{width:220,height:112,alignSelf:"center"},
  brandTag:{alignSelf:"center",backgroundColor:"#F2B923",borderRadius:20,paddingHorizontal:15,paddingVertical:7,marginTop:4,borderWidth:1,borderColor:"#FFE38A"},
  brandTagText:{color:"#071B49",fontSize:10,fontWeight:"900",letterSpacing:1.2},
  title:{color:"#FFFFFF",fontWeight:"900",fontSize:29,marginTop:22,marginBottom:5,textAlign:"center"},
  copy:{color:"#C0CDE3",fontSize:13,lineHeight:20,marginBottom:19,textAlign:"center"},
  fieldLabel:{color:"#F2D99F",fontSize:10,fontWeight:"900",letterSpacing:1.2,marginTop:11,marginBottom:1},
  input:{backgroundColor:"#07183C",borderWidth:1,borderColor:"#35517E",borderRadius:12,color:"#FFFFFF",paddingHorizontal:15,paddingVertical:15,marginTop:7,fontSize:14},
  button:{backgroundColor:"#078447",padding:16,borderRadius:13,alignItems:"center",marginTop:21,borderWidth:1,borderColor:"#39D58D",shadowColor:"#00A85A",shadowOpacity:0.22,shadowRadius:10,elevation:5},
  buttonPressed:{opacity:0.86,transform:[{scale:0.99}]},
  buttonDisabled:{opacity:0.6},
  buttonText:{color:"#FFFFFF",fontWeight:"900",fontSize:13,letterSpacing:0.4},
  separator:{height:1,backgroundColor:"#263F6B",marginTop:20},
  link:{color:"#F2D16B",textAlign:"center",marginTop:17,fontWeight:"800",fontSize:13},
  message:{color:"#FFE3A0",backgroundColor:"#493B21",borderRadius:10,padding:11,fontSize:12,lineHeight:18,marginTop:14,textAlign:"center"},
  footer:{color:"#8298BD",fontSize:8,fontWeight:"800",letterSpacing:1.1,textAlign:"center",marginTop:23}
});
