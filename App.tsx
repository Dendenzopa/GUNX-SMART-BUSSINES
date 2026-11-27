import React, { useEffect, useMemo, useRef, useState } from "react";
import NetInfo from "@react-native-community/netinfo";
import { SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View, Pressable, TextInput, Image, BackHandler } from "react-native";
import { demoProducts, demoSales, demoExpenses } from "./src/data/demoData";
import type { RefundRecord } from "./src/domain/money";
import { countSales, formatTZS, netProfit, totalSales } from "./src/domain/money";
import type { Product, Sale, Expense, DebtEntry } from "./src/domain/types";
import AuthGate, { useShopContext } from "./src/components/AuthGate";
import { supabase, supabaseConfigured } from "./src/lib/supabase";
import { submitCheckout } from "./src/services/checkout";
import { readPendingSales, writePendingSales, readCachedProducts, writeCachedProducts, readCachedBusinessSnapshot, writeCachedBusinessSnapshot, type PendingSale } from "./src/services/offlineSales";
import { exportBusinessReportPdf, exportBusinessReportCsv } from "./src/services/reportExports";
import StaffManagement from "./src/components/StaffManagement";
import SubscriptionManagement from "./src/components/SubscriptionManagement";
import ProductManagement from "./src/components/ProductManagement";
import PlatformOwnerDashboard from "./src/components/PlatformOwnerDashboard";
import OwnerBusinessDashboard from "./src/components/OwnerBusinessDashboard";
type Screen = "Home" | "POS" | "Stock" | "Debts" | "Expenses" | "Returns" | "Sync" | "Payments" | "Reports" | "Staff" | "Subscription" | "Owner";
type CartLine = { productId: string; quantity: number };
function Button({label,onPress,quiet=false}:{label:string;onPress:()=>void;quiet?:boolean}) { return <Pressable onPress={onPress} style={[s.button,quiet&&s.quiet]}><Text style={s.buttonText}>{label}</Text></Pressable>; }
function Metric({label,value,darkMode=true}:{label:string;value:string;darkMode?:boolean}) { return <View style={[s.metric,!darkMode&&{backgroundColor:"#F1F5F9",borderColor:"#DCE5EC"}]}><Text style={[s.label,!darkMode&&{color:"#334155"}]}>{label}</Text><Text style={[s.value,!darkMode&&{color:"#142D42"}]}>{value}</Text></View>; }
function localDateKey(date:Date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`; }
function makeIdempotencyKey() { return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, ch => { const r = Math.floor(Math.random()*16); return (ch==="x"?r:(r&3)|8).toString(16); }); }
function Dashboard() {
 const { shopId, isPlatformAdmin, shopRole, userId, signOut, darkMode, toggleTheme } = useShopContext();
 const effectiveRole = shopRole ?? "owner";
 const allowedScreens: Record<"owner"|"manager"|"cashier"|"stockkeeper", Screen[]> = {
  owner: ["Home","POS","Stock","Debts","Expenses","Returns","Sync","Payments","Reports","Staff","Subscription"],
  manager: ["Home"],
  cashier: ["Home","POS","Debts","Sync"],
  stockkeeper: ["Home","Stock"]
 };
 const [businessBrand,setBusinessBrand]=useState<{name:string;logo:string|null}>({name:"Biashara Yangu",logo:null});
 useEffect(()=>{if(!shopId||!supabase||isPlatformAdmin)return;let active=true;supabase.from("shops").select("name,hero_media_type,hero_media_url").eq("id",shopId).maybeSingle().then(({data,error})=>{if(!active||error||!data)return;setBusinessBrand({name:data.name||"Biashara Yangu",logo:(data.hero_media_type==="business_logo"||data.hero_media_type==="owner_photo")&&typeof data.hero_media_url==="string"?data.hero_media_url:null});});const channel=supabase.channel("business-brand-"+shopId).on("postgres_changes",{event:"UPDATE",schema:"public",table:"shops",filter:"id=eq."+shopId},payload=>{const row=payload.new as any;setBusinessBrand({name:row.name||"Biashara Yangu",logo:(row.hero_media_type==="business_logo"||row.hero_media_type==="owner_photo")&&typeof row.hero_media_url==="string"?row.hero_media_url:null});}).subscribe();return()=>{active=false;void supabase!.removeChannel(channel);};},[shopId,isPlatformAdmin]);
 const [managerPermissions,setManagerPermissions]=useState<string[]>([]);
 const [managerPermissionsLoaded,setManagerPermissionsLoaded]=useState(false);
 useEffect(()=>{
  if(effectiveRole!=="manager"||!shopId||!supabase){setManagerPermissions([]);setManagerPermissionsLoaded(true);return;}
  let active=true;
  setManagerPermissionsLoaded(false);
  supabase.rpc("get_my_shop_permissions",{p_shop_id:shopId}).then(({data,error})=>{
   if(!active)return;
   setManagerPermissions(!error&&Array.isArray(data)?data:[]);
   setManagerPermissionsLoaded(true);
  });
  return ()=>{active=false;};
 },[shopId,effectiveRole]);
 const managerScreens:Screen[]=["Home"];
 if(managerPermissions.includes("pos.use"))managerScreens.push("POS");
 if(managerPermissions.includes("stock.manage"))managerScreens.push("Stock");
 if(managerPermissions.includes("debts.manage"))managerScreens.push("Debts");
 if(managerPermissions.includes("expenses.manage"))managerScreens.push("Expenses");
 if(managerPermissions.includes("refunds.manage"))managerScreens.push("Returns");
 if(managerPermissions.includes("sync.manage")||managerPermissions.includes("pos.use"))managerScreens.push("Sync");
 if(managerPermissions.includes("reports.view"))managerScreens.push("Reports");
 const visibleScreens: Screen[] = isPlatformAdmin ? ["Owner"] : effectiveRole==="manager" ? (managerPermissionsLoaded?managerScreens:["Home"]) : allowedScreens[effectiveRole];
 const [screen,setScreen]=useState<Screen>("Home");
 const [showMore,setShowMore]=useState(false);
 const screenRef=useRef<Screen>("Home");
 const screenHistory=useRef<Screen[]>([]);
 const navigateTo=(next:Screen)=>{const current=screenRef.current;if(next===current)return;screenHistory.current.push(current);screenRef.current=next;setScreen(next);setShowMore(false);};
 const resetToHome=()=>{screenHistory.current=[];screenRef.current="Home";setScreen("Home");setShowMore(false);};
 const goBack=()=>{if(showMore){setShowMore(false);return true;}const current=screenRef.current;let previous:Screen|undefined;while(screenHistory.current.length){const candidate=screenHistory.current.pop()!;if(visibleScreens.includes(candidate)){previous=candidate;break;}}if(previous){screenRef.current=previous;setScreen(previous);return true;}if(current!=="Home"){screenRef.current="Home";setScreen("Home");return true;}return false;};
 useEffect(()=>{const subscription=BackHandler.addEventListener("hardwareBackPress",()=>goBack());return ()=>subscription.remove();},[showMore,isPlatformAdmin,visibleScreens.join("|")]);
 useEffect(()=>{if(!visibleScreens.includes(screen)){screenHistory.current=[];screenRef.current="Home";resetToHome();}},[screen,shopRole,isPlatformAdmin,visibleScreens.join("|")]);
 useEffect(()=>{if(isPlatformAdmin){screenHistory.current=[];screenRef.current="Owner";setScreen("Owner");}},[isPlatformAdmin]);
 const [products,setProducts]=useState<Product[]>(supabaseConfigured ? [] : demoProducts);
 const [sales,setSales]=useState<Sale[]>(supabaseConfigured ? [] : demoSales);
 const [refundTotal,setRefundTotal]=useState(0);
 const [refunds,setRefunds]=useState<RefundRecord[]>([]);
 const [refundsLoaded,setRefundsLoaded]=useState(!supabaseConfigured);
 const [reportRange,setReportRange]=useState<"today"|"7d"|"30d"|"year"|"all">("30d");
 const [expenses,setExpenses]=useState<Expense[]>(supabaseConfigured ? [] : demoExpenses);
 const [debts,setDebts]=useState<DebtEntry[]>(supabaseConfigured ? [] : [{id:"d1",customerId:"c1",customerName:"Asha M.",saleId:"s-debt-1",originalAmount:12000,amountPaid:2000,balance:10000,createdAt:new Date().toISOString()}]);
 const [expenseName,setExpenseName]=useState("");
 const [expenseAmount,setExpenseAmount]=useState("");
 const [debtorName,setDebtorName]=useState("");
 const [debtAmount,setDebtAmount]=useState("");
 const [repaymentAmount,setRepaymentAmount]=useState("");
 const [stockInAmount,setStockInAmount]=useState("1");
 const [refundReason,setRefundReason]=useState("");
 const [refundKeys,setRefundKeys]=useState<Record<string,string>>({});
 const [cart,setCart]=useState<CartLine[]>([]);
 const [notice,setNotice]=useState(supabaseConfigured ? "Imeunganishwa na huduma za duka; data hupakiwa kutoka Supabase." : "DEMO MODE — changes are temporary and reset when the app restarts.");
 const [cloudLoading,setCloudLoading]=useState(false);
 const [pendingCheckoutKey,setPendingCheckoutKey]=useState<string | null>(null);
 const [isConnected,setIsConnected]=useState<boolean | null>(null);
 const [hasShopProductCache,setHasShopProductCache]=useState(false);
 const [pendingOutbox,setPendingOutbox]=useState<PendingSale[]>([]);
 useEffect(()=>{
  if(!supabaseConfigured)return;
  setProducts([]);
  setSales([]);
  setExpenses([]);
  setDebts([]);
  setRefundTotal(0);
  setRefunds([]);
  setRefundsLoaded(false);
  setPendingOutbox([]);
  setHasShopProductCache(false);
 },[shopId,userId]);
 const syncingOutboxRef=useRef(false);
 const cartTotal=useMemo(()=>cart.reduce((sum,line)=>sum+(products.find(p=>p.id===line.productId)?.sellingPrice||0)*line.quantity,0),[cart,products]);
 const lowStock=products.filter(p=>p.stockQuantity<=p.reorderLevel).length;
 const outstandingDebt=debts.reduce((sum,d)=>sum+d.balance,0);
 const reportStart=useMemo(()=>{const now=new Date();const start=new Date(now);if(reportRange==="today")start.setHours(0,0,0,0);else if(reportRange==="7d"){start.setDate(start.getDate()-6);start.setHours(0,0,0,0);}else if(reportRange==="30d"){start.setDate(start.getDate()-29);start.setHours(0,0,0,0);}else if(reportRange==="year"){start.setMonth(0,1);start.setHours(0,0,0,0);}else return null;return start;},[reportRange]);
 const reportSales=useMemo(()=>reportStart?sales.filter(sale=>new Date(sale.createdAt)>=reportStart&&new Date(sale.createdAt)<=new Date()):sales,[sales,reportStart]);
 const reportExpenses=useMemo(()=>reportStart?expenses.filter(expense=>{
  const expenseDate=new Date((expense.expenseDate??expense.createdAt).slice(0,10)+"T00:00:00");
  return expenseDate>=reportStart && expenseDate<=new Date();
 }):expenses,[expenses,reportStart]);
 const reportRefundTotal=useMemo(()=>{
  if(!refundsLoaded)return reportRange==="all"?refundTotal:null;
  return refunds.filter(refund=>!reportStart || (new Date(refund.createdAt)>=reportStart && new Date(refund.createdAt)<=new Date()))
   .reduce((sum,refund)=>sum+refund.amount,0);
 },[refunds,refundsLoaded,reportRange,reportStart,refundTotal]);
 const reportRefundRecords=useMemo(()=>refunds.filter(refund=>!reportStart || (new Date(refund.createdAt)>=reportStart && new Date(refund.createdAt)<=new Date())),[refunds,reportStart]);
 const reportSalesValue=totalSales(reportSales,reportRefundTotal??0);
 const reportExpenseValue=reportExpenses.reduce((sum,expense)=>sum+expense.amount,0);
 const reportProfit=!refundsLoaded||reportRefundTotal===null?null:netProfit(reportSales,reportExpenses,reportRefundRecords);
 useEffect(() => {
  const unsubscribe=NetInfo.addEventListener(state=>setIsConnected(Boolean(state.isConnected)));
  NetInfo.fetch().then(state=>setIsConnected(Boolean(state.isConnected)));
  return unsubscribe;
 },[]);
 useEffect(() => {
  if(!shopId)return;
  let active=true;
  Promise.all([readPendingSales(shopId,userId,effectiveRole),readCachedProducts(shopId,userId,effectiveRole,effectiveRole==="manager"?managerPermissions.slice().sort().join(","):"")]).then(([items,cached])=>{
   if(!active)return;
   setPendingOutbox(items);
   if(cached.length){
    const reserved=new Map<string,number>();
    items.forEach(item=>item.items.forEach(line=>reserved.set(line.product_id,(reserved.get(line.product_id)??0)+line.quantity)));
    setProducts(cached.map(product=>({...product,stockQuantity:Math.max(0,product.stockQuantity-(reserved.get(product.id)??0))})));
    setHasShopProductCache(true);
   }
   if(items.length)setSales(current=>[...items.map(item=>({...item.sale})),...current.filter(sale=>!items.some(item=>item.sale.id===sale.id))]);
  });
  return ()=>{active=false;};
 },[shopId,userId,effectiveRole,managerPermissions.join(",")]);
 useEffect(() => {
  const client=supabase;
  if(!supabaseConfigured||!client||!shopId||isConnected!==true||pendingOutbox.length===0||syncingOutboxRef.current)return;
  syncingOutboxRef.current=true;
  const sync=async()=>{
   let remaining=[...pendingOutbox];
   for(const item of pendingOutbox){
    if(item.syncIssue)continue;
    try{
     const result=await submitCheckout({shopId:item.shopId,idempotencyKey:item.idempotencyKey,items:item.items,paymentMethod:"cash",expectedTotal:item.sale.total});
     const {data:confirmedSales}=await client.rpc("get_shop_sales",{p_shop_id:shopId,p_sale_id:result.saleId});
     const confirmedSale=confirmedSales?.[0] ?? null;
     setSales(current=>current.map(sale=>sale.id===item.sale.id?(confirmedSale?{
      id:confirmedSale.id,receiptNumber:confirmedSale.receipt_number,createdAt:confirmedSale.created_at,
      lines:(confirmedSale.sale_items??[]).map((line:any)=>({id:line.id,productId:line.product_id??"",productName:line.product_name_snapshot,quantity:Number(line.quantity),unitPrice:Number(line.unit_price),unitCost:Number(line.unit_cost_snapshot),lineTotal:Number(line.line_total)})),
      subtotal:Number(confirmedSale.subtotal),discount:Number(confirmedSale.discount),total:Number(confirmedSale.total),amountPaid:Number(confirmedSale.amount_paid),balance:Math.max(0,Number(confirmedSale.total)-Number(confirmedSale.amount_paid)),paymentMethod:confirmedSale.payments?.[0]?.method??"cash",status:"completed"
     }:{...sale,id:result.saleId,receiptNumber:result.receiptNumber,total:result.total,subtotal:result.total,amountPaid:result.total,balance:0,status:"completed"}):sale));
     remaining=remaining.filter(entry=>entry.idempotencyKey!==item.idempotencyKey);
     setPendingOutbox([...remaining]);
     await writePendingSales(shopId,userId,effectiveRole,remaining);
     setNotice("Mauzo ya offline yamesawazishwa: "+result.receiptNumber);
    }catch(error){
     const message=error instanceof Error?error.message:"";
     const issue=message.includes("PRICE_CHANGED")?"PRICE_CHANGED":message.includes("Insufficient stock")?"STOCK_CHANGED":"SYNC_FAILED";
     remaining=remaining.map(entry=>entry.idempotencyKey===item.idempotencyKey?{...entry,syncIssue:issue}:entry);
     setPendingOutbox([...remaining]);
     await writePendingSales(shopId,userId,effectiveRole,remaining);
     setNotice(issue==="PRICE_CHANGED"?"Bei imebadilika. Mauzo yamesimamishwa kwa ukaguzi wa mmiliki; hakuna bei mpya iliyokubaliwa.":issue==="STOCK_CHANGED"?"Stock ya server haitoshi. Mauzo yamesimamishwa kwa ukaguzi wa mmiliki.":"Mauzo "+item.sale.receiptNumber+" bado yanasubiri mtandao/server. Hayajatumwa mara mbili.");
     break;
    }
   }
   const {data:latestProducts,error:productsError}=await client.rpc("get_shop_products",{p_shop_id:shopId});
   if(!productsError&&latestProducts){const mapped=latestProducts.map((p:any)=>({id:p.id,name:p.name,sku:p.sku??"",unit:p.unit,costPrice:Number(p.cost_price),sellingPrice:Number(p.selling_price),stockQuantity:Number(p.stock_quantity),reorderLevel:Number(p.reorder_level),active:p.active}));setProducts(mapped);setHasShopProductCache(true);void writeCachedProducts(shopId,userId,effectiveRole,mapped,effectiveRole==="manager"?managerPermissions.slice().sort().join(","):"");}
   syncingOutboxRef.current=false;
  };
  void sync();
 },[shopId,userId,effectiveRole,isConnected,pendingOutbox]);
 useEffect(() => {
  if (!supabaseConfigured || !supabase || !shopId || (effectiveRole !== "owner" && effectiveRole !== "manager")) return;
  let active = true;
  setCloudLoading(true);
  Promise.all([readCachedBusinessSnapshot(shopId,userId,effectiveRole,effectiveRole==="manager"?managerPermissions.slice().sort().join(","):""),readPendingSales(shopId,userId,effectiveRole)]).then(([snapshot,pending])=>{
   if(!active||!snapshot)return;
   setSales([...pending.map(item=>({...item.sale})),...snapshot.sales.filter(sale=>!pending.some(item=>item.sale.id===sale.id))]);
   setExpenses(snapshot.expenses);
   setDebts(snapshot.debts);
   setRefundTotal(snapshot.refundTotal);
   setNotice("Data ya mwisho iliyohifadhiwa kwenye simu inaonyeshwa. Inatafuta taarifa mpya mtandaoni.");
  });
  supabase.rpc("get_shop_products",{p_shop_id:shopId})
   .then(({data,error}) => {
    if (!active) return;
    if (error) setNotice("Imeshindikana kupakia bidhaa: "+error.message);
    else { const mapped=(data ?? []).map((p:any) => ({id:p.id,name:p.name,sku:p.sku ?? "",unit:p.unit,costPrice:Number(p.cost_price),sellingPrice:Number(p.selling_price),stockQuantity:Number(p.stock_quantity),reorderLevel:Number(p.reorder_level),active:p.active}));setProducts(mapped);setHasShopProductCache(true);void writeCachedProducts(shopId,userId,effectiveRole,mapped,effectiveRole==="manager"?managerPermissions.slice().sort().join(","):""); }
    setCloudLoading(false);
   });
  Promise.all([
   supabase.rpc("get_shop_sales",{p_shop_id:shopId}),
   supabase.from("expenses").select("id,description,category,amount,expense_date,created_at").eq("shop_id",shopId).order("created_at",{ascending:false}),
   supabase.from("debts").select("id,customer_id,description,original_amount,balance,created_at,customers(name)").eq("shop_id",shopId).order("created_at",{ascending:false}),
   supabase.from("sale_refunds").select("refund_total,created_at,sale_refund_items(quantity,sale_items(unit_cost_snapshot))").eq("shop_id",shopId)
  ]).then(async([salesResult,expensesResult,debtsResult,refundsResult]) => {
   if(!active) return;
   const mappedSales:Sale[]|null=!salesResult.error&&salesResult.data?salesResult.data.map((r:any):Sale=>({id:r.id,receiptNumber:r.receipt_number,createdAt:r.created_at,lines:(r.sale_items??[]).map((x:any)=>({id:x.id,productId:x.product_id??"",productName:x.product_name_snapshot,quantity:Number(x.quantity),unitPrice:Number(x.unit_price),unitCost:Number(x.unit_cost_snapshot),lineTotal:Number(x.line_total)})),subtotal:Number(r.subtotal),discount:Number(r.discount),total:Number(r.total),amountPaid:Number(r.amount_paid),balance:Math.max(0,Number(r.total)-Number(r.amount_paid)),paymentMethod:r.payments?.[0]?.method??"cash",status:r.status==="refunded"?"refunded":r.status==="partially_paid"?"partially_paid":r.status==="voided"?"voided":"completed"})):null;
   const mappedExpenses=!expensesResult.error&&expensesResult.data?expensesResult.data.map((e:any)=>({id:e.id,description:e.description,category:e.category,amount:Number(e.amount),expenseDate:e.expense_date,createdAt:e.created_at})):null;
   const mappedDebts=!debtsResult.error&&debtsResult.data?debtsResult.data.map((d:any)=>({id:d.id,customerId:d.customer_id,customerName:d.customers?.[0]?.name??"Mteja",saleId:"manual",originalAmount:Number(d.original_amount),amountPaid:Number(d.original_amount)-Number(d.balance),balance:Number(d.balance),createdAt:d.created_at})):null;
   const mappedRefunds=!refundsResult.error&&refundsResult.data?refundsResult.data.reduce((sum:number,row:any)=>sum+Number(row.refund_total),0):null;
   const mappedRefundRecords:RefundRecord[]|null=!refundsResult.error&&refundsResult.data?refundsResult.data.map((row:any)=>({amount:Number(row.refund_total),createdAt:row.created_at,returnedCost:(row.sale_refund_items??[]).reduce((sum:number,item:any)=>sum+Number(item.quantity)*Number(item.sale_items?.unit_cost_snapshot??0),0)})):null;
   const [pending]=await Promise.all([readPendingSales(shopId,userId,effectiveRole)]);
   if(!active)return;
   if(mappedSales)setSales([...pending.map(item=>({...item.sale})),...mappedSales.filter(sale=>!pending.some(item=>item.sale.id===sale.id))]);
   if(mappedExpenses)setExpenses(mappedExpenses);
   if(mappedDebts)setDebts(mappedDebts);
   if(mappedRefunds!==null){setRefundTotal(mappedRefunds);setRefunds(mappedRefundRecords??[]);setRefundsLoaded(true);}else setRefundsLoaded(false);
   if(mappedSales&&mappedExpenses&&mappedDebts&&mappedRefunds!==null){
    await writeCachedBusinessSnapshot(shopId,userId,effectiveRole,{sales:mappedSales,expenses:mappedExpenses,debts:mappedDebts,refundTotal:mappedRefunds,cachedAt:new Date().toISOString()},effectiveRole==="manager"?managerPermissions.slice().sort().join(","):"");
   }
  });
  return () => { active = false; };
 },[shopId,userId,effectiveRole,managerPermissions.join(",")]);
 async function refreshProductsFromCloud() {
  if(!supabase||!shopId)return;
  const {data,error}=await supabase.rpc("get_shop_products",{p_shop_id:shopId});
  if(!error&&data){const mapped=data.map((p:any)=>({id:p.id,name:p.name,sku:p.sku??"",unit:p.unit,costPrice:Number(p.cost_price),sellingPrice:Number(p.selling_price),stockQuantity:Number(p.stock_quantity),reorderLevel:Number(p.reorder_level),active:p.active}));setProducts(mapped);setHasShopProductCache(true);void writeCachedProducts(shopId,userId,effectiveRole,mapped,effectiveRole==="manager"?managerPermissions.slice().sort().join(","):"");}
 }
 function add(p:Product) { if(pendingCheckoutKey){setNotice("Malizia au thibitisha mauzo yaliyosubiri kabla ya kubadilisha cart.");return;} setCart(current=>{const q=(current.find(x=>x.productId===p.id)?.quantity||0)+1;if(q>p.stockQuantity){setNotice("Stock limit reached.");return current;}return current.some(x=>x.productId===p.id)?current.map(x=>x.productId===p.id?{...x,quantity:q}:x):[...current,{productId:p.id,quantity:1}];});setNotice(p.name+" added to cart."); }
 async function exportReport(kind:"pdf"|"csv") {
  try {
   const labels={today:"Leo", "7d":"Siku 7", "30d":"Siku 30", year:"Mwaka huu", all:"Tangu mwanzo"};
   if(!refundsLoaded||reportRefundTotal===null){setNotice("Historia kamili ya refunds haijapakiwa. Unganisha mtandao kisha ujaribu tena; sitatoa ripoti ya fedha isiyokamilika.");return;}
   const input={businessName:businessBrand.name?.trim()||"GUNX SMART BUSINESS",periodLabel:labels[reportRange],sales:reportSales,expenses:reportExpenses,refundTotal:reportRefundTotal,refunds:reportRefundRecords};
   if(kind==="pdf")await exportBusinessReportPdf(input);else await exportBusinessReportCsv(input);
   setNotice(kind==="pdf"?"Ripoti ya PDF imeandaliwa kwa kushirikishwa.":"Ripoti ya CSV inayofunguka kwenye Excel imeandaliwa.");
  }catch(error){setNotice("Imeshindikana kutoa ripoti: "+(error instanceof Error?error.message:"Hitilafu isiyojulikana"));}
 }
 async function receiveStock(productId:string) {
  const quantity=Number(stockInAmount);
  if(!Number.isFinite(quantity)||quantity<=0){setNotice("Weka kiasi cha stock kinachoingia.");return;}
  if(supabaseConfigured&&isConnected===false){setNotice("Stock-in haiwezi kuthibitishwa bila mtandao. Hakuna mabadiliko yaliyofanywa.");return;}
  if(supabaseConfigured){
   if(!supabase||!shopId){setNotice("Hakuna duka lililounganishwa.");return;}
   setCloudLoading(true);
   const {data,error}=await supabase.rpc("receive_stock",{p_shop_id:shopId,p_product_id:productId,p_quantity:quantity,p_note:"Stock received from app"});
   setCloudLoading(false);
   if(error){setNotice("Stock haijaongezwa: "+error.message);return;}
   setProducts(v=>v.map(p=>p.id===productId?{...p,stockQuantity:Number(data)}:p));
   setNotice("Stock imeongezwa. Salio jipya: "+data);return;
  }
  setProducts(v=>v.map(p=>p.id===productId?{...p,stockQuantity:p.stockQuantity+quantity}:p));
  setNotice("Stock imeongezwa kwenye demo.");
 }
 async function addExpense() {
  const amount=Number(expenseAmount);
  if(!expenseName.trim()||!Number.isFinite(amount)||amount<=0){setNotice("Weka jina la gharama na kiasi sahihi.");return;}
  if(supabaseConfigured&&isConnected===false){setNotice("Gharama haijahifadhiwa. Unganisha mtandao ili iandikwe kwenye database.");return;}
  if(supabaseConfigured){
   if(!supabase||!shopId){setNotice("Hakuna duka lililounganishwa.");return;}
   setCloudLoading(true);
   const {data,error}=await supabase.from("expenses").insert({shop_id:shopId,description:expenseName.trim(),category:"General",amount}).select("id,description,category,amount,expense_date,created_at").single();
   setCloudLoading(false);
   if(error){setNotice("Gharama haijahifadhiwa: "+error.message);return;}
   setExpenses(v=>[{id:data.id,description:data.description,category:data.category,amount:Number(data.amount),expenseDate:data.expense_date,createdAt:data.created_at},...v]);
   setExpenseName("");setExpenseAmount("");setNotice("Gharama imehifadhiwa kwenye database.");return;
  }
  const createdAt=new Date().toISOString();setExpenses(v=>[{id:"local-exp-"+Date.now(),description:expenseName.trim(),category:"General",amount,expenseDate:localDateKey(new Date()),createdAt},...v]);
  setExpenseName("");setExpenseAmount("");setNotice("Gharama imeongezwa kwenye demo.");
 }
 async function addDebt() {
  const amount=Number(debtAmount);
  if(!debtorName.trim()||!Number.isFinite(amount)||amount<=0){setNotice("Weka jina la mteja na deni sahihi.");return;}
  if(supabaseConfigured&&isConnected===false){setNotice("Deni halijahifadhiwa. Unganisha mtandao ili kuepuka deni kurudiwa.");return;}
  if(supabaseConfigured){
   if(!supabase||!shopId){setNotice("Hakuna duka lililounganishwa.");return;}
   setCloudLoading(true);
   const {data,error}=await supabase.rpc("create_manual_debt",{p_shop_id:shopId,p_customer_name:debtorName.trim(),p_amount:amount,p_description:null});
   setCloudLoading(false);
   if(error){setNotice("Deni halijahifadhiwa: "+error.message);return;}
   const {data:rows,error:loadError}=await supabase.from("debts").select("id,customer_id,description,original_amount,balance,created_at,customers(name)").eq("id",data).single();
   if(loadError||!rows){setNotice("Deni limeundwa, lakini halikuweza kuonyeshwa. Fungua tena ukurasa.");return;}
   setDebts(v=>[{id:rows.id,customerId:rows.customer_id,customerName:rows.customers?.[0]?.name??debtorName.trim(),saleId:"manual",originalAmount:Number(rows.original_amount),amountPaid:0,balance:Number(rows.balance),createdAt:rows.created_at},...v]);
   setDebtorName("");setDebtAmount("");setNotice("Deni limehifadhiwa kwenye database.");return;
  }
  setDebts(v=>[{id:"local-debt-"+Date.now(),customerId:"local-customer",customerName:debtorName.trim(),saleId:"manual",originalAmount:amount,amountPaid:0,balance:amount,createdAt:new Date().toISOString()},...v]);
  setDebtorName("");setDebtAmount("");setNotice("Deni limehifadhiwa kwenye demo.");
 }
 async function repayDebt(id:string) {
  const amount=Number(repaymentAmount);
  if(!Number.isFinite(amount)||amount<=0){setNotice("Weka kiasi cha marejesho sahihi.");return;}
  const debt=debts.find(d=>d.id===id);
  if(!debt||amount>debt.balance){setNotice("Marejesho hayawezi kuzidi deni lililobaki.");return;}
  if(supabaseConfigured&&isConnected===false){setNotice("Marejesho hayajahifadhiwa. Unganisha mtandao kabla ya kurekodi malipo ya deni.");return;}
  if(supabaseConfigured){
   if(!supabase){setNotice("Database haijaunganishwa.");return;}
   setCloudLoading(true);
   const {data,error}=await supabase.rpc("record_debt_payment",{p_debt_id:id,p_amount:amount,p_method:"cash",p_note:null});
   setCloudLoading(false);
   if(error){setNotice("Marejesho hayajahifadhiwa: "+error.message);return;}
   setDebts(v=>v.map(d=>d.id===id?{...d,amountPaid:d.originalAmount-Number(data),balance:Number(data)}:d));
   setRepaymentAmount("");setNotice("Marejesho yamehifadhiwa kwenye database. Salio: "+formatTZS(Number(data)));return;
  }
  setDebts(v=>v.map(d=>d.id===id?{...d,amountPaid:d.amountPaid+amount,balance:d.balance-amount}:d));
  setRepaymentAmount("");setNotice("Marejesho yameandikwa kwenye demo.");
 }
 async function refundSale(sale:Sale) {
  const reason=refundReason.trim();
  if(reason.length<3){setNotice("Andika sababu ya kurejesha bidhaa (angalau herufi 3).");return;}
  if(sale.status!=="completed"||sale.amountPaid<sale.total){setNotice("Kwa sasa marejesho yanaruhusiwa kwa mauzo yaliyolipwa kikamilifu pekee.");return;}
  if(!sale.lines.length){setNotice("Risiti haina bidhaa za kurejesha.");return;}
  if(supabaseConfigured&&isConnected===false){setNotice("Refund haijafanyika. Unganisha mtandao ili kuthibitisha marejesho na kurejesha stock kwa usalama.");return;}
  if(supabaseConfigured){
   if(sale.lines.some(line=>!line.id)){setNotice("Taarifa za bidhaa za risiti hazijakamilika; haiwezekani kufanya refund salama.");return;}
   if(!supabase||!shopId){setNotice("Hakuna duka lililounganishwa.");return;}
   const key=refundKeys[sale.id]??makeIdempotencyKey();
   if(!refundKeys[sale.id])setRefundKeys(v=>({...v,[sale.id]:key}));
   setCloudLoading(true);setNotice("Inathibitisha marejesho kwenye database...");
   const {data,error}=await supabase.rpc("refund_sale",{
    p_shop_id:shopId,p_sale_id:sale.id,p_idempotency_key:key,p_reason:reason,p_refund_method:"cash",
    p_items:sale.lines.map(line=>({sale_item_id:line.id,quantity:line.quantity}))
   });
   setCloudLoading(false);
   if(error){setNotice("Refund haijakamilika: "+error.message);return;}
   const refunded=Array.isArray(data)?Number(data[0]?.refund_total):Number(data?.refund_total);
   setSales(v=>v.map(item=>item.id===sale.id?{...item,status:"refunded"}:item));
   setRefundKeys(v=>{const next={...v};delete next[sale.id];return next;});
   setRefundReason("");
   setNotice("Refund imehifadhiwa. Kiasi cha kurejesha: "+formatTZS(refunded||0)+". Stock imerudishwa kwenye hesabu.");
   return;
  }
  setProducts(v=>v.map(p=>{const returned=sale.lines.filter(line=>line.productId===p.id).reduce((sum,line)=>sum+line.quantity,0);return returned?{...p,stockQuantity:p.stockQuantity+returned}:p;}));
  setSales(v=>v.map(item=>item.id===sale.id?{...item,status:"refunded"}:item));
  setRefundReason("");setNotice("Demo refund imeandikwa na stock imerudishwa.");
 }
 async function retryPendingSale(key:string) {
  if(!shopId){setNotice("Hakuna duka lililochaguliwa.");return;}
  if(isConnected!==true){setNotice("Unganisha intaneti kabla ya kujaribu tena.");return;}
  const item=pendingOutbox.find(entry=>entry.idempotencyKey===key);
  if(!item||item.syncIssue==="PRICE_CHANGED"||item.syncIssue==="STOCK_CHANGED"){setNotice("Mauzo haya yanahitaji ukaguzi wa mmiliki; retry ya moja kwa moja imezuiwa.");return;}
  const next=pendingOutbox.map(entry=>entry.idempotencyKey===key?{...entry,syncIssue:undefined}:entry);
  await writePendingSales(shopId,userId,effectiveRole,next);
  setPendingOutbox(next);
  setNotice("Jaribio la kusawazisha limeanzishwa.");
 }
 async function queueOfflineCheckout(key:string) {
  if(!shopId){setNotice("Shop ID haipo; haiwezekani kuweka mauzo kwenye foleni.");return;}
  if(!hasShopProductCache){setNotice("Hatujahifadhi orodha ya bidhaa ya duka hili kwenye simu. Unganisha intaneti kwanza ili kupakua bidhaa kabla ya kutumia POS offline.");return;}
  const lines=cart.map(line=>{const p=products.find(item=>item.id===line.productId);if(!p)throw new Error("Bidhaa haipo kwenye orodha ya ndani.");if(line.quantity>p.stockQuantity)throw new Error("Stock ya "+p.name+" haitoshi kulingana na cache ya mwisho.");return {productId:p.id,productName:p.name,quantity:line.quantity,unitPrice:p.sellingPrice,unitCost:p.costPrice,lineTotal:p.sellingPrice*line.quantity};});
  const total=lines.reduce((sum,line)=>sum+line.lineTotal,0);
  const sale:Sale={id:"pending-"+key,receiptNumber:"PENDING-"+key.slice(0,8).toUpperCase(),createdAt:new Date().toISOString(),lines,subtotal:total,discount:0,total,amountPaid:total,balance:0,paymentMethod:"cash",status:"pending_sync"};
  const item:PendingSale={shopId,idempotencyKey:key,items:cart.map(line=>({product_id:line.productId,quantity:line.quantity})),sale,queuedAt:new Date().toISOString()};
  const next=[...pendingOutbox.filter(entry=>entry.idempotencyKey!==key),item];
  await writePendingSales(shopId,userId,effectiveRole,next);
  setPendingOutbox(next);setSales(current=>[sale,...current]);
  setProducts(current=>current.map(p=>{const line=cart.find(x=>x.productId===p.id);return line?{...p,stockQuantity:Math.max(0,p.stockQuantity-line.quantity)}:p;}));
  setCart([]);setPendingCheckoutKey(null);
  setNotice("Mauzo yamehifadhiwa kwenye simu bila mtandao. Yatasawazishwa mtandao utakaporudi; bado hayajathibitishwa na server.");
  resetToHome();
 }
 async function checkout() {
  if(!cart.length){setNotice("Add a product before checkout.");return;}
  if (supabaseConfigured) {
   if(isConnected===false){try{await queueOfflineCheckout(pendingCheckoutKey??makeIdempotencyKey());}catch(e){setNotice("Haikuweza kuhifadhi mauzo offline: "+(e instanceof Error?e.message:"hitilafu"));}return;}
   if (!shopId || !supabase) { setNotice("Akaunti haijaunganishwa na duka. Ingia tena au unda duka."); return; }
   const key=pendingCheckoutKey ?? makeIdempotencyKey();
   if(!pendingCheckoutKey) setPendingCheckoutKey(key);
   setCloudLoading(true);setNotice("Inatuma mauzo salama kwenye database...");
   try {
    const result=await submitCheckout({shopId,idempotencyKey:key,items:cart.map(x=>({product_id:x.productId,quantity:x.quantity})),paymentMethod:"cash"});
    setCart([]);setPendingCheckoutKey(null);
    const {data,error}=await supabase.rpc("get_shop_products",{p_shop_id:shopId});
    if(!error&&data){const mapped=data.map((p:any)=>({id:p.id,name:p.name,sku:p.sku??"",unit:p.unit,costPrice:Number(p.cost_price),sellingPrice:Number(p.selling_price),stockQuantity:Number(p.stock_quantity),reorderLevel:Number(p.reorder_level),active:p.active}));setProducts(mapped);void writeCachedProducts(shopId,userId,effectiveRole,mapped,effectiveRole==="manager"?managerPermissions.slice().sort().join(","):"");}
    setNotice("Mauzo yamehifadhiwa: "+result.receiptNumber+" · "+formatTZS(result.total));
    resetToHome();
   } catch(e) { const network=await NetInfo.fetch();if(!network.isConnected){try{await queueOfflineCheckout(key);}catch(queueError){setNotice("Mtandao umekatika na mauzo hayajahifadhiwa offline: "+(queueError instanceof Error?queueError.message:"hitilafu"));}}else{setNotice("Mauzo hayajakamilika: "+(e instanceof Error?e.message:"Hitilafu isiyojulikana")+". Hakikisha muamala haujakamilika kabla ya kujaribu tena.");} }
   finally { setCloudLoading(false); }
   return;
  }
  if(!cart.length){setNotice("Add a product before checkout.");return;}
  const lines=cart.map(x=>{const p=products.find(y=>y.id===x.productId)!;return {productId:p.id,productName:p.name,quantity:x.quantity,unitPrice:p.sellingPrice,unitCost:p.costPrice,lineTotal:p.sellingPrice*x.quantity};});
  const total=lines.reduce((a,x)=>a+x.lineTotal,0);
  const sale:Sale={id:"local-"+Date.now(),receiptNumber:"DEMO-"+String(sales.length+1).padStart(4,"0"),createdAt:new Date().toISOString(),lines,subtotal:total,discount:0,total,amountPaid:total,balance:0,paymentMethod:"cash",status:"completed"};
  setSales(v=>[sale,...v]);setProducts(v=>v.map(p=>{const line=cart.find(x=>x.productId===p.id);return line?{...p,stockQuantity:p.stockQuantity-line.quantity}:p;}));setCart([]);setNotice("Demo checkout completed: "+sale.receiptNumber);resetToHome();
 }
 if (screen === "Owner" && isPlatformAdmin) {
  return (
   <SafeAreaView style={[s.adminSafe,darkMode&&{backgroundColor:"#081522"}]}>
    <StatusBar barStyle={darkMode?"light-content":"dark-content"} backgroundColor={darkMode?"#081522":"#FFFFFF"}/>
    <ScrollView style={[s.adminScroll,darkMode&&{backgroundColor:"#081522"}]} contentContainerStyle={[s.adminScrollContent,darkMode&&{backgroundColor:"#081522"}]}>
     <PlatformOwnerDashboard darkMode={darkMode} onToggleTheme={toggleTheme}/>
    </ScrollView>
   </SafeAreaView>
  );
 }
 const ownerHome=screen==="Home"&&effectiveRole==="owner";
 return <SafeAreaView style={[s.safe,ownerHome&&{backgroundColor:"#FFFFFF"},darkMode&&{backgroundColor:"#081522"}]}><StatusBar barStyle={darkMode?"light-content":"dark-content"} backgroundColor={darkMode?"#081522":"#FFFFFF"}/>
  <View style={[s.header,ownerHome&&{backgroundColor:"#FFFFFF",paddingTop:6,paddingBottom:6,minHeight:44},darkMode&&{backgroundColor:"#081522"}]}>{!ownerHome&&<View style={s.businessBrandHeader}>{businessBrand.logo?<Image source={{uri:businessBrand.logo}} style={s.businessBrandLogo} resizeMode="contain"/>:<View style={s.businessBrandPlaceholder}><Text style={s.businessBrandCamera}>▣</Text><Text style={s.businessBrandAdd}>ADD YOUR LOGO</Text></View>}<Text numberOfLines={1} style={[s.businessBrandName,!darkMode&&{color:"#142D42"}]}>{businessBrand.name}</Text></View>}<Pressable accessibilityRole="button" accessibilityLabel={darkMode?"Washa Light Mode":"Washa Dark Mode"} onPress={toggleTheme} style={[s.logoutButton,{right:76,backgroundColor:darkMode?"#173D36":"#E8EEF5"}]}><Text style={[s.logoutText,{color:darkMode?"#75E0B8":"#173247"}]}>{darkMode?"☀":"☾"}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Toka kwenye akaunti" onPress={()=>void signOut()} style={s.logoutButton}><Text style={s.logoutText}>Toka</Text></Pressable></View>
{showMore&&<View style={[s.morePanel,!darkMode&&{backgroundColor:"#F1F5F9",borderColor:"#DCE5EC"}]}>{visibleScreens.filter(x=>!["Home","POS","Stock"].includes(x)).map(x=><Pressable key={x} onPress={()=>navigateTo(x)} style={[s.moreItem,!darkMode&&{backgroundColor:"#F1F5F9",borderColor:"#DCE5EC"}]}><Text style={[s.moreText,!darkMode&&{color:"#142D42"}]}>{({Debts:"Madeni",Expenses:"Gharama",Returns:"Marejesho",Sync:"Offline Sync",Payments:"Malipo",Reports:"Ripoti",Staff:"Wafanyakazi",Subscription:"Subscription",Owner:"Super Admin"} as Partial<Record<Screen,string>>)[x]??x}</Text></Pressable>)}</View>}
  <ScrollView contentContainerStyle={[s.content,darkMode&&{backgroundColor:"#081522"}]}>
    {screen==="Home"&&effectiveRole==="owner"&&<OwnerBusinessDashboard darkMode={darkMode} onToggleTheme={toggleTheme} shopId={shopId} sales={sales} products={products} expenses={expenses} debts={debts} refunds={refunds} refundsLoaded={refundsLoaded} pendingSales={pendingOutbox} notice={notice} online={isConnected} onNavigate={navigateTo}/>}
    {screen==="Home"&&effectiveRole!=="owner"&&<> 
     <View style={[s.profileHero,!darkMode&&{backgroundColor:"#F1F5F9",borderColor:"#DCE5EC"}]}><View style={s.profileCopy}><Text style={s.eyebrow}>WELCOME BACK</Text><Text style={[s.heroTitle,!darkMode&&{color:"#142D42"}]}>{effectiveRole==="manager"?"Business Manager":effectiveRole==="cashier"?"Cashier":"Stockkeeper"}</Text><Text style={s.rolePill}>{effectiveRole.toUpperCase()}</Text></View><View style={s.profileAvatar}><Text style={s.avatarLetter}>{effectiveRole==="manager"?"M":effectiveRole==="cashier"?"C":"S"}</Text></View></View>
     {effectiveRole==="manager"&&<><View style={s.row}><Metric darkMode={darkMode} label="TOTAL SALES" value={refundsLoaded?formatTZS(totalSales(sales,refundTotal)):"Inapakia"}/><Metric darkMode={darkMode} label="EST. NET PROFIT*" value={refundsLoaded?formatTZS(netProfit(sales,expenses,refunds)):"Inapakia"}/></View><View style={s.row}><Metric darkMode={darkMode} label="LOW STOCK" value={lowStock+" items"}/><Metric darkMode={darkMode} label="SALES COUNT" value={String(countSales(sales))}/></View><View style={s.row}><Metric darkMode={darkMode} label="MADENI YALIYOBAKI" value={formatTZS(outstandingDebt)}/><Metric darkMode={darkMode} label="GHARAMA" value={formatTZS(expenses.reduce((a,x)=>a+x.amount,0))}/></View></>}
     {effectiveRole==="cashier"&&<><View style={s.row}><Metric darkMode={darkMode} label="MAUZO YAKO" value={formatTZS(totalSales(sales.filter(sale=>sale.status!=="refunded")))}/><Metric darkMode={darkMode} label="IDADI YA RISITI" value={String(countSales(sales.filter(sale=>sale.status!=="refunded")))}/></View><Text style={[s.muted,!darkMode&&{color:"#142D42"}]}>Takwimu hizi zinahusu mauzo yaliyohusishwa na akaunti yako pekee.</Text></>}
     {effectiveRole==="stockkeeper"&&<><View style={s.row}><Metric darkMode={darkMode} label="BIDHAA ZINAZOFUATILIWA" value={String(products.filter(p=>p.active).length)}/><Metric darkMode={darkMode} label="LOW STOCK" value={lowStock+" items"}/></View><Text style={[s.muted,!darkMode&&{color:"#142D42"}]}>Una ruhusa ya kuona bidhaa na kupokea stock; taarifa za fedha hazionyeshwi.</Text></>}
     <Text style={[s.heading,!darkMode&&{color:"#142D42"}]}>Management Tools</Text><View style={s.actionGrid}>{(effectiveRole==="cashier"?[["＋","New Sale","POS"],["▤","My Debts","Debts"],["⇄","Sync Status","Sync"]]:effectiveRole==="stockkeeper"?[["▤","Stock Check","Stock"],["⇄","Sync Status","Sync"]]:[["▣","Sales & POS","POS"],["▤","Stock Inventory","Stock"],["♙","Employees","Staff"],["▥","Business Reports","Reports"]]).filter(item=>visibleScreens.includes(item[2] as Screen)).map(([icon,label,target])=><Pressable key={target} onPress={()=>navigateTo(target as Screen)} style={[s.actionTile,!darkMode&&{backgroundColor:"#F1F5F9",borderColor:"#DCE5EC"}]}><Text style={s.actionIcon}>{icon}</Text><Text style={[s.actionLabel,!darkMode&&{color:"#142D42"}]}>{label}</Text></Pressable>)}</View>
     <Text style={s.notice}>{isConnected===false?"OFFLINE · ":isConnected===true?"ONLINE · ":""}{pendingOutbox.length>0?pendingOutbox.length+" mauzo yanasubiri kusawazishwa. ":""}{notice}</Text>
    </>}
   {screen==="POS"&&<><Text style={[s.pageTitle,!darkMode&&{color:"#142D42"}]}>Point of Sale</Text><Text style={[s.muted,!darkMode&&{color:"#142D42"}]}>{supabaseConfigured ? (cloudLoading ? "Inapakia bidhaa..." : "Bidhaa za duka lako kutoka database.") : "Tap a product to add it to the cart."}</Text>{products.filter(p=>p.active).map(p=><View key={p.id} style={[s.list,!darkMode&&{backgroundColor:"#F1F5F9",borderColor:"#DCE5EC"}]}><View style={s.flex}><Text style={[s.item,!darkMode&&{color:"#142D42"}]}>{p.name}</Text><Text style={[s.muted,!darkMode&&{color:"#142D42"}]}>{formatTZS(p.sellingPrice)} · Stock {p.stockQuantity}</Text></View><Button label="Add" quiet onPress={()=>add(p)}/></View>)}<View style={[s.panel,!darkMode&&{backgroundColor:"#F1F5F9",borderColor:"#DCE5EC"}]}><Text style={[s.heading,!darkMode&&{color:"#142D42"}]}>Cart ({cart.reduce((a,x)=>a+x.quantity,0)} items)</Text>{cart.map(x=>{const p=products.find(y=>y.id===x.productId)!;return <Text key={x.productId} style={[s.muted,!darkMode&&{color:"#142D42"}]}>{p.name} × {x.quantity} — {formatTZS(p.sellingPrice*x.quantity)}</Text>;})}<Text style={s.total}>Total: {formatTZS(cartTotal)}</Text><Button label={supabaseConfigured ? "Complete cash sale" : "Complete demo cash sale"} onPress={checkout}/><Button label="Clear cart" quiet onPress={()=>setCart([])}/></View><Text style={s.notice}>{notice}</Text></>}
    {screen==="Stock"&&<>{(effectiveRole==="owner"||(effectiveRole==="manager"&&managerPermissions.includes("products.manage")))&&<ProductManagement darkMode={darkMode} shopId={shopId} onProductsChanged={()=>{void refreshProductsFromCloud();}}/>}<View style={[s.panel,!darkMode&&{backgroundColor:"#F1F5F9",borderColor:"#DCE5EC"}]}><Text style={[s.heading,!darkMode&&{color:"#142D42"}]}>Pokea stock</Text><TextInput value={stockInAmount} onChangeText={setStockInAmount} placeholder="Kiasi cha stock kinachoingia" placeholderTextColor="#8194A5" keyboardType="decimal-pad" style={[s.field,!darkMode&&{backgroundColor:"#FFFFFF",borderColor:"#CBD5E1",color:"#142D42"}]}/></View>{products.filter(p=>p.active).map(p=><View key={p.id} style={[s.list,!darkMode&&{backgroundColor:"#F1F5F9",borderColor:"#DCE5EC"}]}><View style={s.flex}><Text style={[s.item,!darkMode&&{color:"#142D42"}]}>{p.name}</Text><Text style={[s.muted,!darkMode&&{color:"#142D42"}]}>SKU {p.sku} · Stock {p.stockQuantity} {p.unit}</Text></View><Button label="＋ Stock in" quiet onPress={()=>receiveStock(p.id)}/></View>)}<Text style={[s.foot,!darkMode&&{color:"#142D42"}]}>Stock in huhifadhiwa kupitia RPC salama na historia ya stock movement. {effectiveRole==="stockkeeper"?"Mabadiliko ya katalogi yanasimamiwa na mmiliki au meneja.":""}</Text></>}
   {screen==="Debts"&&<><Text style={[s.pageTitle,!darkMode&&{color:"#142D42"}]}>Kitabu cha Madeni</Text><Text style={[s.muted,!darkMode&&{color:"#142D42"}]}>Rekodi madeni ya wateja na malipo wanayorejesha.</Text><View style={[s.panel,!darkMode&&{backgroundColor:"#F1F5F9",borderColor:"#DCE5EC"}]}><Text style={[s.heading,!darkMode&&{color:"#142D42"}]}>Ongeza deni jipya</Text><TextInput value={debtorName} onChangeText={setDebtorName} placeholder="Jina la mteja" placeholderTextColor="#8194A5" style={s.field}/><TextInput value={debtAmount} onChangeText={setDebtAmount} placeholder="Kiasi cha deni (TZS)" placeholderTextColor="#8194A5" keyboardType="numeric" style={s.field}/><Button label={supabaseConfigured ? "Hifadhi deni" : "Hifadhi deni (demo)"} onPress={addDebt}/></View><Metric darkMode={darkMode} label="JUMLA YA MADENI YALIYOBAKI" value={formatTZS(outstandingDebt)}/>{debts.map(d=><View key={d.id} style={[s.panel,!darkMode&&{backgroundColor:"#F1F5F9",borderColor:"#DCE5EC"}]}><Text style={[s.item,!darkMode&&{color:"#142D42"}]}>{d.customerName}</Text><Text style={[s.muted,!darkMode&&{color:"#142D42"}]}>Deni la awali: {formatTZS(d.originalAmount)} · Amelipa: {formatTZS(d.amountPaid)}</Text><Text style={s.total}>Baki: {formatTZS(d.balance)}</Text>{d.balance>0&&<><TextInput value={repaymentAmount} onChangeText={setRepaymentAmount} placeholder="Kiasi cha kurejesha (TZS)" placeholderTextColor="#8194A5" keyboardType="numeric" style={s.field}/><Button label="Rekodi marejesho" quiet onPress={()=>repayDebt(d.id)}/></>}</View>)}<Text style={[s.foot,!darkMode&&{color:"#142D42"}]}>{supabaseConfigured ? "Madeni na marejesho huhifadhiwa kwenye database ya duka." : "Data hii ni ya majaribio kwenye kumbukumbu ya muda ya app; bado haisawazishwi na database."}</Text></>}
   {screen==="Expenses"&&<><Text style={[s.pageTitle,!darkMode&&{color:"#142D42"}]}>Gharama za Biashara</Text><Text style={[s.muted,!darkMode&&{color:"#142D42"}]}>Andika gharama ili ionekane kwenye makadirio ya faida.</Text><View style={[s.panel,!darkMode&&{backgroundColor:"#F1F5F9",borderColor:"#DCE5EC"}]}><Text style={[s.heading,!darkMode&&{color:"#142D42"}]}>Ongeza gharama</Text><TextInput value={expenseName} onChangeText={setExpenseName} placeholder="Mfano: Usafiri, kodi, umeme" placeholderTextColor="#8194A5" style={s.field}/><TextInput value={expenseAmount} onChangeText={setExpenseAmount} placeholder="Kiasi (TZS)" placeholderTextColor="#8194A5" keyboardType="numeric" style={s.field}/><Button label={supabaseConfigured ? "Hifadhi gharama" : "Hifadhi gharama (demo)"} onPress={addExpense}/></View><Metric darkMode={darkMode} label="JUMLA YA GHARAMA" value={formatTZS(expenses.reduce((a,x)=>a+x.amount,0))}/>{expenses.map(e=><View key={e.id} style={[s.list,!darkMode&&{backgroundColor:"#F1F5F9",borderColor:"#DCE5EC"}]}><View style={s.flex}><Text style={[s.item,!darkMode&&{color:"#142D42"}]}>{e.description}</Text><Text style={[s.muted,!darkMode&&{color:"#142D42"}]}>{new Date((e.expenseDate??e.createdAt).slice(0,10)+"T00:00:00").toLocaleDateString("sw-TZ")}</Text></View><Text style={s.stock}>{formatTZS(e.amount)}</Text></View>)}<Text style={[s.foot,!darkMode&&{color:"#142D42"}]}>{supabaseConfigured ? "Gharama hizi zimehifadhiwa kwenye database ya duka." : "Gharama zinawekwa kwenye demo tu; data haitadumu baada ya app kufungwa."}</Text></>}
   {screen==="Returns"&&<><Text style={[s.pageTitle,!darkMode&&{color:"#142D42"}]}>Returns & Refunds</Text><Text style={[s.muted,!darkMode&&{color:"#142D42"}]}>Rejesha bidhaa na rudisha fedha kwa mauzo yaliyolipwa kikamilifu. Marejesho yote yanarekodiwa kwenye historia.</Text><View style={[s.panel,!darkMode&&{backgroundColor:"#F1F5F9",borderColor:"#DCE5EC"}]}><Text style={[s.heading,!darkMode&&{color:"#142D42"}]}>Sababu ya kurejesha</Text><TextInput value={refundReason} onChangeText={setRefundReason} placeholder="Mfano: Bidhaa imeharibika / mteja amerejesha" placeholderTextColor="#8194A5" style={s.field}/><Text style={[s.foot,!darkMode&&{color:"#142D42"}]}>Kwa sasa mfumo unaruhusu kurejesha risiti nzima kwa malipo ya cash. Marejesho ya sehemu na njia nyingine za refund zitaongezwa baadaye.</Text></View>{sales.filter(sale=>sale.status==="completed"&&sale.amountPaid>=sale.total).map(sale=><View key={sale.id} style={[s.panel,!darkMode&&{backgroundColor:"#F1F5F9",borderColor:"#DCE5EC"}]}><Text style={[s.item,!darkMode&&{color:"#142D42"}]}>Risiti {sale.receiptNumber}</Text><Text style={[s.muted,!darkMode&&{color:"#142D42"}]}>{new Date(sale.createdAt).toLocaleString("sw-TZ")} · {sale.lines.length} bidhaa</Text>{sale.lines.map((line,index)=><Text key={line.id??index} style={[s.muted,!darkMode&&{color:"#142D42"}]}>{line.productName} × {line.quantity}</Text>)}<Text style={s.total}>{formatTZS(sale.total)}</Text><Button label={supabaseConfigured?"Thibitisha refund nzima (cash)":"Refund nzima (demo)"} quiet onPress={()=>refundSale(sale)}/></View>)}{sales.filter(sale=>sale.status==="refunded").length>0&&<Text style={[s.foot,!darkMode&&{color:"#142D42"}]}>Risiti zilizorejeshwa kikamilifu: {sales.filter(sale=>sale.status==="refunded").length}</Text>}</>}
   {screen==="Sync"&&<><Text style={[s.pageTitle,!darkMode&&{color:"#142D42"}]}>Offline Sync Review</Text><Text style={[s.muted,!darkMode&&{color:"#142D42"}]}>Mauzo yaliyohifadhiwa kwenye simu lakini bado hayajathibitishwa na server. Usifute rekodi hizi kama fedha tayari zimepokelewa.</Text><View style={[s.panel,!darkMode&&{backgroundColor:"#F1F5F9",borderColor:"#DCE5EC"}]}><Metric darkMode={darkMode} label="MAUZO YANAYOSUBIRI" value={String(pendingOutbox.length)}/><Text style={[s.muted,!darkMode&&{color:"#142D42"}]}>Hali ya mtandao: {isConnected===true?"ONLINE":isConnected===false?"OFFLINE":"INAKAGUA"}</Text></View>{pendingOutbox.length===0?<Text style={s.notice}>Hakuna mauzo yanayosubiri kusawazishwa.</Text>:pendingOutbox.map(item=><View key={item.idempotencyKey} style={[s.panel,!darkMode&&{backgroundColor:"#F1F5F9",borderColor:"#DCE5EC"}]}><Text style={[s.item,!darkMode&&{color:"#142D42"}]}>{item.sale.receiptNumber}</Text><Text style={[s.muted,!darkMode&&{color:"#142D42"}]}>{new Date(item.queuedAt).toLocaleString("sw-TZ")} · {item.items.length} bidhaa</Text>{item.sale.lines.map((line,index)=><Text key={line.productId+index} style={[s.muted,!darkMode&&{color:"#142D42"}]}>{line.productName} × {line.quantity} · {formatTZS(line.lineTotal)}</Text>)}<Text style={s.total}>{formatTZS(item.sale.total)}</Text><Text style={s.notice}>{item.syncIssue==="PRICE_CHANGED"?"Bei ya server imebadilika. Muamala umefungwa kwa ukaguzi wa mmiliki; thibitisha bei na mteja kabla ya kuamua hatua inayofuata.":item.syncIssue==="STOCK_CHANGED"?"Stock ya server haitoshi. Kagua stock na uthibitishe kama mauzo yalifanyika kabla ya kuendelea.":item.syncIssue==="SYNC_FAILED"?"Server haikupokea muamala. Jaribu tena baada ya kuthibitisha intaneti na hali ya database.":"Inasubiri kusawazishwa; bado si mauzo yaliyothibitishwa."}</Text>{(!item.syncIssue||item.syncIssue==="SYNC_FAILED")&&<Button label="Jaribu kusawazisha tena" quiet onPress={()=>retryPendingSale(item.idempotencyKey)}/>}</View>)}<Text style={[s.foot,!darkMode&&{color:"#142D42"}]}>Bei au stock ikibadilika, app haibadilishi bei kimyakimya wala haifuti mauzo. Mmiliki anapaswa kulinganisha risiti ya mteja na rekodi za server kabla ya kuchukua hatua.</Text></>}
   {screen==="Payments"&&<><Text style={[s.pageTitle,!darkMode&&{color:"#142D42"}]}>Payment Instructions</Text><Text style={[s.muted,!darkMode&&{color:"#142D42"}]}>Manual payment details supplied by the business owner. Confirm the recipient and amount before sending.</Text><View style={[s.panel,!darkMode&&{backgroundColor:"#F1F5F9",borderColor:"#DCE5EC"}]}><Text style={s.eyebrow}>HALOPESA</Text><Text style={s.paymentNumber}>0621665181</Text><Text style={[s.item,!darkMode&&{color:"#142D42"}]}>REORNADA BINARY RHESPICIOUS</Text><Text style={[s.muted,!darkMode&&{color:"#142D42"}]}>Use this number for HaloPesa payments.</Text></View><View style={[s.panel,!darkMode&&{backgroundColor:"#F1F5F9",borderColor:"#DCE5EC"}]}><Text style={s.eyebrow}>M-PESA</Text><Text style={s.paymentNumber}>0797665181</Text><Text style={[s.item,!darkMode&&{color:"#142D42"}]}>ELIAS PAUL MARWA</Text><Text style={[s.muted,!darkMode&&{color:"#142D42"}]}>Use this number for M-Pesa payments.</Text></View><Text style={s.notice}>IMPORTANT: These are manual payment instructions only. App payment verification, automatic Pro activation and provider API callbacks are not connected yet. Never mark a payment as successful based only on a screenshot or customer message.</Text></>}
   {screen==="Reports"&&<><Text style={[s.pageTitle,!darkMode&&{color:"#142D42"}]}>Ripoti za Biashara</Text><Text style={[s.muted,!darkMode&&{color:"#142D42"}]}>{supabaseConfigured ? "Muhtasari wa miamala iliyopakiwa kutoka database ya duka." : "Muhtasari wa data ya majaribio pekee."}</Text><View style={[s.panel,!darkMode&&{backgroundColor:"#F1F5F9",borderColor:"#DCE5EC"}]}><Text style={[s.heading,!darkMode&&{color:"#142D42"}]}>Chagua kipindi</Text><View style={s.row}>{([{id:"today",label:"Leo"},{id:"7d",label:"Siku 7"},{id:"30d",label:"Siku 30"}] as const).map(option=><Pressable key={option.id} onPress={()=>setReportRange(option.id)} style={[s.navItem,reportRange===option.id&&s.navOn]}><Text style={[s.navText,reportRange===option.id&&s.navTextOn]}>{option.label}</Text></Pressable>)}</View><View style={s.row}>{([{id:"year",label:"Mwaka huu"},{id:"all",label:"Tangu mwanzo"}] as const).map(option=><Pressable key={option.id} onPress={()=>setReportRange(option.id)} style={[s.navItem,reportRange===option.id&&s.navOn]}><Text style={[s.navText,reportRange===option.id&&s.navTextOn]}>{option.label}</Text></Pressable>)}</View></View><View style={[s.panel,!darkMode&&{backgroundColor:"#F1F5F9",borderColor:"#DCE5EC"}]}><Text style={[s.heading,!darkMode&&{color:"#142D42"}]}>Pakua / Shiriki Ripoti</Text><Text style={[s.muted,!darkMode&&{color:"#142D42"}]}>PDF kwa ripoti rasmi, au CSV inayofunguka kwenye Microsoft Excel na programu nyingine za spreadsheet.</Text><View style={s.row}><View style={s.flex}><Button label="Tengeneza PDF" onPress={()=>exportReport("pdf")}/></View><View style={s.flex}><Button label="Export Excel (CSV)" quiet onPress={()=>exportReport("csv")}/></View></View></View><Metric darkMode={darkMode} label="MAUZO YALIYOTHIBITISHWA" value={reportRefundTotal===null?"Haijapatikana":formatTZS(reportSalesValue)}/><Metric darkMode={darkMode} label="IDADI YA MAUZO" value={String(countSales(reportSales))}/><Metric darkMode={darkMode} label="REFUNDS ZA KIPINDI" value={reportRefundTotal===null?"Haijapatikana":formatTZS(reportRefundTotal)}/><Metric darkMode={darkMode} label="GHARAMA ZA KIPINDI" value={formatTZS(reportExpenseValue)}/><Metric darkMode={darkMode} label="FAIDA HALISI YA MAKADIRIO" value={reportProfit===null?"Haijapatikana":formatTZS(reportProfit)}/><Text style={[s.foot,!darkMode&&{color:"#142D42"}]}>Ripoti inachuja mauzo kwa tarehe ya muamala, gharama kwa tarehe ya gharama, na refunds kwa tarehe ya kurejesha. Mauzo yanayosubiri sync hayahesabiwi. Faida ni makadirio kabla ya kodi na gharama ambazo hazijaingizwa.</Text></>}
     {screen==="Owner"&&isPlatformAdmin&&<PlatformOwnerDashboard darkMode={darkMode} onToggleTheme={toggleTheme}/>}
     {screen==="Staff"&&effectiveRole==="owner"&&<StaffManagement darkMode={darkMode}/>}
     {screen==="Subscription"&&effectiveRole==="owner"&&<SubscriptionManagement darkMode={darkMode}/>}
  </ScrollView>
  <View style={[s.bottomNav,!darkMode&&{backgroundColor:"#F1F5F9",borderColor:"#DCE5EC"}]}>{[["⌂","Home"],["▣","POS"],["▤","Stock"],["☰","More"]].filter(([icon,label])=>label==="More"||visibleScreens.includes(label as Screen)).map(([icon,label])=><Pressable key={label} onPress={()=>label==="More"?setShowMore(v=>!v):navigateTo(label as Screen)} style={s.bottomItem}><Text style={[s.bottomIcon,(label==="More"?showMore:screen===label)&&s.bottomActive]}>{icon}</Text><Text style={[s.bottomLabel,(label==="More"?showMore:screen===label)&&s.bottomActive]}>{label}</Text></Pressable>)}</View>
 </SafeAreaView>;
}
const s=StyleSheet.create({
 adminSafe:{flex:1,width:"100%",backgroundColor:"#FFFFFF"},adminScroll:{flex:1,width:"100%",backgroundColor:"#FFFFFF"},adminScrollContent:{flexGrow:1,width:"100%",backgroundColor:"#FFFFFF"}, safe:{flex:1,backgroundColor:"#081522"},profileHero:{padding:18,backgroundColor:"#102438",borderRadius:17,borderWidth:1,borderColor:"#1D3A50",marginBottom:12,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},profileCopy:{flex:1},rolePill:{alignSelf:"flex-start",overflow:"hidden",color:"#75E0B8",backgroundColor:"#173D36",paddingHorizontal:10,paddingVertical:5,borderRadius:20,fontSize:9,fontWeight:"900",marginTop:8},profileAvatar:{width:54,height:54,borderRadius:27,backgroundColor:"#174A40",borderWidth:2,borderColor:"#D7B56D",alignItems:"center",justifyContent:"center"},avatarLetter:{color:"#F2D99F",fontSize:22,fontWeight:"900"},actionGrid:{flexDirection:"row",flexWrap:"wrap",gap:10,marginTop:8},actionTile:{width:"47.8%",minHeight:126,backgroundColor:"#102438",borderWidth:1,borderColor:"#1D3A50",borderRadius:12,padding:11,justifyContent:"center"},actionIcon:{fontSize:70,color:"#D7B56D",fontWeight:"900",marginBottom:8},actionLabel:{color:"#F4F7FA",fontWeight:"800",fontSize:16},morePanel:{marginHorizontal:14,marginTop:8,padding:10,backgroundColor:"#102438",borderColor:"#D7B56D",borderWidth:1,borderRadius:13,flexDirection:"row",flexWrap:"wrap",gap:8},moreItem:{backgroundColor:"#173247",paddingHorizontal:13,paddingVertical:10,borderRadius:9},moreText:{color:"#F4F7FA",fontSize:11,fontWeight:"800"},bottomNav:{flexDirection:"row",justifyContent:"space-around",alignItems:"center",backgroundColor:"#0D2030",borderTopWidth:1,borderTopColor:"#24445A",paddingTop:8,paddingBottom:8},bottomItem:{flex:1,alignItems:"center",gap:3},bottomIcon:{fontSize:50,color:"#C1CED8",fontWeight:"800"},bottomLabel:{fontSize:13,color:"#C1CED8",fontWeight:"800"},bottomActive:{color:"#75E0B8"},header:{paddingTop:12,paddingBottom:14,paddingHorizontal:17,alignItems:"center",justifyContent:"center"},businessBrandHeader:{width:"100%",alignItems:"center",justifyContent:"center",gap:5,minHeight:104},businessBrandLogo:{width:220,height:78},businessBrandPlaceholder:{width:"100%",height:78,borderWidth:1.5,borderStyle:"dashed",borderColor:"#64748B",borderRadius:12,alignItems:"center",justifyContent:"center",backgroundColor:"#F8FAFC"},businessBrandCamera:{fontSize:56,color:"#64748B",fontWeight:"900"},businessBrandAdd:{fontSize:11,color:"#0B1F4A",fontWeight:"900",letterSpacing:1},businessBrandName:{color:"#FFFFFF",fontSize:18,fontWeight:"900",maxWidth:"78%"},eyebrow:{color:"#43C99A",fontSize:10,fontWeight:"800",letterSpacing:1.5},brand:{color:"#F4F7FA",fontSize:19,fontWeight:"900"},gold:{color:"#D7B56D"},logoImage:{width:400,height:250,alignSelf:"center",marginBottom:5,backgroundColor:"transparent"},logoutButton:{position:"absolute",right:12,top:10,backgroundColor:"#173D36",borderWidth:1,borderColor:"#43C99A",paddingHorizontal:13,paddingVertical:9,borderRadius:10},logoutText:{color:"#75E0B8",fontSize:12,fontWeight:"900"},headerText:{alignItems:"center"},dashboardGrid:{flexDirection:"row",flexWrap:"wrap",gap:9,paddingHorizontal:14,paddingTop:10,paddingBottom:6,maxWidth:900,width:"100%",alignSelf:"center"},dashboardTile:{width:"31.5%",minHeight:116,backgroundColor:"#102438",borderColor:"#1D3A50",borderWidth:1,borderRadius:11,padding:8,justifyContent:"center"},dashboardTileOn:{backgroundColor:"#153B36",borderColor:"#D7B56D",borderWidth:1.5},tileIcon:{color:"#D7B56D",fontSize:66,fontWeight:"900",marginBottom:6},tileIconOn:{color:"#75E0B8"},tileLabel:{color:"#F4F7FA",fontSize:15,fontWeight:"900"},tileLabelOn:{color:"#FFFFFF"},tileHint:{color:"#91A4B5",fontSize:11,marginTop:3},navItem:{paddingHorizontal:16,paddingVertical:11,alignItems:"center",backgroundColor:"#102438",borderRadius:11},field:{backgroundColor:"#0B1B2A",borderWidth:1,borderColor:"#2B4B61",borderRadius:9,color:"#F4F7FA",paddingHorizontal:12,paddingVertical:11,marginTop:9,fontSize:13},paymentNumber:{color:"#F2D99F",fontSize:25,fontWeight:"900",letterSpacing:1,marginTop:9,marginBottom:6},navOn:{backgroundColor:"#174A40",borderWidth:1,borderColor:"#43C99A"},navText:{color:"#C1CED8",fontSize:13,fontWeight:"800"},navTextOn:{color:"#75E0B8"},content:{padding:16,paddingBottom:40,maxWidth:900,width:"100%",alignSelf:"center"},hero:{padding:20,backgroundColor:"#102438",borderRadius:17,borderWidth:1,borderColor:"#1D3A50",marginBottom:12},heroTitle:{color:"#FFF",fontSize:25,fontWeight:"900",marginTop:8},muted:{color:"#C1CED8",fontSize:14,lineHeight:21,marginTop:5},row:{flexDirection:"row",gap:10,marginBottom:10},flex:{flex:1},metric:{flex:1,minHeight:72,padding:10,backgroundColor:"#102438",borderRadius:14,borderWidth:1,borderColor:"#1D3A50",marginBottom:9,justifyContent:"center"},label:{color:"#C1CED8",fontSize:14,fontWeight:"900"},value:{color:"#F4F7FA",fontSize:21,fontWeight:"900",marginTop:8},heading:{color:"#FFF",fontSize:17,fontWeight:"800",marginTop:12,marginBottom:8},pageTitle:{color:"#FFF",fontSize:24,fontWeight:"900"},button:{backgroundColor:"#16785C",padding:13,borderRadius:11,alignItems:"center",justifyContent:"center",marginTop:7},quiet:{backgroundColor:"#173247",borderWidth:1,borderColor:"#2B4B61"},buttonText:{color:"#F5FFFA",fontSize:12,fontWeight:"800"},notice:{color:"#75E0B8",backgroundColor:"#102D2C",padding:12,borderRadius:10,fontSize:12,marginTop:14},foot:{color:"#B7C5D0",fontSize:13,lineHeight:20,marginTop:16},list:{flexDirection:"row",alignItems:"center",gap:10,padding:13,backgroundColor:"#102438",borderWidth:1,borderColor:"#1D3A50",borderRadius:13,marginTop:9},item:{color:"#F4F7FA",fontSize:15,fontWeight:"800"},stock:{color:"#75E0B8",fontWeight:"900",backgroundColor:"#173D36",padding:7,borderRadius:8,fontSize:13},panel:{backgroundColor:"#102438",borderWidth:1,borderColor:"#1D3A50",padding:14,borderRadius:14,marginTop:15},total:{color:"#F2D99F",fontSize:18,fontWeight:"900",marginTop:14}
});


export default function App() { return <AuthGate><Dashboard /></AuthGate>; }
