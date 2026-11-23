import React, { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { supabase } from "../lib/supabase";
import { formatTZS } from "../domain/money";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";

type GroupOption = { id: string; name: string; role: "group_owner" | "group_admin" | "group_viewer" };
type BranchMetric = { shop_id: string; shop_name: string; branch_id: string; branch_name: string; sales_count: number; sales_total: number; expenses_total: number; net_after_expenses: number; debt_outstanding: number; stock_units: number; stock_value: number; low_stock_products: number };
type MemberOption = { user_id: string; role: "group_owner" | "group_admin" | "group_viewer" };

function dateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

export default function CompanyGroupDashboard({ shopId, shopRole }: { shopId: string | null; shopRole: string | null }) {
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [rows, setRows] = useState<BranchMetric[]>([]);
  const [toDate, setToDate] = useState(() => dateInputValue(new Date()));
  const [fromDate, setFromDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 29);
    return dateInputValue(date);
  });
  const [appliedToDate, setAppliedToDate] = useState(() => dateInputValue(new Date()));
  const [appliedFromDate, setAppliedFromDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 29);
    return dateInputValue(date);
  });
  const [groupName, setGroupName] = useState("");
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [memberUserId, setMemberUserId] = useState("");
  const [memberRole, setMemberRole] = useState<"group_admin" | "group_viewer">("group_viewer");
  const [busy, setBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
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
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const fromTime = Date.parse(appliedFromDate + "T00:00:00Z");
    const toTime = Date.parse(appliedToDate + "T00:00:00Z");
    const dayCount = (toTime - fromTime) / 86400000;
    if (!datePattern.test(appliedFromDate) || !datePattern.test(appliedToDate) ||
        !Number.isFinite(dayCount) || dayCount < 0 || dayCount > 366 ||
        new Date(fromTime).toISOString().slice(0, 10) !== appliedFromDate ||
        new Date(toTime).toISOString().slice(0, 10) !== appliedToDate) {
      setRows([]);
      setNotice("Weka tarehe sahihi. Kipindi cha ripoti kisiwe zaidi ya siku 367.");
      return;
    }
    const { data, error } = await supabase.rpc("get_company_group_enterprise_overview", {
      p_group_id: groupId, p_from: appliedFromDate, p_to: appliedToDate
    });
    if (error) { setRows([]); setNotice("Ripoti haijapakiwa: " + error.message); return; }
    setRows((data ?? []) as BranchMetric[]);
    setNotice("Ripoti ya " + appliedFromDate + " hadi " + appliedToDate + " imepakiwa. Madeni na stock ni salio la sasa.");
  }, [appliedFromDate, appliedToDate]);

  useEffect(() => { void loadGroups(); }, [loadGroups]);
  useEffect(() => {
    void loadOverview(selectedGroupId);
    const role = groups.find(group => group.id === selectedGroupId)?.role;
    if (role === "group_owner" || role === "group_admin") void loadMembers(selectedGroupId);
    else setMembers([]);
  }, [selectedGroupId, groups, loadOverview, loadMembers]);

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

  const selectedGroupName = groups.find(group => group.id === selectedGroupId)?.name ?? "GUNX Company Group";
  const exportRows = rows.map(row => ({
    shop: row.shop_name, branch: row.branch_name,
    salesCount: Number(row.sales_count || 0), sales: Number(row.sales_total || 0),
    expenses: Number(row.expenses_total || 0), net: Number(row.net_after_expenses || 0),
    debt: Number(row.debt_outstanding || 0), stockUnits: Number(row.stock_units || 0),
    stockValue: Number(row.stock_value || 0), lowStock: Number(row.low_stock_products || 0)
  }));
  const csvCell = (value: string | number) => '"' + String(value).replace(/"/g, '""') + '"';
  async function exportCsv() {
    if (Platform.OS === "web") { setNotice("CSV export na kushiriki faili vinapatikana kwenye app ya Android/iOS kwa sasa."); return; }
    if (!rows.length) { setNotice("Hakuna data ya kundi hili ya ku-export."); return; }
    setExportBusy(true);
    try {
      const header = ["Biashara", "Tawi", "Idadi ya mauzo", "Mauzo TZS", "Gharama TZS", "Mauzo pungufu gharama TZS", "Deni linalobaki TZS", "Stock units", "Thamani ya stock TZS", "Bidhaa chini ya reorder"];
      const lines = [header, ...exportRows.map(row => [row.shop,row.branch,row.salesCount,row.sales,row.expenses,row.net,row.debt,row.stockUnits,row.stockValue,row.lowStock])]
        .map(line => line.map(csvCell).join(",")).join("\r\n");
      const summary = ["KUNDI", selectedGroupName, "KUANZIA", appliedFromDate, "HADI", appliedToDate].map(csvCell).join(",");
      const uri = FileSystem.cacheDirectory + "gunx-group-report-" + appliedFromDate + "-" + appliedToDate + ".csv";
      await FileSystem.writeAsStringAsync(uri, "\uFEFF" + summary + "\r\n" + lines, { encoding: FileSystem.EncodingType.UTF8 });
      await Sharing.shareAsync(uri, { mimeType: "text/csv", dialogTitle: "Shiriki ripoti ya GUNX" });
      setNotice("Ripoti ya CSV imetengenezwa na kufunguliwa kwa ajili ya kushiriki.");
    } catch (error) {
      setNotice("CSV haikutengenezwa: " + (error instanceof Error ? error.message : String(error)));
    } finally { setExportBusy(false); }
  }
  async function exportPdf() {
    if (!rows.length) { setNotice("Hakuna data ya kundi hili ya ku-export."); return; }
    setExportBusy(true);
    try {
      const safe = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      const body = exportRows.map(row => `<tr><td>${safe(row.shop)}</td><td>${safe(row.branch)}</td><td>${row.salesCount}</td><td>${formatTZS(row.sales)}</td><td>${formatTZS(row.expenses)}</td><td>${formatTZS(row.debt)}</td><td>${row.stockUnits}</td><td>${formatTZS(row.stockValue)}</td><td>${row.lowStock}</td></tr>`).join("");
      const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;color:#102438;padding:24px}h1{color:#0B2940;font-size:22px}p{color:#456}table{width:100%;border-collapse:collapse;font-size:9px;margin-top:20px}th{background:#0B2940;color:white}th,td{padding:8px;border:1px solid #ccd5dc;text-align:left}tr:nth-child(even){background:#f2f6f8}.note{margin-top:18px;font-size:10px;color:#456}</style></head><body><h1>GUNX SMART BUSINESS</h1><h2>${safe(selectedGroupName)} — Ripoti ya matawi</h2><p>Kipindi: ${safe(appliedFromDate)} hadi ${safe(appliedToDate)} · Sarafu: TZS</p><table><thead><tr><th>Biashara</th><th>Tawi</th><th>Mauzo</th><th>Mauzo TZS</th><th>Gharama TZS</th><th>Deni sasa TZS</th><th>Stock units</th><th>Thamani stock TZS</th><th>Low stock</th></tr></thead><tbody>${body}</tbody></table><p class="note">Mauzo na gharama ni za kipindi kilichochaguliwa. Madeni na stock ni salio la sasa. “Mauzo pungufu gharama” si faida ya kihasibu.</p></body></html>`;
      if (Platform.OS === "web") {
        await Print.printAsync({ html });
        setNotice("Ripoti imefunguliwa kwenye dirisha la uchapishaji la kivinjari.");
      } else {
        const file = await Print.printToFileAsync({ html, width: 842, height: 595 });
        await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", dialogTitle: "Shiriki ripoti ya GUNX PDF" });
        setNotice("PDF ya ripoti imetengenezwa na kufunguliwa kwa ajili ya kushiriki.");
      }
    } catch (error) {
      setNotice("PDF haikutengenezwa: " + (error instanceof Error ? error.message : String(error)));
    } finally { setExportBusy(false); }
  }

  const canManage = groups.some(group => group.id === selectedGroupId && (group.role === "group_owner" || group.role === "group_admin"));
  const totalSales = rows.reduce((sum, row) => sum + Number(row.sales_total || 0), 0);
  const totalExpenses = rows.reduce((sum, row) => sum + Number(row.expenses_total || 0), 0);
  const salesCount = rows.reduce((sum, row) => sum + Number(row.sales_count || 0), 0);
  const totalDebt = rows.reduce((sum, row) => sum + Number(row.debt_outstanding || 0), 0);
  const totalStockValue = rows.reduce((sum, row) => sum + Number(row.stock_value || 0), 0);
  const totalStockUnits = rows.reduce((sum, row) => sum + Number(row.stock_units || 0), 0);
  const lowStockCount = rows.reduce((sum, row) => sum + Number(row.low_stock_products || 0), 0);

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
      <Text style={s.section}>Kipindi cha ripoti</Text>
      <View style={s.metrics}>
        <View style={{flex:1}}>
          <Text style={s.muted}>Kuanzia (YYYY-MM-DD)</Text>
          <TextInput value={fromDate} onChangeText={setFromDate} placeholder="2026-11-01" placeholderTextColor="#8194A5" style={s.input}/>
        </View>
        <View style={{flex:1}}>
          <Text style={s.muted}>Mpaka (YYYY-MM-DD)</Text>
          <TextInput value={toDate} onChangeText={setToDate} placeholder="2026-11-24" placeholderTextColor="#8194A5" style={s.input}/>
        </View>
      </View>
      <Pressable disabled={busy} onPress={() => { setAppliedFromDate(fromDate); setAppliedToDate(toDate); }} style={s.button}>
        <Text style={s.buttonText}>Tengeneza ripoti kwa tarehe hizi</Text>
      </Pressable>
      <View style={s.metrics}>
        <Pressable disabled={exportBusy || rows.length === 0} onPress={() => void exportCsv()} style={[s.button,{flex:1,opacity:exportBusy || rows.length===0?0.5:1}]}>
          <Text style={s.buttonText}>{exportBusy ? "Inatengeneza..." : "Pakua / Shiriki CSV"}</Text>
        </Pressable>
        <Pressable disabled={exportBusy || rows.length === 0} onPress={() => void exportPdf()} style={[s.button,{flex:1,opacity:exportBusy || rows.length===0?0.5:1}]}>
          <Text style={s.buttonText}>Pakua / Shiriki PDF</Text>
        </Pressable>
      </View>
      <Text style={s.section}>Muhtasari wa mauzo na gharama</Text>
      <View style={s.metrics}>
        <View style={s.metric}><Text style={s.metricLabel}>MAUZO · {appliedFromDate} → {appliedToDate}</Text><Text style={s.metricValue}>{formatTZS(totalSales)}</Text></View>
        <View style={s.metric}><Text style={s.metricLabel}>GHARAMA · {appliedFromDate} → {appliedToDate}</Text><Text style={s.metricValue}>{formatTZS(totalExpenses)}</Text></View>
      </View>
      <View style={s.metrics}>
        <View style={s.metric}><Text style={s.metricLabel}>MADENI YANAYODAIWA SASA</Text><Text style={s.metricValue}>{formatTZS(totalDebt)}</Text></View>
        <View style={s.metric}><Text style={s.metricLabel}>THAMANI YA STOCK (KWA COST)</Text><Text style={s.metricValue}>{formatTZS(totalStockValue)}</Text></View>
      </View>
      <View style={s.metrics}>
        <View style={s.metric}><Text style={s.metricLabel}>IDADI YA MAUZO</Text><Text style={s.metricValue}>{salesCount.toLocaleString("en-US")}</Text></View>
        <View style={s.metric}><Text style={s.metricLabel}>UNITS ZA STOCK</Text><Text style={s.metricValue}>{totalStockUnits.toLocaleString("en-US")}</Text></View>
      </View>
      <Text style={s.muted}>Bidhaa zilizo chini ya kiwango cha reorder: {lowStockCount}. Mauzo na gharama ni za kipindi kilichochaguliwa; madeni na stock ni hali ya sasa.</Text>
      <Text style={s.section}>Utendaji wa kila tawi</Text>
      {rows.map(row => <View key={row.branch_id} style={s.panel}>
        <Text style={s.choiceTitle}>{row.shop_name} · {row.branch_name}</Text>
        <Text style={s.muted}>{Number(row.sales_count).toLocaleString("en-US")} mauzo · Mauzo {formatTZS(Number(row.sales_total))}</Text>
        <Text style={s.muted}>Gharama {formatTZS(Number(row.expenses_total))} · Mauzo pungufu gharama {formatTZS(Number(row.net_after_expenses))}</Text>
        <Text style={s.muted}>Madeni yaliyobaki {formatTZS(Number(row.debt_outstanding))}</Text>
        <Text style={s.muted}>Stock {Number(row.stock_units).toLocaleString("en-US")} units · Thamani {formatTZS(Number(row.stock_value))}</Text>
        <Text style={s.muted}>Bidhaa chini ya reorder: {Number(row.low_stock_products).toLocaleString("en-US")}</Text>
      </View>)}
      {rows.length === 0 && <Text style={s.muted}>Hakuna biashara iliyounganishwa kwenye kundi hili au hakuna data ya ripoti kwa kipindi hiki.</Text>}
      {canManage && <View style={s.panel}>
        <Text style={s.section}>Usimamizi wa wanachama</Text>
        <Text style={s.muted}>Ongeza akaunti kwa kutumia User ID yake. Admin anaweza kuongeza viewer pekee; group owner ndiye anayeweza kuteua admin.</Text>
        <TextInput value={memberUserId} onChangeText={setMemberUserId} autoCapitalize="none" placeholder="User ID (UUID) ya mwanachama" placeholderTextColor="#8194A5" style={s.input}/>
        <View style={s.roleChoices}>
          <Pressable onPress={() => setMemberRole("group_viewer")} style={[s.roleChoice, memberRole === "group_viewer" && s.roleSelected]}><Text style={s.roleText}>Viewer</Text></Pressable>
          {groups.some(group => group.id === selectedGroupId && group.role === "group_owner") && <Pressable onPress={() => setMemberRole("group_admin")} style={[s.roleChoice, memberRole === "group_admin" && s.roleSelected]}><Text style={s.roleText}>Admin</Text></Pressable>}
        </View>
        <Pressable disabled={busy} onPress={addMember} style={s.button}><Text style={s.buttonText}>{busy ? "Subiri..." : "Ongeza mwanachama"}</Text></Pressable>
        {members.map(member => <View key={member.user_id} style={s.memberRow}>
          <View style={{flex:1}}><Text style={s.choiceTitle}>{member.user_id}</Text><Text style={s.muted}>Nafasi: {member.role.replace("group_", "")}</Text></View>
          {member.role !== "group_owner" && (groups.some(group => group.id === selectedGroupId && group.role === "group_owner") || member.role === "group_viewer") && <Pressable disabled={busy} onPress={() => void removeMember(member.user_id)}><Text style={s.removeText}>Ondoa</Text></Pressable>}
        </View>)}
      </View>}
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
  roleChoices:{flexDirection:"row",gap:8,marginTop:10},
  roleChoice:{paddingHorizontal:14,paddingVertical:9,borderRadius:9,backgroundColor:"#0B1B2A",borderWidth:1,borderColor:"#2B4B61"},
  roleSelected:{borderColor:"#43C99A",backgroundColor:"#174A40"},
  roleText:{color:"#F4F7FA",fontSize:12,fontWeight:"700"},
  removeText:{color:"#F2A39A",fontSize:12,fontWeight:"800",padding:8}
});
