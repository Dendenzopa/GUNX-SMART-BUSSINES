import React, { createContext, useContext, useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View, Image } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "../lib/supabase";

const ShopContext = createContext<{ shopId: string | null }>({ shopId: null });
export function useShopContext() { return useContext(ShopContext); }

const AUTH_REDIRECT_URL = "gunxsmartbusiness://auth/callback";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [shopName, setShopName] = useState("");
  const [needsShop, setNeedsShop] = useState(false);
  const [shopId, setShopId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"login" | "signup" | "forgot" | "reset">("login");

  useEffect(() => {
    if (!supabaseConfigured || !supabase) { setLoading(false); return; }

    const handleAuthUrl = async (url: string | null) => {
      if (!url || !supabase) return;
      try {
        const parsed = new URL(url);
        const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ""));
        const query = parsed.searchParams;
        const accessToken = fragment.get("access_token") ?? query.get("access_token");
        const refreshToken = fragment.get("refresh_token") ?? query.get("refresh_token");
        const flowType = fragment.get("type") ?? query.get("type");
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (error) setMessage("Imeshindikana kuthibitisha link: " + error.message);
          else if (flowType === "recovery") {
            setMode("reset");
            setMessage("Weka password yako mpya.");
          } else {
            setMode("login");
            setMessage("Email imethibitishwa. Sasa unaweza kuingia.");
          }
        } else if (parsed.searchParams.get("error_description")) {
          setMessage(decodeURIComponent(parsed.searchParams.get("error_description") ?? "Link imeisha muda wake."));
        }
      } catch {
        setMessage("Link haijatambulika. Omba link mpya kisha ujaribu tena.");
      }
    };

    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) setMessage(error.message);
      setSession(data.session);
      setLoading(false);
    });

    void Linking.getInitialURL().then(handleAuthUrl);
    const urlSubscription = Linking.addEventListener("url", event => { void handleAuthUrl(event.url); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) { setNeedsShop(false); setShopId(null); }
    });
    return () => {
      urlSubscription.remove();
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session || !supabase) return;
    let active = true;
    supabase.from("shop_members").select("shop_id").eq("user_id", session.user.id).limit(1).maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setMessage("Imeshindikana kusoma duka: " + error.message);
        setNeedsShop(!data && !error);
        setShopId(data?.shop_id ?? null);
      });
    return () => { active = false; };
  }, [session]);

  async function authenticate() {
    if (!supabase) return;
    if (!email.trim() || password.length < 8) { setMessage("Weka email na password yenye angalau herufi 8."); return; }
    setBusy(true); setMessage("");
    const result = mode === "signup"
      ? await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: AUTH_REDIRECT_URL } })
      : await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (result.error) setMessage(result.error.message);
    else if (mode === "signup" && !result.data.session) setMessage("Akaunti imetengenezwa. Angalia Gmail kuthibitisha email. Usipopata ujumbe, bonyeza Tuma tena email.");
  }

  async function resendConfirmation() {
    if (!supabase || !email.trim()) { setMessage("Weka email uliyotumia kujisajili kwanza."); return; }
    setBusy(true); setMessage("");
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: AUTH_REDIRECT_URL }
    });
    setBusy(false);
    setMessage(error ? "Imeshindikana kutuma email: " + error.message : "Ombi limetumwa. Angalia Inbox na Spam/Junk ya Gmail.");
  }

  async function sendPasswordReset() {
    if (!supabase || !email.trim()) { setMessage("Weka email ya akaunti yako kwanza."); return; }
    setBusy(true); setMessage("");
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: AUTH_REDIRECT_URL });
    setBusy(false);
    setMessage(error ? "Imeshindikana kutuma link: " + error.message : "Ikiwa akaunti inatumia email hii, link ya kubadilisha password imetumwa. Angalia Inbox na Spam/Junk.");
  }

  async function saveNewPassword() {
    if (!supabase || newPassword.length < 8) { setMessage("Password mpya iwe na angalau herufi 8."); return; }
    setBusy(true); setMessage("");
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setBusy(false);
    if (error) setMessage("Password haikubadilishwa: " + error.message);
    else {
      setPassword("");
      setNewPassword("");
      setMode("login");
      await supabase.auth.signOut();
      setMessage("Password imebadilishwa. Sasa ingia kwa password yako mpya.");
    }
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
  if (!session || mode === "reset") return <SafeAreaView style={a.safe}><View style={a.card}><Image source={require("../../assets/GUNX20Smart20Business20Logo-1.jpg")} style={a.logoImage} resizeMode="contain"/><Text style={a.brand}>GUNX SMART BUSINESS</Text><Text style={a.title}>{mode === "signup" ? "Fungua akaunti" : mode === "forgot" ? "Sahau password?" : mode === "reset" ? "Weka password mpya" : "Karibu tena"}</Text>
    {mode !== "reset" && <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="Email" placeholderTextColor="#8194A5" style={a.input}/>}
    {mode === "login" || mode === "signup" ? <TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder="Password (angalau herufi 8)" placeholderTextColor="#8194A5" style={a.input}/> : null}
    {mode === "reset" && <TextInput value={newPassword} onChangeText={setNewPassword} secureTextEntry placeholder="Password mpya (angalau herufi 8)" placeholderTextColor="#8194A5" style={a.input}/>}
    <Pressable disabled={busy} onPress={mode === "signup" || mode === "login" ? authenticate : mode === "forgot" ? sendPasswordReset : saveNewPassword} style={a.button}><Text style={a.buttonText}>{busy ? "Subiri..." : mode === "signup" ? "Jisajili" : mode === "forgot" ? "Tuma link ya kubadilisha password" : mode === "reset" ? "Hifadhi password mpya" : "Ingia"}</Text></Pressable>
    {mode === "login" && <Pressable onPress={()=>{setMode("forgot");setMessage("");}}><Text style={a.link}>Forgot Password? / Nimesahau password</Text></Pressable>}
    {mode === "signup" && <Pressable disabled={busy} onPress={resendConfirmation}><Text style={a.link}>Tuma tena email ya uthibitisho</Text></Pressable>}
    {mode !== "login" && mode !== "reset" && <Pressable onPress={()=>{setMode("login");setMessage("");}}><Text style={a.link}>Rudi kwenye Login</Text></Pressable>}
    {mode === "login" && <Pressable onPress={()=>{setMode("signup");setMessage("");}}><Text style={a.link}>Huna akaunti? Jisajili</Text></Pressable>}
    {mode === "reset" && <Pressable onPress={()=>{setMode("login");setMessage("Omba link mpya kama link hii imeisha muda wake.");}}><Text style={a.link}>Rudi kwenye Login</Text></Pressable>}
    {!!message&&<Text style={a.message}>{message}</Text>}
  </View></SafeAreaView>;
  if (needsShop) return <SafeAreaView style={a.safe}><View style={a.card}><Text style={a.brand}>GUNX SMART BUSINESS</Text><Text style={a.title}>Unda duka lako</Text><Text style={a.copy}>Akaunti yako imeingia. Weka jina la biashara ili kuanzisha workspace.</Text><TextInput value={shopName} onChangeText={setShopName} placeholder="Jina la duka / biashara" placeholderTextColor="#8194A5" style={a.input}/><Pressable disabled={busy} onPress={createShop} style={a.button}><Text style={a.buttonText}>{busy ? "Inaunda..." : "Unda duka"}</Text></Pressable>{!!message&&<Text style={a.message}>{message}</Text>}<Pressable onPress={()=>supabase?.auth.signOut()}><Text style={a.link}>Toka kwenye akaunti</Text></Pressable></View></SafeAreaView>;
  return <ShopContext.Provider value={{ shopId }}>{children}</ShopContext.Provider>;
}

const a = StyleSheet.create({
  safe:{flex:1,backgroundColor:"#081522",justifyContent:"center",padding:20},
  card:{width:"100%",maxWidth:460,alignSelf:"center",backgroundColor:"#102438",borderColor:"#1D3A50",borderWidth:1,borderRadius:18,padding:22},
  logoImage:{width:190,height:126,alignSelf:"center",marginBottom:8},
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
