import React, { createContext, useContext, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View, Image } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "../lib/supabase";

const ShopContext = createContext<{ shopId: string | null; isPlatformAdmin: boolean }>({ shopId: null, isPlatformAdmin: false });
export function useShopContext() { return useContext(ShopContext); }

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [shopName, setShopName] = useState("");
  const [needsShop, setNeedsShop] = useState(false);
  const [shopId, setShopId] = useState<string | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessError, setAccessError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");

  useEffect(() => {
    if (!supabaseConfigured || !supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) setMessage(error.message);
      setSession(data.session);
      setAccessLoading(Boolean(data.session));
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setAccessLoading(Boolean(next));
      if (!next) { setNeedsShop(false); setShopId(null); setIsPlatformAdmin(false); setAccessError(""); }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session || !supabase) return;
    const client = supabase;
    let active = true;
    setAccessLoading(true);
    const resolveAccess = async () => {
      try {
        const [adminResult, memberResult] = await Promise.all([
          client.rpc("is_platform_admin"),
          client.from("shop_members").select("shop_id").eq("user_id", session.user.id).limit(1).maybeSingle(),
        ]);
        if (!active) return;
        if (memberResult.error) throw new Error("Imeshindikana kusoma uanachama wa biashara: " + memberResult.error.message);
        const platformAdmin = !adminResult.error && adminResult.data === true;
        if (adminResult.error && !memberResult.data) {
          throw new Error("Huduma ya kuthibitisha Platform Admin haipatikani. Ufikiaji umesitishwa kwa usalama; wasiliana na msimamizi.");
        }
        setAccessError("");
        setIsPlatformAdmin(platformAdmin);
        setShopId(memberResult.data?.shop_id ?? null);
        setNeedsShop(!memberResult.data && !platformAdmin);
      } catch (e) {
        if (!active) return;
        setAccessError(e instanceof Error ? e.message : "Imeshindikana kuthibitisha ruhusa za akaunti.");
        setNeedsShop(false);
      } finally {
        if (active) setAccessLoading(false);
      }
    };
    void resolveAccess();
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
    else { const { data } = await supabase.from("shop_members").select("shop_id").eq("user_id", (await supabase.auth.getUser()).data.user?.id).limit(1).maybeSingle(); setShopId(data?.shop_id ?? null); setNeedsShop(!data); }
  }

  if (!supabaseConfigured) return <>{children}</>;
  if (loading) return <SafeAreaView style={a.safe}><ActivityIndicator color="#43C99A" size="large"/></SafeAreaView>;
  if (session && accessLoading) return <SafeAreaView style={a.safe}><ActivityIndicator color="#43C99A" size="large"/><Text style={a.copy}>Inathibitisha ruhusa za akaunti...</Text></SafeAreaView>;
  if (session && accessError) return <SafeAreaView style={a.safe}><View style={a.card}><Text style={a.title}>Ufikiaji umesitishwa</Text><Text style={a.copy}>{accessError}</Text><Pressable onPress={()=>supabase?.auth.signOut()} style={a.button}><Text style={a.buttonText}>Toka kwenye akaunti</Text></Pressable></View></SafeAreaView>;
  if (!session) return <SafeAreaView style={a.safe}><View style={a.card}><Image source={require("../../assets/GUNX20Smart20Business20Logo-1.jpg")} style={a.logoImage} resizeMode="contain"/><Text style={a.brand}>GUNX SMART BUSINESS</Text><Text style={a.privacy}>Your Business, Your Data, Your Privacy.</Text><Text style={a.title}>{mode === "login" ? "Karibu tena" : "Fungua akaunti"}</Text><TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="Email" placeholderTextColor="#8194A5" style={a.input}/><TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder="Password (angalau herufi 8)" placeholderTextColor="#8194A5" style={a.input}/><Pressable disabled={busy} onPress={authenticate} style={a.button}><Text style={a.buttonText}>{busy ? "Subiri..." : mode === "login" ? "Ingia" : "Jisajili"}</Text></Pressable><Pressable onPress={()=>{setMode(mode === "login" ? "signup" : "login");setMessage("");}}><Text style={a.link}>{mode === "login" ? "Huna akaunti? Jisajili" : "Tayari una akaunti? Ingia"}</Text></Pressable>{!!message&&<Text style={a.message}>{message}</Text>}</View></SafeAreaView>;
  if (needsShop) return <SafeAreaView style={a.safe}><View style={a.card}><Text style={a.brand}>GUNX SMART BUSINESS</Text><Text style={a.privacy}>Your Business, Your Data, Your Privacy.</Text><Text style={a.title}>Unda duka lako</Text><Text style={a.copy}>Akaunti yako imeingia. Weka jina la biashara ili kuanzisha workspace.</Text><TextInput value={shopName} onChangeText={setShopName} placeholder="Jina la duka / biashara" placeholderTextColor="#8194A5" style={a.input}/><Pressable disabled={busy} onPress={createShop} style={a.button}><Text style={a.buttonText}>{busy ? "Inaunda..." : "Unda duka"}</Text></Pressable>{!!message&&<Text style={a.message}>{message}</Text>}<Pressable onPress={()=>supabase?.auth.signOut()}><Text style={a.link}>Toka kwenye akaunti</Text></Pressable></View></SafeAreaView>;
  return <ShopContext.Provider value={{ shopId, isPlatformAdmin }}>{children}</ShopContext.Provider>;
}

const a = StyleSheet.create({
  safe:{flex:1,backgroundColor:"#081522",justifyContent:"center",padding:20},
  card:{width:"100%",maxWidth:460,alignSelf:"center",backgroundColor:"#102438",borderColor:"#1D3A50",borderWidth:1,borderRadius:18,padding:22},
  logoImage:{width:190,height:126,alignSelf:"center",marginBottom:8},
  brand:{color:"#D7B56D",fontWeight:"900",letterSpacing:1.3,fontSize:12},
  privacy:{color:"#D7B56D",fontWeight:"800",fontSize:11,marginTop:6},
  title:{color:"#F4F7FA",fontWeight:"900",fontSize:25,marginTop:12,marginBottom:8},
  copy:{color:"#91A4B5",fontSize:13,lineHeight:20,marginBottom:12},
  input:{backgroundColor:"#0B1B2A",borderWidth:1,borderColor:"#2B4B61",borderRadius:10,color:"#F4F7FA",padding:13,marginTop:10},
  button:{backgroundColor:"#16785C",padding:14,borderRadius:11,alignItems:"center",marginTop:15},
  buttonText:{color:"#F5FFFA",fontWeight:"900"},
  link:{color:"#75E0B8",textAlign:"center",marginTop:17,fontWeight:"700"},
  message:{color:"#F2D99F",fontSize:12,lineHeight:18,marginTop:13},
  warning:{color:"#F2D99F",fontSize:12,marginTop:14}
});
