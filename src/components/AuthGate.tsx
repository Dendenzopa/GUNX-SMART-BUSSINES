import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ActivityIndicator, AppState, Linking, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View, Image } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { GUNX_OFFICIAL_LOGO } from "../branding";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { registerAppInstallation, recordSignedInActivity } from "../services/appAnalytics";

type ShopRole = "owner" | "manager" | "cashier" | "stockkeeper";
const ShopContext = createContext<{ shopId: string | null; isPlatformAdmin: boolean; userId: string | null; shopRole: ShopRole | null; darkMode: boolean; toggleTheme: () => void; signOut: () => Promise<void> }>({ shopId: null, isPlatformAdmin: false, userId: null, shopRole: null, darkMode: true, toggleTheme: () => {}, signOut: async () => {} });
export function useShopContext() { return useContext(ShopContext); }

const AUTH_REDIRECT_URL = "gunxsmartbusiness://auth/callback";
const WEB_AUTH_REDIRECT_URL = "https://gunx-smart-bussines.vercel.app";
const getAuthRedirectUrl = () => Platform.OS === "web"
  ? (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") ? window.location.origin : WEB_AUTH_REDIRECT_URL)
  : AUTH_REDIRECT_URL;

function EmailIcon() {
  return <View style={a.emailIcon}><View style={a.emailFoldLeft}/><View style={a.emailFoldRight}/></View>;
}
function LockIcon() {
  return <View style={a.lockIconWrap}><View style={a.lockShackle}/><View style={a.lockBody}><View style={a.lockKeyhole}/></View></View>;
}

function ThemeToggle({ darkMode, onPress }: { darkMode: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={darkMode ? "Washa Light Mode" : "Washa Dark Mode"} onPress={onPress} style={[a.themeToggle, darkMode && { backgroundColor: "#173D36", borderColor: "#43C99A" }]}>
    <Text style={[a.themeToggleText, darkMode && { color: "#75E0B8" }]}>{darkMode ? "☀ Light Mode" : "☾ Dark Mode"}</Text>
  </Pressable>;
}

function normalizeEmployeePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("255") && digits.length === 12) return "+" + digits;
  if (digits.startsWith("0") && digits.length === 10) return "+255" + digits.slice(1);
  if (/^[67]\d{8}$/.test(digits)) return "+255" + digits;
  return null;
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [darkMode, setDarkMode] = useState(true);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneOtp, setPhoneOtp] = useState("");
  const [phoneOtpPending, setPhoneOtpPending] = useState(false);
  const [phoneOtpLogin, setPhoneOtpLogin] = useState(false);
  const [phoneLogin, setPhoneLogin] = useState(false);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [shopName, setShopName] = useState("");
  const [onboardingStep, setOnboardingStep] = useState<"business" | "photo">("business");
  const [businessImageUri, setBusinessImageUri] = useState<string | null>(null);
  const [ownerDisplayName, setOwnerDisplayName] = useState("Mmiliki wa Biashara");
  const [needsShop, setNeedsShop] = useState(false);
  const [shopId, setShopId] = useState<string | null>(null);
  const [shopRole, setShopRole] = useState<ShopRole | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [shopLoading, setShopLoading] = useState(false);
  const [membershipCheckError, setMembershipCheckError] = useState<string | null>(null);
  const [membershipCheckAttempt, setMembershipCheckAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<"login" | "signup" | "forgot" | "reset">("login");

  useEffect(() => {
    let active = true;
    const userId = session?.user.id;
    const userKey = userId ? "@gunx-theme-mode:" + userId : "@gunx-auth-theme-mode";
    void Promise.all([
      AsyncStorage.getItem(userKey),
      AsyncStorage.getItem("@gunx-auth-theme-mode")
    ]).then(([saved, fallback]) => {
      if (!active) return;
      const preference = saved ?? fallback;
      setDarkMode(preference !== "light");
    }).catch(() => {
      if (active) setDarkMode(true);
    });
    return () => { active = false; };
  }, [session?.user.id]);

  const toggleTheme = () => {
    setDarkMode(current => {
      const next = !current;
      const value = next ? "dark" : "light";
      void AsyncStorage.setItem("@gunx-auth-theme-mode", value).catch(() => {});
      if (session?.user.id) {
        void AsyncStorage.setItem("@gunx-theme-mode:" + session.user.id, value).catch(() => {});
      }
      return next;
    });
  };

  useEffect(() => {
    if (!supabaseConfigured || !supabase) { setLoading(false); return; }

    const handleAuthUrl = async (url: string | null) => {
      if (!url || !supabase) return;
      try {
        const parsed = new URL(url);
        const invitation = parsed.searchParams.get("invite");
        if (invitation && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(invitation)) {
          setInviteToken(invitation);
          setPhoneLogin(true);
          setMode("signup");
          setMessage("Umealikwa kujiunga na biashara. Tumia namba ile ile iliyopokea mwaliko.");
        }
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
    if (!session) return;
    const refreshAnalytics = () => {
      void registerAppInstallation();
      void recordSignedInActivity();
    };
    refreshAnalytics();
    const subscription = AppState.addEventListener("change", state => {
      if (state === "active") refreshAnalytics();
    });
    return () => subscription.remove();
  }, [session?.user.id]);

  useEffect(() => {
    setIsPlatformAdmin(false);
    setShopRole(null);
    if (!session || !supabase) { setShopLoading(false); setMembershipCheckError(null); return; }
    if (inviteToken) { setShopLoading(false); setMembershipCheckError(null); return; }
    let active = true;
    setShopLoading(true);
    setMembershipCheckError(null);
    Promise.all([
      supabase.rpc("is_platform_admin"),
      supabase.from("shop_members").select("shop_id,role").eq("user_id", session.user.id).limit(2)
    ]).then(([adminResult, membershipResult]) => {
      if (!active) return;
      if (adminResult.error || membershipResult.error) {
        const reason = adminResult.error?.message ?? membershipResult.error?.message ?? "Taarifa za ruhusa hazijapatikana.";
        setMembershipCheckError("Imeshindikana kuthibitisha role na biashara ya akaunti hii: " + reason);
        setShopLoading(false);
        return;
      }
      const admin = adminResult.data === true;
      const memberships = membershipResult.data ?? [];
      if (!admin && memberships.length > 1) {
        setMembershipCheckError("Akaunti hii imeunganishwa na biashara zaidi ya moja. Kwa usalama, hatutachagua biashara kiholela. Wasiliana na msimamizi ili uchague biashara sahihi.");
        setShopLoading(false);
        return;
      }
      const membership = memberships[0] ?? null;
      const validRoles: ShopRole[] = ["owner", "manager", "cashier", "stockkeeper"];
      if (!admin && membership && !validRoles.includes(membership.role as ShopRole)) {
        setMembershipCheckError("Jukumu la akaunti hii halitambuliki. Dashboard imefungwa hadi role sahihi ithibitishwe.");
        setShopLoading(false);
        return;
      }
      setIsPlatformAdmin(admin);
      const hasMembership = Boolean(membership);
      setNeedsShop(!hasMembership && !admin);
      setMembershipCheckError(null);
      const metadata = session.user.user_metadata ?? {};
      const googleIdentity = session.user.identities?.find((item: any) => item.provider === "google")?.identity_data ?? {};
      const displayName = googleIdentity.name ?? googleIdentity.full_name ?? metadata.full_name ?? metadata.name ?? metadata.display_name ?? session.user.email ?? "Mmiliki wa Biashara";
      setOwnerDisplayName(typeof displayName === "string" && displayName.trim() ? displayName.trim() : "Mmiliki wa Biashara");
      // Platform admins must never inherit a tenant context, even if a stale shop_members row exists.
      setShopId(admin ? null : (membership?.shop_id ?? null));
      setShopRole(admin ? null : ((membership?.role as ShopRole | undefined) ?? null));
      setShopLoading(false);
    }).catch((error: unknown) => {
      if (!active) return;
      setMessage(error instanceof Error ? error.message : "Imeshindikana kuthibitisha ruhusa za akaunti.");
      setShopLoading(false);
    });
    return () => { active = false; };
  }, [session, membershipCheckAttempt, inviteToken]);

  useEffect(() => {
    if (!session || !inviteToken || !supabase) return;
    let active = true;
    setShopLoading(true);
    supabase.rpc("accept_shop_invitation", { p_token: inviteToken }).then(({ data, error }) => {
      if (!active) return;
      setShopLoading(false);
      if (error) {
        setMessage("Mwaliko haujakubaliwa: " + error.message + ". Hakikisha umeingia kwa namba ile ile iliyopokea mwaliko.");
        return;
      }
      setInviteToken(null);
      setPhoneOtpPending(false);
      setMembershipCheckAttempt(value => value + 1);
      setMessage("Umejiunga na biashara kikamilifu. Karibu GUNX SMART BUSINESS.");
    });
    return () => { active = false; };
  }, [session?.user.id, inviteToken]);

  async function signOut() {
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.auth.signOut();
    setBusy(false);
    if (error) setMessage("Imeshindikana kutoka kwenye akaunti: " + error.message);
  }

  async function authenticate() {
    if (!supabase) return;
    if (phoneLogin) {
      const normalizedPhone = normalizeEmployeePhone(phone);
      if (!normalizedPhone || password.length < 8) {
        setMessage("Weka namba sahihi ya Tanzania na password yenye angalau herufi 8.");
        return;
      }
      if (mode === "signup" && !inviteToken) {
        setMessage("Usajili wa mfanyakazi unahitaji link halali ya mwaliko kutoka kwa mmiliki wa biashara.");
        return;
      }
      setBusy(true); setMessage("");
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          phone: normalizedPhone,
          password,
          options: { data: { account_type: "employee" } }
        });
        setBusy(false);
        if (error) setMessage("Usajili wa simu umeshindikana: " + error.message);
        else if (data.session) setMessage("Akaunti imetengenezwa. Inakubali mwaliko...");
        else { setPhoneOtpPending(true); setMessage("Tumetuma code ya uthibitisho kwa SMS. Ingiza code ili kukamilisha usajili."); }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ phone: normalizedPhone, password });
        setBusy(false);
        if (error) setMessage("Kuingia kwa simu kumeshindikana: " + error.message);
      }
      return;
    }
    if (!email.trim() || password.length < 8) { setMessage("Weka email na password yenye angalau herufi 8."); return; }
    setBusy(true); setMessage("");
    const result = mode === "signup"
      ? await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: getAuthRedirectUrl() } })
      : await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (result.error) setMessage(result.error.message);
    else if (mode === "signup" && !result.data.session) setMessage("Akaunti imetengenezwa. Angalia Gmail kuthibitisha email. Usipopata ujumbe, bonyeza Tuma tena email.");
  }

  async function requestPhoneLoginOtp() {
    if (!supabase) return;
    const normalizedPhone = normalizeEmployeePhone(phone);
    if (!normalizedPhone) { setMessage("Weka namba sahihi ya simu iliyosajiliwa."); return; }
    setBusy(true); setMessage("");
    const { error } = await supabase.auth.signInWithOtp({
      phone: normalizedPhone,
      options: { shouldCreateUser: false }
    });
    setBusy(false);
    if (error) setMessage("Imeshindikana kutuma OTP. Hakikisha namba hii tayari imesajiliwa na kuthibitishwa: " + error.message);
    else {
      setPhoneOtpLogin(true);
      setPhoneOtpPending(true);
      setPhoneOtp("");
      setMessage("Tumetuma OTP kwa SMS. Ingiza code ili kuingia kwenye akaunti yako iliyopo. Hatutafungua akaunti mpya.");
    }
  }

  async function verifyPhoneOtp() {
    if (!supabase) return;
    const normalizedPhone = normalizeEmployeePhone(phone);
    if (!normalizedPhone || phoneOtp.trim().length < 4) { setMessage("Weka namba na code sahihi ya SMS."); return; }
    setBusy(true); setMessage("");
    const { error } = await supabase.auth.verifyOtp({ phone: normalizedPhone, token: phoneOtp.trim(), type: "sms" });
    setBusy(false);
    if (error) setMessage("Code haijathibitishwa: " + error.message);
    else {
      setPhoneOtpPending(false);
      setPhoneOtpLogin(false);
      setMessage(inviteToken ? "Namba imethibitishwa. Inakubali mwaliko wa biashara..." : "Umeingia kwa uthibitisho wa SMS. Inathibitisha biashara na ruhusa zako...");
    }
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

  async function createShopAndContinue(skipName = false) {
    if (!supabase) return;
    const name = shopName.trim() || (skipName ? "Biashara Yangu" : "");
    if (name.length < 2) { setMessage("Tafadhali andika jina la biashara yako."); return; }
    if (name.length > 120) { setMessage("Jina la biashara lisizidi herufi 120."); return; }
    setBusy(true); setMessage("");
    const { data: createdShopId, error } = await supabase.rpc("create_shop", { p_name: name });
    if (error) { setBusy(false); setMessage("Biashara haikuundwa: " + error.message); return; }
    const { data, error: membershipError } = await supabase.from("shop_members").select("shop_id,role").eq("user_id", session?.user.id).eq("shop_id", createdShopId).maybeSingle();
    setBusy(false);
    if (membershipError || !createdShopId || !data || data.role !== "owner") { setMessage("Biashara imeundwa lakini jukumu la mmiliki halikuweza kuthibitishwa. Wasiliana na msaada kabla ya kuendelea."); return; }
    setShopId(createdShopId);
    setShopRole("owner");
    setOnboardingStep("photo");
    setMessage("Taarifa za biashara zimehifadhiwa. Sasa unaweza kuweka picha au logo.");
  }

  async function uploadBusinessImage() {
    if (!supabase || !shopId || !session) return;
    setBusy(true); setMessage("");
    try {
      let uri = businessImageUri;
      if (!uri) {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) { setMessage("Ruhusu GUNX kufungua picha kwenye simu yako."); setBusy(false); return; }
        const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.82 });
        if (picked.canceled || !picked.assets?.[0]?.uri) { setBusy(false); return; }
        uri = picked.assets[0].uri;
        setBusinessImageUri(uri);
      }
      const response = await fetch(uri);
      const blob = await response.blob();
      const extension = (uri.split(".").pop()?.split("?")[0] || "jpg").toLowerCase();
      const contentType = blob.type || (extension === "png" ? "image/png" : "image/jpeg");
      const path = shopId + "/business_logo-" + Date.now() + "." + (extension === "png" ? "png" : "jpg");
      const { error: uploadError } = await supabase.storage.from("shop-branding").upload(path, blob, { contentType, upsert: true, cacheControl: "3600" });
      if (uploadError) throw uploadError;
      const { data: publicUrl } = supabase.storage.from("shop-branding").getPublicUrl(path);
      const { error: updateError } = await supabase.from("shops").update({ hero_media_type: "business_logo", hero_media_url: publicUrl.publicUrl }).eq("id", shopId);
      if (updateError) throw updateError;
      setNeedsShop(false);
      setMessage("Logo/picha ya biashara imehifadhiwa.");
    } catch (error) {
      setMessage("Picha haikuhifadhiwa: " + (error instanceof Error ? error.message : "Jaribu tena."));
    } finally { setBusy(false); }
  }

  function skipBusinessPhoto() {
    setNeedsShop(false);
    setMessage("");
  }

  if (!supabaseConfigured) return <ShopContext.Provider value={{ shopId: null, isPlatformAdmin: false, userId: null, shopRole: null, darkMode, toggleTheme, signOut }}>{children}</ShopContext.Provider>;
  if (loading) return <SafeAreaView style={[a.safe, darkMode && { backgroundColor: "#081522" }]}><ActivityIndicator color="#43C99A" size="large"/></SafeAreaView>;
  if (!session || mode === "reset") return <SafeAreaView style={[a.safe, darkMode && { backgroundColor: "#081522" }]}>
    <ScrollView contentContainerStyle={a.authScroll} keyboardShouldPersistTaps="handled">
    <View style={a.authContent}>
      <ThemeToggle darkMode={darkMode} onPress={toggleTheme}/>
      <Image accessibilityLabel="GUNX SMART BUSINESS official logo" source={GUNX_OFFICIAL_LOGO} style={a.logoImage} resizeMode="contain"/>
      <Text style={[a.title, darkMode && { color: "#F4F7FA" }]}>{mode === "signup" ? "Fungua akaunti" : mode === "forgot" ? "Umesahau password?" : mode === "reset" ? "Weka password mpya" : "Ingia kwenye akaunti yako"}</Text>
      {mode === "login" && !phoneLogin && !inviteToken && <>
        <Pressable disabled={busy} onPress={signInWithGoogle} style={a.googleButton}>
          <Text style={a.googleG}>G</Text><Text style={a.googleText}>{busy ? "Subiri..." : "Endelea kwa Google (Gmail)"}</Text>
        </Pressable>
        <View style={a.orRow}><View style={a.orLine}/><Text style={a.orText}>AU</Text><View style={a.orLine}/></View>
      </>}
      {inviteToken && <Text style={[a.copy, darkMode && { color: "#C1CED8" }]}>Mwaliko wa mfanyakazi umepatikana. Tumia namba ya simu iliyowekwa na mmiliki wa biashara.</Text>}
      {mode !== "reset" && (phoneLogin ? <View style={a.inputWrap}>
        <Text style={{color:"#102B63",fontSize:20,marginHorizontal:4}}>☎</Text>
        <TextInput value={phone} onChangeText={setPhone} autoCapitalize="none" keyboardType="phone-pad" autoComplete="tel" placeholder="07XXXXXXXX au +2557XXXXXXXX" placeholderTextColor="#65758B" style={a.input}/>
      </View> : <View style={a.inputWrap}>
        <EmailIcon/>
        <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="Email Address" placeholderTextColor="#65758B" style={a.input}/>
      </View>)}
      {(mode === "login" || mode === "signup") && !(phoneOtpPending && phoneOtpLogin) ? <View style={a.inputWrap}>
        <LockIcon/>
        <TextInput value={password} onChangeText={setPassword} secureTextEntry={!showPassword} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="Password (angalau herufi 8)" placeholderTextColor="#65758B" style={a.input}/>
        <Pressable onPress={()=>setShowPassword(v=>!v)} accessibilityLabel={showPassword ? "Ficha password" : "Onyesha password"} style={a.eyeButton}><Text style={a.eyeIcon}>{showPassword ? "◉" : "◎"}</Text></Pressable>
      </View> : null}
      {phoneOtpPending && <View style={a.inputWrap}>
        <Text style={{color:"#102B63",fontSize:14,fontWeight:"900",marginHorizontal:4}}>SMS</Text>
        <TextInput value={phoneOtp} onChangeText={setPhoneOtp} keyboardType="number-pad" placeholder="Code ya SMS" placeholderTextColor="#65758B" style={a.input}/>
      </View>}
      {mode === "reset" && <View style={a.inputWrap}>
        <LockIcon/>
        <TextInput value={newPassword} onChangeText={setNewPassword} secureTextEntry={!showPassword} placeholder="Password mpya (angalau herufi 8)" placeholderTextColor="#65758B" style={a.input}/>
        <Pressable onPress={()=>setShowPassword(v=>!v)} accessibilityLabel={showPassword ? "Ficha password" : "Onyesha password"} style={a.eyeButton}><Text style={a.eyeIcon}>{showPassword ? "◉" : "◎"}</Text></Pressable>
      </View>}
      {mode === "login" && !phoneLogin && <Pressable onPress={()=>{setMode("forgot");setMessage("");}} style={a.forgotWrap}><Text style={a.forgotLink}>Umesahau password?</Text></Pressable>}
      <Pressable disabled={busy} onPress={phoneOtpPending ? verifyPhoneOtp : mode === "signup" || mode === "login" ? authenticate : mode === "forgot" ? sendPasswordReset : saveNewPassword} style={a.button}><Text style={a.buttonText}>{busy ? "Subiri..." : phoneOtpPending ? "THIBITISHA SMS" : phoneLogin && mode === "signup" ? "JISAJILI KWA SIMU" : phoneLogin ? "INGIA KWA SIMU" : mode === "signup" ? "JISAJILI" : mode === "forgot" ? "TUMA LINK YA PASSWORD" : mode === "reset" ? "HIFADHI PASSWORD MPYA" : "INGIA"}</Text></Pressable>
      {mode === "signup" && !phoneLogin && <Pressable disabled={busy} onPress={resendConfirmation}><Text style={[a.link, darkMode && { color: "#75E0B8" }]}>Tuma tena email ya uthibitisho</Text></Pressable>}
      {mode === "login" && !inviteToken && <Pressable onPress={()=>{setPhoneLogin(value=>!value);setPhoneOtpPending(false);setPhoneOtpLogin(false);setMessage("");}}><Text style={[a.link, darkMode && { color: "#75E0B8" }]}>{phoneLogin ? "Ingia kwa Email" : "Ingia kwa namba ya simu"}</Text></Pressable>}
      {mode === "login" && phoneLogin && !phoneOtpPending && <Pressable disabled={busy} onPress={()=>void requestPhoneLoginOtp()}><Text style={[a.link, darkMode && { color: "#75E0B8" }]}>{busy ? "Inatuma OTP..." : "Ingia kwa OTP ya SMS (simu mpya)"}</Text></Pressable>}
      {phoneOtpPending && phoneOtpLogin && <Pressable onPress={()=>{setPhoneOtpPending(false);setPhoneOtpLogin(false);setPhoneOtp("");setMessage("");}}><Text style={[a.link, darkMode && { color: "#75E0B8" }]}>Rudi kutumia password</Text></Pressable>}
      {mode !== "login" && mode !== "reset" && <Pressable onPress={()=>{setMode("login");setMessage("");}}><Text style={[a.link, darkMode && { color: "#75E0B8" }]}>Rudi kwenye Login</Text></Pressable>}
      {mode === "login" && <Pressable onPress={()=>{setMode("signup");if(!inviteToken)setPhoneLogin(false);setMessage("");}} style={a.signupWrap}><Text style={[a.signupText, darkMode && { color: "#C1CED8" }]}>Huna akaunti? <Text style={[a.signupLink, darkMode && { color: "#75E0B8" }]}>Jisajili hapa</Text></Text></Pressable>}
      {mode === "reset" && <Pressable onPress={()=>{setMode("login");setMessage("Omba link mpya kama link hii imeisha muda wake.");}}><Text style={[a.link, darkMode && { color: "#75E0B8" }]}>Rudi kwenye Login</Text></Pressable>}
      {!!message&&<Text style={[a.message, darkMode && { color: "#F2D99F" }]}>{message}</Text>}
    </View>
    </ScrollView>
  </SafeAreaView>;
  if (session && inviteToken && !shopLoading) return <SafeAreaView style={[a.safe, darkMode && { backgroundColor: "#081522" }]}><View style={a.authContent}><ThemeToggle darkMode={darkMode} onPress={toggleTheme}/><Text style={[a.title, darkMode && { color: "#F4F7FA" }]}>Thibitisha akaunti ya mfanyakazi</Text><Text style={[a.message, darkMode && { color: "#F2D99F" }]}>{message || "Mwaliko huu unahitaji akaunti ya simu inayolingana na namba iliyoalikwa."}</Text><Text style={[a.copy, darkMode && { color: "#C1CED8" }]}>Ikiwa umeingia kwa akaunti nyingine, toka kisha ingia kwa namba ya mfanyakazi iliyopokea mwaliko.</Text><Pressable disabled={busy} onPress={signOut} style={a.button}><Text style={a.buttonText}>TOKA NA BADILISHA AKAUNTI</Text></Pressable></View></SafeAreaView>;
  if (session && shopLoading) return <SafeAreaView style={[a.safe, darkMode && { backgroundColor: "#081522" }]}><ThemeToggle darkMode={darkMode} onPress={toggleTheme}/><ActivityIndicator color="#43C99A" size="large"/><Text style={[a.copy, darkMode && { color: "#C1CED8" }]}>Inathibitisha ruhusa za akaunti...</Text></SafeAreaView>;
  if (session && membershipCheckError) return <SafeAreaView style={[a.safe, darkMode && { backgroundColor: "#081522" }]}><View style={a.authContent}><ThemeToggle darkMode={darkMode} onPress={toggleTheme}/><Text style={[a.title, darkMode && { color: "#F4F7FA" }]}>Imeshindikana kuthibitisha akaunti</Text><Text style={[a.message, darkMode && { color: "#F2D99F" }]}>{membershipCheckError}</Text><Text style={[a.copy, darkMode && { color: "#C1CED8" }]}>Kwa usalama, dashboard haijafunguliwa kwa sababu role ya akaunti haijathibitishwa. Jaribu tena ukiwa na intaneti.</Text><Pressable onPress={()=>{setShopLoading(true);setMembershipCheckAttempt(v=>v+1);}} style={a.button}><Text style={a.buttonText}>JARIBU TENA</Text></Pressable><Pressable disabled={busy} onPress={signOut}><Text style={[a.link, darkMode && { color: "#75E0B8" }]}>Toka kwenye akaunti</Text></Pressable></View></SafeAreaView>;
  if (needsShop) return <SafeAreaView style={[a.onboardingSafe, darkMode && { backgroundColor: "#081522" }]}>
    <ScrollView contentContainerStyle={[a.onboardingScroll, darkMode && { backgroundColor: "#081522" }]} keyboardShouldPersistTaps="handled">
      <View style={a.onboardingTop}>
        
      </View>
      <View style={a.onboardingContent}>
        <ThemeToggle darkMode={darkMode} onPress={toggleTheme}/>
        <Text style={[a.welcome, darkMode && { color: "#F4F7FA" }]}>Karibu {ownerDisplayName}, Ahsante kwa kuchagua GUNX SMART BUSINESS</Text>
        <Text style={[a.tagline, darkMode && { color: "#C1CED8" }]}>Think Big, Build Smart, Grow beyond</Text>
        {onboardingStep === "business" ? <>
          <Text style={[a.prompt, darkMode && { color: "#F4F7FA" }]}>Tafadhali Andika Jina la Kampuni yako au Biashara yako</Text>
          <TextInput value={shopName} onChangeText={setShopName} placeholder="Jina la Kampuni / Biashara" placeholderTextColor="#8291A8" style={a.onboardingInput} maxLength={120}/>
          <Pressable disabled={busy} onPress={()=>void createShopAndContinue(false)} style={a.onboardingButton}><Text style={a.onboardingButtonText}>{busy ? "Inahifadhi..." : "Create"}</Text></Pressable>
          <Pressable disabled={busy} onPress={()=>void createShopAndContinue(true)} style={a.skipButton}><Text style={[a.skipText, darkMode && { color: "#75E0B8" }]}>Skip</Text></Pressable>
        </> : <>
          <Text style={[a.prompt, darkMode && { color: "#F4F7FA" }]}>Pakia Picha ya Biashara yako, Logo au Icon</Text>
          <Pressable disabled={busy} onPress={()=>void uploadBusinessImage()} style={a.uploadArea}>
            {businessImageUri ? <Image source={{uri:businessImageUri}} style={a.previewImage} resizeMode="cover"/> : <><Text style={a.uploadIcon}>＋</Text><Text style={[a.uploadHint, darkMode && { color: "#C1CED8" }]}>Chagua picha, logo au icon kutoka kwenye simu</Text></>}
          </Pressable>
          <Pressable disabled={busy} onPress={()=>void uploadBusinessImage()} style={a.onboardingButton}><Text style={a.onboardingButtonText}>{busy ? "Inapakia..." : "Create"}</Text></Pressable>
          <Pressable disabled={busy} onPress={skipBusinessPhoto} style={a.skipButton}><Text style={[a.skipText, darkMode && { color: "#75E0B8" }]}>Skip</Text></Pressable>
        </>}
        {!!message&&<Text style={[a.onboardingMessage, darkMode && { color: "#F2D99F" }]}>{message}</Text>}
        <Pressable disabled={busy} onPress={signOut}><Text style={[a.link, darkMode && { color: "#75E0B8" }]}>Toka kwenye akaunti</Text></Pressable>
      </View>
    </ScrollView>
  </SafeAreaView>;
  return <ShopContext.Provider value={{ shopId, isPlatformAdmin, userId: session.user.id, shopRole, darkMode, toggleTheme, signOut }}>{children}</ShopContext.Provider>;
}

const a = StyleSheet.create({
  safe:{flex:1,backgroundColor:"#FFFFFF",paddingHorizontal:22},
  themeToggle:{alignSelf:"flex-end",paddingHorizontal:12,paddingVertical:8,borderRadius:9,borderWidth:1,borderColor:"#CBD5E1",backgroundColor:"#F1F5F9",marginBottom:10},
  themeToggleText:{color:"#142D42",fontSize:11,fontWeight:"900"},
  onboardingSafe:{flex:1,backgroundColor:"#FFFFFF"},
  onboardingScroll:{flexGrow:1,paddingBottom:30,backgroundColor:"#FFFFFF"},
  onboardingTop:{width:"100%",alignItems:"center",justifyContent:"center",paddingTop:18,paddingBottom:4},
  onboardingLogo:{width:400,height:250,alignSelf:"center"},
  onboardingContent:{width:"100%",maxWidth:480,alignSelf:"center",paddingHorizontal:22,paddingTop:27},
  welcome:{color:"#0B1F4A",fontSize:22,lineHeight:31,fontWeight:"900",textAlign:"center"},
  tagline:{color:"#0B1F4A",fontSize:14,fontWeight:"800",letterSpacing:.4,textAlign:"center",marginTop:11,marginBottom:27},
  prompt:{color:"#102B63",fontSize:16,lineHeight:24,fontWeight:"800",marginBottom:12},
  onboardingInput:{minHeight:56,borderWidth:1.4,borderColor:"#B7C5D9",borderRadius:13,backgroundColor:"#FFFFFF",paddingHorizontal:15,color:"#14264A",fontSize:15},
  onboardingButton:{minHeight:54,backgroundColor:"#079B45",borderRadius:13,alignItems:"center",justifyContent:"center",marginTop:17,elevation:2},
  onboardingButtonText:{color:"#FFFFFF",fontSize:17,fontWeight:"900",letterSpacing:.5},
  skipButton:{alignItems:"center",justifyContent:"center",paddingVertical:15},
  skipText:{color:"#155EEF",fontSize:15,fontWeight:"800"},
  uploadArea:{minHeight:165,borderWidth:1.5,borderColor:"#AAB9D4",borderStyle:"dashed",borderRadius:16,backgroundColor:"#FFFFFF",alignItems:"center",justifyContent:"center",padding:14},
  uploadIcon:{color:"#079B45",fontSize:42,fontWeight:"400"},
  uploadHint:{color:"#64748B",fontSize:13,textAlign:"center",marginTop:8},
  previewImage:{width:132,height:132,borderRadius:14},
  onboardingMessage:{color:"#8A5B00",fontSize:12,lineHeight:18,marginTop:14,textAlign:"center"},
  authScroll:{flexGrow:1,justifyContent:"flex-start",paddingTop:16,paddingBottom:28},
  authContent:{width:"100%",maxWidth:440,alignSelf:"center",backgroundColor:"transparent",paddingHorizontal:8,paddingTop:4,paddingBottom:12},
  logoImage:{width:400,height:250,alignSelf:"center",marginTop:0,marginBottom:8,backgroundColor:"transparent"},
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
