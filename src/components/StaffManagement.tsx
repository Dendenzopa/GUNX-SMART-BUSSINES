import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { useShopContext } from "./AuthGate";
import { supabase } from "../lib/supabase";

type Role = "manager" | "cashier" | "stockkeeper";
type Member = { user_id: string; role: string };
type EmployeeProfileRow = { user_id:string; legal_name:string; phone_e164:string; identity_type:string; identity_number:string; guarantor_name:string|null; guarantor_phone:string|null; guarantor_address:string|null; origin_location:string|null; current_address:string|null; emergency_contact_name:string|null; emergency_contact_phone:string|null; job_title:string|null; employment_start_date:string|null; employee_photo_path:string|null; contract_path:string|null; declaration_accepted_at:string|null };
type EmployeeDocumentRow = { id:string; user_id:string; document_type:string; storage_path:string; created_at:string };
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
  { id: "staff.documents.view", label: "Nyaraka za wafanyakazi", detail: "Kuona taarifa na nyaraka binafsi za wafanyakazi wa biashara hii" },
];
const roles: { id: Role; label: string; detail: string }[] = [
  { id: "manager", label: "Meneja", detail: "Usimamizi wa shughuli za duka" },
  { id: "cashier", label: "Cashier", detail: "Mauzo na malipo" },
  { id: "stockkeeper", label: "Stock", detail: "Kupokea na kufuatilia stock ya bidhaa zilizopo" },
];

export default function StaffManagement({ darkMode = true }: { darkMode?: boolean }) {
  const { shopId, shopRole } = useShopContext();
  const [members, setMembers] = useState<Member[]>([]);
  const [phone, setPhone] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [role, setRole] = useState<Role>("cashier");
  const [owner, setOwner] = useState(false);
  const [managerCanViewDocuments,setManagerCanViewDocuments]=useState(false);
  const [permissionTarget, setPermissionTarget] = useState<Member | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("Inapakia wanachama wa duka...");
  const [selectedEmployee,setSelectedEmployee]=useState<Member|null>(null);
  const [employeeProfile,setEmployeeProfile]=useState<EmployeeProfileRow|null>(null);
  const [employeeDocuments,setEmployeeDocuments]=useState<EmployeeDocumentRow[]>([]);
  const [profileLoading,setProfileLoading]=useState(false);
  const [openingDocument,setOpeningDocument]=useState<string|null>(null);

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
    if(shopRole==="manager"){
      const {data:grants,error:grantError}=await supabase.rpc("get_my_shop_permissions",{p_shop_id:shopId});
      setManagerCanViewDocuments(!grantError&&Array.isArray(grants)&&grants.includes("staff.documents.view"));
    } else setManagerCanViewDocuments(false);
    setNotice(rows.length + " wanachama kwenye duka hili.");
    setLoading(false);
  }, [shopId,shopRole]);

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
    const link = Platform.OS === "web" && typeof window !== "undefined"
      ? window.location.origin + "/?invite=" + encodeURIComponent(String(token))
      : "gunxsmartbusiness://auth/callback?invite=" + encodeURIComponent(String(token));
    setPhone("");
    setInviteLink(link);
    setNotice("Mwaliko wa " + target + " umetengenezwa. Mfanyakazi lazima athibitishe namba hii kwa SMS.");
    await shareInvitation(link);
  }

  async function viewEmployeeProfile(member:Member) {
    if(!supabase||!shopId||!owner)return;
    setSelectedEmployee(member);setEmployeeProfile(null);setEmployeeDocuments([]);setProfileLoading(true);
    const [profileResult,documentsResult]=await Promise.all([
      supabase.from("employee_profiles").select("user_id,legal_name,phone_e164,identity_type,identity_number,guarantor_name,guarantor_phone,guarantor_address,origin_location,current_address,emergency_contact_name,emergency_contact_phone,job_title,employment_start_date,employee_photo_path,contract_path,declaration_accepted_at").eq("shop_id",shopId).eq("user_id",member.user_id).maybeSingle(),
      supabase.from("employee_private_documents").select("id,user_id,document_type,storage_path,created_at").eq("shop_id",shopId).eq("user_id",member.user_id).order("created_at",{ascending:false})
    ]);
    setProfileLoading(false);
    if(profileResult.error){setNotice("Wasifu haujapakiwa: "+profileResult.error.message);return;}
    if(documentsResult.error){setNotice("Nyaraka hazijapakiwa: "+documentsResult.error.message);return;}
    setEmployeeProfile(profileResult.data as EmployeeProfileRow|null);
    setEmployeeDocuments((documentsResult.data??[]) as EmployeeDocumentRow[]);
    setNotice(profileResult.data?"Wasifu wa mfanyakazi umepakiwa.":"Mfanyakazi bado hajajaza wasifu wake.");
  }

  async function openEmployeeDocument(doc:EmployeeDocumentRow,action:"view"|"download"="view") {
    if(!supabase||(!owner&&!managerCanViewDocuments)||openingDocument)return;
    setOpeningDocument(doc.id);
    const {error:logError}=await supabase.rpc("log_employee_document_access",{p_document_id:doc.id,p_action:action});
    if(logError){setNotice("Ufikiaji umekataliwa au haukuandikwa: "+logError.message);setOpeningDocument(null);return;}
    const {data,error}=await supabase.storage.from("employee-private-documents").createSignedUrl(doc.storage_path,60);
    setOpeningDocument(null);
    if(error||!data?.signedUrl){setNotice("Kiungo salama hakikutengenezwa: "+(error?.message??"Jaribu tena."));return;}
    try{await Linking.openURL(data.signedUrl);setNotice("Nyaraka imefunguliwa kwa kiungo cha muda mfupi.");}
    catch{setNotice("Simu haikuweza kufungua nyaraka hii.");}
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

  const staffMembers = members.filter(member => member.role !== "owner");
  const filteredMembers = staffMembers.filter(member => {
    const roleLabel = roles.find(item => item.id === member.role)?.label ?? member.role;
    return (roleLabel + " " + member.user_id).toLowerCase().includes(memberSearch.toLowerCase());
  });
  const panel = { backgroundColor: "#0B192C", borderColor: "#1E3A5F", borderWidth: 1, borderRadius: 20, padding: 16 } as const;
  const field = { backgroundColor: "#10223A", borderColor: "#1E3A5F", borderWidth: 1, borderRadius: 13, color: "#FFFFFF", paddingHorizontal: 14, paddingVertical: 13, fontSize: 13 } as const;
  const mutedText = { color: "#AFC0D0", fontSize: 11, lineHeight: 17 } as const;
  const actionButton = { backgroundColor: "#10223A", borderColor: "#1E3A5F", borderWidth: 1, borderRadius: 11, paddingHorizontal: 11, paddingVertical: 9 } as const;
  return <ScrollView style={{ backgroundColor: "#071120" }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 42, width: "100%", maxWidth: 1120, alignSelf: "center", gap: 15 }} keyboardShouldPersistTaps="handled">
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, padding: 13, backgroundColor: "#0B192C", borderColor: "#1E3A5F", borderWidth: 1, borderRadius: 17 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: "#FBBF24", fontSize: 9, fontWeight: "900", letterSpacing: 1.4 }}>GUNX SMART BUSINESS</Text>
        <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "900", marginTop: 3 }}>Biashara Yangu</Text>
        <Text style={{ color: "#AFC0D0", fontSize: 10, marginTop: 2 }}>Usimamizi wa akaunti na nafasi za wafanyakazi</Text>
      </View>
      <Pressable disabled={loading || busy} onPress={() => void load()} style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: "#10223A", borderColor: "#1E3A5F", borderWidth: 1, alignItems: "center", justifyContent: "center" }}>
        {loading ? <ActivityIndicator color="#10B981" /> : <Text style={{ color: "#10B981", fontSize: 20, fontWeight: "900" }}>↻</Text>}
      </Pressable>
    </View>

    <View style={{ gap: 5 }}>
      <Text style={{ color: "#FFFFFF", fontSize: 25, fontWeight: "900", letterSpacing: -0.5 }}>Wafanyakazi wa Duka</Text>
      <View style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "#10223A", borderColor: "#FBBF24", borderWidth: 1, borderRadius: 30, paddingHorizontal: 11, paddingVertical: 6 }}>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: "#10B981" }} />
        <Text style={{ color: "#FBBF24", fontSize: 9, fontWeight: "800" }}>USIMAMIZI WA AKAUNTI & NAFASI</Text>
      </View>
      <Text style={{ color: "#AFC0D0", fontSize: 12, lineHeight: 19 }}>Alika wafanyakazi kwa namba ya simu. Kila mfanyakazi ana akaunti yake na huingia kwa simu na nenosiri lake binafsi.</Text>
    </View>

    {loading && <ActivityIndicator color="#10B981" />}
    {!owner && !loading && <View style={{ backgroundColor: "#102D2C", borderColor: "#1D6B55", borderWidth: 1, borderRadius: 13, padding: 12 }}><Text style={{ color: "#75E0B8", fontSize: 11, lineHeight: 18 }}>Akaunti hii haina ruhusa ya mmiliki. Unaweza kuona taarifa zinazoruhusiwa tu; maamuzi ya nafasi na ruhusa yanathibitishwa na database.</Text></View>}

    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9 }}>
      {[
        { label: "Wanachama waliothibitishwa", value: String(staffMembers.length), color: "#FFFFFF", icon: "♙" },
        { label: "Mialiko inasubiri", value: "—", color: "#FBBF24", icon: "◷" },
        { label: "Nafasi zilizopo", value: "—", color: "#FFFFFF", icon: "✓" },
      ].map(item => <View key={item.label} style={{ flexGrow: 1, flexBasis: "30%", minWidth: 105, backgroundColor: "#0B192C", borderColor: "#1E3A5F", borderWidth: 1, borderRadius: 16, padding: 12, minHeight: 86, justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 5 }}>
          <Text style={{ color: "#AFC0D0", fontSize: 9, fontWeight: "700", flex: 1 }}>{item.label}</Text>
          <Text style={{ color: item.color === "#FBBF24" ? "#FBBF24" : "#10B981", fontSize: 17, fontWeight: "900" }}>{item.icon}</Text>
        </View>
        <Text style={{ color: item.color, fontSize: 22, fontWeight: "900", marginTop: 8 }}>{item.value}</Text>
      </View>)}
    </View>

    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14, alignItems: "flex-start" }}>
      {owner && <View style={[panel, { flexGrow: 1, flexBasis: Platform.OS === "web" ? 390 : "100%" }]}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomColor: "#1E3A5F", borderBottomWidth: 1, paddingBottom: 11, marginBottom: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
            <View style={{ width: 5, height: 23, borderRadius: 4, backgroundColor: "#FBBF24" }} />
            <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "900" }}>Ongeza mfanyakazi</Text>
          </View>
          <Text style={{ color: "#10B981", fontSize: 10, fontWeight: "800" }}>MWALIKO WA SIMU</Text>
        </View>
        <Text style={{ color: "#DCE7F1", fontSize: 11, fontWeight: "800", marginBottom: 6 }}>Namba ya simu ya mfanyakazi</Text>
        <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="07XXXXXXXX au +2557XXXXXXXX" placeholderTextColor="#8194A5" style={field} />
        <Text style={{ color: "#DCE7F1", fontSize: 11, fontWeight: "800", marginTop: 16, marginBottom: 8 }}>Chagua nafasi</Text>
        <View style={{ gap: 8 }}>
          {roles.map(item => <Pressable key={item.id} disabled={busy} onPress={() => setRole(item.id)} style={{ padding: 12, borderWidth: role === item.id ? 2 : 1, borderColor: role === item.id ? "#10B981" : "#1E3A5F", borderRadius: 13, backgroundColor: role === item.id ? "#12372F" : "#10223A", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "900" }}>{item.label} {role === item.id ? "✓" : ""}</Text>
              <Text style={{ color: "#AFC0D0", fontSize: 10, marginTop: 4, lineHeight: 15 }}>{item.detail}</Text>
            </View>
            <View style={{ paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: role === item.id ? "#10B981" : "#0B192C" }}>
              <Text style={{ color: role === item.id ? "#071120" : "#AFC0D0", fontSize: 9, fontWeight: "900" }}>{role === item.id ? "IMECHAGULIWA" : "CHAGUA"}</Text>
            </View>
          </Pressable>)}
        </View>
        <View style={{ backgroundColor: "#10223A", borderColor: "#1E3A5F", borderWidth: 1, borderRadius: 11, padding: 11, marginTop: 10 }}>
          <Text style={{ color: "#FBBF24", fontSize: 10, fontWeight: "900" }}>MAELEZO YA NAFASI</Text>
          <Text style={[mutedText, { marginTop: 4 }]}>{roles.find(item => item.id === role)?.detail}</Text>
        </View>
        <Pressable disabled={busy || !phone.trim()} onPress={() => void addMember()} style={{ backgroundColor: busy ? "#285E50" : "#059669", borderColor: "#10B981", borderWidth: 1, borderRadius: 13, padding: 14, marginTop: 13, alignItems: "center" }}>
          <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "900" }}>{busy ? "Inatengeneza mwaliko..." : "＋ Ongeza mfanyakazi"}</Text>
        </Pressable>
        {!!inviteLink && <View style={{ backgroundColor: "#102D2C", borderColor: "#1D6B55", borderWidth: 1, borderRadius: 13, padding: 12, marginTop: 12 }}>
          <Text style={{ color: "#75E0B8", fontSize: 10, fontWeight: "800" }}>LINK YA MWALIKO • INAISHA BAADA YA SIKU 7</Text>
          <Text selectable style={{ color: "#FFFFFF", fontSize: 11, lineHeight: 18, marginTop: 7 }}>{inviteLink}</Text>
          <Pressable disabled={busy} onPress={() => void shareInvitation(inviteLink)} style={[actionButton, { alignSelf: "flex-start", marginTop: 9, borderColor: "#10B981" }]}><Text style={{ color: "#75E0B8", fontSize: 10, fontWeight: "900" }}>Shiriki tena link</Text></Pressable>
        </View>}
      </View>}

      <View style={[panel, { flexGrow: 1, flexBasis: Platform.OS === "web" ? 390 : "100%" }]}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, borderBottomColor: "#1E3A5F", borderBottomWidth: 1, paddingBottom: 11 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "900" }}>Orodha ya wanachama ({staffMembers.length})</Text>
            <Text style={{ color: "#AFC0D0", fontSize: 10, marginTop: 3 }}>Wanachama wa biashara hii</Text>
          </View>
          <Pressable disabled={loading || busy} onPress={() => void load()} style={[actionButton, { flexDirection: "row", alignItems: "center", gap: 5 }]}>
            <Text style={{ color: "#10B981", fontSize: 15, fontWeight: "900" }}>↻</Text><Text style={{ color: "#10B981", fontSize: 9, fontWeight: "900" }}>Sasisha</Text>
          </Pressable>
        </View>
        <TextInput value={memberSearch} onChangeText={setMemberSearch} placeholder="Tafuta kwa nafasi au utambulisho..." placeholderTextColor="#8194A5" style={[field, { marginTop: 12 }]} />
        {filteredMembers.length === 0 && <View style={{ alignItems: "center", paddingVertical: 25 }}>
          <Text style={{ color: "#FBBF24", fontSize: 22 }}>♙</Text>
          <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "800", marginTop: 6 }}>{loading ? "Inapakia wanachama..." : staffMembers.length ? "Hakuna matokeo ya utafutaji" : "Bado hakuna mfanyakazi aliyejiunga"}</Text>
          <Text style={[mutedText, { textAlign: "center", marginTop: 4 }]}>Wanachama waliojiunga na biashara hii wataonekana hapa.</Text>
        </View>}
        {filteredMembers.map(member => <View key={member.user_id} style={{ backgroundColor: "#10223A", borderColor: "#1E3A5F", borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "900" }}>{roles.find(item => item.id === member.role)?.label ?? member.role}</Text>
              <Text style={{ color: "#AFC0D0", fontSize: 10, marginTop: 4 }}>Akaunti ••••{member.user_id.slice(-6)}</Text>
            </View>
            <View style={{ backgroundColor: "#12372F", borderColor: "#1D6B55", borderWidth: 1, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 5 }}>
              <Text style={{ color: "#75E0B8", fontSize: 9, fontWeight: "900" }}>AMEJIUNGA</Text>
            </View>
          </View>
          {(owner || managerCanViewDocuments) && <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 10 }}>
            {(owner || managerCanViewDocuments) && <Pressable disabled={busy} onPress={() => void viewEmployeeProfile(member)} style={actionButton}><Text style={{ color: "#75E0B8", fontSize: 10, fontWeight: "800" }}>Wasifu / Nyaraka</Text></Pressable>}
            {owner && <>
              {roles.filter(item => item.id !== member.role).map(item => <Pressable key={item.id} disabled={busy} onPress={() => void changeRole(member, item.id)} style={actionButton}><Text style={{ color: "#FFFFFF", fontSize: 10, fontWeight: "800" }}>{item.label}</Text></Pressable>)}
              {member.role === "manager" && <Pressable disabled={busy} onPress={() => void openPermissions(member)} style={[actionButton, { borderColor: "#FBBF24" }]}><Text style={{ color: "#FBBF24", fontSize: 10, fontWeight: "800" }}>Ruhusa</Text></Pressable>}
              <Pressable disabled={busy} onPress={() => void remove(member)} style={[actionButton, { backgroundColor: "#3B2029", borderColor: "#7F3044" }]}><Text style={{ color: "#FDA4AF", fontSize: 10, fontWeight: "800" }}>Ondoa</Text></Pressable>
            </>}
          </View>}
        </View>)}
      </View>
    </View>

    {(owner || managerCanViewDocuments) && selectedEmployee && <View style={panel}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "900" }}>Wasifu wa mfanyakazi</Text>
        <Pressable onPress={() => { setSelectedEmployee(null); setEmployeeProfile(null); setEmployeeDocuments([]); }} style={actionButton}><Text style={{ color: "#FDA4AF", fontSize: 10, fontWeight: "800" }}>Funga</Text></Pressable>
      </View>
      <Text style={[mutedText, { marginTop: 5 }]}>Akaunti ••••{selectedEmployee.user_id.slice(-6)} · {selectedEmployee.role}</Text>
      {profileLoading && <ActivityIndicator color="#10B981" style={{ marginTop: 10 }} />}
      {!profileLoading && !employeeProfile && <Text style={[mutedText, { marginTop: 10 }]}>Hakuna wasifu uliohifadhiwa bado.</Text>}
      {!profileLoading && employeeProfile && <>
        {([
          ["Majina kamili",employeeProfile.legal_name],["Simu",employeeProfile.phone_e164],["Kitambulisho",employeeProfile.identity_type==="nida"?"NIDA":"Kadi ya mpiga kura"],["Namba ya kitambulisho",employeeProfile.identity_number],["Cheo",employeeProfile.job_title||"—"],["Tarehe ya kuanza",employeeProfile.employment_start_date||"—"],["Mdhamini",employeeProfile.guarantor_name||"—"],["Simu ya mdhamini",employeeProfile.guarantor_phone||"—"],["Anwani ya mdhamini",employeeProfile.guarantor_address||"—"],["Mahali anapotoka",employeeProfile.origin_location||"—"],["Anwani ya sasa",employeeProfile.current_address||"—"],["Mtu wa dharura",employeeProfile.emergency_contact_name||"—"],["Simu ya dharura",employeeProfile.emergency_contact_phone||"—"]
        ] as [string,string][]).map(([label,value]) => <View key={label} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#1E3A5F" }}><Text style={mutedText}>{label}</Text><Text selectable style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "800", marginTop: 3 }}>{value}</Text></View>)}
        <Text style={[mutedText, { marginTop: 9 }]}>Tamko limekubaliwa: {employeeProfile.declaration_accepted_at ? "Ndiyo" : "Hapana"}</Text>
      </>}
      <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "900", marginTop: 15, marginBottom: 5 }}>Nyaraka binafsi ({employeeDocuments.length})</Text>
      {employeeDocuments.map(doc => <View key={doc.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "#1E3A5F" }}>
        <View style={{ flex: 1 }}><Text style={{ color: "#FFFFFF", fontSize: 11, fontWeight: "800" }}>{({identity:"Kitambulisho",employee_photo:"Picha ya mfanyakazi",local_government_letter:"Barua ya serikali ya mtaa",guarantor_support:"Nyaraka za mdhamini",employment_contract:"Mkataba wa ajira"} as Record<string,string>)[doc.document_type] || doc.document_type}</Text><Text style={mutedText}>{new Date(doc.created_at).toLocaleDateString()}</Text></View>
        <Pressable disabled={!!openingDocument} onPress={() => void openEmployeeDocument(doc)} style={actionButton}><Text style={{ color: "#75E0B8", fontSize: 10, fontWeight: "800" }}>{openingDocument === doc.id ? "Inafungua..." : "Fungua"}</Text></Pressable>
      </View>)}
    </View>}

    {owner && permissionTarget && <View style={panel}>
      <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "900" }}>Ruhusa za Meneja</Text>
      <Text style={[mutedText, { marginTop: 5 }]}>Meneja ••••{permissionTarget.user_id.slice(-6)}. Chagua kazi anazoweza kufanya. Ruhusa ambazo hazijachaguliwa zitabaki zimefungwa.</Text>
      {permissionOptions.map(item => <Pressable key={item.id} disabled={busy} onPress={() => togglePermission(item.id)} style={{ padding: 11, borderWidth: 1, borderColor: permissions.includes(item.id) ? "#10B981" : "#1E3A5F", backgroundColor: permissions.includes(item.id) ? "#12372F" : "#10223A", borderRadius: 12, marginTop: 8 }}>
        <Text style={{ color: "#FFFFFF", fontSize: 11, fontWeight: "900" }}>{permissions.includes(item.id) ? "✓ " : "○ "}{item.label}</Text><Text style={[mutedText, { marginTop: 3 }]}>{item.detail}</Text>
      </Pressable>)}
      <Pressable disabled={busy} onPress={() => void savePermissions()} style={{ backgroundColor: "#059669", borderRadius: 12, padding: 13, alignItems: "center", marginTop: 12 }}><Text style={{ color: "#FFFFFF", fontSize: 11, fontWeight: "900" }}>{busy ? "Inahifadhi..." : "Hifadhi ruhusa"}</Text></Pressable>
      <Pressable disabled={busy} onPress={() => setPermissionTarget(null)} style={[actionButton, { alignSelf: "flex-start", marginTop: 8 }]}><Text style={{ color: "#AFC0D0", fontSize: 10, fontWeight: "800" }}>Ghairi</Text></Pressable>
    </View>}

    <View style={{ backgroundColor: "#102D2C", borderColor: "#1D6B55", borderWidth: 1, borderRadius: 12, padding: 12 }}>
      <Text style={{ color: "#75E0B8", fontSize: 11, fontWeight: "900" }}>USALAMA WA BIASHARA</Text>
      <Text style={[mutedText, { marginTop: 5 }]}>Kuongeza, kubadilisha nafasi na kuondoa wanachama ni kazi za Boss pekee. Meneja anaweza kuona nyaraka ikiwa Boss amempa ruhusa; kila ufunguzi wa nyaraka huandikwa kwenye audit log.</Text>
    </View>
    <Text style={[mutedText, { textAlign: "center" }]}>{notice}</Text>
  </ScrollView>;
}

const s = StyleSheet.create({
  wrap:{paddingHorizontal:18,paddingTop:22,paddingBottom:52,maxWidth:980,width:"100%",alignSelf:"center"},
  title:{color:"#F4F7FA",fontSize:29,fontWeight:"900",letterSpacing:-0.7},
  heading:{color:"#FFF",fontSize:16,fontWeight:"800",marginTop:12,marginBottom:8},
  copy:{color:"#AFC0CD",fontSize:13,lineHeight:20,marginTop:6},
  panel:{backgroundColor:"#102438",borderColor:"#31516A",borderWidth:1,borderRadius:21,padding:18,marginTop:18},
  input:{backgroundColor:"#0B1B2A",borderWidth:1,borderColor:"#31516A",borderRadius:14,color:"#F4F7FA",padding:15,marginTop:10,fontSize:14},
  role:{padding:13,borderWidth:1,borderColor:"#29475D",borderRadius:13,marginTop:8,backgroundColor:"#0B1B2A"},
  selected:{borderColor:"#43C99A",backgroundColor:"#12372F"},
  roleTitle:{color:"#F4F7FA",fontWeight:"800",fontSize:13},
  button:{backgroundColor:"#16785C",padding:15,borderRadius:13,alignItems:"center",marginTop:13,borderWidth:1,borderColor:"#43C99A"},
  buttonText:{color:"#F5FFFA",fontWeight:"900"},
  member:{backgroundColor:"#102438",borderWidth:1,borderColor:"#31516A",padding:17,borderRadius:18,marginTop:11},
  actions:{flexDirection:"row",flexWrap:"wrap",gap:7,marginTop:10},
  small:{backgroundColor:"#173D36",paddingHorizontal:10,paddingVertical:8,borderRadius:8},
  remove:{backgroundColor:"#59332F"},
  inviteBox:{backgroundColor:"#0B1B2A",borderColor:"#286451",borderWidth:1,borderRadius:14,padding:13,marginTop:14},
  inviteLink:{color:"#75E0B8",fontSize:11,lineHeight:18,marginTop:6},
  smallText:{color:"#F4F7FA",fontSize:11,fontWeight:"800"},
  refresh:{alignSelf:"flex-start",padding:12,backgroundColor:"#173247",borderRadius:11,marginTop:13},
  notice:{color:"#75E0B8",backgroundColor:"#102D2C",padding:12,borderRadius:10,fontSize:12,lineHeight:18,marginTop:14},
  profileField:{paddingVertical:7,borderBottomWidth:1,borderBottomColor:"#29475D"},documentRow:{flexDirection:"row",alignItems:"center",gap:10,paddingVertical:9,borderBottomWidth:1,borderBottomColor:"#29475D"}
});
