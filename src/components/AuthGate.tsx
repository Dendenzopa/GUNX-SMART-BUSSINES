import React, { createContext, useContext, useEffect, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View, Image } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "../lib/supabase";

type ShopRole = "owner" | "manager" | "cashier" | "stockkeeper";
const ShopContext = createContext<{ shopId: string | null; isPlatformAdmin: boolean; userId: string | null; shopRole: ShopRole | null }>({ shopId: null, isPlatformAdmin: false, userId: null, shopRole: null });
export function useShopContext() { return useContext(ShopContext); }

const AUTH_REDIRECT_URL = "gunxsmartbusiness://auth/callback";
const getAuthRedirectUrl = () => Platform.OS === "web" ? window.location.origin : AUTH_REDIRECT_URL;

function EmailIcon() {
  return <View style={a.emailIcon}><View style={a.emailFoldLeft}/><View style={a.emailFoldRight}/></View>;
}
function LockIcon() {
  return <View style={a.lockIconWrap}><View style={a.lockShackle}/><View style={a.lockBody}><View style={a.lockKeyhole}/></View></View>;
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [shopName, setShopName] = useState("");
  const [needsShop, setNeedsShop] = useState(false);
  const [shopId, setShopId] = useState<string | null>(null);
  const [shopRole, setShopRole] = useState<ShopRole | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [shopLoading, setShopLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<"login" | "signup" | "forgot" | "reset">("login");

  useEffect(() => {
    if (!supabaseConfigured || !supabase) { setLoading(false); return; }

    const handleAuthUrl = async (url: string | null) => {
      if (!url || !supabase) return;
      try {
        const parsed = new URL(url);
        const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ""));
        const query = parsed.searchParams;
        const authCode = query.get("code");
        if (authCode) {
          const { error } = await supabase.auth.exchangeCodeForSession(authCode);
          if (error) setMessage("Imeshindikana kuthibitisha link: " + error.message);
          else {
            if (Platform.OS === "web" && typeof window !== "undefined") {
              window.history.replaceState({}, document.title, window.location.pathname);
            }
            setMessage("Link imethibitishwa. Unaweza kuendelea.");
          }
          return;
        }
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

    if (Platform.OS === "web" && typeof window !== "undefined") {
      void handleAuthUrl(window.location.href);
    }

    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) setMessage(error.message);
      setSession(data.session);
      setLoading(false);
    });

    if (Platform.OS !== "web") void Linking.getInitialURL().then(handleAuthUrl);
    const urlSubscription = Linking.addEventListener("url", event => { void handleAuthUrl(event.url); });
    const { data: listener } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === "PASSWORD_RECOVERY") {
        setMode("reset");
        setMessage("Weka password yako mpya.");
      }
      if (!next) { setNeedsShop(false); setShopId(null); setShopRole(null); setIsPlatformAdmin(false); setShopLoading(false); }
    });
    return () => {
      urlSubscription.remove();
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    setIsPlatformAdmin(false);
    setShopRole(null);
    if (!session || !supabase) { setShopLoading(false); return; }
    let active = true;
    setShopLoading(true);
    Promise.all([
      supabase.rpc("is_platform_admin"),
      supabase.from("shop_members").select("shop_id,role").eq("user_id", session.user.id).limit(1).maybeSingle()
    ]).then(([adminResult, membershipResult]) => {
      if (!active) return;
      const admin = !adminResult.error && adminResult.data === true;
      if (membershipResult.error) setMessage("Imeshindikana kusoma duka: " + membershipResult.error.message);
      setIsPlatformAdmin(admin);
      setNeedsShop(!membershipResult.data && !membershipResult.error && !admin);
      setShopId(membershipResult.data?.shop_id ?? null);
      setShopRole((membershipResult.data?.role as ShopRole | undefined) ?? null);
      setShopLoading(false);
    }).catch((error: unknown) => {
      if (!active) return;
      setMessage(error instanceof Error ? error.message : "Imeshindikana kuthibitisha ruhusa za akaunti.");
      setShopLoading(false);
    });
    return () => { active = false; };
  }, [session]);

  async function authenticate() {
    if (!supabase) return;
    if (!email.trim() || password.length < 8) { setMessage("Weka email na password yenye angalau herufi 8."); return; }
    setBusy(true); setMessage("");
    const result = mode === "signup"
      ? await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: getAuthRedirectUrl() } })
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
      options: { emailRedirectTo: getAuthRedirectUrl() }
    });
    setBusy(false);
    setMessage(error ? "Imeshindikana kutuma email: " + error.message : "Ombi limetumwa. Angalia Inbox na Spam/Junk ya Gmail.");
  }

  async function sendPasswordReset() {
    if (!supabase || !email.trim()) { setMessage("Weka email ya akaunti yako kwanza."); return; }
    setBusy(true); setMessage("");
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: getAuthRedirectUrl() });
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

  async function signInWithGoogle() {
    if (!supabase) { setMessage("Huduma ya kuingia haijawekwa tayari."); return; }
    setBusy(true); setMessage("");
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: getAuthRedirectUrl(), skipBrowserRedirect: true }
    });
    setBusy(false);
    if (error) { setMessage("Imeshindikana kuanza Google login: " + error.message); return; }
    if (data.url) {
      try {
        if (Platform.OS === "web" && typeof window !== "undefined") window.location.assign(data.url);
        else await Linking.openURL(data.url);
      } catch { setMessage("Imeshindikana kufungua Google login. Jaribu tena."); }
    } else setMessage("Google login haijarudisha link. Hakikisha Google provider imewezeshwa Supabase.");
  }

  async function createShop() {
    if (!supabase || shopName.trim().length < 2) { setMessage("Jina la duka liwe na angalau herufi 2."); return; }
    setBusy(true); setMessage("");
    const { error } = await supabase.rpc("create_shop", { p_name: shopName.trim() });
    setBusy(false);
    if (error) setMessage("Duka halikuundwa: " + error.message);
    else { const { data } = await supabase.from("shop_members").select("shop_id,role").eq("user_id", (await supabase.auth.getUser()).data.user?.id).limit(1).maybeSingle(); setShopId(data?.shop_id ?? null); setShopRole((data?.role as ShopRole | undefined) ?? null); setNeedsShop(!data && !isPlatformAdmin); }
  }

  if (!supabaseConfigured) return <>{children}</>;
  if (loading) return <SafeAreaView style={a.safe}><ActivityIndicator color="#43C99A" size="large"/></SafeAreaView>;
  if (!session || mode === "reset") return <SafeAreaView style={a.safe}>
    <ScrollView contentContainerStyle={a.authScroll} keyboardShouldPersistTaps="handled">
    <View style={a.authContent}>
      <Image accessibilityLabel="GUNX SMART BUSINESS official logo" source={require("../../assets/GUNX20Smart20Business20Logo-1.jpg")} style={a.logoImage} resizeMode="contain"/>
      <Text style={a.title}>{mode === "signup" ? "Fungua akaunti" : mode === "forgot" ? "Umesahau password?" : mode === "reset" ? "Weka password mpya" : "Ingia kwenye akaunti yako"}</Text>
      {mode === "login" && <>
        <Pressable disabled={busy} onPress={signInWithGoogle} style={a.googleButton}>
          <Text style={a.googleG}>G</Text><Text style={a.googleText}>{busy ? "Subiri..." : "Endelea kwa Google (Gmail)"}</Text>
        </Pressable>
        <View style={a.orRow}><View style={a.orLine}/><Text style={a.orText}>AU</Text><View style={a.orLine}/></View>
      </>}
      {mode !== "reset" && <View style={a.inputWrap}>
        <EmailIcon/>
        <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="Email Address" placeholderTextColor="#65758B" style={a.input}/>
      </View>}
      {mode === "login" || mode === "signup" ? <View style={a.inputWrap}>
        <LockIcon/>
        <TextInput value={password} onChangeText={setPassword} secureTextEntry={!showPassword} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="Password (angalau herufi 8)" placeholderTextColor="#65758B" style={a.input}/>
        <Pressable onPress={()=>setShowPassword(v=>!v)} accessibilityLabel={showPassword ? "Ficha password" : "Onyesha password"} style={a.eyeButton}><Text style={a.eyeIcon}>{showPassword ? "◉" : "◎"}</Text></Pressable>
      </View> : null}
      {mode === "reset" && <View style={a.inputWrap}>
        <LockIcon/>
        <TextInput value={newPassword} onChangeText={setNewPassword} secureTextEntry={!showPassword} placeholder="Password mpya (angalau herufi 8)" placeholderTextColor="#65758B" style={a.input}/>
        <Pressable onPress={()=>setShowPassword(v=>!v)} accessibilityLabel={showPassword ? "Ficha password" : "Onyesha password"} style={a.eyeButton}><Text style={a.eyeIcon}>{showPassword ? "◉" : "◎"}</Text></Pressable>
      </View>}
      {mode === "login" && <Pressable onPress={()=>{setMode("forgot");setMessage("");}} style={a.forgotWrap}><Text style={a.forgotLink}>Umesahau password?</Text></Pressable>}
      <Pressable disabled={busy} onPress={mode === "signup" || mode === "login" ? authenticate : mode === "forgot" ? sendPasswordReset : saveNewPassword} style={a.button}><Text style={a.buttonText}>{busy ? "Subiri..." : mode === "signup" ? "JISAJILI" : mode === "forgot" ? "TUMA LINK YA PASSWORD" : mode === "reset" ? "HIFADHI PASSWORD MPYA" : "INGIA"}</Text></Pressable>
      {mode === "signup" && <Pressable disabled={busy} onPress={resendConfirmation}><Text style={a.link}>Tuma tena email ya uthibitisho</Text></Pressable>}
      {mode !== "login" && mode !== "reset" && <Pressable onPress={()=>{setMode("login");setMessage("");}}><Text style={a.link}>Rudi kwenye Login</Text></Pressable>}
      {mode === "login" && <Pressable onPress={()=>{setMode("signup");setMessage("");}} style={a.signupWrap}><Text style={a.signupText}>Huna akaunti? <Text style={a.signupLink}>Jisajili hapa</Text></Text></Pressable>}
      {mode === "reset" && <Pressable onPress={()=>{setMode("login");setMessage("Omba link mpya kama link hii imeisha muda wake.");}}><Text style={a.link}>Rudi kwenye Login</Text></Pressable>}
      {!!message&&<Text style={a.message}>{message}</Text>}
    </View>
    </ScrollView>
  </SafeAreaView>;
  if (session && shopLoading) return <SafeAreaView style={a.safe}><ActivityIndicator color="#43C99A" size="large"/><Text style={a.copy}>Inathibitisha ruhusa za akaunti...</Text></SafeAreaView>;
  if (needsShop) return <SafeAreaView style={a.safe}><View style={a.card}><Text style={a.brand}>GUNX SMART BUSINESS</Text><Text style={a.title}>Unda duka lako</Text><Text style={a.copy}>Akaunti yako imeingia. Weka jina la biashara ili kuanzisha workspace.</Text><TextInput value={shopName} onChangeText={setShopName} placeholder="Jina la duka / biashara" placeholderTextColor="#8194A5" style={a.input}/><Pressable disabled={busy} onPress={createShop} style={a.button}><Text style={a.buttonText}>{busy ? "Inaunda..." : "Unda duka"}</Text></Pressable>{!!message&&<Text style={a.message}>{message}</Text>}<Pressable onPress={()=>supabase?.auth.signOut()}><Text style={a.link}>Toka kwenye akaunti</Text></Pressable></View></SafeAreaView>;
  return <ShopContext.Provider value={{ shopId, isPlatformAdmin, userId: session.user.id, shopRole }}>{children}</ShopContext.Provider>;
}

const a = StyleSheet.create({
  safe:{flex:1,backgroundColor:"#FFFFFF",paddingHorizontal:22},
  authScroll:{flexGrow:1,justifyContent:"center",paddingVertical:24},
  authContent:{width:"100%",maxWidth:440,alignSelf:"center",backgroundColor:"#FFFFFF",paddingHorizontal:8,paddingVertical:12},
  logoImage:{width:270,height:150,alignSelf:"center",marginTop:0,marginBottom:8},
  title:{color:"#102B63",fontWeight:"900",fontSize:25,textAlign:"center",marginTop:4,marginBottom:24,letterSpacing:-.35},
  inputWrap:{minHeight:56,flexDirection:"row",alignItems:"center",borderWidth:1.2,borderColor:"#AEBED8",borderRadius:13,backgroundColor:"#FFFFFF",marginTop:13,paddingHorizontal:14},
  emailIcon:{width:22,height:17,borderWidth:1.8,borderColor:"#102B63",borderRadius:3,marginHorizontal:4,marginRight:8,position:"relative",overflow:"hidden"},
  emailFoldLeft:{position:"absolute",width:13,height:13,borderLeftWidth:1.6,borderBottomWidth:1.6,borderColor:"#102B63",left:1,top:-7,transform:[{rotate:"-45deg"}]},
  emailFoldRight:{position:"absolute",width:13,height:13,borderRightWidth:1.6,borderBottomWidth:1.6,borderColor:"#102B63",right:1,top:-7,transform:[{rotate:"45deg"}]},
  lockIconWrap:{width:24,height:25,marginHorizontal:3,marginRight:7,alignItems:"center",justifyContent:"flex-end"},
  lockShackle:{position:"absolute",top:0,width:14,height:13,borderWidth:1.8,borderColor:"#102B63",borderTopLeftRadius:8,borderTopRightRadius:8,borderBottomWidth:0},
  lockBody:{width:20,height:14,borderRadius:3,backgroundColor:"#102B63",alignItems:"center",justifyContent:"center"},
  lockKeyhole:{width:3,height:6,borderRadius:2,backgroundColor:"#FFFFFF"},
  input:{flex:1,minWidth:0,color:"#14264A",paddingVertical:14,paddingHorizontal:8,fontSize:15},
  eyeButton:{padding:8,marginLeft:2},
  eyeIcon:{color:"#50627F",fontSize:22,fontWeight:"700"},
  googleButton:{minHeight:56,flexDirection:"row",alignItems:"center",justifyContent:"center",borderWidth:1.2,borderColor:"#AEBED8",borderRadius:13,backgroundColor:"#FFFFFF",paddingHorizontal:14},
  googleG:{fontSize:25,fontWeight:"900",color:"#4285F4",marginRight:14},
  googleText:{fontSize:16,color:"#14264A",fontWeight:"800"},
  orRow:{flexDirection:"row",alignItems:"center",gap:12,marginTop:16,marginBottom:2},
  orLine:{height:1,flex:1,backgroundColor:"#AAB9D4"},
  orText:{fontSize:13,color:"#14264A",fontWeight:"800"},
  forgotWrap:{alignItems:"flex-end",marginTop:14},
  forgotLink:{color:"#0645D8",fontWeight:"700",fontSize:14},
  button:{backgroundColor:"#079B45",paddingVertical:17,borderRadius:13,alignItems:"center",marginTop:20,elevation:2,shadowColor:"#079B45",shadowOpacity:.16,shadowRadius:7,shadowOffset:{width:0,height:3}},
  buttonText:{color:"#FFFFFF",fontWeight:"900",fontSize:17,letterSpacing:.4},
  link:{color:"#0645D8",textAlign:"center",marginTop:17,fontWeight:"700"},
  signupWrap:{alignItems:"center",marginTop:18},
  signupText:{color:"#14264A",fontSize:14},
  signupLink:{color:"#0645D8",fontWeight:"900"},
  message:{color:"#8A5B00",fontSize:12,lineHeight:18,marginTop:14,textAlign:"center"},
  copy:{color:"#53647A",fontSize:13,lineHeight:20,marginBottom:12},
  warning:{color:"#8A5B00",fontSize:12,marginTop:14},
  card:{width:"100%",maxWidth:460,alignSelf:"center",backgroundColor:"#FFFFFF",borderColor:"#D9E2F1",borderWidth:1,borderRadius:18,padding:22},
  brand:{color:"#102B63",fontWeight:"900",letterSpacing:1.3,fontSize:12}
});
