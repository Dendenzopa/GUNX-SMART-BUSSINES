import React, { createContext, useContext, useEffect, useState } from "react";
import { ActivityIndicator, AppState, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View, Image } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { registerAppInstallation, recordSignedInActivity } from "../services/appAnalytics";

type ShopRole = "owner" | "manager" | "cashier" | "stockkeeper";
const ShopContext = createContext<{ shopId: string | null; isPlatformAdmin: boolean; userId: string | null; shopRole: ShopRole | null }>({ shopId: null, isPlatformAdmin: false, userId: null, shopRole: null });
export function useShopContext() { return useContext(ShopContext); }

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionCheckTimedOut, setSessionCheckTimedOut] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [shopName, setShopName] = useState("");
  const [needsShop, setNeedsShop] = useState(false);
  const [shopId, setShopId] = useState<string | null>(null);
  const [shopRole, setShopRole] = useState<ShopRole | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [shopLoading, setShopLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");

  useEffect(() => {
    if (!supabaseConfigured || !supabase) { setLoading(false); return; }
    let active = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setMessage(error.message);
      if (data.session) setShopLoading(true);
      setSession(data.session);
      setLoading(false);
      setSessionCheckTimedOut(false);
    }).catch((error: unknown) => {
      if (!active) return;
      setMessage(error instanceof Error ? error.message : "Imeshindikana kusoma akaunti iliyohifadhiwa.");
      setLoading(false);
      setSessionCheckTimedOut(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) { setNeedsShop(false); setShopId(null); setShopRole(null); setIsPlatformAdmin(false); }
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  // Do not leave the opening spinner running forever if local session storage is slow.
  // Keep the user outside the app until session state is safely resolved.
  useEffect(() => {
    if (!loading || sessionCheckTimedOut) return;
    const timeout = setTimeout(() => setSessionCheckTimedOut(true), 10000);
    return () => clearTimeout(timeout);
  }, [loading, sessionCheckTimedOut]);

  async function retrySessionCheck() {
    if (!supabase) return;
    setSessionCheckTimedOut(false);
    setLoading(true);
    setMessage("");
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) setMessage(error.message);
      if (data.session) setShopLoading(true);
      setSession(data.session);
      setLoading(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Imeshindikana kusoma akaunti iliyohifadhiwa.");
      setSessionCheckTimedOut(true);
      setLoading(false);
    }
  }

  useEffect(() => {
    // Clear the previous account's UI privilege immediately while the server
    // checks the newly signed-in account. The dashboard RPC remains authoritative.
    setIsPlatformAdmin(false);
    if (!session || !supabase) return;
    let active = true;
    void registerAppInstallation();
    void recordSignedInActivity();
    supabase.rpc("is_platform_admin").then(({ data, error }) => {
      if (active) setIsPlatformAdmin(!error && data === true);
    });
    return () => { active = false; };
  }, [session]);

  // Retry both installation registration and activity when the signed-in app
  // returns to foreground. This recovers from temporary offline/RPC failures.
  useEffect(() => {
    if (!session || !supabase) return;
    const refreshAnalytics = () => {
      void registerAppInstallation();
      void recordSignedInActivity();
    };
    refreshAnalytics();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshAnalytics();
    });
    return () => subscription.remove();
  }, [session?.user.id]);

  useEffect(() => {
    if (!session || !supabase) return;
    let active = true;
    setShopLoading(true);
    supabase.from("shop_members").select("shop_id,role").eq("user_id", session.user.id).limit(1).maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setMessage("Imeshindikana kusoma duka: " + error.message);
        setNeedsShop(!data && !error);
        setShopId(data?.shop_id ?? null);
        setShopRole((data?.role as ShopRole | undefined) ?? null);
        setShopLoading(false);
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
    else { const { data } = await supabase.from("shop_members").select("shop_id,role").eq("user_id", (await supabase.auth.getUser()).data.user?.id).limit(1).maybeSingle(); setShopId(data?.shop_id ?? null); setShopRole((data?.role as ShopRole | undefined) ?? null); setNeedsShop(!data); }
  }

  if (!supabaseConfigured) return <>{children}</>;
  if (loading && !sessionCheckTimedOut) return <SafeAreaView style={a.safe}><Image source={require("../../assets/GUNX20Smart20Business20Logo-1.jpg")} style={a.logoImage} resizeMode="contain"/><ActivityIndicator color="#43C99A" size="large"/><Text style={a.copy}>Inafungua akaunti yako...</Text></SafeAreaView>;
  if (loading && sessionCheckTimedOut) return <SafeAreaView style={a.safe}><View style={a.card}><Image source={require("../../assets/GUNX20Smart20Business20Logo-1.jpg")} style={a.logoImage} resizeMode="contain"/><Text style={a.title}>Kufungua app kunachukua muda</Text><Text style={a.copy}>{message || "Imeshindikana kusoma taarifa za akaunti kwa wakati. Hakikisha simu ina intaneti kisha jaribu tena."}</Text><Pressable onPress={retrySessionCheck} style={a.button}><Text style={a.buttonText}>Jaribu tena</Text></Pressable></View></SafeAreaView>;
  if (!session) return <SafeAreaView style={a.safe}><View style={a.card}><Image source={require("../../assets/GUNX20Smart20Business20Logo-1.jpg")} style={a.logoImage} resizeMode="contain"/><Text style={a.brand}>GUNX SMART BUSINESS</Text><Text style={a.title}>{mode === "login" ? "Karibu tena" : "Fungua akaunti"}</Text><TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="Email" placeholderTextColor="#8194A5" style={a.input}/><TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder="Password (angalau herufi 8)" placeholderTextColor="#8194A5" style={a.input}/><Pressable disabled={busy} onPress={authenticate} style={a.button}><Text style={a.buttonText}>{busy ? "Subiri..." : mode === "login" ? "Ingia" : "Jisajili"}</Text></Pressable><Pressable onPress={()=>{setMode(mode === "login" ? "signup" : "login");setMessage("");}}><Text style={a.link}>{mode === "login" ? "Huna akaunti? Jisajili" : "Tayari una akaunti? Ingia"}</Text></Pressable>{!!message&&<Text style={a.message}>{message}</Text>}</View></SafeAreaView>;
  if (session && shopLoading) return <SafeAreaView style={a.safe}><ActivityIndicator color="#43C99A" size="large"/><Text style={a.copy}>Inathibitisha duka lako...</Text></SafeAreaView>;
  if (session && !shopId && !needsShop) return <SafeAreaView style={a.safe}><View style={a.card}><Text style={a.brand}>GUNX SMART BUSINESS</Text><Text style={a.title}>Duka halijathibitishwa</Text><Text style={a.copy}>{message || "Imeshindikana kuthibitisha uanachama wa duka. Hakuna taarifa za demo zitakazoonyeshwa kama data halisi."}</Text><Pressable onPress={()=>supabase?.auth.signOut()} style={a.button}><Text style={a.buttonText}>Toka kisha ujaribu tena</Text></Pressable></View></SafeAreaView>;
  if (needsShop) return <SafeAreaView style={a.safe}><View style={a.card}><Text style={a.brand}>GUNX SMART BUSINESS</Text><Text style={a.title}>Unda duka lako</Text><Text style={a.copy}>Akaunti yako imeingia. Weka jina la biashara ili kuanzisha workspace.</Text><TextInput value={shopName} onChangeText={setShopName} placeholder="Jina la duka / biashara" placeholderTextColor="#8194A5" style={a.input}/><Pressable disabled={busy} onPress={createShop} style={a.button}><Text style={a.buttonText}>{busy ? "Inaunda..." : "Unda duka"}</Text></Pressable>{!!message&&<Text style={a.message}>{message}</Text>}<Pressable onPress={()=>supabase?.auth.signOut()}><Text style={a.link}>Toka kwenye akaunti</Text></Pressable></View></SafeAreaView>;
  return <ShopContext.Provider value={{ shopId, isPlatformAdmin, userId: session.user.id, shopRole }}>{children}</ShopContext.Provider>;
}

const a = StyleSheet.create({
  safe:{flex:1,backgroundColor:"#081522",justifyContent:"center",padding:20},
  card:{width:"100%",maxWidth:460,alignSelf:"center",backgroundColor:"#102438",borderColor:"#1D3A50",borderWidth:1,borderRadius:18,padding:22},
  logoImage:{width:240,height:155,alignSelf:"center",marginBottom:12},
  brand:{color:"#D7B56D",fontWeight:"900",letterSpacing:1.3,fontSize:12},
  title:{color:"#F4F7FA",fontWeight:"900",fontSize:25,marginTop:12,marginBottom:8},
  copy:{color:"#91A4B5",fontSize:13,lineHeight:20,marginBottom:12},
  input:{backgroundColor:"#0B1B2A",borderWidth:1,borderColor:"#2B4B61",borderRadius:10,color:"#F4F7FA",padding:13,marginTop:10},
  button:{backgroundColor:"#16785C",padding:14,borderRadius:11,alignItems:"center",marginTop:15},
  buttonText:{color:"#F5FFFA",fontWeight:"900"},
  link:{color:"#75E0B8",textAlign:"center",marginTop:17,fontWeight:"700"},
  message:{color:"#F2D99F",fontSize:12,lineHeight:18,marginTop:13},
  warning:{color:"#F2D99F",fontSize:12,marginTop:14}
});
