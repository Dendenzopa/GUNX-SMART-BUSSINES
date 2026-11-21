import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useShopContext } from "./AuthGate";
import { supabase } from "../lib/supabase";

type Role = "manager" | "cashier" | "stockkeeper";
type Member = { user_id: string; role: string };
const roles: { id: Role; label: string; detail: string }[] = [
  { id: "manager", label: "Meneja", detail: "Usimamizi wa shughuli za duka" },
  { id: "cashier", label: "Cashier", detail: "Mauzo na malipo" },
  { id: "stockkeeper", label: "Stock", detail: "Bidhaa na stock" },
];

export default function StaffManagement() {
  const { shopId } = useShopContext();
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("cashier");
  const [owner, setOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("Inapakia wanachama wa duka...");

  const load = useCallback(async () => {
    if (!supabase || !shopId) { setLoading(false); setNotice("Duka halijaunganishwa."); return; }
    setLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    const currentId = auth.user?.id;
    const { data, error } = await supabase.from("shop_members").select("user_id,role").eq("shop_id", shopId).order("role");
    if (error) { setNotice("Imeshindikana kupakia wafanyakazi: " + error.message); setLoading(false); return; }
    const rows = (data ?? []) as Member[];
    setMembers(rows);
    setOwner(Boolean(rows.find(row => row.user_id === currentId && row.role === "owner")));
    setNotice(rows.length + " wanachama kwenye duka hili.");
    setLoading(false);
  }, [shopId]);

  useEffect(() => { void load(); }, [load]);

  async function addMember() {
    const target = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target) || target.length > 254) {
      setNotice("Weka email sahihi ya mfanyakazi.");
      return;
    }
    if (!supabase || !shopId || !owner) return;
    setBusy(true);
    const { error } = await supabase.functions.invoke("invite-staff", { body: { shopId, email: target, role } });
    setBusy(false);
    if (error) { setNotice("Mwaliko haujatumwa: " + error.message + ". Hakikisha Edge Function invite-staff imedeployiwa."); return; }
    setEmail("");
    setNotice("Mwaliko umetumwa kwa " + target + ". Mfanyakazi ataweza kuingia baada ya kukamilisha usajili wa email.");
    await load();
  }

  async function changeRole(member: Member, nextRole: Role) {
    if (!supabase || !shopId || !owner || member.role === "owner") return;
    setBusy(true);
    const { error } = await supabase.rpc("update_shop_member_role", { p_shop_id: shopId, p_user_id: member.user_id, p_role: nextRole });
    setBusy(false);
    setNotice(error ? "Jukumu halijabadilishwa: " + error.message : "Jukumu limebadilishwa.");
    await load();
  }

  async function remove(member: Member) {
    if (!supabase || !shopId || !owner || member.role === "owner") return;
    setBusy(true);
    const { error } = await supabase.rpc("remove_shop_member", { p_shop_id: shopId, p_user_id: member.user_id });
    setBusy(false);
    setNotice(error ? "Mfanyakazi hajaondolewa: " + error.message : "Mfanyakazi ameondolewa kwenye duka.");
    await load();
  }

  return <ScrollView contentContainerStyle={s.wrap}>
    <Text style={s.title}>Wafanyakazi wa Duka</Text>
    <Text style={s.copy}>Simamia nafasi za watumiaji waliokwisha sajiliwa kwenye GUNX SMART BUSINESS.</Text>
    {loading && <ActivityIndicator color="#43C99A" />}
    {!owner && !loading && <Text style={s.notice}>Akaunti hii haina ruhusa ya mmiliki. Unaweza kuona orodha tu; maamuzi ya ruhusa yanathibitishwa na database.</Text>}
    {owner && <View style={s.panel}>
      <Text style={s.heading}>Ongeza mfanyakazi</Text>
      <Text style={s.copy}>Ingiza email ya mfanyakazi. Mfumo utatuma mwaliko wa kujiunga na duka.</Text>
      <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="Email ya mfanyakazi" placeholderTextColor="#8194A5" style={s.input}/>
      <Text style={s.heading}>Chagua nafasi</Text>
      {roles.map(item => <Pressable key={item.id} onPress={() => setRole(item.id)} style={[s.role, role === item.id && s.selected]}>
        <Text style={s.roleTitle}>{item.label} {role === item.id ? "✓" : ""}</Text><Text style={s.copy}>{item.detail}</Text>
      </Pressable>)}
      <Pressable disabled={busy} onPress={addMember} style={s.button}><Text style={s.buttonText}>{busy ? "Inachakata..." : "＋ Ongeza mfanyakazi"}</Text></Pressable>
    </View>}
    <Text style={s.heading}>Orodha ya wanachama ({members.length})</Text>
    {members.map(member => <View key={member.user_id} style={s.member}>
      <Text style={s.roleTitle}>{member.role === "owner" ? "Mmiliki" : roles.find(r => r.id === member.role)?.label ?? member.role}</Text>
      <Text style={s.copy}>ID: {member.user_id}</Text>
      {owner && member.role !== "owner" && <View style={s.actions}>
        {roles.filter(r => r.id !== member.role).map(r => <Pressable key={r.id} disabled={busy} onPress={() => changeRole(member, r.id)} style={s.small}><Text style={s.smallText}>{r.label}</Text></Pressable>)}
        <Pressable disabled={busy} onPress={() => remove(member)} style={[s.small, s.remove]}><Text style={s.smallText}>Ondoa</Text></Pressable>
      </View>}
    </View>)}
    <Pressable onPress={() => void load()} style={s.refresh}><Text style={s.smallText}>↻ Sasisha orodha</Text></Pressable>
    <Text style={s.notice}>{notice}</Text>
    <Text style={s.copy}>Usalama: kuongeza, kubadilisha nafasi na kuondoa wanachama hufanywa na RPC za database zinazokagua jukumu la owner. Ongeza tu User ID ya mtu unayemwamini.</Text>
  </ScrollView>;
}

const s = StyleSheet.create({
  wrap:{padding:16,paddingBottom:40,maxWidth:900,width:"100%",alignSelf:"center"},
  title:{color:"#F4F7FA",fontSize:24,fontWeight:"900"},
  heading:{color:"#FFF",fontSize:16,fontWeight:"800",marginTop:12,marginBottom:8},
  copy:{color:"#91A4B5",fontSize:12,lineHeight:18,marginTop:4},
  panel:{backgroundColor:"#102438",borderColor:"#1D3A50",borderWidth:1,borderRadius:14,padding:14,marginTop:14},
  input:{backgroundColor:"#0B1B2A",borderWidth:1,borderColor:"#2B4B61",borderRadius:9,color:"#F4F7FA",padding:12,marginTop:8,fontSize:12},
  role:{padding:11,borderWidth:1,borderColor:"#2B4B61",borderRadius:10,marginTop:7,backgroundColor:"#0B1B2A"},
  selected:{borderColor:"#43C99A",backgroundColor:"#12372F"},
  roleTitle:{color:"#F4F7FA",fontWeight:"800",fontSize:13},
  button:{backgroundColor:"#16785C",padding:13,borderRadius:10,alignItems:"center",marginTop:12},
  buttonText:{color:"#F5FFFA",fontWeight:"900"},
  member:{backgroundColor:"#102438",borderWidth:1,borderColor:"#1D3A50",padding:13,borderRadius:12,marginTop:8},
  actions:{flexDirection:"row",flexWrap:"wrap",gap:7,marginTop:10},
  small:{backgroundColor:"#173D36",paddingHorizontal:10,paddingVertical:8,borderRadius:8},
  remove:{backgroundColor:"#59332F"},
  smallText:{color:"#F4F7FA",fontSize:11,fontWeight:"800"},
  refresh:{alignSelf:"flex-start",padding:10,backgroundColor:"#173247",borderRadius:8,marginTop:12},
  notice:{color:"#75E0B8",backgroundColor:"#102D2C",padding:12,borderRadius:10,fontSize:12,lineHeight:18,marginTop:14}
});
