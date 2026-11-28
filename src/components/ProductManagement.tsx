import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "../lib/supabase";
import { formatTZS } from "../domain/money";
import type { Product } from "../domain/types";

type Props = { shopId: string | null; onProductsChanged: () => void; darkMode?: boolean };
type SelectedImage = { uri: string; mimeType?: string | null };
type ShopStaff = { user_id: string; role: string };

export default function ProductManagement({ shopId, onProductsChanged, darkMode = true }: Props) {
  const [items, setItems] = useState<Product[]>([]);
  const [members, setMembers] = useState<ShopStaff[]>([]);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState("piece");
  const [cost, setCost] = useState("");
  const [price, setPrice] = useState("");
  const [reorder, setReorder] = useState("0");
  const [editing, setEditing] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [canManage, setCanManage] = useState(false);
  const [canViewCost, setCanViewCost] = useState(false);

  async function load() {
    if (!supabase || !shopId) return;
    setBusy(true);
    const [{ data, error }, ownerResult, permissionResult, costPermissionResult, profitPermissionResult] = await Promise.all([
      supabase.rpc("get_shop_products", { p_shop_id: shopId }),
      supabase.rpc("has_shop_role", { p_shop_id: shopId, p_roles: ["owner"] }),
      supabase.rpc("has_shop_permission", { p_shop_id: shopId, p_permission: "products.manage" }),
      supabase.rpc("has_shop_permission", { p_shop_id: shopId, p_permission: "costs.view" }),
      supabase.rpc("has_shop_permission", { p_shop_id: shopId, p_permission: "reports.profit" }),
    ]);
    const isOwner = !ownerResult.error && ownerResult.data === true;
    setCanManage(isOwner || (!permissionResult.error && permissionResult.data === true));
    setCanViewCost(isOwner || (!costPermissionResult.error && costPermissionResult.data === true) || (!profitPermissionResult.error && profitPermissionResult.data === true));
    if (isOwner || (!permissionResult.error && permissionResult.data === true)) {
      const { data: staffRows } = await supabase.from("shop_members").select("user_id,role").eq("shop_id", shopId).in("role", ["manager", "cashier", "stockkeeper"]).order("role");
      setMembers((staffRows ?? []) as ShopStaff[]);
    } else {
      setMembers([]);
    }
    setBusy(false);
    if (error) { setMessage("Bidhaa hazijapakiwa: " + error.message); return; }
    setItems((data ?? []).map((p: any) => ({
      id: p.id, name: p.name, sku: p.sku ?? "", category: p.category ?? null, assignedStaffIds: Array.isArray(p.assigned_staff_ids) ? p.assigned_staff_ids : [], unit: p.unit,
      imageUrl: p.image_url ?? null,
      costPrice: Number(p.cost_price ?? 0), sellingPrice: Number(p.selling_price),
      stockQuantity: Number(p.stock_quantity), reorderLevel: Number(p.reorder_level), active: p.active
    })));
  }

  useEffect(() => { void load(); }, [shopId]);

  function reset() {
    setName(""); setSku(""); setCategory(""); setUnit("piece"); setCost(""); setPrice(""); setReorder("0");
    setEditing(null); setImageUrl(null); setSelectedImage(null);
  }

  function startEdit(p: Product) {
    setEditing(p.id); setName(p.name); setSku(p.sku); setCategory(p.category ?? ""); setUnit(p.unit);
    setCost(String(p.costPrice)); setPrice(String(p.sellingPrice)); setReorder(String(p.reorderLevel));
    setImageUrl(p.imageUrl ?? null); setSelectedImage(null);
    setMessage("Unahariri " + p.name + ". Stock hubadilishwa kupitia Pokea stock.");
  }

  async function chooseImage(source: "camera" | "gallery") {
    try {
      const permission = source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setMessage(source === "camera" ? "Ruhusu kamera kwenye mipangilio ya simu ili kupiga picha ya bidhaa." : "Ruhusu Gallery ili kuchagua picha ya bidhaa.");
        return;
      }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.78,
      };
      const result = source === "camera"
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setSelectedImage({ uri: asset.uri, mimeType: asset.mimeType });
      setMessage("Picha imechaguliwa. Ihakiki kisha hifadhi bidhaa.");
    } catch (error) {
      setMessage("Imeshindikana kufungua " + (source === "camera" ? "kamera" : "Gallery") + ": " + (error instanceof Error ? error.message : "Hitilafu"));
    }
  }

  async function uploadProductImage(productId: string) {
    if (!supabase || !shopId || !selectedImage) return;
    const { data: userResult, error: userError } = await supabase.auth.getUser();
    if (userError || !userResult.user) throw new Error("Akaunti haijathibitishwa. Ingia tena kisha ujaribu kupakia picha.");
    const mimeType = selectedImage.mimeType || "image/jpeg";
    if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
      throw new Error("Tumia picha ya JPG, PNG au WEBP.");
    }
    const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
    const response = await fetch(selectedImage.uri);
    if (!response.ok) throw new Error("Picha haikuweza kusomwa kutoka kwenye simu.");
    const blob = await response.blob();
    if (blob.size > 5 * 1024 * 1024) throw new Error("Picha imezidi 5 MB. Punguza ukubwa wake kisha ujaribu tena.");
    const path = shopId + "/" + userResult.user.id + "/products/" + productId + "." + extension;
    const { error: uploadError } = await supabase.storage.from("business-assets").upload(path, blob, {
      contentType: mimeType,
      cacheControl: "3600",
      upsert: true,
    });
    if (uploadError) throw uploadError;
    const publicUrl = supabase.storage.from("business-assets").getPublicUrl(path).data.publicUrl + "?v=" + Date.now();
    const { error: updateError } = await supabase.from("products")
      .update({ image_url: publicUrl }).eq("id", productId).eq("shop_id", shopId);
    if (updateError) throw updateError;
    setImageUrl(publicUrl);
  }

  async function save() {
    if (!supabase || !shopId) { setMessage("Ingia kwenye akaunti ya duka kwanza."); return; }
    const costValue = Number(cost), priceValue = Number(price), reorderValue = Number(reorder);
    if (name.trim().length < 2 || (canViewCost && (!Number.isFinite(costValue) || costValue < 0)) ||
        !Number.isFinite(priceValue) || priceValue < 0 ||
        !Number.isFinite(reorderValue) || reorderValue < 0 || !unit.trim()) {
      setMessage("Jaza jina, unit, gharama, bei ya kuuza na kiwango cha tahadhari kwa usahihi."); return;
    }
    setBusy(true); setMessage("");
    const payload: Record<string, unknown> = { name: name.trim(), sku: sku.trim() || null, category: category.trim() || null, unit: unit.trim(),
      selling_price: priceValue, reorder_level: reorderValue };
    if (canViewCost) payload.cost_price = costValue;
    const result = editing
      ? await supabase.from("products").update(payload).eq("id", editing).eq("shop_id", shopId)
      : await supabase.from("products").insert({ ...payload, shop_id: shopId, stock_quantity: 0 }).select("id").single();
    if (result.error) {
      setBusy(false); setMessage("Bidhaa haijahifadhiwa: " + result.error.message); return;
    }
    const productId = editing ?? (result.data as { id?: string } | null)?.id;
    if (!productId) {
      setBusy(false); setMessage("Bidhaa imehifadhiwa lakini kitambulisho chake hakikupatikana. Refresh kisha ujaribu tena."); return;
    }
    if (selectedImage) {
      try {
        await uploadProductImage(productId);
      } catch (error) {
        setBusy(false);
        setMessage("Taarifa za bidhaa zimehifadhiwa, lakini picha haikupakiwa: " + (error instanceof Error ? error.message : "Hitilafu"));
        await load(); onProductsChanged(); return;
      }
    }
    setBusy(false);
    setMessage(editing ? "Bidhaa na picha yake zimesasishwa." : "Bidhaa mpya imeongezwa. Stock inaanza sifuri.");
    reset(); await load(); onProductsChanged();
  }

  async function toggleStaffAssignment(product: Product, staffUserId: string) {
    if (!supabase || !shopId || !canManage) return;
    const current = product.assignedStaffIds ?? [];
    const next = current.includes(staffUserId)
      ? current.filter(id => id !== staffUserId)
      : [...current, staffUserId];
    setBusy(true);
    const { error } = await supabase.rpc("set_product_staff_assignments", {
      p_shop_id: shopId,
      p_product_id: product.id,
      p_staff_user_ids: next,
    });
    setBusy(false);
    if (error) {
      setMessage("Mgawo wa bidhaa haujahifadhiwa: " + error.message);
      return;
    }
    setMessage("Mgawo wa wafanyakazi wa " + product.name + " umesasishwa.");
    await load();
    onProductsChanged();
  }

  async function archive(p: Product) {
    if (!supabase || !shopId) return;
    setBusy(true);
    const { error } = await supabase.from("products").update({ active: false }).eq("id", p.id).eq("shop_id", shopId);
    setBusy(false);
    if (error) { setMessage("Bidhaa haijaondolewa: " + error.message); return; }
    setMessage(p.name + " imefichwa kwenye mauzo. Historia yake imehifadhiwa.");
    await load(); onProductsChanged();
  }

  async function restore(p: Product) {
    if (!supabase || !shopId) return;
    setBusy(true);
    const { error } = await supabase.from("products").update({ active: true }).eq("id", p.id).eq("shop_id", shopId);
    setBusy(false);
    if (error) { setMessage("Bidhaa haijarejeshwa: " + error.message); return; }
    setMessage(p.name + " imerejeshwa kwenye bidhaa zinazouzwa.");
    await load(); onProductsChanged();
  }

  return <ScrollView keyboardShouldPersistTaps="handled" style={{ backgroundColor: darkMode ? "#081522" : "#F8FAFC" }} contentContainerStyle={s.content}>
    <View style={s.intro}>
      <View style={s.introCopy}>
        <Text style={[s.eyebrow, !darkMode && { color: "#087A5A" }]}>GUNX CATALOGUE</Text>
        <Text style={[s.title, !darkMode && { color: "#142D42" }]}>Usimamizi wa bidhaa</Text>
        <Text style={[s.copy, !darkMode && { color: "#526477" }]}>Jenga katalogi safi yenye picha, bei na taarifa sahihi za kila bidhaa.</Text>
      </View>
      <View style={s.countBadge}><Text style={s.countValue}>{items.filter(p => p.active).length}</Text><Text style={s.countLabel}>ACTIVE</Text></View>
    </View>
    {canManage ? <View style={[s.panel, !darkMode && { backgroundColor: "#FFFFFF", borderColor: "#DCE5EC" }]}>
      <View style={s.sectionTop}>
        <View style={s.sectionMarker} />
        <Text style={[s.heading, !darkMode && { color: "#142D42" }]}>{editing ? "Hariri bidhaa" : "Ongeza bidhaa mpya"}</Text>
      </View>
      <Text style={[s.label, !darkMode && { color: "#526477" }]}>PICHA YA BIDHAA</Text>
      <View style={s.photoEditor}>
        <View style={s.photoPreview}>
          {selectedImage?.uri || imageUrl
            ? <Image source={{ uri: selectedImage?.uri ?? imageUrl! }} style={s.photoImage} resizeMode="cover" />
            : <View style={s.photoEmpty}><Text style={s.photoGlyph}>▣</Text><Text style={s.photoEmptyText}>NO PHOTO</Text></View>}
        </View>
        <View style={s.photoActions}>
          <Pressable disabled={busy} onPress={() => void chooseImage("camera")} style={s.photoButton}>
            <Text style={s.photoButtonIcon}>◎</Text><Text style={s.photoButtonText}>Piga picha</Text>
          </Pressable>
          <Pressable disabled={busy} onPress={() => void chooseImage("gallery")} style={s.photoButtonSecondary}>
            <Text style={s.photoButtonIcon}>▧</Text><Text style={s.photoButtonText}>Chagua Gallery</Text>
          </Pressable>
          <Text style={[s.photoHint, !darkMode && { color: "#64748B" }]}>JPG, PNG au WEBP · hadi 5 MB</Text>
        </View>
      </View>
      <Text style={[s.label, !darkMode && { color: "#526477" }]}>TAARIFA ZA BIDHAA</Text>
      <TextInput value={name} onChangeText={setName} placeholder="Jina la bidhaa" placeholderTextColor="#8194A5" style={[s.input, !darkMode && { backgroundColor: "#FFFFFF", borderColor: "#CBD5E1", color: "#142D42" }]}/>
      <TextInput value={sku} onChangeText={setSku} placeholder="SKU / Barcode (hiari)" placeholderTextColor="#8194A5" style={[s.input, !darkMode && { backgroundColor: "#FFFFFF", borderColor: "#CBD5E1", color: "#142D42" }]}/>
      <TextInput value={category} onChangeText={setCategory} placeholder="Kategoria (mf. Vinywaji, Chakula)" placeholderTextColor="#8194A5" style={[s.input, !darkMode && { backgroundColor: "#FFFFFF", borderColor: "#CBD5E1", color: "#142D42" }]}/>
      <TextInput value={unit} onChangeText={setUnit} placeholder="Unit (mf. piece, kg, lita)" placeholderTextColor="#8194A5" style={[s.input, !darkMode && { backgroundColor: "#FFFFFF", borderColor: "#CBD5E1", color: "#142D42" }]}/>
      {canViewCost && <TextInput value={cost} onChangeText={setCost} placeholder="Bei ya kununua (TZS)" keyboardType="decimal-pad" placeholderTextColor="#8194A5" style={[s.input, !darkMode && { backgroundColor: "#FFFFFF", borderColor: "#CBD5E1", color: "#142D42" }]}/>}
      <TextInput value={price} onChangeText={setPrice} placeholder="Bei ya kuuza (TZS)" keyboardType="decimal-pad" placeholderTextColor="#8194A5" style={[s.input, !darkMode && { backgroundColor: "#FFFFFF", borderColor: "#CBD5E1", color: "#142D42" }]}/>
      <TextInput value={reorder} onChangeText={setReorder} placeholder="Tahadhari ya stock" keyboardType="decimal-pad" placeholderTextColor="#8194A5" style={[s.input, !darkMode && { backgroundColor: "#FFFFFF", borderColor: "#CBD5E1", color: "#142D42" }]}/>
      <Pressable disabled={busy} onPress={save} style={[s.button, busy && { opacity: 0.6 }]}><Text style={s.buttonText}>{busy ? "Inahifadhi..." : editing ? "Hifadhi mabadiliko" : "＋  Ongeza bidhaa"}</Text></Pressable>
      {editing && <Pressable disabled={busy} onPress={reset} style={s.secondary}><Text style={s.secondaryText}>Ghairi uhariri</Text></Pressable>}
      {!!message && <Text style={s.message}>{message}</Text>}
    </View> : <Text style={[s.copy, !darkMode && { color: "#526477" }]}>Kubadilisha katalogi, picha, kuficha au kurejesha bidhaa kunaruhusiwa kwa Owner na Manager mwenye ruhusa ya products.manage.</Text>}
    {!!message && !canManage && <Text style={s.message}>{message}</Text>}
    <View style={s.row}><Text style={[s.heading, !darkMode && { color: "#142D42" }]}>Katalogi ya bidhaa ({items.filter(p => p.active).length})</Text><Pressable onPress={load}><Text style={[s.refresh, !darkMode && { color: "#087A5A" }]}>Refresh</Text></Pressable></View>
    {busy && <ActivityIndicator color="#43C99A"/>}
    {items.map(p => <View key={p.id} style={[s.item, !darkMode && { backgroundColor: "#FFFFFF", borderColor: "#DCE5EC" }]}>
      <View style={s.itemPhoto}>
        {p.imageUrl ? <Image source={{ uri: p.imageUrl }} style={s.itemPhotoImage} resizeMode="cover"/> : <Text style={s.itemPhotoPlaceholder}>▣</Text>}
      </View>
      <View style={s.itemDetails}>
        <Text style={[s.name, !darkMode && { color: "#142D42" }]}>{p.name} {!p.active ? "(Imefichwa)" : ""}</Text>
        <Text style={[s.copy, !darkMode && { color: "#526477" }]}>{p.sku || "Hakuna SKU"} · {p.category || "Bila kategoria"} · {p.unit} · Stock {p.stockQuantity}</Text>
        <Text style={[s.price, !darkMode && { color: "#8A6512" }]}>{canViewCost ? `Gharama ${formatTZS(p.costPrice)} · ` : ""}Bei {formatTZS(p.sellingPrice)}</Text>
        {canManage && members.length > 0 && <View style={{ marginTop: 9 }}>
          <Text style={[s.copy, !darkMode && { color: "#526477" }]}>Wapangiwe bidhaa hii:</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 5 }}>
            {members.map(member => {
              const selected = (p.assignedStaffIds ?? []).includes(member.user_id);
              return <Pressable key={member.user_id} disabled={busy} onPress={() => void toggleStaffAssignment(p, member.user_id)}
                style={{ paddingHorizontal: 9, paddingVertical: 7, borderRadius: 9, borderWidth: 1, borderColor: selected ? "#43C99A" : "#31516A", backgroundColor: selected ? "#173D36" : (darkMode ? "#0B1B2A" : "#F1F5F9") }}>
                <Text style={{ color: selected ? "#75E0B8" : (darkMode ? "#D9E4EC" : "#334155"), fontSize: 10, fontWeight: "800" }}>
                  {selected ? "✓ " : "+ "}{member.role === "manager" ? "Meneja" : member.role === "stockkeeper" ? "Storekeeper" : "Staff"} ••••{member.user_id.slice(-4)}
                </Text>
              </Pressable>;
            })}
          </View>
        </View>}
      </View>
      {canManage && <View style={s.actions}>
        {p.active ? <>
          <Pressable onPress={() => startEdit(p)} style={s.small}><Text style={s.buttonText}>Hariri</Text></Pressable>
          <Pressable onPress={() => archive(p)} style={s.small}><Text style={s.buttonText}>Ficha</Text></Pressable>
        </> : <Pressable onPress={() => restore(p)} style={s.small}><Text style={s.buttonText}>Rejesha</Text></Pressable>}
      </View>}
    </View>)}
    {!busy && items.length === 0 && <Text style={[s.copy, !darkMode && { color: "#526477" }]}>Bado hakuna bidhaa. Ongeza bidhaa ya kwanza hapo juu.</Text>}
  </ScrollView>;
}

const s = StyleSheet.create({
  content: { paddingBottom: 44, paddingTop: 4 },
  intro: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 6 },
  introCopy: { flex: 1 },
  eyebrow: { color: "#75E0B8", fontSize: 10, fontWeight: "900", letterSpacing: 1.8, marginBottom: 5 },
  title: { color: "#F4F7FA", fontSize: 29, fontWeight: "900", letterSpacing: -0.8 },
  copy: { color: "#AFC0CD", fontSize: 13, lineHeight: 20, marginTop: 6 },
  countBadge: { minWidth: 62, minHeight: 62, borderRadius: 17, backgroundColor: "#173D36", borderWidth: 1, borderColor: "#D7B56D", alignItems: "center", justifyContent: "center", padding: 7 },
  countValue: { color: "#F2D99F", fontSize: 22, fontWeight: "900" },
  countLabel: { color: "#75E0B8", fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  panel: { backgroundColor: "#102438", borderColor: "#31516A", borderWidth: 1, borderRadius: 21, padding: 18, marginTop: 17 },
  sectionTop: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 14 },
  sectionMarker: { width: 4, height: 21, borderRadius: 4, backgroundColor: "#D7B56D" },
  heading: { color: "#FFF", fontSize: 16, fontWeight: "900" },
  label: { color: "#91A4B5", fontSize: 9, fontWeight: "900", letterSpacing: 1.3, marginTop: 10, marginBottom: 8 },
  photoEditor: { flexDirection: "row", alignItems: "center", gap: 13, padding: 12, borderRadius: 15, backgroundColor: "#0B1B2A", borderWidth: 1, borderColor: "#29475D", marginBottom: 7 },
  photoPreview: { width: 104, height: 104, borderRadius: 13, overflow: "hidden", backgroundColor: "#173247", borderWidth: 1, borderColor: "#D7B56D" },
  photoImage: { width: "100%", height: "100%" },
  photoEmpty: { flex: 1, alignItems: "center", justifyContent: "center" },
  photoGlyph: { color: "#D7B56D", fontSize: 33, fontWeight: "900" },
  photoEmptyText: { color: "#91A4B5", fontSize: 8, fontWeight: "900", letterSpacing: 1.2, marginTop: 3 },
  photoActions: { flex: 1, gap: 7 },
  photoButton: { backgroundColor: "#16785C", borderRadius: 10, paddingHorizontal: 11, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  photoButtonSecondary: { backgroundColor: "#173247", borderWidth: 1, borderColor: "#D7B56D", borderRadius: 10, paddingHorizontal: 11, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  photoButtonIcon: { color: "#F2D99F", fontSize: 16, fontWeight: "900" },
  photoButtonText: { color: "#F4F7FA", fontSize: 11, fontWeight: "900" },
  photoHint: { color: "#91A4B5", fontSize: 9, lineHeight: 13 },
  input: { backgroundColor: "#0B1B2A", borderColor: "#31516A", borderWidth: 1, borderRadius: 14, color: "#F4F7FA", paddingHorizontal: 15, paddingVertical: 15, marginTop: 10, fontSize: 14 },
  button: { backgroundColor: "#16785C", padding: 15, borderRadius: 13, alignItems: "center", marginTop: 13, borderWidth: 1, borderColor: "#43C99A" },
  secondary: { backgroundColor: "#173247", padding: 12, borderRadius: 11, alignItems: "center", marginTop: 8 },
  buttonText: { color: "#F5FFFA", fontWeight: "900", fontSize: 11 },
  secondaryText: { color: "#F4F7FA", fontWeight: "800", fontSize: 11 },
  message: { color: "#75E0B8", fontSize: 11, marginTop: 10, lineHeight: 17 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 19, marginBottom: 3 },
  refresh: { color: "#75E0B8", fontWeight: "900", fontSize: 11 },
  item: { backgroundColor: "#102438", borderColor: "#31516A", borderWidth: 1, borderRadius: 18, padding: 13, marginTop: 11, flexDirection: "row", alignItems: "center", gap: 12 },
  itemPhoto: { width: 60, height: 60, borderRadius: 11, overflow: "hidden", backgroundColor: "#173247", borderWidth: 1, borderColor: "#29475D", alignItems: "center", justifyContent: "center" },
  itemPhotoImage: { width: "100%", height: "100%" },
  itemPhotoPlaceholder: { color: "#D7B56D", fontSize: 24 },
  itemDetails: { flex: 1, minWidth: 0 },
  name: { color: "#F4F7FA", fontWeight: "900", fontSize: 13 },
  price: { color: "#D7B56D", fontSize: 10, marginTop: 5, fontWeight: "800" },
  actions: { gap: 6 },
  small: { backgroundColor: "#173D36", paddingHorizontal: 11, paddingVertical: 9, borderRadius: 9, borderWidth: 1, borderColor: "#28634F" },
});
