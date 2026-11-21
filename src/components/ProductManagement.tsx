import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { supabase } from "../lib/supabase";
import { formatTZS } from "../domain/money";
import type { Product } from "../domain/types";

type Props = { shopId: string | null; onProductsChanged: () => void };

export default function ProductManagement({ shopId, onProductsChanged }: Props) {
  const [items, setItems] = useState<Product[]>([]);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [unit, setUnit] = useState("piece");
  const [cost, setCost] = useState("");
  const [price, setPrice] = useState("");
  const [reorder, setReorder] = useState("0");
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    if (!supabase || !shopId) return;
    setBusy(true);
    const { data, error } = await supabase.from("products")
      .select("id,name,sku,unit,cost_price,selling_price,stock_quantity,reorder_level,active")
      .eq("shop_id", shopId).order("name");
    setBusy(false);
    if (error) { setMessage("Bidhaa hazijapakiwa: " + error.message); return; }
    setItems((data ?? []).map((p: any) => ({
      id: p.id, name: p.name, sku: p.sku ?? "", unit: p.unit,
      costPrice: Number(p.cost_price), sellingPrice: Number(p.selling_price),
      stockQuantity: Number(p.stock_quantity), reorderLevel: Number(p.reorder_level), active: p.active
    })));
  }

  useEffect(() => { void load(); }, [shopId]);

  function reset() {
    setName(""); setSku(""); setUnit("piece"); setCost(""); setPrice(""); setReorder("0"); setEditing(null);
  }

  function startEdit(p: Product) {
    setEditing(p.id); setName(p.name); setSku(p.sku); setUnit(p.unit);
    setCost(String(p.costPrice)); setPrice(String(p.sellingPrice)); setReorder(String(p.reorderLevel));
    setMessage("Unahariri " + p.name + ". Stock hubadilishwa kupitia Pokea stock.");
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
      ? await supabase.from("products").update(payload).eq("id", editing).eq("shop_id", shopId)
      : await supabase.from("products").insert({ ...payload, shop_id: shopId, stock_quantity: 0 });
    setBusy(false);
    if (result.error) { setMessage("Bidhaa haijahifadhiwa: " + result.error.message); return; }
    setMessage(editing ? "Taarifa za bidhaa zimesasishwa." : "Bidhaa mpya imeongezwa. Stock inaanza sifuri.");
    reset(); await load(); onProductsChanged();
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

  return <ScrollView keyboardShouldPersistTaps="handled">
    <Text style={s.title}>Usimamizi wa bidhaa</Text>
    <Text style={s.copy}>Ongeza bidhaa, hariri bei na taarifa, au ifiche bidhaa isiyouzwa. Stock inaongezwa kupitia sehemu ya Pokea stock.</Text>
    <View style={s.panel}>
      <Text style={s.heading}>{editing ? "Hariri bidhaa" : "Ongeza bidhaa mpya"}</Text>
      <TextInput value={name} onChangeText={setName} placeholder="Jina la bidhaa" placeholderTextColor="#8194A5" style={s.input}/>
      <TextInput value={sku} onChangeText={setSku} placeholder="SKU / Barcode (hiari)" placeholderTextColor="#8194A5" style={s.input}/>
      <TextInput value={unit} onChangeText={setUnit} placeholder="Unit (mf. piece, kg, lita)" placeholderTextColor="#8194A5" style={s.input}/>
      <TextInput value={cost} onChangeText={setCost} placeholder="Bei ya kununua (TZS)" keyboardType="decimal-pad" placeholderTextColor="#8194A5" style={s.input}/>
      <TextInput value={price} onChangeText={setPrice} placeholder="Bei ya kuuza (TZS)" keyboardType="decimal-pad" placeholderTextColor="#8194A5" style={s.input}/>
      <TextInput value={reorder} onChangeText={setReorder} placeholder="Tahadhari ya stock" keyboardType="decimal-pad" placeholderTextColor="#8194A5" style={s.input}/>
      <Pressable disabled={busy} onPress={save} style={s.button}><Text style={s.buttonText}>{busy ? "Inahifadhi..." : editing ? "Hifadhi mabadiliko" : "Ongeza bidhaa"}</Text></Pressable>
      {editing && <Pressable onPress={reset} style={s.secondary}><Text style={s.buttonText}>Ghairi uhariri</Text></Pressable>}
      {!!message && <Text style={s.message}>{message}</Text>}
    </View>
    <View style={s.row}><Text style={s.heading}>Bidhaa zilizopo ({items.filter(p => p.active).length})</Text><Pressable onPress={load}><Text style={s.refresh}>Refresh</Text></Pressable></View>
    {busy && <ActivityIndicator color="#43C99A"/>}
    {items.map(p => <View key={p.id} style={s.item}>
      <View style={{flex:1}}>
        <Text style={s.name}>{p.name} {!p.active ? "(Imefichwa)" : ""}</Text>
        <Text style={s.copy}>{p.sku || "Hakuna SKU"} · {p.unit} · Stock {p.stockQuantity}</Text>
        <Text style={s.price}>Gharama {formatTZS(p.costPrice)} · Bei {formatTZS(p.sellingPrice)}</Text>
      </View>
      <View style={s.actions}>
        {p.active ? <>
          <Pressable onPress={() => startEdit(p)} style={s.small}><Text style={s.buttonText}>Hariri</Text></Pressable>
          <Pressable onPress={() => archive(p)} style={s.small}><Text style={s.buttonText}>Ficha</Text></Pressable>
        </> : <Pressable onPress={() => restore(p)} style={s.small}><Text style={s.buttonText}>Rejesha</Text></Pressable>}
      </View>
    </View>)}
    {!busy && items.length === 0 && <Text style={s.copy}>Bado hakuna bidhaa. Ongeza bidhaa ya kwanza hapo juu.</Text>}
  </ScrollView>;
}

const s = StyleSheet.create({
  title:{color:"#F4F7FA",fontSize:23,fontWeight:"900"},copy:{color:"#91A4B5",fontSize:12,lineHeight:18,marginTop:6},
  panel:{backgroundColor:"#102438",borderColor:"#1D3A50",borderWidth:1,borderRadius:14,padding:14,marginTop:14},
  heading:{color:"#FFF",fontSize:16,fontWeight:"800"},input:{backgroundColor:"#0B1B2A",borderColor:"#2B4B61",borderWidth:1,borderRadius:9,color:"#F4F7FA",padding:12,marginTop:9,fontSize:13},
  button:{backgroundColor:"#16785C",padding:13,borderRadius:10,alignItems:"center",marginTop:12},secondary:{backgroundColor:"#173247",padding:12,borderRadius:10,alignItems:"center",marginTop:8},
  buttonText:{color:"#F5FFFA",fontWeight:"800",fontSize:12},message:{color:"#75E0B8",fontSize:12,marginTop:10,lineHeight:18},
  row:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginTop:18},refresh:{color:"#75E0B8",fontWeight:"800"},
  item:{backgroundColor:"#102438",borderColor:"#1D3A50",borderWidth:1,borderRadius:12,padding:12,marginTop:9,flexDirection:"row",alignItems:"center",gap:8},
  name:{color:"#F4F7FA",fontWeight:"800",fontSize:14},price:{color:"#D7B56D",fontSize:11,marginTop:5},actions:{gap:6},
  small:{backgroundColor:"#173D36",paddingHorizontal:11,paddingVertical:9,borderRadius:8}
});
