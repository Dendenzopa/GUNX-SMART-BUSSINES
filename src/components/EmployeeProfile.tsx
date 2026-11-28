import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useShopContext } from "./AuthGate";
import { supabase } from "../lib/supabase";

type Profile = {
  legal_name: string; phone_e164: string; identity_type: "nida"|"voter_id"; identity_number: string;
  guarantor_name: string; guarantor_phone: string; guarantor_address: string; origin_location: string;
  current_address: string; emergency_contact_name: string; emergency_contact_phone: string;
  job_title: string; employment_start_date: string;
};
const empty: Profile = {legal_name:"",phone_e164:"",identity_type:"nida",identity_number:"",guarantor_name:"",guarantor_phone:"",guarantor_address:"",origin_location:"",current_address:"",emergency_contact_name:"",emergency_contact_phone:"",job_title:"",employment_start_date:""};
export default function EmployeeProfile({darkMode=true}:{darkMode?:boolean}) {
 const {shopId,userId}=useShopContext();
 const [form,setForm]=useState<Profile>(empty),[consent,setConsent]=useState(false),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[notice,setNotice]=useState("Inapakia taarifa zako...");
 const load=useCallback(async()=>{
  if(!supabase||!shopId||!userId){setLoading(false);setNotice("Akaunti au biashara haijaunganishwa.");return;}
  setLoading(true);
  const {data,error}=await supabase.from("employee_profiles").select("legal_name,phone_e164,identity_type,identity_number,guarantor_name,guarantor_phone,guarantor_address,origin_location,current_address,emergency_contact_name,emergency_contact_phone,job_title,employment_start_date,declaration_accepted_at").eq("shop_id",shopId).eq("user_id",userId).maybeSingle();
  if(error){setNotice("Imeshindikana kupakia taarifa: "+error.message);} else if(data){setForm({...empty,...data});setConsent(Boolean(data.declaration_accepted_at));setNotice("Taarifa zako zimepakiwa.");} else setNotice("Jaza taarifa zako za ajira hapa.");
  setLoading(false);
 },[shopId,userId]);
 useEffect(()=>{void load();},[load]);
 const set=(key:keyof Profile,value:string)=>setForm(prev=>({...prev,[key]:value}));
 const field=(key:keyof Profile,label:string,placeholder:string,keyboardType:"default"|"phone-pad"="default")=><View style={s.fieldWrap} key={key}><Text style={[s.label,!darkMode&&{color:"#334155"}]}>{label}</Text><TextInput value={form[key]} onChangeText={v=>set(key,v)} placeholder={placeholder} placeholderTextColor="#8293A3" keyboardType={keyboardType} style={[s.input,!darkMode&&{backgroundColor:"#FFFFFF",borderColor:"#CBD5E1",color:"#142D42"}]}/></View>;
 async function save(){
  if(!supabase||!shopId||!userId)return;
  if(!form.legal_name.trim()||!form.phone_e164.trim()||!form.identity_number.trim()||!consent){setNotice("Jaza jina, simu, kitambulisho na ukubali tamko kabla ya kuhifadhi.");return;}
  setBusy(true);
  const {error}=await supabase.from("employee_profiles").upsert({shop_id:shopId,user_id:userId,...form,legal_name:form.legal_name.trim(),declaration_accepted_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:"shop_id,user_id"});
  setBusy(false);setNotice(error?"Taarifa hazijahifadhiwa: "+error.message:"Taarifa za mfanyakazi zimehifadhiwa."); 
 }
 return <ScrollView style={{backgroundColor:darkMode?"#081522":"#F8FAFC"}} contentContainerStyle={s.wrap}>
  <Text style={[s.title,!darkMode&&{color:"#142D42"}]}>Wasifu wa Mfanyakazi</Text>
  <Text style={[s.copy,!darkMode&&{color:"#526477"}]}>Jaza taarifa sahihi za ajira. Kitambulisho kimoja kinatosha: NIDA au kadi ya mpiga kura.</Text>
  {loading&&<ActivityIndicator color="#43C99A"/>}
  <View style={s.panel}><Text style={s.heading}>Taarifa binafsi</Text>{field("legal_name","Majina kamili ya kisheria","Majina kama yalivyo kwenye kitambulisho")}{field("phone_e164","Namba ya simu","+2557XXXXXXXX","phone-pad")}
   <Text style={s.label}>Aina ya kitambulisho (chagua kimoja)</Text><View style={s.row}>{(["nida","voter_id"] as const).map(t=><Pressable key={t} onPress={()=>set("identity_type",t)} style={[s.choice,form.identity_type===t&&s.selected]}><Text style={s.choiceText}>{t==="nida"?"NIDA":"Kadi ya mpiga kura"}</Text></Pressable>)}</View>
   {field("identity_number",form.identity_type==="nida"?"Namba ya NIDA":"Namba ya mpiga kura","Namba ya kitambulisho")}
  </View>
  <View style={s.panel}><Text style={s.heading}>Mdhamini</Text>{field("guarantor_name","Jina la mdhamini","Jina kamili")}{field("guarantor_phone","Simu ya mdhamini","+255...","phone-pad")}{field("guarantor_address","Anwani ya mdhamini","Mtaa, kata, wilaya")}</View>
  <View style={s.panel}><Text style={s.heading}>Makazi na dharura</Text>{field("origin_location","Mahali unapotoka","Kijiji/mtaa, wilaya, mkoa")}{field("current_address","Anwani ya sasa","Mtaa, kata, wilaya")}{field("emergency_contact_name","Jina la mtu wa dharura","Jina kamili")}{field("emergency_contact_phone","Simu ya dharura","+255...","phone-pad")}</View>
  <View style={s.panel}><Text style={s.heading}>Taarifa za ajira</Text>{field("job_title","Cheo / kazi","Mfano: Cashier, Storekeeper")}{field("employment_start_date","Tarehe ya kuanza kazi","YYYY-MM-DD")}</View>
  <Pressable onPress={()=>setConsent(v=>!v)} style={s.consent}><Text style={s.choiceText}>{consent?"☑":"□"}  Nakubali taarifa hizi zitumike kwa madhumuni ya ajira na usimamizi wa biashara, kwa kufuata ruhusa na sera za faragha.</Text></Pressable>
  <Pressable disabled={busy||loading} onPress={()=>void save()} style={s.button}><Text style={s.buttonText}>{busy?"Inahifadhi...":"Hifadhi wasifu"}</Text></Pressable>
  <Text style={s.notice}>{notice}</Text>
  <Text style={s.copy}>Nyaraka za utambulisho, barua ya serikali ya mtaa na mkataba zitaongezwa kupitia sehemu salama ya nyaraka. Usitume nyaraka hizi kwenye sehemu za umma.</Text>
 </ScrollView>;
}
const s=StyleSheet.create({wrap:{padding:16,paddingBottom:36,gap:12},title:{fontSize:22,fontWeight:"900",color:"#E7F0F6"},copy:{fontSize:12,lineHeight:18,color:"#9DB0BF"},panel:{backgroundColor:"#102438",borderColor:"#25445B",borderWidth:1,borderRadius:15,padding:14,gap:10},heading:{fontSize:15,fontWeight:"900",color:"#75E0B8"},fieldWrap:{gap:5},label:{fontSize:11,fontWeight:"800",color:"#C8D7E1"},input:{backgroundColor:"#0B1B2A",borderColor:"#31516A",borderWidth:1,borderRadius:10,padding:11,color:"#F4F8FB",fontSize:13},row:{flexDirection:"row",gap:8,flexWrap:"wrap"},choice:{padding:10,borderWidth:1,borderColor:"#31516A",borderRadius:9},selected:{backgroundColor:"#174638",borderColor:"#43C99A"},choiceText:{color:"#E5F2F6",fontSize:12,fontWeight:"800"},consent:{padding:13,borderRadius:12,backgroundColor:"#173D36",borderWidth:1,borderColor:"#43C99A"},button:{backgroundColor:"#087F5B",padding:14,borderRadius:12,alignItems:"center"},buttonText:{color:"#FFFFFF",fontWeight:"900"},notice:{color:"#75E0B8",fontSize:12,padding:10,backgroundColor:"#102438",borderRadius:10}});
