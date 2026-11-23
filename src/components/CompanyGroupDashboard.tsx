import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { supabase } from "../lib/supabase";
import { formatTZS } from "../domain/money";

type GroupOption = { id: string; name: string; role: "group_owner" | "group_admin" | "group_viewer" };
type ShopMetric = { shop_id: string; shop_name: string; sales_count: number; sales_total: number; expenses_total: number };
type MemberOption = { user_id: string; role: "group_owner" | "group_admin" | "group_viewer" };

export default function CompanyGroupDashboard({ shopId, shopRole }: { shopId: string | null; shopRole: string | null }) {
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [rows, setRows] = useState<ShopMetric[]>([]);
  const [groupName, setGroupName] = useState("");
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [memberUserId, setMemberUserId] = useState("");
  const [memberRole, setMemberRole] = useState<"group_admin" | "group_viewer">("group_viewer");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("Ripoti za kundi zinaonyesha jumla za biashara zilizounganishwa tu.");

  const loadGroups = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from("company_group_members")
      .select("group_id,role,company_groups(id,name)")
      .order("created_at", { ascending: true });
    if (error) { setNotice("Imeshindikana kupakia makundi: " + error.message); return; }
    const options = (data ?? []).flatMap((item: any) => item.company_groups
      ? [{ id: item.group_id, name: item.company_groups.name, role: item.role as GroupOption["role"] }]
      : []);
    setGroups(options);
    setSelectedGroupId(current => current && options.some(item => item.id === current) ? current : options[0]?.id ?? "");
  }, []);

  const loadMembers = useCallback(async (groupId: string) => {
    if (!supabase || !groupId) { setMembers([]); return; }
    const { data, error } = await supabase.from("company_group_members")
      .select("user_id,role").eq("group_id", groupId).order("created_at", { ascending: true });
    if (error) { setNotice("Imeshindikana kusoma wanachama: " + error.message); return; }
    setMembers((data ?? []) as MemberOption[]);
  }, []);

  async function addMember() {
    if (!supabase || !selectedGroupId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(memberUserId.trim())) {
      setNotice("Weka User ID halali ya akaunti ya GUNX.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("add_company_group_member", {
      p_group_id: selectedGroupId, p_user_id: memberUserId.trim(), p_role: memberRole
    });
    setBusy(false);
    if (error) { setNotice("Mwanachama hakuongezwa: " + error.message); return; }
    setMemberUserId("");
    await loadMembers(selectedGroupId);
    setNotice("Mwanachama ameongezwa kwenye kundi.");
  }

  async function removeMember(userId: string) {
    if (!supabase || !selectedGroupId) return;
    setBusy(true);
    const { error } = await supabase.rpc("remove_company_group_member", { p_group_id: selectedGroupId, p_user_id: userId });
    setBusy(false);
    if (error) { setNotice("Mwanachama hakuondolewa: " + error.message); return; }
    await loadMembers(selectedGroupId);
    setNotice("Mwanachama ameondolewa kwenye kundi.");
  }

  const loadOverview = useCallback(async (groupId: string) => {
    if (!supabase || !groupId) { setRows([]); return; }
    const { data, error } = await supabase.rpc("get_company_group_overview", {
      p_group_id: groupId,
      p_from: new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10),
      p_to: new Date().toISOString().slice(0, 10)
    });
    if (error) { setRows([]); setNotice("Ripoti haijapakiwa: " + error.message); return; }
    setRows((data ?? []) as ShopMetric[]);
    setNotice("Ripoti ya siku 30 imepakiwa kwa kundi uliloruhusiwa kuona.");
  }, []);

  useEffect(() => { void loadGroups(); }, [loadGroups]);
  useEffect(() => { void loadOverview(selectedGroupId); void loadMembers(selectedGroupId); }, [selectedGroupId, loadOverview, loadMembers]);

  async function createGroup() {
    if (!supabase || groupName.trim().length < 2) { setNotice("Jina la kundi liwe na angalau herufi 2."); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc("create_company_group", { p_name: groupName.trim() });
    setBusy(false);
    if (error) { setNotice("Kundi halikuundwa: " + error.message); return; }
    setGroupName("");
    await loadGroups();
    if (typeof data === "string") setSelectedGroupId(data);
    setNotice("Kundi limetengenezwa. Sasa unaweza kuunganisha biashara unayoimiliki.");
  }

  async function linkCurrentShop() {
    if (!supabase || !shopId || !selectedGroupId) return;
    setBusy(true);
    const { error } = await supabase.rpc("add_shop_to_company_group", { p_group_id: selectedGroupId, p_shop_id: shopId });
    setBusy(false);
    if (error) { setNotice("Biashara haijaunganishwa: " + error.message); return; }
    await loadOverview(selectedGroupId);
    setNotice("Biashara imeunganishwa kwenye kundi.");
  }

  const canManage = groups.some(group => group.id === selectedGroupId && (group.role === "group_owner" || group.role === "group_admin"));
  const totalSales = rows.reduce((sum, row) => sum + Number(row.sales_total || 0), 0);
  const totalExpenses = rows.reduce((sum, row) => sum + Number(row.expenses_total || 0), 0);
  const salesCount = rows.reduce((sum, row) => sum + Number(row.sales_count || 0), 0);

  return <View>
    <Text style={s.title}>Enterprise · Makundi ya Biashara</Text>
    <Text style={s.muted}>Tazama utendaji wa biashara zilizounganishwa kwenye kundi moja. Ruhusa za kundi hazitoi ufikiaji wa POS, stock au taarifa za kina za duka.</Text>
    {groups.map(group => <Pressable key={group.id} onPress={() => setSelectedGroupId(group.id)} style={[s.choice, selectedGroupId === group.id && s.selected]}>
      <Text style={s.choiceTitle}>{group.name}</Text><Text style={s.muted}>Nafasi: {group.role.replace("group_", "")}</Text>
    </Pressable>)}
    {groups.length === 0 && <Text style={s.muted}>Bado hujajiunga na kundi lolote. Tengeneza kundi jipya hapa chini.</Text>}
    <View style={s.panel}>
      <Text style={s.section}>Tengeneza kundi jipya</Text>
      <TextInput value={groupName} onChangeText={setGroupName} placeholder="Jina la kundi / kampuni mama" placeholderTextColor="#8194A5" style={s.input}/>
      <Pressable disabled={busy} onPress={createGroup} style={s.button}><Text style={s.buttonText}>{busy ? "Subiri..." : "Tengeneza kundi"}</Text></Pressable>
    </View>
    {!!selectedGroupId && canManage && shopRole === "owner" && <View style={s.panel}>
      <Text style={s.section}>Unganisha biashara ya sasa</Text>
      <Text style={s.muted}>Biashara itaongezwa tu ikiwa akaunti hii ni mmiliki wake na pia ina ruhusa ya kusimamia kundi.</Text>
      <Pressable disabled={busy || !shopId} onPress={linkCurrentShop} style={s.button}><Text style={s.buttonText}>{busy ? "Inaunganisha..." : "Ongeza biashara hii kwenye kundi"}</Text></Pressable>
    </View>}
    {!!selectedGroupId && <>
      <Text style={s.section}>Muhtasari wa siku 30</Text>
      <View style={s.metrics}>
        <View style={s.metric}><Text style={s.metricLabel}>MAUZO</Text><Text style={s.metricValue}>{formatTZS(totalSales)}</Text></View>
        <View style={s.metric}><Text style={s.metricLabel}>GHARAMA</Text><Text style={s.metricValue}>{formatTZS(totalExpenses)}</Text></View>
      </View>
      <View style={s.metric}><Text style={s.metricLabel}>IDADI YA MAUZO</Text><Text style={s.metricValue}>{salesCount}</Text></View>
      {rows.map(row => <View key={row.shop_id} style={s.panel}>
        <Text style={s.choiceTitle}>{row.shop_name}</Text>
        <Text style={s.muted}>{row.sales_count} mauzo · Mauzo {formatTZS(Number(row.sales_total))}</Text>
        <Text style={s.muted}>Gharama {formatTZS(Number(row.expenses_total))}</Text>
      </View>)}
      {rows.length === 0 && <Text style={s.muted}>Hakuna biashara iliyounganishwa kwenye kundi hili au hakuna data ya ripoti kwa kipindi hiki.</Text>}
    </>}
    <Text style={s.notice}>{notice}</Text>
  </View>;
}

const s = StyleSheet.create({
  title:{color:"#F4F7FA",fontSize:23,fontWeight:"900"},
  section:{color:"#F4F7FA",fontSize:16,fontWeight:"800",marginTop:14,marginBottom:8},
  muted:{color:"#91A4B5",fontSize:12,lineHeight:18,marginTop:4},
  choice:{backgroundColor:"#102438",borderColor:"#1D3A50",borderWidth:1,borderRadius:12,padding:13,marginTop:9},
  selected:{borderColor:"#43C99A",backgroundColor:"#12352F"},
  choiceTitle:{color:"#F4F7FA",fontSize:14,fontWeight:"800"},
  panel:{backgroundColor:"#102438",borderColor:"#1D3A50",borderWidth:1,borderRadius:13,padding:14,marginTop:13},
  input:{backgroundColor:"#0B1B2A",borderWidth:1,borderColor:"#2B4B61",borderRadius:9,color:"#F4F7FA",padding:12,marginTop:8},
  button:{backgroundColor:"#16785C",padding:13,borderRadius:10,alignItems:"center",marginTop:10},
  buttonText:{color:"#F5FFFA",fontWeight:"800",fontSize:12},
  metrics:{flexDirection:"row",gap:10,marginTop:10},
  metric:{flex:1,backgroundColor:"#102438",borderColor:"#1D3A50",borderWidth:1,borderRadius:12,padding:13,marginTop:10},
  metricLabel:{color:"#91A4B5",fontSize:9,fontWeight:"800"},
  metricValue:{color:"#F4F7FA",fontSize:16,fontWeight:"900",marginTop:8},
  notice:{color:"#75E0B8",backgroundColor:"#102D2C",padding:12,borderRadius:10,fontSize:12,marginTop:14},
  memberRow:{flexDirection:"row",alignItems:"center",paddingVertical:10,borderBottomWidth:1,borderBottomColor:"#1D3A50"},
  removeText:{color:"#F2A39A",fontSize:12,fontWeight:"800",padding:8}
});
