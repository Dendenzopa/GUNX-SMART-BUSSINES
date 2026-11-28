import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "../lib/supabase";
import { formatTZS } from "../domain/money";
import type { Product } from "../domain/types";

type Props = { shopId: string | null; onProductsChanged: () => void; darkMode?: boolean; canReceiveStock?: boolean; onReceiveStock?: (productId: string, quantity: number) => Promise<void> | void; onExit?: () => void };
type SelectedImage = { uri: string; mimeType?: string | null };
type ShopStaff = { user_id: string; role: string };

export default function ProductManagement({ shopId, onProductsChanged, darkMode = true, canReceiveStock = false, onReceiveStock, onExit }: Props) {
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
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"Zote" | "Active" | "Zinakaribia Kuisha" | "Zimeisha">("Zote");
  const [showEditor, setShowEditor] = useState(false);
  const [receivingProduct, setReceivingProduct] = useState<string | null>(null);
  const [receiveAmount, setReceiveAmount] = useState("1");

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
    setEditing(null); setImageUrl(null); setSelectedImage(null); setShowEditor(false);
  }

  function startEdit(p: Product) {
    setShowEditor(true); setEditing(p.id); setName(p.name); setSku(p.sku); setCategory(p.category ?? ""); setUnit(p.unit);
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

  const active = items.filter(p => p.active);
  const low = active.filter(p => p.stockQuantity > 0 && p.stockQuantity <= p.reorderLevel);
  const out = active.filter(p => p.stockQuantity <= 0);
  const value = active.reduce((n,p)=>n+p.stockQuantity*p.costPrice,0);
  const visible = items.filter(p => {
    const q=search.trim().toLowerCase();
    const found=!q||p.name.toLowerCase().includes(q)||p.sku.toLowerCase().includes(q);
    const matched=filter==="Zote"|| (filter==="Active"&&p.active) || (filter==="Zinakaribia Kuisha"&&p.active&&p.stockQuantity>0&&p.stockQuantity<=p.reorderLevel) || (filter==="Zimeisha"&&p.active&&p.stockQuantity<=0);
    return found&&matched;
  });
  const bg=darkMode?"#0B1917":"#F1F5F9", card=darkMode?"#122623":"#FFFFFF", raised=darkMode?"#0E201D":"#F8FAFC", border=darkMode?"#1E3A34":"#DCE5EC", ink=darkMode?"#F0FDF4":"#142D42", muted=darkMode?"#99B8B0":"#64748B";
  const confirmReceive=async()=>{const quantity=Number(receiveAmount);if(!receivingProduct||!Number.isFinite(quantity)||quantity<=0){setMessage("Weka kiasi sahihi cha stock.");return;}if(!onReceiveStock){setMessage("Huduma ya kupokea stock haijaunganishwa.");return;}await onReceiveStock(receivingProduct,quantity);setReceivingProduct(null);await load();};
  return <ScrollView keyboardShouldPersistTaps="handled" style={{backgroundColor:bg}} contentContainerStyle={{padding:14,paddingBottom:44}}>
    <View style={{backgroundColor:"#0B1917",borderColor:"#1E3A34",borderWidth:1,borderRadius:17,padding:13,flexDirection:"row",alignItems:"center",gap:9,marginBottom:12}}>
      <Pressable onPress={onExit} style={{width:38,height:38,borderRadius:11,backgroundColor:"#122623",alignItems:"center",justifyContent:"center",borderWidth:1,borderColor:"#1E3A34"}}><Text style={{color:"#F0FDF4",fontSize:25}}>‹</Text></Pressable>
      <View style={{flex:1}}><Text style={{color:"#F0FDF4",fontSize:18,fontWeight:"900"}}>Stock Kuu</Text><Text style={{color:"#99B8B0",fontSize:10}}>GUNX SMART BUSINESS • Katalogi & Stoo</Text></View>
      <Pressable onPress={()=>void load()} style={{width:38,height:38,borderRadius:11,backgroundColor:"#122623",borderWidth:1,borderColor:"#1E3A34",alignItems:"center",justifyContent:"center"}}><Text style={{color:"#34D399",fontSize:20,fontWeight:"900"}}>↻</Text></Pressable>
      <Pressable onPress={onExit} style={{height:38,paddingHorizontal:11,borderRadius:11,backgroundColor:"#122623",borderWidth:1,borderColor:"#1E3A34",justifyContent:"center"}}><Text style={{color:"#F0FDF4",fontSize:11,fontWeight:"800"}}>Toka</Text></Pressable>
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:9,paddingBottom:5}}>
      {[
        ["Jumla ya Bidhaa",String(active.length),"#34D399"],
        ["Thamani ya Stoo",canViewCost?formatTZS(value):"Haijaoneshwa","#34D399"],
        ["Zinakaribia Kuisha",String(low.length),"#FBBF24"],
        ["Zimeisha Stoo",String(out.length),"#FB7185"]
      ].map(([label,val,color])=><View key={label} style={{width:150,minHeight:82,backgroundColor:card,borderColor:border,borderWidth:1,borderRadius:15,padding:12,justifyContent:"space-between"}}><Text style={{color:muted,fontSize:10,fontWeight:"700"}}>{label}</Text><Text numberOfLines={1} style={{color,fontSize:17,fontWeight:"900"}}>{val}</Text></View>)}
    </ScrollView>
    <View style={{flexDirection:"row",gap:9,marginTop:10}}>
      {canManage&&<Pressable onPress={()=>{reset();setShowEditor(v=>!v);}} style={{flex:1,backgroundColor:"#10B981",borderRadius:13,padding:14,alignItems:"center"}}><Text style={{color:"#042F2E",fontWeight:"900",fontSize:12}}>＋ Bidhaa Mpya</Text></Pressable>}
      {canReceiveStock&&<Pressable onPress={()=>{if(active[0])setReceivingProduct(active[0].id);else setMessage("Ongeza bidhaa kwanza.");}} style={{flex:1,backgroundColor:card,borderColor:border,borderWidth:1,borderRadius:13,padding:14,alignItems:"center"}}><Text style={{color:"#34D399",fontWeight:"900",fontSize:12}}>⇅ Pokea Stock</Text></Pressable>}
    </View>
    {showEditor&&canManage&&<View style={{backgroundColor:card,borderColor:border,borderWidth:1,borderRadius:17,padding:14,marginTop:12}}>
      <View style={{flexDirection:"row",justifyContent:"space-between",alignItems:"center"}}><Text style={{color:ink,fontSize:15,fontWeight:"900"}}>{editing?"Hariri bidhaa":"Ongeza bidhaa mpya"}</Text><Pressable onPress={reset}><Text style={{color:"#34D399",fontWeight:"800"}}>Funga ✕</Text></Pressable></View>
      <View style={{flexDirection:"row",gap:8,marginTop:10}}><View style={{width:76,height:76,backgroundColor:raised,borderColor:border,borderWidth:1,borderRadius:12,overflow:"hidden",alignItems:"center",justifyContent:"center"}}>{selectedImage?.uri||imageUrl?<Image source={{uri:selectedImage?.uri??imageUrl!}} style={{width:"100%",height:"100%"}}/>:<Text style={{color:muted,fontSize:9}}>NO PHOTO</Text>}</View><View style={{flex:1,gap:6}}><Pressable onPress={()=>void chooseImage("camera")} style={{backgroundColor:"#16785C",padding:9,borderRadius:9}}><Text style={{color:"#F0FDF4",textAlign:"center",fontWeight:"800",fontSize:10}}>Piga picha</Text></Pressable><Pressable onPress={()=>void chooseImage("gallery")} style={{backgroundColor:raised,padding:9,borderRadius:9,borderWidth:1,borderColor:border}}><Text style={{color:ink,textAlign:"center",fontWeight:"800",fontSize:10}}>Chagua Gallery</Text></Pressable></View></View>
      {[
        {v:name,f:setName,p:"Jina la bidhaa"},{v:sku,f:setSku,p:"SKU / Barcode (hiari)"},{v:category,f:setCategory,p:"Kategoria"},{v:unit,f:setUnit,p:"Unit (piece, kg, lita)"},
        ...(canViewCost?[{v:cost,f:setCost,p:"Bei ya kununua (TZS)",n:true}]:[]),
        {v:price,f:setPrice,p:"Bei ya kuuza (TZS)",n:true},{v:reorder,f:setReorder,p:"Tahadhari ya stock",n:true}
      ].map(x=><TextInput key={x.p} value={x.v} onChangeText={x.f} placeholder={x.p} placeholderTextColor={muted} keyboardType={x.n?"decimal-pad":"default"} style={{backgroundColor:raised,borderColor:border,borderWidth:1,borderRadius:11,padding:12,color:ink,marginTop:8,fontSize:12}}/>)}
      <Pressable disabled={busy} onPress={()=>void save()} style={{backgroundColor:"#10B981",borderRadius:11,padding:13,alignItems:"center",marginTop:10}}><Text style={{color:"#042F2E",fontWeight:"900"}}>{busy?"Inahifadhi...":editing?"Hifadhi mabadiliko":"＋ Ongeza bidhaa"}</Text></Pressable>
      {!!message&&<Text style={{color:"#34D399",fontSize:11,marginTop:8}}>{message}</Text>}
    </View>}
    <View style={{flexDirection:"row",alignItems:"center",marginTop:15,gap:8}}>
      <View style={{flex:1,backgroundColor:raised,borderColor:border,borderWidth:1,borderRadius:12,paddingHorizontal:11}}><TextInput value={search} onChangeText={setSearch} placeholder="Tafuta jina la bidhaa au SKU..." placeholderTextColor={muted} style={{paddingVertical:12,color:ink,fontSize:12}}/></View>
      <View style={{width:42,height:42,borderRadius:12,backgroundColor:card,borderColor:border,borderWidth:1,alignItems:"center",justifyContent:"center"}}><Text style={{color:"#34D399",fontSize:17}}>▦</Text></View>
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:7,marginTop:10}}>
      {(["Zote","Active","Zinakaribia Kuisha","Zimeisha"] as const).map(label=><Pressable key={label} onPress={()=>setFilter(label)} style={{paddingHorizontal:13,paddingVertical:9,borderRadius:10,backgroundColor:filter===label?"#10B981":raised,borderWidth:1,borderColor:filter===label?"#10B981":border}}><Text style={{color:filter===label?"#042F2E":muted,fontWeight:"900",fontSize:10}}>{label}</Text></Pressable>)}
    </ScrollView>
    <View style={{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginTop:15,marginBottom:9}}><Text style={{color:ink,fontSize:12,fontWeight:"900",letterSpacing:1}}>KATALOGI YA BIDHAA</Text><Text style={{color:muted,fontSize:10}}>Kichujio: {filter} • {visible.length}</Text></View>
    {busy&&<ActivityIndicator color="#34D399" style={{marginVertical:10}}/>}
    <View style={{flexDirection:"row",flexWrap:"wrap",justifyContent:"space-between",rowGap:10}}>
      {visible.map(p=><View key={p.id} style={{width:"48.5%",backgroundColor:card,borderColor:border,borderWidth:1,borderRadius:15,overflow:"hidden"}}>
        <View style={{height:108,backgroundColor:raised,borderBottomColor:border,borderBottomWidth:1,alignItems:"center",justifyContent:"center"}}>{p.imageUrl?<Image source={{uri:p.imageUrl}} style={{width:"100%",height:"100%"}} resizeMode="cover"/>:<Text style={{color:muted,fontSize:26}}>▧</Text>}
          <View style={{position:"absolute",top:7,right:7,backgroundColor:"#122623",borderRadius:7,paddingHorizontal:7,paddingVertical:4}}><Text style={{color:p.stockQuantity<=0?"#FB7185":p.stockQuantity<=p.reorderLevel?"#FBBF24":"#34D399",fontSize:9,fontWeight:"900"}}>{p.stockQuantity} {p.unit}</Text></View>
        </View>
        <View style={{padding:9,gap:4}}><Text numberOfLines={1} style={{color:ink,fontSize:12,fontWeight:"900"}}>{p.name}</Text><Text numberOfLines={1} style={{color:muted,fontSize:9}}>SKU: {p.sku||"—"} • {p.category||p.unit}</Text><Text style={{color:"#34D399",fontSize:13,fontWeight:"900"}}>{formatTZS(p.sellingPrice)}</Text>{canViewCost&&<Text style={{color:muted,fontSize:9}}>Gharama: {formatTZS(p.costPrice)}</Text>}{!p.active&&<Text style={{color:"#FB7185",fontSize:9}}>IMEFICHWA</Text>}</View>
        <View style={{paddingHorizontal:8,paddingBottom:8,flexDirection:"row",gap:5}}>
          {canReceiveStock&&<Pressable onPress={()=>setReceivingProduct(p.id)} style={{flex:1,backgroundColor:"#10B98122",borderColor:"#10B98166",borderWidth:1,borderRadius:8,paddingVertical:8,alignItems:"center"}}><Text style={{color:"#34D399",fontSize:9,fontWeight:"900"}}>＋ Stock</Text></Pressable>}
          {canManage&&<Pressable onPress={()=>startEdit(p)} style={{flex:1,backgroundColor:raised,borderColor:border,borderWidth:1,borderRadius:8,paddingVertical:8,alignItems:"center"}}><Text style={{color:ink,fontSize:9,fontWeight:"800"}}>Hariri</Text></Pressable>}
          {canManage&&!p.active&&<Pressable onPress={()=>void restore(p)} style={{flex:1,backgroundColor:raised,borderColor:border,borderWidth:1,borderRadius:8,paddingVertical:8,alignItems:"center"}}><Text style={{color:ink,fontSize:9,fontWeight:"800"}}>Rejesha</Text></Pressable>}
        </View>
      </View>)}
    </View>
    {!busy&&visible.length===0&&<View style={{backgroundColor:card,borderColor:border,borderWidth:1,borderRadius:14,padding:20,alignItems:"center"}}><Text style={{color:ink,fontWeight:"800"}}>Hakuna bidhaa zilizopatikana</Text><Text style={{color:muted,fontSize:11,marginTop:5}}>Badili utafutaji au kichujio.</Text></View>}
    {receivingProduct&&<View style={{backgroundColor:card,borderColor:"#10B981",borderWidth:1,borderRadius:16,padding:13,marginTop:14}}>
      <Text style={{color:ink,fontWeight:"900"}}>Pokea stock: {items.find(p=>p.id===receivingProduct)?.name}</Text>
      <TextInput value={receiveAmount} onChangeText={setReceiveAmount} placeholder="Kiasi cha stock kinachoingia" placeholderTextColor={muted} keyboardType="decimal-pad" style={{backgroundColor:raised,borderColor:border,borderWidth:1,borderRadius:10,padding:12,color:ink,marginTop:9}}/>
      <View style={{flexDirection:"row",gap:8,marginTop:9}}><Pressable onPress={()=>void confirmReceive()} style={{flex:1,backgroundColor:"#10B981",padding:12,borderRadius:10,alignItems:"center"}}><Text style={{color:"#042F2E",fontWeight:"900"}}>Thibitisha kupokea</Text></Pressable><Pressable onPress={()=>setReceivingProduct(null)} style={{backgroundColor:raised,padding:12,borderRadius:10,borderWidth:1,borderColor:border}}><Text style={{color:ink,fontWeight:"800"}}>Ghairi</Text></Pressable></View>
    </View>}
    {!!message&&!showEditor&&<Text style={{color:"#34D399",fontSize:11,marginTop:10}}>{message}</Text>}
    <Text style={{color:muted,fontSize:9,textAlign:"center",marginTop:15}}>Stock in huhifadhiwa kupitia RPC salama ya biashara hii. Thamani ya ununuzi huonekana kwa wenye ruhusa pekee.</Text>
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
