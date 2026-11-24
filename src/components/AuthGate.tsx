import React, { createContext, useContext, useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, View, Image } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "../lib/supabase";

const ShopContext = createContext<{ shopId: string | null }>({ shopId: null });
export function useShopContext() { return useContext(ShopContext); }
const NAVY="#071B36", GREEN="#079B62", GOLD="#D8B45E", INK="#172338", MUTED="#718096";

export default function AuthGate({ children }: { children: React.ReactNode }) {
 const [session,setSession]=useState<Session|null>(null),[loading,setLoading]=useState(true);
 const [email,setEmail]=useState(""),[password,setPassword]=useState(""),[showPassword,setShowPassword]=useState(false);
 const [shopName,setShopName]=useState(""),[needsShop,setNeedsShop]=useState(false),[shopId,setShopId]=useState<string|null>(null);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[mode,setMode]=useState<"login"|"signup"|"reset">("login");

 useEffect(()=>{
  if(!supabaseConfigured||!supabase){setLoading(false);return;}
  let active=true;
  const handleUrl=async(url:string)=>{
   try{
    const parsed=new URL(url),code=parsed.searchParams.get("code");
    const hash=parsed.hash.startsWith("#")?new URLSearchParams(parsed.hash.slice(1)):null;
    if(code){const {error}=await supabase.auth.exchangeCodeForSession(code);if(error&&active)setMessage(error.message);}
    else if(hash?.get("access_token")&&hash.get("refresh_token")){
     const {error}=await supabase.auth.setSession({access_token:hash.get("access_token")!,refresh_token:hash.get("refresh_token")!});
     if(error&&active)setMessage(error.message);
    }
   }catch{if(active)setMessage("Imeshindikana kukamilisha uthibitishaji. Jaribu tena.");}
  };
  supabase.auth.getSession().then(({data,error})=>{if(!active)return;if(error)setMessage(error.message);setSession(data.session);setLoading(false);});
  const {data:listener}=supabase.auth.onAuthStateChange((_event,next)=>{setSession(next);if(!next){setNeedsShop(false);setShopId(null);}});
  const sub=Linking.addEventListener("url",({url})=>{void handleUrl(url);});
  Linking.getInitialURL().then(url=>{if(url)void handleUrl(url);});
  return()=>{active=false;listener.subscription.unsubscribe();sub.remove();};
 },[]);

 useEffect(()=>{
  if(!session||!supabase)return;let active=true;
  supabase.from("shop_members").select("shop_id").eq("user_id",session.user.id).limit(1).maybeSingle().then(({data,error})=>{
   if(!active)return;if(error)setMessage("Imeshindikana kusoma duka: "+error.message);
   setNeedsShop(!data&&!error);setShopId(data?.shop_id??null);
  });
  return()=>{active=false;};
 },[session]);

 async function authenticate(){
  if(!supabase)return;
  if(!/^\S+@\S+\.\S+$/.test(email.trim())||password.length<8){setMessage("Weka email sahihi na password yenye angalau herufi 8.");return;}
  setBusy(true);setMessage("");
  const result=mode==="signup"?await supabase.auth.signUp({email:email.trim(),password}):await supabase.auth.signInWithPassword({email:email.trim(),password});
  setBusy(false);
  if(result.error)setMessage(result.error.message);
  else if(mode==="signup"&&!result.data.session){setMessage("Akaunti imetengenezwa. Fungua email yako na uthibitishe akaunti kabla ya kuingia.");setMode("login");}
 }
 async function resetPassword(){
  if(!supabase)return;
  if(!/^\S+@\S+\.\S+$/.test(email.trim())){setMessage("Weka email yako sahihi kwanza.");return;}
  setBusy(true);setMessage("");const {error}=await supabase.auth.resetPasswordForEmail(email.trim());setBusy(false);
  setMessage(error?"Imeshindikana kutuma link: "+error.message:"Link ya kubadilisha password imetumwa. Angalia Inbox na Spam/Junk.");
 }
 async function googleLogin(){
  if(!supabase)return;setBusy(true);setMessage("");
  const {data,error}=await supabase.auth.signInWithOAuth({provider:"google",options:{redirectTo:"gunxsmartbusiness://auth/callback",skipBrowserRedirect:true}});
  if(error||!data.url){setBusy(false);setMessage(error?.message??"Hakikisha Google provider imewashwa kwenye Supabase.");return;}
  try{await Linking.openURL(data.url);}catch{setMessage("Imeshindikana kufungua Google Sign-In.");}finally{setBusy(false);}
 }
 async function createShop(){
  if(!supabase||shopName.trim().length<2){setMessage("Jina la duka liwe na angalau herufi 2.");return;}
  setBusy(true);setMessage("");const {error}=await supabase.rpc("create_shop",{p_name:shopName.trim()});setBusy(false);
  if(error)setMessage("Duka halikuundwa: "+error.message);
  else{const {data}=await supabase.from("shop_members").select("shop_id").eq("user_id",(await supabase.auth.getUser()).data.user?.id).limit(1).maybeSingle();setShopId(data?.shop_id??null);setNeedsShop(!data);}
 }

 if(!supabaseConfigured)return <>{children}</>;
 if(loading)return <SafeAreaView style={a.loading}><StatusBar barStyle="light-content" backgroundColor={NAVY}/><ActivityIndicator color={GREEN} size="large"/></SafeAreaView>;
 if(!session)return <SafeAreaView style={a.safe}>
  <StatusBar barStyle="light-content" backgroundColor={NAVY}/>
  <KeyboardAvoidingView style={a.flex} behavior={Platform.OS==="ios"?"padding":undefined}>
   <ScrollView contentContainerStyle={a.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
    <View style={a.brandPanel}><View style={a.glowOne}/><View style={a.glowTwo}/>
     <Image source={require("../../assets/GUNX20Smart20Business20Logo-1.jpg")} style={a.logo} resizeMode="contain"/>
     <Text style={a.tagline}>THINK BIG. BUILD SMART. GROW BEYOND.</Text>
    </View>
    <View style={a.form}>
     <Text style={a.title}>{mode==="signup"?"Fungua akaunti yako":mode==="reset"?"Badilisha password":"Ingia kwenye akaunti yako"}</Text>
     {mode!=="reset"&&<>
      <Pressable disabled={busy} onPress={googleLogin} style={({pressed})=>[a.google,pressed&&a.pressed]}><Text style={a.googleG}>G</Text><Text style={a.googleLabel}>Endelea kwa Google (Gmail)</Text></Pressable>
      <View style={a.divider}><View style={a.line}/><Text style={a.or}>AU</Text><View style={a.line}/></View>
     </>}
     <View style={a.inputWrap}><Text style={a.icon}>✉</Text><TextInput value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" placeholder="Email Address" placeholderTextColor="#8794A5" style={a.input}/></View>
     {mode!=="reset"&&<View style={a.inputWrap}><Text style={a.icon}>▣</Text><TextInput value={password} onChangeText={setPassword} secureTextEntry={!showPassword} autoCapitalize="none" textContentType={mode==="signup"?"newPassword":"password"} placeholder="Password" placeholderTextColor="#8794A5" style={a.input}/><Pressable onPress={()=>setShowPassword(v=>!v)} hitSlop={12} style={a.eye}><Text style={a.eyeLabel}>{showPassword?"Ficha":"Onyesha"}</Text></Pressable></View>}
     {mode==="login"&&<Pressable onPress={()=>{setMode("reset");setMessage("");}} style={a.forgot}><Text style={a.forgotLabel}>Umesahau password?</Text></Pressable>}
     {mode==="reset"&&<Text style={a.helper}>Tutatuma link ya kubadilisha password kwenye email yako.</Text>}
     <Pressable disabled={busy} onPress={mode==="reset"?resetPassword:authenticate} style={({pressed})=>[a.primary,pressed&&a.primaryPressed,busy&&a.disabled]}>{busy?<ActivityIndicator color="#FFF"/>:<Text style={a.primaryLabel}>{mode==="signup"?"JISAJILI":mode==="reset"?"TUMA LINK":"INGIA"}</Text>}</Pressable>
     {mode!=="reset"?<View style={a.registerRow}><Text style={a.registerText}>{mode==="login"?"Huna akaunti? ":"Tayari una akaunti? "}</Text><Pressable onPress={()=>{setMode(mode==="login"?"signup":"login");setMessage("");}}><Text style={a.registerLink}>{mode==="login"?"Jisajili hapa":"Ingia hapa"}</Text></Pressable></View>:<Pressable onPress={()=>{setMode("login");setMessage("");}}><Text style={a.backLink}>Rudi kwenye kuingia</Text></Pressable>}
     {!!message&&<Text accessibilityRole="alert" style={a.message}>{message}</Text>}
     <Text style={a.footer}>GUNX SMART BUSINESS  •  SALAMA NA RAHISI</Text>
    </View>
   </ScrollView>
  </KeyboardAvoidingView>
 </SafeAreaView>;

 if(needsShop)return <SafeAreaView style={a.safe}><StatusBar barStyle="light-content" backgroundColor={NAVY}/><View style={a.shopCard}>
  <Image source={require("../../assets/GUNX20Smart20Business20Logo-1.jpg")} style={a.logo} resizeMode="contain"/>
  <Text style={a.shopTitle}>Unda duka lako</Text><Text style={a.shopCopy}>Akaunti yako imeingia. Weka jina la biashara ili kuanzisha workspace.</Text>
  <TextInput value={shopName} onChangeText={setShopName} placeholder="Jina la duka / biashara" placeholderTextColor="#8794A5" style={a.shopInput}/>
  <Pressable disabled={busy} onPress={createShop} style={a.shopButton}><Text style={a.primaryLabel}>{busy?"Inaunda...":"Unda duka"}</Text></Pressable>
  {!!message&&<Text style={a.message}>{message}</Text>}<Pressable onPress={()=>supabase?.auth.signOut()}><Text style={a.backLink}>Toka kwenye akaunti</Text></Pressable>
 </View></SafeAreaView>;
 return <ShopContext.Provider value={{shopId}}>{children}</ShopContext.Provider>;
}

const a=StyleSheet.create({
 flex:{flex:1},loading:{flex:1,backgroundColor:NAVY,alignItems:"center",justifyContent:"center"},safe:{flex:1,backgroundColor:NAVY},
 scroll:{flexGrow:1,backgroundColor:NAVY,paddingBottom:24},brandPanel:{minHeight:265,backgroundColor:NAVY,alignItems:"center",justifyContent:"center",paddingTop:26,paddingBottom:22,overflow:"hidden"},
 glowOne:{position:"absolute",width:260,height:260,borderRadius:130,backgroundColor:"#123E67",opacity:.45,top:-130,right:-70},
 glowTwo:{position:"absolute",width:190,height:190,borderRadius:95,backgroundColor:"#0C594C",opacity:.2,bottom:-115,left:-65},
 logo:{width:236,height:172,alignSelf:"center"},tagline:{color:GOLD,fontSize:9,fontWeight:"800",letterSpacing:2,marginTop:3},
 form:{backgroundColor:"#FFF",borderTopLeftRadius:28,borderTopRightRadius:28,paddingHorizontal:24,paddingTop:27,paddingBottom:28,flexGrow:1},
 title:{color:INK,fontSize:21,fontWeight:"800",textAlign:"center",marginBottom:22},
 google:{height:54,borderRadius:12,borderWidth:1,borderColor:"#D9E0E8",backgroundColor:"#FFF",flexDirection:"row",alignItems:"center",justifyContent:"center",gap:13},
 pressed:{opacity:.78},googleG:{fontSize:25,fontWeight:"900",color:"#4285F4"},googleLabel:{fontSize:14,fontWeight:"700",color:"#253247"},
 divider:{flexDirection:"row",alignItems:"center",gap:13,marginVertical:22},line:{height:1,backgroundColor:"#DDE3EA",flex:1},or:{fontSize:11,fontWeight:"800",color:"#8793A3",letterSpacing:1},
 inputWrap:{height:56,backgroundColor:"#FFF",borderWidth:1,borderColor:"#C9D8E8",borderRadius:12,flexDirection:"row",alignItems:"center",paddingHorizontal:14,marginBottom:13},
 icon:{fontSize:19,color:"#52708F",width:25,textAlign:"center"},input:{flex:1,color:INK,fontSize:14,paddingVertical:0},eye:{paddingLeft:8,paddingVertical:8},eyeLabel:{color:"#315E8D",fontSize:11,fontWeight:"700"},
 forgot:{alignSelf:"flex-end",marginBottom:18,paddingVertical:4},forgotLabel:{color:"#1769C2",fontSize:13,fontWeight:"700"},helper:{color:MUTED,fontSize:12,lineHeight:18,marginBottom:14},
 primary:{height:56,borderRadius:13,backgroundColor:GREEN,alignItems:"center",justifyContent:"center",marginTop:3,shadowColor:"#04764B",shadowOpacity:.22,shadowRadius:8,shadowOffset:{width:0,height:4},elevation:3},
 primaryPressed:{backgroundColor:"#067B4E"},disabled:{opacity:.65},primaryLabel:{color:"#FFF",fontSize:16,fontWeight:"900",letterSpacing:1},
 registerRow:{flexDirection:"row",justifyContent:"center",alignItems:"center",marginTop:24},registerText:{color:INK,fontSize:13},registerLink:{color:"#1769C2",fontSize:13,fontWeight:"800"},
 backLink:{color:"#1769C2",fontSize:13,fontWeight:"800",textAlign:"center",marginTop:22},
 message:{color:"#9A5A12",backgroundColor:"#FFF6E5",borderWidth:1,borderColor:"#F0D7A5",borderRadius:10,padding:12,fontSize:12,lineHeight:18,marginTop:16},
 footer:{textAlign:"center",color:"#9AA5B2",fontSize:9,fontWeight:"700",letterSpacing:1,marginTop:28},
 shopCard:{flex:1,justifyContent:"center",width:"100%",maxWidth:460,alignSelf:"center",padding:24},shopTitle:{color:"#FFF",fontWeight:"900",fontSize:25,textAlign:"center",marginTop:10},
 shopCopy:{color:"#B7C5D4",fontSize:13,lineHeight:20,textAlign:"center",marginTop:8,marginBottom:12},
 shopInput:{backgroundColor:"#FFF",borderWidth:1,borderColor:"#C9D8E8",borderRadius:11,color:INK,padding:14,marginTop:10},
 shopButton:{backgroundColor:GREEN,padding:15,borderRadius:12,alignItems:"center",marginTop:16}
});
