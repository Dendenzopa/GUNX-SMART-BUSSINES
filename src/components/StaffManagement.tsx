import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { useShopContext } from "./AuthGate";
import { supabase } from "../lib/supabase";

type Role = "manager" | "cashier" | "stockkeeper";
type Member = { user_id: string; role: string };
const permissionOptions = [
  { id: "products.read", label: "Kuona bidhaa", detail: "Kuona katalogi na bei za kuuza" },
  { id: "products.manage", label: "Kusimamia bidhaa", detail: "Kuongeza, kuhariri na kuficha bidhaa" },
  { id: "pos.use", label: "POS / Mauzo", detail: "Kufanya mauzo na checkout" },
  { id: "sales.view", label: "Historia ya mauzo", detail: "Kuona risiti na rekodi za mauzo" },
  { id: "payments.view", label: "Malipo", detail: "Kuona rekodi za malipo" },
  { id: "customers.read", label: "Wateja", detail: "Kuona na kusimamia taarifa za wateja" },
  { id: "debts.manage", label: "Madeni", detail: "Kuona madeni na kurekodi marejesho" },
  { id: "stock.manage", label: "Stock", detail: "Kupokea stock na kuona movement" },
  { id: "expenses.manage", label: "Gharama", detail: "Kuona na kurekodi gharama" },
  { id: "refunds.manage", label: "Refunds", detail: "Kurejesha bidhaa na fedha" },
  { id: "reports.view", label: "Ripoti", detail: "Kuona ripoti za biashara" },
  { id: "reports.profit", label: "Faida na gharama za bidhaa", detail: "Kuona gharama ya bidhaa na makadirio ya faida" },
  { id: "costs.view", label: "Bei za kununua", detail: "Kuona cost price ya bidhaa" },
  { id: "sync.manage", label: "Offline sync", detail: "Kusimamia mauzo yanayosubiri kusawazishwa" },
];
const roles: { id: Role; label: string; detail: string }[] = [
  { id: "manager", label: "Meneja", detail: "Usimamizi wa shughuli za duka" },
  { id: "cashier", label: "Cashier", detail: "Mauzo na malipo" },
  { id: "stockkeeper", label: "Stock", detail: "Kupokea na kufuatilia stock ya bidhaa zilizopo" },
];

export default function StaffManagement({ darkMode = true }: { darkMode?: boolean }) {
  const { shopId } = useShopContext();
  const [members, setMembers] = useState<Member[]>([]);
  const [phone, setPhone] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [role, setRole] = useState<Role>("cashier");
  const [owner, setOwner] = useState(false);
  const [permissionTarget, setPermissionTarget] = useState<Member | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
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

  function normalizeTanzaniaPhone(value: string) {
    const digits = value.replace(/\D/g, "");
    if (digits.startsWith("255") && digits.length === 12) return "+" + digits;
    if (digits.startsWith("0") && digits.length === 10) return "+255" + digits.slice(1);
    if (/^[67]\d{8}$/.test(digits)) return "+255" + digits;
    return null;
  }

  async function shareInvitation(link: string) {
    try {
      await Share.share({ message: "Jiunge na biashara yangu kwenye GUNX SMART BUSINESS kupitia link hii: " + link });
    } catch {
      setNotice("Link ya mwaliko imetengenezwa. Nakili link iliyoonyeshwa hapa chini na umtumie mfanyakazi.");
    }
  }

  async function addMember() {
    const target = normalizeTanzaniaPhone(phone);
    if (!target) { setNotice("Weka namba sahihi ya Tanzania, mfano 07XXXXXXXX au +2557XXXXXXXX."); return; }
    if (!supabase || !shopId || !owner) return;
    setBusy(true);
    const { data: token, error } = await supabase.rpc("create_shop_invitation", {
      p_shop_id: shopId, p_phone_e164: target, p_role: role
    });
    setBusy(false);
    if (error || !token) { setNotice("Mwaliko haukutengenezwa: " + (error?.message ?? "Jaribu tena.")); return; }
    // Always share a public HTTPS invitation URL so employees can open it before installing GUNX.
    const link = "https://gunx-smart-bussines-dendenzopa.vercel.app/?invite=" + encodeURIComponent(String(token));
    setPhone("");
    setInviteLink(link);
    setNotice("Mwaliko wa " + target + " umetengenezwa. Mfanyakazi lazima athibitishe namba hii kwa SMS.");
    await shareInvitation(link);
  }

  async function changeRole(member: Member, nextRole: Role) {
    if (!supabase || !shopId || !owner || member.role === "owner") return;
    setBusy(true);
    const { error } = await supabase.rpc("update_shop_member_role", { p_shop_id: shopId, p_user_id: member.user_id, p_role: nextRole });
    setBusy(false);
    setNotice(error ? "Jukumu halijabadilishwa: " + error.message : "Jukumu limebadilishwa.");
    await load();
  }

  async function openPermissions(member: Member) {
    if (!supabase || !shopId || !owner || member.role !== "manager") return;
    setBusy(true);
    const { data, error } = await supabase.rpc("get_shop_member_permissions", { p_shop_id: shopId, p_user_id: member.user_id });
    setBusy(false);
    if (error) { setNotice("Ruhusa hazijapakiwa: " + error.message); return; }
    setPermissionTarget(member);
    setPermissions(Array.isArray(data) ? data : []);
    setNotice("Badilisha ruhusa za meneja kisha uhifadhi. Ruhusa ambazo hazijachaguliwa zitafungwa.");
  }

  function togglePermission(permission: string) {
    setPermissions(current => current.includes(permission)
      ? current.filter(item => item !== permission)
      : [...current, permission]);
  }

  async function savePermissions() {
    if (!supabase || !shopId || !owner || !permissionTarget) return;
    const next = new Set(permissions);
    if (next.has("pos.use") || next.has("stock.manage") || next.has("products.manage")) next.add("products.read");
    setBusy(true);
    const { error } = await supabase.rpc("set_manager_permissions", {
      p_shop_id: shopId, p_user_id: permissionTarget.user_id, p_permissions: [...next]
    });
    setBusy(false);
    if (error) { setNotice("Ruhusa hazijahifadhiwa: " + error.message); return; }
    setPermissions([...next]);
    setNotice("Ruhusa za meneja zimehifadhiwa na kuanza kutumika.");
    setPermissionTarget(null);
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

  return <ScrollView style={{ backgroundColor: darkMode ? "#081522" : "#F8FAFC" }} contentContainerStyle={s.wrap}>
    <Text style={[s.title, !darkMode && { color: "#142D42" }]}>Wafanyakazi wa Duka</Text>
    <Text style={[s.copy, !darkMode && { color: "#526477" }]}>Alika wafanyakazi kwa namba ya simu. Kila mfanyakazi atakuwa na akaunti yake binafsi na ataingia kwa simu na password.</Text>
    {loading && <ActivityIndicator color="#43C99A" />}
    {!owner && !loading && <Text style={[s.notice, !darkMode && { color: "#075E46", backgroundColor: "#E8F7F0" }]}>Akaunti hii haina ruhusa ya mmiliki. Unaweza kuona orodha tu; maamuzi ya ruhusa yanathibitishwa na database.</Text>}
    {owner && <View style={[s.panel, !darkMode && { backgroundColor: "#FFFFFF", borderColor: "#DCE5EC" }]}>
      <Text style={[s.heading, !darkMode && { color: "#142D42" }]}>Ongeza mfanyakazi</Text>
      <Text style={[s.copy, !darkMode && { color: "#526477" }]}>Ingiza namba ya simu ya mfanyakazi. Link ya mwaliko itatengenezwa ili umshirikishe.</Text>
      <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="07XXXXXXXX au +2557XXXXXXXX" placeholderTextColor="#8194A5" style={[s.input, !darkMode && { backgroundColor: "#FFFFFF", borderColor: "#CBD5E1", color: "#142D42" }]}/>
      <Text style={[s.heading, !darkMode && { color: "#142D42" }]}>Chagua nafasi</Text>
      {roles.map(item => <Pressable key={item.id} onPress={() => setRole(item.id)} style={[s.role, !darkMode && { backgroundColor: "#FFFFFF", borderColor: "#CBD5E1" }, role === item.id && (darkMode ? s.selected : { backgroundColor: "#E8F7F0", borderColor: "#159A70" })]}>
        <Text style={[s.roleTitle, !darkMode && { color: "#142D42" }]}>{item.label} {role === item.id ? "✓" : ""}</Text><Text style={[s.copy, !darkMode && { color: "#526477" }]}>{item.detail}</Text>
      </Pressable>)}
      <Pressable disabled={busy} onPress={addMember} style={s.button}><Text style={s.buttonText}>{busy ? "Inachakata..." : "＋ Ongeza mfanyakazi"}</Text></Pressable>
      {!!inviteLink && <View style={[s.inviteBox, !darkMode && { backgroundColor: "#F0FDF7", borderColor: "#A7DCC7" }]}>
        <Text style={[s.copy, !darkMode && { color: "#526477" }]}>Link ya mwaliko (inaisha baada ya siku 7):</Text>
        <Text selectable style={[s.inviteLink, !darkMode && { color: "#087A5A" }]}>{inviteLink}</Text>
        <Pressable disabled={busy} onPress={() => void shareInvitation(inviteLink)} style={s.small}><Text style={[s.smallText, !darkMode && { color: "#FFFFFF" }]}>Shiriki tena link</Text></Pressable>
      </View>}
    </View>}
    <Text style={[s.heading, !darkMode && { color: "#142D42" }]}>Orodha ya wanachama ({members.length})</Text>
    {members.map(member => <View key={member.user_id} style={[s.member, !darkMode && { backgroundColor: "#FFFFFF", borderColor: "#DCE5EC" }]}>
      <Text style={[s.roleTitle, !darkMode && { color: "#142D42" }]}>{member.role === "owner" ? "Mmiliki" : roles.find(r => r.id === member.role)?.label ?? member.role}</Text>
      <Text style={[s.copy, !darkMode && { color: "#526477" }]}>Utambulisho: ••••{member.user_id.slice(-6)}</Text>
      {owner && member.role !== "owner" && <View style={s.actions}>
        {roles.filter(r => r.id !== member.role).map(r => <Pressable key={r.id} disabled={busy} onPress={() => changeRole(member, r.id)} style={s.small}><Text style={[s.smallText, !darkMode && { color: "#FFFFFF" }]}>{r.label}</Text></Pressable>)}
        {member.role === "manager" && <Pressable disabled={busy} onPress={() => void openPermissions(member)} style={s.small}><Text style={[s.smallText, !darkMode && { color: "#FFFFFF" }]}>Ruhusa</Text></Pressable>}
        <Pressable disabled={busy} onPress={() => remove(member)} style={[s.small, s.remove]}><Text style={[s.smallText, !darkMode && { color: "#FFFFFF" }]}>Ondoa</Text></Pressable>
      </View>}
    </View>)}
    {owner && permissionTarget && <View style={[s.panel, !darkMode && { backgroundColor: "#FFFFFF", borderColor: "#DCE5EC" }]}>
      <Text style={[s.heading, !darkMode && { color: "#142D42" }]}>Ruhusa za Meneja</Text>
      <Text style={[s.copy, !darkMode && { color: "#526477" }]}>Meneja ••••{permissionTarget.user_id.slice(-6)}. Chagua kazi anazoweza kufanya. Bila ruhusa, taarifa na vitendo vinabaki vimefungwa.</Text>
      {permissionOptions.map(item => <Pressable key={item.id} disabled={busy} onPress={() => togglePermission(item.id)} style={[s.role, permissions.includes(item.id) && s.selected]}>
        <Text style={[s.roleTitle, !darkMode && { color: "#142D42" }]}>{permissions.includes(item.id) ? "✓ " : "○ "}{item.label}</Text>
        <Text style={[s.copy, !darkMode && { color: "#526477" }]}>{item.detail}</Text>
      </Pressable>)}
      <Pressable disabled={busy} onPress={() => void savePermissions()} style={s.button}><Text style={s.buttonText}>{busy ? "Inahifadhi..." : "Hifadhi ruhusa"}</Text></Pressable>
      <Pressable disabled={busy} onPress={() => setPermissionTarget(null)} style={[s.refresh, !darkMode && { backgroundColor: "#E7EEF4" }]}><Text style={[s.smallText, !darkMode && { color: "#FFFFFF" }]}>Ghairi</Text></Pressable>
    </View>}
    <Pressable onPress={() => void load()} style={[s.refresh, !darkMode && { backgroundColor: "#E7EEF4" }]}><Text style={[s.smallText, !darkMode && { color: "#FFFFFF" }]}>↻ Sasisha orodha</Text></Pressable>
    <Text style={[s.notice, !darkMode && { color: "#075E46", backgroundColor: "#E8F7F0" }]}>{notice}</Text>
    <Text style={[s.copy, !darkMode && { color: "#526477" }]}>Usalama: kuongeza, kubadilisha nafasi na kuondoa wanachama hufanywa na RPC za database zinazokagua jukumu la mmiliki. Wafanyakazi hujiunga kwa namba ya simu iliyothibitishwa kwa SMS.</Text>
  </ScrollView>;
}

const s = StyleSheet.create({
  wrap:{padding:18,paddingBottom:44,maxWidth:980,width:"100%",alignSelf:"center"},
  title:{color:"#F4F7FA",fontSize:26,fontWeight:"900",letterSpacing:-0.4},
  heading:{color:"#FFF",fontSize:16,fontWeight:"800",marginTop:12,marginBottom:8},
  copy:{color:"#91A4B5",fontSize:12,lineHeight:18,marginTop:4},
  panel:{backgroundColor:"#102438",borderColor:"#29475D",borderWidth:1,borderRadius:18,padding:16,marginTop:16},
  input:{backgroundColor:"#0B1B2A",borderWidth:1,borderColor:"#29475D",borderRadius:12,color:"#F4F7FA",padding:14,marginTop:9,fontSize:13},
  role:{padding:13,borderWidth:1,borderColor:"#29475D",borderRadius:13,marginTop:8,backgroundColor:"#0B1B2A"},
  selected:{borderColor:"#43C99A",backgroundColor:"#12372F"},
  roleTitle:{color:"#F4F7FA",fontWeight:"800",fontSize:13},
  button:{backgroundColor:"#16785C",padding:15,borderRadius:13,alignItems:"center",marginTop:13,borderWidth:1,borderColor:"#43C99A"},
  buttonText:{color:"#F5FFFA",fontWeight:"900"},
  member:{backgroundColor:"#102438",borderWidth:1,borderColor:"#29475D",padding:15,borderRadius:16,marginTop:9},
  actions:{flexDirection:"row",flexWrap:"wrap",gap:7,marginTop:10},
  small:{backgroundColor:"#173D36",paddingHorizontal:10,paddingVertical:8,borderRadius:8},
  remove:{backgroundColor:"#59332F"},
  inviteBox:{backgroundColor:"#0B1B2A",borderColor:"#286451",borderWidth:1,borderRadius:14,padding:13,marginTop:14},
  inviteLink:{color:"#75E0B8",fontSize:11,lineHeight:18,marginTop:6},
  smallText:{color:"#F4F7FA",fontSize:11,fontWeight:"800"},
  refresh:{alignSelf:"flex-start",padding:12,backgroundColor:"#173247",borderRadius:11,marginTop:13},
  notice:{color:"#75E0B8",backgroundColor:"#102D2C",padding:12,borderRadius:10,fontSize:12,lineHeight:18,marginTop:14}
});
