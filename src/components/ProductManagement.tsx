import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "../lib/supabase";
import { formatTZS } from "../domain/money";
import type { Product } from "../domain/types";

type Props = { shopId: string | null; onProductsChanged: () => void };
type ProductRow = Product & { imageUrl?: string | null };
type PendingPhoto = { uri: string; mimeType: string; fileName?: string };

export default function ProductManagement({ shopId, onProductsChanged }: Props) {
  const [items, setItems] = useState<ProductRow[]>([]);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [unit, setUnit] = useState("piece");
  const [cost, setCost] = useState("");
  const [price, setPrice] = useState("");
  const [reorder, setReorder] = useState("0");
  const [editing, setEditing] = useState<string | null>(null);
  const [photo, setPhoto] = useState<PendingPhoto | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [canManage, setCanManage] = useState(false);

  async function load() {
    if (!supabase || !shopId) return;
    setBusy(true);
    const client = supabase;
    const [{ data, error }, roleResult, photoResult] = await Promise.all([
      client.rpc("get_shop_products", { p_shop_id: shopId }),
      client.rpc("has_shop_role", { p_shop_id: shopId, p_roles: ["owner", "manager"] }),
      client.from("products").select("id,image_url").eq("shop_id", shopId),
    ]);
    setCanManage(!roleResult.error && roleResult.data === true);
    setBusy(false);
    if (error) { setMessage("Bidhaa hazijapakiwa: " + error.message); return; }
    const photos = new Map((photoResult.data ?? []).map((row: any) => [row.id, row.image_url]));
    setItems((data ?? []).map((p: any) => ({
      id: p.id, name: p.name, sku: p.sku ?? "", unit: p.unit,
      costPrice: Number(p.cost_price), sellingPrice: Number(p.selling_price),
      stockQuantity: Number(p.stock_quantity), reorderLevel: Number(p.reorder_level),
      active: p.active, imageUrl: photos.get(p.id) ?? null
    })));
  }

  useEffect(() => { void load(); }, [shopId]);

  function reset() {
    setName(""); setSku(""); setUnit("piece"); setCost(""); setPrice("");
    setReorder("0"); setEditing(null); setPhoto(null);
  }

  function startEdit(p: ProductRow) {
    setEditing(p.id); setName(p.name); setSku(p.sku); setUnit(p.unit);
    setCost(String(p.costPrice)); setPrice(String(p.sellingPrice)); setReorder(String(p.reorderLevel));
    setPhoto(null);
    setMessage("Unahariri " + p.name + ". Picha mpya itawekwa ukihifadhi.");
  }

  async function choosePhoto(source: "camera" | "gallery") {
    if (source === "camera") {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) { setMessage("Ruhusu kamera kwenye mipangilio ya simu ili kupiga picha ya bidhaa."); return; }
    } else {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { setMessage("Ruhusu Gallery/Photos ili kuchagua picha ya bidhaa."); return; }
    }
    const result = source === "camera"
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1,1], quality: 0.75 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1,1], quality: 0.75 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const mimeType = asset.mimeType || "image/jpeg";
    if (!["image/jpeg","image/png","image/webp"].includes(mimeType)) {
      setMessage("Tumia picha ya JPG, PNG au WEBP pekee."); return;
    }
    setPhoto({ uri: asset.uri, mimeType, fileName: asset.fileName ?? undefined });
    setMessage("Picha imechaguliwa. Bonyeza Hifadhi ili kui-upload pamoja na bidhaa.");
  }

  async function uploadPhoto(productId: string) {
    if (!supabase || !shopId || !photo) return null;
    const extension = photo.mimeType === "image/png" ? "png" : photo.mimeType === "image/webp" ? "webp" : "jpg";
    const path = shopId + "/" + productId + "/" + Date.now() + "." + extension;
    const response = await fetch(photo.uri);
    const blob = await response.blob();
    const { error: uploadError } = await supabase.storage.from("product-images").upload(path, blob, {
      contentType: photo.mimeType, upsert: true, cacheControl: "3600"
    });
    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from("product-images").getPublicUrl(path);
    const { error: updateError } = await supabase.from("products").update({ image_url: data.publicUrl }).eq("id", productId).eq("shop_id", shopId);
    if (updateError) throw updateError;
    return data.publicUrl;
  }

  async function save() {
    if (!supabase || !shopId) { setMessage("Ingia kwenye akaunti ya duka kwanza."); return; }
    const costValue = Number(cost), priceValue = Number(price), reorderValue = Number(reorder);
    if (name.trim().length < 2 || !Number.isFinite(costValue) || costValue < 0 ||
        !Number.isFinite(priceValue) || priceValue < 0 ||
        !Number.isFinite(reorderValue) || reorderValue < 0 || !unit.trim()) {
      setMessage("Jaza jina, unit, gharama, bei ya kuuza na kiwango cha tahadhari kwa usahihi."); return;
    }
    setBusy(true); setMessage("");
    const payload = { name: name.trim(), sku: sku.trim() || null, unit: unit.trim(),
      cost_price: costValue, selling_price: priceValue, reorder_level: reorderValue };
    const result = editing
      ? await supabase.from("products").update(payload).eq("id", editing).eq("shop_id", shopId).select("id").single()
      : await supabase.from("products").insert({ ...payload, shop_id: shopId, stock_quantity: 0 }).select("id").single();
    if (result.error || !result.data) {
      setBusy(false); setMessage("Bidhaa haijahifadhiwa: " + (result.error?.message ?? "Hakuna ID ya bidhaa.")); return;
    }
    try {
      if (photo) await uploadPhoto(result.data.id);
      setMessage(photo ? "Bidhaa na picha yake vimehifadhiwa kikamilifu." : editing ? "Taarifa za bidhaa zimesasishwa." : "Bidhaa mpya imeongezwa. Stock inaanza sifuri.");
      reset(); await load(); onProductsChanged();
    } catch (error) {
      setMessage("Bidhaa imehifadhiwa, lakini picha haiku-upload: " + (error instanceof Error ? error.message : "Hitilafu ya upload") + ". Chagua picha tena kisha hifadhi.");
      await load();
    } finally { setBusy(false); }
  }

  async function archive(p: ProductRow) {
    if (!supabase || !shopId) return;
    setBusy(true);
    const { error } = await supabase.from("products").update({ active: false }).eq("id", p.id).eq("shop_id", shopId);
    setBusy(false);
    if (error) { setMessage("Bidhaa haijaondolewa: " + error.message); return; }
    setMessage(p.name + " imefichwa kwenye mauzo. Historia yake imehifadhiwa.");
    await load(); onProductsChanged();
  }

  async function restore(p: ProductRow) {
    if (!supabase || !shopId) return;
    setBusy(true);
    const { error } = await supabase.from("products").update({ active: true }).eq("id", p.id).eq("shop_id", shopId);
    setBusy(false);
    if (error) { setMessage("Bidhaa haijarejeshwa: " + error.message); return; }
    setMessage(p.name + " imerejeshwa kwenye bidhaa zinazouzwa.");
    await load(); onProductsChanged();
  }

  return <ScrollView keyboardShouldPersistTaps="handled">
    <Text style={s.title}>Usimamizi wa bidhaa</Text>
    <Text style={s.copy}>Ongeza bidhaa, piga picha kwa kamera au chagua Gallery, kisha upload picha pamoja na taarifa za bidhaa. Stock inaongezwa kupitia Pokea stock.</Text>
    {canManage ? <View style={s.panel}>
      <Text style={s.heading}>{editing ? "Hariri bidhaa" : "Ongeza bidhaa mpya"}</Text>
      <View style={s.photoBox}>
        {photo ? <Image source={{uri:photo.uri}} style={s.preview}/> : editing && items.find(p=>p.id===editing)?.imageUrl ? <Image source={{uri:items.find(p=>p.id===editing)?.imageUrl ?? undefined}} style={s.preview}/> : <View style={s.emptyPhoto}><Text style={s.photoIcon}>＋</Text><Text style={s.copy}>Hakuna picha iliyochaguliwa</Text></View>}
        <View style={s.photoActions}>
          <Pressable disabled={busy} onPress={()=>void choosePhoto("camera")} style={s.photoButton}><Text style={s.buttonText}>Piga picha</Text></Pressable>
          <Pressable disabled={busy} onPress={()=>void choosePhoto("gallery")} style={s.secondary}><Text style={s.buttonText}>Upload kutoka Gallery</Text></Pressable>
          {!!photo && <Pressable onPress={()=>setPhoto(null)}><Text style={s.removePhoto}>Ondoa picha mpya</Text></Pressable>}
        </View>
      </View>
      <TextInput value={name} onChangeText={setName} placeholder="Jina la bidhaa" placeholderTextColor="#8194A5" style={s.input}/>
      <TextInput value={sku} onChangeText={setSku} placeholder="SKU / Barcode (hiari)" placeholderTextColor="#8194A5" style={s.input}/>
      <TextInput value={unit} onChangeText={setUnit} placeholder="Unit (mf. piece, kg, lita)" placeholderTextColor="#8194A5" style={s.input}/>
      <TextInput value={cost} onChangeText={setCost} placeholder="Bei ya kununua (TZS)" keyboardType="decimal-pad" placeholderTextColor="#8194A5" style={s.input}/>
      <TextInput value={price} onChangeText={setPrice} placeholder="Bei ya kuuza (TZS)" keyboardType="decimal-pad" placeholderTextColor="#8194A5" style={s.input}/>
      <TextInput value={reorder} onChangeText={setReorder} placeholder="Tahadhari ya stock" keyboardType="decimal-pad" placeholderTextColor="#8194A5" style={s.input}/>
      <Pressable disabled={busy} onPress={()=>void save()} style={s.button}><Text style={s.buttonText}>{busy ? "Inahifadhi / ina-upload..." : editing ? "Hifadhi mabadiliko" : "Ongeza bidhaa"}</Text></Pressable>
      {editing && <Pressable onPress={reset} style={s.secondary}><Text style={s.buttonText}>Ghairi uhariri</Text></Pressable>}
      {!!message && <Text style={s.message}>{message}</Text>}
    </View> : <Text style={s.copy}>Kubadilisha katalogi, kupiga picha, upload, kuficha au kurejesha bidhaa kunaruhusiwa kwa Owner na Manager pekee.</Text>}
    {!!message && !canManage && <Text style={s.message}>{message}</Text>}
    <View style={s.row}><Text style={s.heading}>Bidhaa zilizopo ({items.filter(p => p.active).length})</Text><Pressable onPress={()=>void load()}><Text style={s.refresh}>Refresh</Text></Pressable></View>
    {busy && <ActivityIndicator color="#43C99A"/>}
    {items.map(p => <View key={p.id} style={s.item}>
      {p.imageUrl ? <Image source={{uri:p.imageUrl}} style={s.thumb}/> : <View style={s.thumbEmpty}><Text style={s.copy}>IMG</Text></View>}
      <View style={{flex:1}}>
        <Text style={s.name}>{p.name} {!p.active ? "(Imefichwa)" : ""}</Text>
        <Text style={s.copy}>{p.sku || "Hakuna SKU"} · {p.unit} · Stock {p.stockQuantity}</Text>
        <Text style={s.price}>{canManage ? "Gharama " + formatTZS(p.costPrice) + " · " : ""}Bei {formatTZS(p.sellingPrice)}</Text>
      </View>
      {canManage && <View style={s.actions}>
        {p.active ? <><Pressable onPress={() => startEdit(p)} style={s.small}><Text style={s.buttonText}>Hariri</Text></Pressable><Pressable onPress={() => void archive(p)} style={s.small}><Text style={s.buttonText}>Ficha</Text></Pressable></> : <Pressable onPress={() => void restore(p)} style={s.small}><Text style={s.buttonText}>Rejesha</Text></Pressable>}
      </View>}
    </View>)}
    {!busy && items.length === 0 && <Text style={s.copy}>Bado hakuna bidhaa. Ongeza bidhaa ya kwanza hapo juu.</Text>}
  </ScrollView>;
}

const s = StyleSheet.create({
  title:{color:"#F4F7FA",fontSize:23,fontWeight:"900"},copy:{color:"#91A4B5",fontSize:12,lineHeight:18,marginTop:6},
  panel:{backgroundColor:"#102438",borderColor:"#1D3A50",borderWidth:1,borderRadius:14,padding:14,marginTop:14},
  heading:{color:"#FFF",fontSize:16,fontWeight:"800"},input:{backgroundColor:"#0B1B2A",borderColor:"#2B4B61",borderWidth:1,borderRadius:9,color:"#F4F7FA",padding:12,marginTop:9,fontSize:13},
  button:{backgroundColor:"#16785C",padding:13,borderRadius:10,alignItems:"center",marginTop:12},secondary:{backgroundColor:"#173247",padding:11,borderRadius:9,alignItems:"center",marginTop:8},
  buttonText:{color:"#F5FFFA",fontWeight:"800",fontSize:12},message:{color:"#75E0B8",fontSize:12,marginTop:10,lineHeight:18},
  photoBox:{flexDirection:"row",alignItems:"center",gap:12,marginTop:12},preview:{width:104,height:104,borderRadius:12,backgroundColor:"#0B1B2A"},emptyPhoto:{width:104,height:104,borderRadius:12,backgroundColor:"#0B1B2A",alignItems:"center",justifyContent:"center"},photoIcon:{color:"#D7B56D",fontSize:34},photoActions:{flex:1},photoButton:{backgroundColor:"#16785C",padding:11,borderRadius:9,alignItems:"center"},removePhoto:{color:"#F2A39A",fontSize:11,marginTop:9},
  row:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginTop:18},refresh:{color:"#75E0B8",fontWeight:"800"},
  item:{backgroundColor:"#102438",borderColor:"#1D3A50",borderWidth:1,borderRadius:12,padding:12,marginTop:9,flexDirection:"row",alignItems:"center",gap:8},
  thumb:{width:58,height:58,borderRadius:9,backgroundColor:"#0B1B2A"},thumbEmpty:{width:58,height:58,borderRadius:9,backgroundColor:"#0B1B2A",alignItems:"center",justifyContent:"center"},
  name:{color:"#F4F7FA",fontWeight:"800",fontSize:14},price:{color:"#D7B56D",fontSize:11,marginTop:5},actions:{gap:6},
  small:{backgroundColor:"#173D36",paddingHorizontal:11,paddingVertical:9,borderRadius:8}
});
