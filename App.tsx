import React, { useEffect, useMemo, useRef, useState } from "react";
import NetInfo from "@react-native-community/netinfo";
import { SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View, Pressable, TextInput, Image } from "react-native";
import { demoProducts, demoSales, demoExpenses } from "./src/data/demoData";
import { formatTZS, netProfit, totalSales } from "./src/domain/money";
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
type Screen = "Home" | "POS" | "Stock" | "Debts" | "Expenses" | "Returns" | "Sync" | "Payments" | "Reports" | "Staff" | "Subscription" | "Owner" | "DayClose";
type CartLine = { productId: string; quantity: number };
function Button({label,onPress,quiet=false}:{label:string;onPress:()=>void;quiet?:boolean}) { return <Pressable onPress={onPress} style={[s.button,quiet&&s.quiet]}><Text style={s.buttonText}>{label}</Text></Pressable>; }
function Metric({label,value}:{label:string;value:string}) { return <View style={s.metric}><Text style={s.label}>{label}</Text><Text style={s.value}>{value}</Text></View>; }
function makeIdempotencyKey() { return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, ch => { const r = Math.floor(Math.random()*16); return (ch==="x"?r:(r&3)|8).toString(16); }); }
function Dashboard() {
 const { shopId, isPlatformAdmin, shopRole, userId, branchId, branches, setBranchId } = useShopContext();
 const effectiveRole = shopRole ?? (supabaseConfigured ? "cashier" : "owner");
 const allowedScreens: Record<"owner"|"manager"|"cashier"|"stockkeeper", Screen[]> = {
  owner: ["Home","POS","Stock","Debts","Expenses","Returns","Sync","Payments","Reports","Staff","Subscription","DayClose"],
  manager: ["Home","POS","Stock","Debts","Expenses","Returns","Sync","Reports","DayClose"],
  cashier: ["Home","POS","Debts","Sync","DayClose"],
  stockkeeper: ["Home","Stock"]
 };
 const visibleScreens = [...allowedScreens[effectiveRole], ...(isPlatformAdmin ? ["Owner" as Screen] : [])];
 const [screen,setScreen]=useState<Screen>("Home");
 useEffect(()=>{if(!visibleScreens.includes(screen))setScreen("Home");},[screen,shopRole,isPlatformAdmin]);
 const [products,setProducts]=useState<Product[]>(supabaseConfigured ? [] : demoProducts);
 const [sales,setSales]=useState<Sale[]>(supabaseConfigured ? [] : demoSales);
 const [refundTotal,setRefundTotal]=useState(0);
 const [reportRange,setReportRange]=useState<"today"|"7d"|"30d"|"year"|"all">("30d");
 const [expenses,setExpenses]=useState<Expense[]>(supabaseConfigured ? [] : demoExpenses);
 const [debts,setDebts]=useState<DebtEntry[]>(supabaseConfigured ? [] : [{id:"d1",customerId:"c1",customerName:"Asha M.",saleId:"s-debt-1",originalAmount:12000,amountPaid:2000,balance:10000,createdAt:new Date().toISOString()}]);
 const [expenseName,setExpenseName]=useState("");
 const [expenseAmount,setExpenseAmount]=useState("");
 const [expensePaymentMethod,setExpensePaymentMethod]=useState<"cash"|"mobile_money"|"bank">("cash");
 const [debtorName,setDebtorName]=useState("");
 const [debtAmount,setDebtAmount]=useState("");
 const [repaymentAmount,setRepaymentAmount]=useState("");
 const [debtPaymentMethod,setDebtPaymentMethod]=useState<"cash"|"mobile_money"|"bank">("cash");
 const [stockInAmount,setStockInAmount]=useState("1");
 const [transferTargetBranchId,setTransferTargetBranchId]=useState("");
 const [transferProductId,setTransferProductId]=useState("");
 const [transferQuantity,setTransferQuantity]=useState("1");
 const [transferIdempotencyKey,setTransferIdempotencyKey]=useState<string|null>(null);
 const [adjustmentProductId,setAdjustmentProductId]=useState("");
 const [adjustmentType,setAdjustmentType]=useState<"count"|"damage"|"loss"|"correction">("count");
 const [adjustmentQuantity,setAdjustmentQuantity]=useState("");
 const [adjustmentReason,setAdjustmentReason]=useState("");
 const [adjustmentIdempotencyKey,setAdjustmentIdempotencyKey]=useState<string|null>(null);
 const [stockAdjustments,setStockAdjustments]=useState<any[]>([]);
 const [refundReason,setRefundReason]=useState("");
 const [refundPaymentMethod,setRefundPaymentMethod]=useState<"cash"|"mobile_money"|"bank">("cash");
 const [refundKeys,setRefundKeys]=useState<Record<string,string>>({});
 const [cart,setCart]=useState<CartLine[]>([]);
 const [posPaymentMethod,setPosPaymentMethod]=useState<"cash"|"mobile_money"|"bank">("cash");
 const [notice,setNotice]=useState(supabaseConfigured ? "Imeunganishwa na huduma za duka; data hupakiwa kutoka Supabase." : "DEMO MODE — changes are temporary and reset when the app restarts.");
 const [cloudLoading,setCloudLoading]=useState(false);
 const [pendingCheckoutKey,setPendingCheckoutKey]=useState<string | null>(null);
 const [isConnected,setIsConnected]=useState<boolean | null>(null);
 const [hasShopProductCache,setHasShopProductCache]=useState(false);
 const [pendingOutbox,setPendingOutbox]=useState<PendingSale[]>([]);
 const [activeSession,setActiveSession]=useState<{id:string;opened_at:string;opening_cash:number;opened_by:string}|null>(null);
 const [openingCash,setOpeningCash]=useState("0");
 const [countedCash,setCountedCash]=useState("");
 const [sessionBusy,setSessionBusy]=useState(false);
 const [dailyClosings,setDailyClosings]=useState<any[]>([]);
 const syncingOutboxRef=useRef(false);
 const cartTotal=useMemo(()=>cart.reduce((sum,line)=>sum+(products.find(p=>p.id===line.productId)?.sellingPrice||0)*line.quantity,0),[cart,products]);
 const lowStock=products.filter(p=>p.stockQuantity<=p.reorderLevel).length;
 const outstandingDebt=debts.reduce((sum,d)=>sum+d.balance,0);
 const reportStart=useMemo(()=>{const now=new Date();const start=new Date(now);if(reportRange==="today")start.setHours(0,0,0,0);else if(reportRange==="7d")start.setDate(start.getDate()-6);else if(reportRange==="30d")start.setDate(start.getDate()-29);else if(reportRange==="year"){start.setMonth(0,1);start.setHours(0,0,0,0);}else return null;return start;},[reportRange]);
 const reportSales=useMemo(()=>reportStart?sales.filter(sale=>new Date(sale.createdAt)>=reportStart):sales,[sales,reportStart]);
 const reportExpenses=useMemo(()=>reportStart?expenses.filter(expense=>new Date(expense.createdAt)>=reportStart):expenses,[expenses,reportStart]);
 const reportSalesValue=totalSales(reportSales);
 const reportExpenseValue=reportExpenses.reduce((sum,expense)=>sum+expense.amount,0);
 const reportProfit=netProfit(reportSales,reportExpenses);
 async function mapProductsForBranch(rows:any[]) {
  if(!supabase||!shopId||!branchId) return [] as Product[];
  const {data,error}=await supabase.rpc("get_branch_stock",{p_shop_id:shopId,p_branch_id:branchId});
  if(error) throw new Error("Imeshindikana kusoma stock ya tawi: "+error.message);
  const stockByProduct=new Map((data??[]).map((row:any)=>[row.product_id,row]));
  return rows.map((p:any)=>{const stock=stockByProduct.get(p.id) as any;return {id:p.id,name:p.name,sku:p.sku??"",unit:p.unit,costPrice:Number(p.cost_price??0),sellingPrice:Number(p.selling_price),stockQuantity:Number(stock?.quantity??0),reorderLevel:Number(stock?.reorder_level??p.reorder_level),active:p.active};});
 }
 useEffect(() => {
  if(!supabaseConfigured||!supabase||!shopId||!branchId){setActiveSession(null);return;}
  setActiveSession(null);
  let active=true;
  supabase.from("branch_cash_sessions").select("id,opened_at,opening_cash,opened_by")
   .eq("shop_id",shopId).eq("branch_id",branchId).eq("status","open").maybeSingle()
   .then(({data,error})=>{if(!active)return;if(error){setNotice("Imeshindikana kusoma session ya tawi: "+error.message);return;}setActiveSession(data?{...data,opening_cash:Number(data.opening_cash)}:null);});
  return ()=>{active=false;};
 },[shopId,branchId]);
 useEffect(() => {
  if(!supabase||!shopId||!branchId||(effectiveRole!=="owner"&&effectiveRole!=="manager")){setDailyClosings([]);return;}
  setDailyClosings([]);
  let active=true;
  supabase.from("branch_daily_closings").select("id,closed_at,expected_cash,counted_cash,cash_difference,total_sales,sales_count,review_status,closed_by")
   .eq("shop_id",shopId).eq("branch_id",branchId).order("closed_at",{ascending:false}).limit(10)
   .then(({data,error})=>{if(!active)return;if(error){setNotice("Ripoti za kufunga siku hazijapakiwa: "+error.message);return;}setDailyClosings(data??[]);});
  return ()=>{active=false;};
 },[shopId,branchId,effectiveRole]);
 useEffect(()=>{
  if(!supabase||!shopId||!branchId){setStockAdjustments([]);return;}
  let active=true;
  supabase.from("branch_stock_adjustments").select("id,product_id,adjustment_type,quantity_before,quantity_after,quantity_change,reason,created_at,created_by").eq("shop_id",shopId).eq("branch_id",branchId).order("created_at",{ascending:false}).limit(30)
   .then(({data,error})=>{if(!active)return;if(error){setNotice("Historia ya marekebisho haijapakiwa: "+error.message);return;}setStockAdjustments(data??[]);});
  return ()=>{active=false;};
 },[shopId,branchId]);
 async function reviewDailyClosing(id:string,status:"approved"|"needs_review"){
  if(!supabase){setNotice("Database haijaunganishwa.");return;}
  const {error}=await supabase.rpc("review_branch_daily_closing",{p_closing_id:id,p_review_status:status,p_note:null});
  if(error){setNotice("Mapitio ya ripoti hayajahifadhiwa: "+error.message);return;}
  setDailyClosings(rows=>rows.map(row=>row.id===id?{...row,review_status:status}:row));
  setNotice(status==="approved"?"Ripoti ya kufunga siku imeidhinishwa.":"Ripoti imewekwa kwenye ukaguzi zaidi.");
 }
 async function refreshActiveSession(){
  if(!supabase||!shopId||!branchId){setActiveSession(null);return;}
  const {data,error}=await supabase.from("branch_cash_sessions").select("id,opened_at,opening_cash,opened_by")
   .eq("shop_id",shopId).eq("branch_id",branchId).eq("status","open").maybeSingle();
  if(error){setNotice("Imeshindikana kusoma session ya tawi: "+error.message);return;}
  setActiveSession(data?{...data,opening_cash:Number(data.opening_cash)}:null);
 }
 async function openCashSession(){
  const amount=Number(openingCash);
  if(!Number.isFinite(amount)||amount<0){setNotice("Weka cash ya mwanzo iliyo sahihi.");return;}
  if(!supabase||!shopId||!branchId){setNotice("Chagua duka na tawi kabla ya kufungua siku.");return;}
  setSessionBusy(true);
  const {data,error}=await supabase.rpc("open_branch_cash_session",{p_shop_id:shopId,p_branch_id:branchId,p_opening_cash:amount});
  setSessionBusy(false);
  if(error){setNotice("Session haijafunguliwa: "+error.message);return;}
  await refreshActiveSession();setNotice("Siku ya biashara imefunguliwa. Mauzo ya tawi hili sasa yanaweza kuanza.");
 }
 async function closeCashSession(){
  const amount=Number(countedCash);
  if(!Number.isFinite(amount)||amount<0){setNotice("Weka kiasi cha cash ulichohesabu.");return;}
  if(!supabase||!activeSession){setNotice("Hakuna session iliyo wazi.");return;}
  if(pendingOutbox.length>0){setNotice("Huwezi kufunga siku wakati kuna mauzo offline yanayosubiri kusawazishwa. Unganisha intaneti na yasawazishe kwanza.");return;}
  setSessionBusy(true);
  const {data,error}=await supabase.rpc("close_branch_cash_session",{p_session_id:activeSession.id,p_counted_cash:amount,p_note:null});
  setSessionBusy(false);
  if(error){setNotice("Kufunga siku kumeshindikana: "+error.message);return;}
  const row=Array.isArray(data)?data[0]:data;
  setActiveSession(null);setCountedCash("");
  setNotice("Siku imefungwa. Cash inayotarajiwa: "+formatTZS(Number(row?.expected_cash??0))+" · Iliyohesabiwa: "+formatTZS(Number(row?.counted_cash??amount))+" · Tofauti: "+formatTZS(Number(row?.cash_difference??0))+". Ripoti imetumwa kwa usimamizi.");
 }
 useEffect(() => {
  const unsubscribe=NetInfo.addEventListener(state=>setIsConnected(Boolean(state.isConnected)));
  NetInfo.fetch().then(state=>setIsConnected(Boolean(state.isConnected)));
  return unsubscribe;
 },[]);
 useEffect(() => {
  if(!shopId||!branchId)return;
  setProducts([]);setCart([]);setSales([]);setExpenses([]);setDebts([]);setRefundTotal(0);setHasShopProductCache(false);
  let active=true;
  Promise.all([readPendingSales(shopId,userId,effectiveRole),readCachedProducts(shopId,branchId??"")]).then(([items,cached])=>{
   if(!active)return;
   // Older offline tickets predate branch IDs. They were created against the
   // former shop-wide stock ledger, so recover them into the primary branch.
   const fallbackBranchId=branches.find(item=>item.is_primary)?.id??branchId??"";
   const normalizedItems=items.map(item=>({...item,branchId:item.branchId||fallbackBranchId}));
   setPendingOutbox(normalizedItems);
   if(normalizedItems.some((item,index)=>item.branchId!==items[index]?.branchId)){
    void writePendingSales(shopId,userId,effectiveRole,normalizedItems);
   }
   if(cached.length){
    const reserved=new Map<string,number>();
    items.forEach(item=>item.items.forEach(line=>reserved.set(line.product_id,(reserved.get(line.product_id)??0)+line.quantity)));
    setProducts(cached.map(product=>({...product,stockQuantity:Math.max(0,product.stockQuantity-(reserved.get(product.id)??0))})));
    setHasShopProductCache(true);
   }
   if(items.length)setSales(current=>[...items.map(item=>({...item.sale})),...current.filter(sale=>!items.some(item=>item.sale.id===sale.id))]);
  });
  return ()=>{active=false;};
 },[shopId,userId,effectiveRole,branchId,branches]);
 useEffect(() => {
  const client=supabase;
  if(!supabaseConfigured||!client||!shopId||!branchId||isConnected!==true||pendingOutbox.length===0||syncingOutboxRef.current)return;
  syncingOutboxRef.current=true;
  const sync=async()=>{
   let remaining=[...pendingOutbox];
   for(const item of pendingOutbox){
    if(item.syncIssue)continue;
    try{
     const result=await submitCheckout({shopId:item.shopId,branchId:item.branchId,idempotencyKey:item.idempotencyKey,items:item.items,paymentMethod:item.sale.paymentMethod,expectedTotal:item.sale.total});
     const {data:confirmedSale}=await client.from("sales").select("*,sale_items(*),payments(method)").eq("id",result.saleId).single();
     const costResult=(effectiveRole==="owner"||effectiveRole==="manager")?await client.rpc("get_sale_item_costs",{p_shop_id:shopId,p_sale_id:result.saleId}):{data:[]};
     const costByItemId=new Map((costResult.data??[]).map((row:any)=>[row.sale_item_id,Number(row.unit_cost_snapshot)]));
     setSales(current=>current.map(sale=>sale.id===item.sale.id?(confirmedSale?{
      id:confirmedSale.id,receiptNumber:confirmedSale.receipt_number,createdAt:confirmedSale.created_at,
      lines:(confirmedSale.sale_items??[]).map((line:any)=>({id:line.id,productId:line.product_id??"",productName:line.product_name_snapshot,quantity:Number(line.quantity),unitPrice:Number(line.unit_price),unitCost:Number(costByItemId.get(line.id)??0),lineTotal:Number(line.line_total)})),
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
   if(!productsError&&latestProducts){const mapped=await mapProductsForBranch(latestProducts);setProducts(mapped);setHasShopProductCache(true);void writeCachedProducts(shopId,branchId??"",mapped);}
   syncingOutboxRef.current=false;
  };
  void sync();
 },[shopId,branchId,userId,effectiveRole,isConnected,pendingOutbox]);
 useEffect(() => {
  if (!supabaseConfigured || !supabase || !shopId || !branchId || (effectiveRole !== "owner" && effectiveRole !== "manager")) return;
  setSales([]);setExpenses([]);setDebts([]);setRefundTotal(0);
  let active = true;
  setCloudLoading(true);
  Promise.all([readCachedBusinessSnapshot(shopId,userId,branchId??""),readPendingSales(shopId,userId,effectiveRole)]).then(([snapshot,pending])=>{
   if(!active||!snapshot)return;
   setSales([...pending.map(item=>({...item.sale})),...snapshot.sales.filter(sale=>!pending.some(item=>item.sale.id===sale.id))]);
   setExpenses(snapshot.expenses);
   setDebts(snapshot.debts);
   setRefundTotal(snapshot.refundTotal);
   setNotice("Data ya mwisho iliyohifadhiwa kwenye simu inaonyeshwa. Inatafuta taarifa mpya mtandaoni.");
  });
  supabase.rpc("get_shop_products",{p_shop_id:shopId})
   .then(async ({data,error}) => {
    if (!active) return;
    if (error) setNotice("Imeshindikana kupakia bidhaa: "+error.message);
    else { try { const mapped=await mapProductsForBranch(data??[]);setProducts(mapped);setHasShopProductCache(true);void writeCachedProducts(shopId,branchId??"",mapped); } catch(error) { setNotice(error instanceof Error?error.message:"Imeshindikana kupakia stock ya tawi."); } }
    setCloudLoading(false);
   });
  Promise.all([
   supabase.from("sales").select("*,sale_items(*),payments(method)").eq("shop_id",shopId).eq("branch_id",branchId).order("created_at",{ascending:false}),
   supabase.from("expenses").select("id,description,category,amount,created_at").eq("shop_id",shopId).eq("branch_id",branchId).order("created_at",{ascending:false}),
   supabase.from("debts").select("id,customer_id,description,original_amount,balance,created_at,customers(name)").eq("shop_id",shopId).eq("branch_id",branchId).order("created_at",{ascending:false}),
   supabase.from("sale_refunds").select("refund_total").eq("shop_id",shopId).eq("branch_id",branchId),
   supabase.rpc("get_sale_item_costs",{p_shop_id:shopId})
  ]).then(async([salesResult,expensesResult,debtsResult,refundsResult,costsResult]) => {
   if(!active) return;
   const costByItemId=new Map((costsResult.data??[]).map((row:any)=>[row.sale_item_id,Number(row.unit_cost_snapshot)]));
   const mappedSales:Sale[]|null=!salesResult.error&&salesResult.data?salesResult.data.map((r:any):Sale=>({id:r.id,receiptNumber:r.receipt_number,createdAt:r.created_at,lines:(r.sale_items??[]).map((x:any)=>({id:x.id,productId:x.product_id??"",productName:x.product_name_snapshot,quantity:Number(x.quantity),unitPrice:Number(x.unit_price),unitCost:Number(costByItemId.get(x.id)??0),lineTotal:Number(x.line_total)})),subtotal:Number(r.subtotal),discount:Number(r.discount),total:Number(r.total),amountPaid:Number(r.amount_paid),balance:Math.max(0,Number(r.total)-Number(r.amount_paid)),paymentMethod:r.payments?.[0]?.method??"cash",status:r.status==="refunded"?"refunded":r.status==="partially_paid"?"partially_paid":"completed"})):null;
   if(costsResult.error)setNotice("Gharama za bidhaa hazijapakiwa. Faida haitakuwa sahihi hadi mmiliki akague ruhusa za database.");
   const mappedExpenses=!expensesResult.error&&expensesResult.data?expensesResult.data.map((e:any)=>({id:e.id,description:e.description,category:e.category,amount:Number(e.amount),createdAt:e.created_at})):null;
   const mappedDebts=!debtsResult.error&&debtsResult.data?debtsResult.data.map((d:any)=>({id:d.id,customerId:d.customer_id,customerName:d.customers?.[0]?.name??"Mteja",saleId:"manual",originalAmount:Number(d.original_amount),amountPaid:Number(d.original_amount)-Number(d.balance),balance:Number(d.balance),createdAt:d.created_at})):null;
   const mappedRefunds=!refundsResult.error&&refundsResult.data?refundsResult.data.reduce((sum:number,row:any)=>sum+Number(row.refund_total),0):null;
   const [pending]=await Promise.all([readPendingSales(shopId,userId,effectiveRole)]);
   if(!active)return;
   if(mappedSales)setSales([...pending.map(item=>({...item.sale})),...mappedSales.filter(sale=>!pending.some(item=>item.sale.id===sale.id))]);
   if(mappedExpenses)setExpenses(mappedExpenses);
   if(mappedDebts)setDebts(mappedDebts);
   if(mappedRefunds!==null)setRefundTotal(mappedRefunds);
   if(mappedSales&&mappedExpenses&&mappedDebts&&mappedRefunds!==null){
    await writeCachedBusinessSnapshot(shopId,userId,branchId??"",{sales:mappedSales,expenses:mappedExpenses,debts:mappedDebts,refundTotal:mappedRefunds,cachedAt:new Date().toISOString()});
   }
  });
  return () => { active = false; };
 },[shopId,userId,effectiveRole,branchId]);
 async function refreshProductsFromCloud() {
  if(!supabase||!shopId||!branchId)return;
  const {data,error}=await supabase.rpc("get_shop_products",{p_shop_id:shopId});
  if(!error&&data){const mapped=await mapProductsForBranch(data);setProducts(mapped);setHasShopProductCache(true);void writeCachedProducts(shopId,branchId,mapped);}
 }
 function add(p:Product) { if(pendingCheckoutKey){setNotice("Malizia au thibitisha mauzo yaliyosubiri kabla ya kubadilisha cart.");return;} setCart(current=>{const q=(current.find(x=>x.productId===p.id)?.quantity||0)+1;if(q>p.stockQuantity){setNotice("Stock limit reached.");return current;}return current.some(x=>x.productId===p.id)?current.map(x=>x.productId===p.id?{...x,quantity:q}:x):[...current,{productId:p.id,quantity:1}];});setNotice(p.name+" added to cart."); }
 async function exportReport(kind:"pdf"|"csv") {
  try {
   const labels={today:"Leo", "7d":"Siku 7", "30d":"Siku 30", year:"Mwaka huu", all:"Tangu mwanzo"};
   const input={businessName:"GUNX SMART BUSINESS",periodLabel:labels[reportRange],sales:reportSales,expenses:reportExpenses,refundTotal};
   if(kind==="pdf")await exportBusinessReportPdf(input);else await exportBusinessReportCsv(input);
   setNotice(kind==="pdf"?"Ripoti ya PDF imeandaliwa kwa kushirikishwa.":"Ripoti ya CSV inayofunguka kwenye Excel imeandaliwa.");
  }catch(error){setNotice("Imeshindikana kutoa ripoti: "+(error instanceof Error?error.message:"Hitilafu isiyojulikana"));}
 }
 async function adjustBranchStock(){
  const product=products.find(item=>item.id===adjustmentProductId);
  const quantity=Number(adjustmentQuantity);
  const reason=adjustmentReason.trim();
  if(!product){setNotice("Chagua bidhaa ya kuhesabu au kurekebisha stock.");return;}
  if(!Number.isFinite(quantity)||(adjustmentType==="correction"?quantity===0:quantity<0)||(adjustmentType!=="correction"&&quantity===0)){setNotice("Weka kiasi sahihi kulingana na aina ya marekebisho.");return;}
  if(reason.length<3){setNotice("Andika sababu ya marekebisho (angalau herufi 3).");return;}
  if(supabaseConfigured&&isConnected===false){setNotice("Hesabu/marekebisho ya stock yanahitaji mtandao.");return;}
  if(supabaseConfigured){
   if(!supabase||!shopId||!branchId){setNotice("Chagua duka na tawi kwanza.");return;}
   const key=adjustmentIdempotencyKey??makeIdempotencyKey();
   if(!adjustmentIdempotencyKey)setAdjustmentIdempotencyKey(key);
   setCloudLoading(true);
   const {data,error}=await supabase.rpc("adjust_branch_stock",{p_shop_id:shopId,p_branch_id:branchId,p_product_id:product.id,p_adjustment_type:adjustmentType,p_quantity:quantity,p_reason:reason,p_idempotency_key:key});
   setCloudLoading(false);
   if(error){setNotice("Marekebisho hayajahifadhiwa: "+error.message);return;}
   const row=Array.isArray(data)?data[0]:data;
   await refreshProductsFromCloud();
   const {data:history}=await supabase.from("branch_stock_adjustments").select("id,product_id,adjustment_type,quantity_before,quantity_after,quantity_change,reason,created_at,created_by").eq("shop_id",shopId).eq("branch_id",branchId).order("created_at",{ascending:false}).limit(30);
   if(history)setStockAdjustments(history);
   setAdjustmentIdempotencyKey(null);setAdjustmentQuantity("");setAdjustmentReason("");
   setNotice("Marekebisho yamehifadhiwa. Stock: "+Number(row?.quantity_before??0)+" → "+Number(row?.quantity_after??0)+". Rejea: "+(row?.adjustment_id??""));
   return;
  }
  setProducts(rows=>rows.map(item=>{if(item.id!==product.id)return item;const next=adjustmentType==="count"?quantity:adjustmentType==="damage"||adjustmentType==="loss"?item.stockQuantity-quantity:item.stockQuantity+quantity;return {...item,stockQuantity:Math.max(0,next)};}));
  setAdjustmentQuantity("");setAdjustmentReason("");setNotice("Marekebisho yamefanyika kwenye demo pekee.");
 }
 async function transferStock(){
  if(cloudLoading)return;
  const quantity=Number(transferQuantity);
  if(!supabase||!shopId||!branchId){setNotice("Chagua tawi la chanzo kabla ya kuhamisha stock.");return;}
  if(!transferTargetBranchId||transferTargetBranchId===branchId){setNotice("Chagua tawi tofauti la kupokea stock.");return;}
  if(!transferProductId){setNotice("Chagua bidhaa ya kuhamisha.");return;}
  if(!Number.isFinite(quantity)||quantity<=0){setNotice("Weka kiasi sahihi cha kuhamisha.");return;}
  if(isConnected===false){setNotice("Uhamisho wa stock unahitaji mtandao ili uthibitishwe salama.");return;}
  const key=transferIdempotencyKey??makeIdempotencyKey();
  if(!transferIdempotencyKey)setTransferIdempotencyKey(key);
  setCloudLoading(true);
  const {data,error}=await supabase.rpc("transfer_branch_stock",{p_shop_id:shopId,p_idempotency_key:key,p_from_branch_id:branchId,p_to_branch_id:transferTargetBranchId,p_product_id:transferProductId,p_quantity:quantity,p_note:"Branch transfer from app"});
  setCloudLoading(false);
  if(error){setNotice("Uhamisho haujakamilika: "+error.message);return;}
  await refreshProductsFromCloud();
  const target=branches.find(item=>item.id===transferTargetBranchId);
  setTransferIdempotencyKey(null);
  setNotice("Stock imehamishwa kwenda "+(target?.name??"tawi jingine")+". Rejea: "+data);
  setTransferQuantity("1");
 }
 async function receiveStock(productId:string) {
  const quantity=Number(stockInAmount);
  if(!Number.isFinite(quantity)||quantity<=0){setNotice("Weka kiasi cha stock kinachoingia.");return;}
  if(supabaseConfigured&&isConnected===false){setNotice("Stock-in haiwezi kuthibitishwa bila mtandao. Hakuna mabadiliko yaliyofanywa.");return;}
  if(supabaseConfigured){
   if(!supabase||!shopId||!branchId){setNotice("Hakuna duka au tawi lililochaguliwa.");return;}
   setCloudLoading(true);
   const {data,error}=await supabase.rpc("receive_stock_in_branch",{p_shop_id:shopId,p_branch_id:branchId,p_product_id:productId,p_quantity:quantity,p_note:"Stock received from app"});
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
   if(!supabase||!shopId||!branchId){setNotice("Hakuna duka au tawi lililochaguliwa.");return;}
   setCloudLoading(true);
   const {data,error}=await supabase.from("expenses").insert({shop_id:shopId,branch_id:branchId,description:expenseName.trim(),category:"General",amount,payment_method:expensePaymentMethod}).select("id,description,category,amount,created_at").single();
   setCloudLoading(false);
   if(error){setNotice("Gharama haijahifadhiwa: "+error.message);return;}
   setExpenses(v=>[{id:data.id,description:data.description,category:data.category,amount:Number(data.amount),createdAt:data.created_at},...v]);
   setExpenseName("");setExpenseAmount("");setNotice("Gharama imehifadhiwa kwenye database.");return;
  }
  setExpenses(v=>[{id:"local-exp-"+Date.now(),description:expenseName.trim(),category:"General",amount,createdAt:new Date().toISOString()},...v]);
  setExpenseName("");setExpenseAmount("");setNotice("Gharama imeongezwa kwenye demo.");
 }
 async function addDebt() {
  const amount=Number(debtAmount);
  if(!debtorName.trim()||!Number.isFinite(amount)||amount<=0){setNotice("Weka jina la mteja na deni sahihi.");return;}
  if(supabaseConfigured&&isConnected===false){setNotice("Deni halijahifadhiwa. Unganisha mtandao ili kuepuka deni kurudiwa.");return;}
  if(supabaseConfigured){
   if(!supabase||!shopId||!branchId){setNotice("Hakuna duka au tawi lililochaguliwa.");return;}
   setCloudLoading(true);
   const {data,error}=await supabase.rpc("create_manual_debt_in_branch",{p_shop_id:shopId,p_branch_id:branchId,p_customer_name:debtorName.trim(),p_amount:amount,p_description:null});
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
   if(!supabase||!branchId){setNotice("Database au tawi halijaunganishwa.");return;}
   setCloudLoading(true);
   const {data,error}=await supabase.rpc("record_debt_payment_in_branch",{p_branch_id:branchId,p_debt_id:id,p_amount:amount,p_method:debtPaymentMethod,p_note:null});
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
   if(!supabase||!shopId||!branchId){setNotice("Hakuna duka au tawi lililochaguliwa.");return;}
   const key=refundKeys[sale.id]??makeIdempotencyKey();
   if(!refundKeys[sale.id])setRefundKeys(v=>({...v,[sale.id]:key}));
   setCloudLoading(true);setNotice("Inathibitisha marejesho kwenye database...");
   const {data,error}=await supabase.rpc("refund_sale_in_branch",{
    p_shop_id:shopId,p_branch_id:branchId,p_sale_id:sale.id,p_idempotency_key:key,p_reason:reason,p_refund_method:refundPaymentMethod,
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
  if(!activeSession){setNotice("Fungua siku ya biashara kabla ya kuhifadhi mauzo offline.");return;}
  if(!shopId||!branchId){setNotice("Chagua tawi kabla ya kuweka mauzo kwenye foleni.");return;}
  if(!hasShopProductCache){setNotice("Hatujahifadhi orodha ya bidhaa ya duka hili kwenye simu. Unganisha intaneti kwanza ili kupakua bidhaa kabla ya kutumia POS offline.");return;}
  const lines=cart.map(line=>{const p=products.find(item=>item.id===line.productId);if(!p)throw new Error("Bidhaa haipo kwenye orodha ya ndani.");if(line.quantity>p.stockQuantity)throw new Error("Stock ya "+p.name+" haitoshi kulingana na cache ya mwisho.");return {productId:p.id,productName:p.name,quantity:line.quantity,unitPrice:p.sellingPrice,unitCost:p.costPrice,lineTotal:p.sellingPrice*line.quantity};});
  const total=lines.reduce((sum,line)=>sum+line.lineTotal,0);
  const sale:Sale={id:"pending-"+key,receiptNumber:"PENDING-"+key.slice(0,8).toUpperCase(),createdAt:new Date().toISOString(),lines,subtotal:total,discount:0,total,amountPaid:total,balance:0,paymentMethod:posPaymentMethod,status:"pending_sync"};
  const item:PendingSale={shopId,branchId:branchId??"",idempotencyKey:key,items:cart.map(line=>({product_id:line.productId,quantity:line.quantity})),sale,queuedAt:new Date().toISOString()};
  const next=[...pendingOutbox.filter(entry=>entry.idempotencyKey!==key),item];
  await writePendingSales(shopId,userId,effectiveRole,next);
  setPendingOutbox(next);setSales(current=>[sale,...current]);
  setProducts(current=>current.map(p=>{const line=cart.find(x=>x.productId===p.id);return line?{...p,stockQuantity:Math.max(0,p.stockQuantity-line.quantity)}:p;}));
  setCart([]);setPendingCheckoutKey(null);
  setNotice("Mauzo yamehifadhiwa kwenye simu bila mtandao. Yatasawazishwa mtandao utakaporudi; bado hayajathibitishwa na server.");
  setScreen("Home");
 }
 async function checkout() {
  if(supabaseConfigured&&!activeSession){setNotice("Fungua siku ya biashara kwenye menyu ya Opening/Closing kabla ya kufanya mauzo.");setScreen("DayClose");return;}
  if(!cart.length){setNotice("Add a product before checkout.");return;}
  if (supabaseConfigured) {
   if(isConnected===false){try{await queueOfflineCheckout(pendingCheckoutKey??makeIdempotencyKey());}catch(e){setNotice("Haikuweza kuhifadhi mauzo offline: "+(e instanceof Error?e.message:"hitilafu"));}return;}
   if (!shopId || !supabase || !branchId) { setNotice("Chagua tawi halali kabla ya kufanya mauzo."); return; }
   const key=pendingCheckoutKey ?? makeIdempotencyKey();
   if(!pendingCheckoutKey) setPendingCheckoutKey(key);
   setCloudLoading(true);setNotice("Inatuma mauzo salama kwenye database...");
   try {
    const result=await submitCheckout({shopId,branchId:branchId??"",idempotencyKey:key,items:cart.map(x=>({product_id:x.productId,quantity:x.quantity})),paymentMethod:posPaymentMethod});
    setCart([]);setPendingCheckoutKey(null);
    const {data,error}=await supabase.rpc("get_shop_products",{p_shop_id:shopId});
    if(!error&&data){const mapped=await mapProductsForBranch(data);setProducts(mapped);void writeCachedProducts(shopId,branchId??"",mapped);}
    setNotice("Mauzo yamehifadhiwa: "+result.receiptNumber+" · "+formatTZS(result.total));
    setScreen("Home");
   } catch(e) { const network=await NetInfo.fetch();if(!network.isConnected){try{await queueOfflineCheckout(key);}catch(queueError){setNotice("Mtandao umekatika na mauzo hayajahifadhiwa offline: "+(queueError instanceof Error?queueError.message:"hitilafu"));}}else{setNotice("Mauzo hayajakamilika: "+(e instanceof Error?e.message:"Hitilafu isiyojulikana")+". Hakikisha muamala haujakamilika kabla ya kujaribu tena.");} }
   finally { setCloudLoading(false); }
   return;
  }
  if(!cart.length){setNotice("Add a product before checkout.");return;}
  const lines=cart.map(x=>{const p=products.find(y=>y.id===x.productId)!;return {productId:p.id,productName:p.name,quantity:x.quantity,unitPrice:p.sellingPrice,unitCost:p.costPrice,lineTotal:p.sellingPrice*x.quantity};});
  const total=lines.reduce((a,x)=>a+x.lineTotal,0);
  const sale:Sale={id:"local-"+Date.now(),receiptNumber:"DEMO-"+String(sales.length+1).padStart(4,"0"),createdAt:new Date().toISOString(),lines,subtotal:total,discount:0,total,amountPaid:total,balance:0,paymentMethod:posPaymentMethod,status:"completed"};
  setSales(v=>[sale,...v]);setProducts(v=>v.map(p=>{const line=cart.find(x=>x.productId===p.id);return line?{...p,stockQuantity:p.stockQuantity-line.quantity}:p;}));setCart([]);setNotice("Demo checkout completed: "+sale.receiptNumber);setScreen("Home");
 }
 return <SafeAreaView style={s.safe}><StatusBar barStyle="light-content" backgroundColor="#081522"/>
  <View style={s.header}><Image source={require("./assets/GUNX20Smart20Business20Logo-1.jpg")} style={s.logoImage} resizeMode="contain"/><View style={s.headerText}><Text style={s.eyebrow}>GUNX BUSINESS SUITE</Text><Text style={s.brand}>GUNX <Text style={s.gold}>SMART</Text> BUSINESS</Text><Text style={s.muted}>Sales · Stock · Finance</Text></View></View>
  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.navScroll}><View style={s.nav}>{visibleScreens.map(x=><Pressable key={x} onPress={()=>setScreen(x)} style={[s.navItem,screen===x&&s.navOn]}><Text style={[s.navText,screen===x&&s.navTextOn]}>{x==="Owner"?"PLATFORM OWNER":x}</Text></Pressable>)}</View></ScrollView>
  {branches.length>0&&<ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.navScroll}><View style={s.nav}>{branches.map(branch=><Pressable key={branch.id} onPress={()=>{setBranchId(branch.id);setCart([]);setTransferTargetBranchId("");setTransferProductId("");setTransferIdempotencyKey(null);setNotice("Tawi limebadilishwa: "+branch.name+". Cart ya awali imeondolewa ili kuzuia mauzo kwenye tawi lisilo sahihi.");}} style={[s.navItem,branchId===branch.id&&s.navOn]}><Text style={[s.navText,branchId===branch.id&&s.navTextOn]}>{branch.name}</Text></Pressable>)}</View></ScrollView>}
  <ScrollView contentContainerStyle={s.content}>
    {screen==="Home"&&<>
     <View style={s.hero}><Text style={s.eyebrow}>{effectiveRole==="owner"?"BUSINESS OWNER DASHBOARD":effectiveRole==="manager"?"BUSINESS MANAGER DASHBOARD":effectiveRole==="cashier"?"CASHIER DASHBOARD":"STOCKKEEPER DASHBOARD"}</Text><Text style={s.heroTitle}>Welcome back</Text><Text style={s.muted}>{effectiveRole==="owner"?"Muhtasari wa biashara yako.":effectiveRole==="manager"?"Muhtasari wa shughuli za biashara.":effectiveRole==="cashier"?"Mauzo yako na kazi za kaunta.":"Bidhaa na hali ya stock."}</Text></View>
     {(effectiveRole==="owner"||effectiveRole==="manager")&&<><View style={s.row}><Metric label="TOTAL SALES" value={formatTZS(totalSales(sales))}/><Metric label="EST. NET PROFIT*" value={formatTZS(netProfit(sales,expenses))}/></View><View style={s.row}><Metric label="LOW STOCK" value={lowStock+" items"}/><Metric label="SALES COUNT" value={String(sales.length)}/></View><View style={s.row}><Metric label="MADENI YALIYOBAKI" value={formatTZS(outstandingDebt)}/><Metric label="GHARAMA" value={formatTZS(expenses.reduce((a,x)=>a+x.amount,0))}/></View></>}
     {effectiveRole==="cashier"&&<><View style={s.row}><Metric label="MAUZO YAKO" value={formatTZS(totalSales(sales))}/><Metric label="IDADI YA RISITI" value={String(sales.length)}/></View><Text style={s.muted}>Takwimu hizi zinahusu mauzo yaliyohusishwa na akaunti yako pekee.</Text></>}
     {effectiveRole==="stockkeeper"&&<><View style={s.row}><Metric label="BIDHAA ZINAZOFUATILIWA" value={String(products.filter(p=>p.active).length)}/><Metric label="LOW STOCK" value={lowStock+" items"}/></View><Text style={s.muted}>Una ruhusa ya kuona bidhaa na kupokea stock; taarifa za fedha hazionyeshwi.</Text></>}
     <Text style={s.heading}>Quick actions</Text><View style={s.row}>{effectiveRole!=="stockkeeper"&&<View style={s.flex}><Button label="Opening / Closing" quiet onPress={()=>setScreen("DayClose")}/></View>}{(effectiveRole==="cashier"?[["＋ New sale","POS"]]:effectiveRole==="stockkeeper"?[["View stock","Stock"]]:[["＋ New sale","POS"],["View stock","Stock"]]).map(([label,target])=><View key={target} style={s.flex}><Button label={label} quiet={target==="Stock"} onPress={()=>setScreen(target as Screen)}/></View>)}</View>
     <Text style={s.notice}>{isConnected===false?"OFFLINE · ":isConnected===true?"ONLINE · ":""}{pendingOutbox.length>0?pendingOutbox.length+" mauzo yanasubiri kusawazishwa. ":""}{notice}</Text>
     {(effectiveRole==="owner"||effectiveRole==="manager")&&<Text style={s.foot}>{supabaseConfigured ? "*Makadirio ya faida kutokana na mauzo, gharama na refunds zilizopakiwa; hakiki hesabu kabla ya maamuzi ya fedha." : "*Demo estimate only. Not connected to a live business database."}</Text>}
    </>}
   {screen==="POS"&&<><Text style={s.pageTitle}>Point of Sale</Text><Text style={s.muted}>{supabaseConfigured ? (cloudLoading ? "Inapakia bidhaa..." : "Bidhaa za duka lako kutoka database.") : "Tap a product to add it to the cart."}</Text>{products.filter(p=>p.active).map(p=><View key={p.id} style={s.list}><View style={s.flex}><Text style={s.item}>{p.name}</Text><Text style={s.muted}>{formatTZS(p.sellingPrice)} · Stock {p.stockQuantity}</Text></View><Button label="Add" quiet onPress={()=>add(p)}/></View>)}<View style={s.panel}><Text style={s.heading}>Cart ({cart.reduce((a,x)=>a+x.quantity,0)} items)</Text>{cart.map(x=>{const p=products.find(y=>y.id===x.productId)!;return <Text key={x.productId} style={s.muted}>{p.name} × {x.quantity} — {formatTZS(p.sellingPrice*x.quantity)}</Text>;})}<Text style={s.total}>Total: {formatTZS(cartTotal)}</Text><Text style={s.muted}>Njia ya malipo:</Text><View style={s.row}>{([{id:"cash",label:"Cash"},{id:"mobile_money",label:"M-Pesa / Mobile"},{id:"bank",label:"Bank"}] as const).map(option=><Pressable key={option.id} onPress={()=>setPosPaymentMethod(option.id)} style={[s.navItem,posPaymentMethod===option.id&&s.navOn]}><Text style={[s.navText,posPaymentMethod===option.id&&s.navTextOn]}>{option.label}</Text></Pressable>)}</View><Button label={supabaseConfigured ? "Thibitisha mauzo" : "Thibitisha demo sale"} onPress={checkout}/><Button label="Clear cart" quiet onPress={()=>setCart([])}/></View><Text style={s.notice}>{notice}</Text></>}
    {screen==="Stock"&&<>{(effectiveRole==="owner"||effectiveRole==="manager")&&<ProductManagement shopId={shopId} onProductsChanged={()=>{void refreshProductsFromCloud();}}/>}<View style={s.panel}><Text style={s.heading}>Pokea stock</Text><TextInput value={stockInAmount} onChangeText={setStockInAmount} placeholder="Kiasi cha stock kinachoingia" placeholderTextColor="#8194A5" keyboardType="decimal-pad" style={s.field}/></View><View style={s.panel}><Text style={s.heading}>Hesabu na rekebisha stock</Text><Text style={s.muted}>Chagua bidhaa na aina ya marekebisho. Kila hatua ina sababu, mtumiaji na muda kwenye historia ya tawi.</Text><View style={s.row}>{products.filter(item=>item.active).map(item=><Pressable key={item.id} onPress={()=>{setAdjustmentProductId(item.id);setAdjustmentIdempotencyKey(null);}} style={[s.navItem,adjustmentProductId===item.id&&s.navOn]}><Text style={[s.navText,adjustmentProductId===item.id&&s.navTextOn]}>{item.name}</Text></Pressable>)}</View><Text style={s.muted}>Aina ya marekebisho:</Text><View style={s.row}>{([{id:"count",label:"Hesabu halisi"},{id:"damage",label:"Imeharibika"},{id:"loss",label:"Imepotea"},{id:"correction",label:"Sahihisha ±"}] as const).map(option=><Pressable key={option.id} onPress={()=>{setAdjustmentType(option.id);setAdjustmentIdempotencyKey(null);}} style={[s.navItem,adjustmentType===option.id&&s.navOn]}><Text style={[s.navText,adjustmentType===option.id&&s.navTextOn]}>{option.label}</Text></Pressable>)}</View><TextInput value={adjustmentQuantity} onChangeText={value=>{setAdjustmentQuantity(value);setAdjustmentIdempotencyKey(null);}} placeholder={adjustmentType==="count"?"Idadi halisi iliyohesabiwa":adjustmentType==="correction"?"Tofauti (+ kuongeza / - kupunguza)":"Kiasi cha kuondoa"} placeholderTextColor="#8194A5" keyboardType="numbers-and-punctuation" style={s.field}/><TextInput value={adjustmentReason} onChangeText={value=>{setAdjustmentReason(value);setAdjustmentIdempotencyKey(null);}} placeholder="Sababu: mfano bidhaa imeharibika / hesabu ya ghala" placeholderTextColor="#8194A5" style={s.field}/><Button label={cloudLoading?"Inahifadhi...":"Hifadhi hesabu / marekebisho"} onPress={adjustBranchStock}/>{adjustmentProductId&&<Text style={s.foot}>Stock ya sasa ya {products.find(item=>item.id===adjustmentProductId)?.name}: {products.find(item=>item.id===adjustmentProductId)?.stockQuantity??0}</Text>}</View><View style={s.panel}><Text style={s.heading}>Historia ya stock adjustments</Text>{stockAdjustments.length===0?<Text style={s.muted}>Hakuna marekebisho yaliyorekodiwa kwenye tawi hili.</Text>:stockAdjustments.map(item=><View key={item.id} style={s.list}><View style={s.flex}><Text style={s.item}>{products.find(p=>p.id===item.product_id)?.name??"Bidhaa" } · {item.adjustment_type}</Text><Text style={s.muted}>{new Date(item.created_at).toLocaleString("sw-TZ")} · {item.reason}</Text><Text style={s.muted}>{Number(item.quantity_before)} → {Number(item.quantity_after)} (Δ {Number(item.quantity_change)>0?"+":""}{Number(item.quantity_change)})</Text></View></View>)}</View><View style={s.panel}><Text style={s.heading}>Hamisha stock kwenda tawi jingine</Text><Text style={s.muted}>Tawi la chanzo: {branches.find(item=>item.id===branchId)?.name??"—"}</Text><Text style={s.muted}>Tawi la kupokea:</Text><View style={s.row}>{branches.filter(item=>item.id!==branchId).map(item=><Pressable key={item.id} onPress={()=>{setTransferTargetBranchId(item.id);setTransferIdempotencyKey(null);}} style={[s.navItem,transferTargetBranchId===item.id&&s.navOn]}><Text style={[s.navText,transferTargetBranchId===item.id&&s.navTextOn]}>{item.name}</Text></Pressable>)}</View><Text style={s.muted}>Chagua bidhaa:</Text><View style={s.row}>{products.filter(item=>item.active).map(item=><Pressable key={item.id} onPress={()=>{setTransferProductId(item.id);setTransferIdempotencyKey(null);}} style={[s.navItem,transferProductId===item.id&&s.navOn]}><Text style={[s.navText,transferProductId===item.id&&s.navTextOn]}>{item.name}</Text></Pressable>)}</View><TextInput value={transferQuantity} onChangeText={value=>{setTransferQuantity(value);setTransferIdempotencyKey(null);}} placeholder="Kiasi cha kuhamisha" placeholderTextColor="#8194A5" keyboardType="decimal-pad" style={s.field}/><Button label={cloudLoading?"Inahamisha...":"Thibitisha uhamisho"} onPress={transferStock}/>{branches.length<=1&&<Text style={s.foot}>Ongeza tawi jingine kabla ya kufanya uhamisho.</Text>}</View>{products.filter(p=>p.active).map(p=><View key={p.id} style={s.list}><View style={s.flex}><Text style={s.item}>{p.name}</Text><Text style={s.muted}>SKU {p.sku} · Stock {p.stockQuantity} {p.unit}</Text></View><Button label="＋ Stock in" quiet onPress={()=>receiveStock(p.id)}/></View>)}<Text style={s.foot}>Stock in huhifadhiwa kupitia RPC salama na historia ya stock movement. {effectiveRole==="stockkeeper"?"Mabadiliko ya katalogi yanasimamiwa na mmiliki au meneja.":""}</Text></>}
   {screen==="Debts"&&<><Text style={s.pageTitle}>Kitabu cha Madeni</Text><Text style={s.muted}>Rekodi madeni ya wateja na malipo wanayorejesha.</Text><View style={s.panel}><Text style={s.heading}>Ongeza deni jipya</Text><TextInput value={debtorName} onChangeText={setDebtorName} placeholder="Jina la mteja" placeholderTextColor="#8194A5" style={s.field}/><TextInput value={debtAmount} onChangeText={setDebtAmount} placeholder="Kiasi cha deni (TZS)" placeholderTextColor="#8194A5" keyboardType="numeric" style={s.field}/><Button label={supabaseConfigured ? "Hifadhi deni" : "Hifadhi deni (demo)"} onPress={addDebt}/></View><Metric label="JUMLA YA MADENI YALIYOBAKI" value={formatTZS(outstandingDebt)}/>{debts.map(d=><View key={d.id} style={s.panel}><Text style={s.item}>{d.customerName}</Text><Text style={s.muted}>Deni la awali: {formatTZS(d.originalAmount)} · Amelipa: {formatTZS(d.amountPaid)}</Text><Text style={s.total}>Baki: {formatTZS(d.balance)}</Text>{d.balance>0&&<><TextInput value={repaymentAmount} onChangeText={setRepaymentAmount} placeholder="Kiasi cha kurejesha (TZS)" placeholderTextColor="#8194A5" keyboardType="numeric" style={s.field}/><View style={s.row}>{([{id:"cash",label:"Cash"},{id:"mobile_money",label:"Mobile"},{id:"bank",label:"Bank"}] as const).map(option=><Pressable key={option.id} onPress={()=>setDebtPaymentMethod(option.id)} style={[s.navItem,debtPaymentMethod===option.id&&s.navOn]}><Text style={[s.navText,debtPaymentMethod===option.id&&s.navTextOn]}>{option.label}</Text></Pressable>)}</View><Button label="Rekodi marejesho" quiet onPress={()=>repayDebt(d.id)}/></>}</View>)}<Text style={s.foot}>{supabaseConfigured ? "Madeni na marejesho huhifadhiwa kwenye database ya duka." : "Data hii ni ya majaribio kwenye kumbukumbu ya muda ya app; bado haisawazishwi na database."}</Text></>}
   {screen==="Expenses"&&<><Text style={s.pageTitle}>Gharama za Biashara</Text><Text style={s.muted}>Andika gharama ili ionekane kwenye makadirio ya faida.</Text><View style={s.panel}><Text style={s.heading}>Ongeza gharama</Text><TextInput value={expenseName} onChangeText={setExpenseName} placeholder="Mfano: Usafiri, kodi, umeme" placeholderTextColor="#8194A5" style={s.field}/><TextInput value={expenseAmount} onChangeText={setExpenseAmount} placeholder="Kiasi (TZS)" placeholderTextColor="#8194A5" keyboardType="numeric" style={s.field}/><Text style={s.muted}>Njia ya malipo ya gharama:</Text><View style={s.row}>{([{id:"cash",label:"Cash"},{id:"mobile_money",label:"Mobile"},{id:"bank",label:"Bank"}] as const).map(option=><Pressable key={option.id} onPress={()=>setExpensePaymentMethod(option.id)} style={[s.navItem,expensePaymentMethod===option.id&&s.navOn]}><Text style={[s.navText,expensePaymentMethod===option.id&&s.navTextOn]}>{option.label}</Text></Pressable>)}</View><Button label={supabaseConfigured ? "Hifadhi gharama" : "Hifadhi gharama (demo)"} onPress={addExpense}/></View><Metric label="JUMLA YA GHARAMA" value={formatTZS(expenses.reduce((a,x)=>a+x.amount,0))}/>{expenses.map(e=><View key={e.id} style={s.list}><View style={s.flex}><Text style={s.item}>{e.description}</Text><Text style={s.muted}>{new Date(e.createdAt).toLocaleDateString("sw-TZ")}</Text></View><Text style={s.stock}>{formatTZS(e.amount)}</Text></View>)}<Text style={s.foot}>{supabaseConfigured ? "Gharama hizi zimehifadhiwa kwenye database ya duka." : "Gharama zinawekwa kwenye demo tu; data haitadumu baada ya app kufungwa."}</Text></>}
   {screen==="Returns"&&<><Text style={s.pageTitle}>Returns & Refunds</Text><Text style={s.muted}>Rejesha bidhaa na rudisha fedha kwa mauzo yaliyolipwa kikamilifu. Marejesho yote yanarekodiwa kwenye historia.</Text><View style={s.panel}><Text style={s.heading}>Sababu ya kurejesha</Text><TextInput value={refundReason} onChangeText={setRefundReason} placeholder="Mfano: Bidhaa imeharibika / mteja amerejesha" placeholderTextColor="#8194A5" style={s.field}/><Text style={s.muted}>Njia ya kurejesha fedha:</Text><View style={s.row}>{([{id:"cash",label:"Cash"},{id:"mobile_money",label:"Mobile Money"},{id:"bank",label:"Bank"}] as const).map(option=><Pressable key={option.id} onPress={()=>setRefundPaymentMethod(option.id)} style={[s.navItem,refundPaymentMethod===option.id&&s.navOn]}><Text style={[s.navText,refundPaymentMethod===option.id&&s.navTextOn]}>{option.label}</Text></Pressable>)}</View><Text style={s.foot}>Kwa sasa refund inafanyika kwa risiti nzima; chagua njia halisi iliyotumika kurejesha fedha.</Text></View>{sales.filter(sale=>sale.status==="completed"&&sale.amountPaid>=sale.total).map(sale=><View key={sale.id} style={s.panel}><Text style={s.item}>Risiti {sale.receiptNumber}</Text><Text style={s.muted}>{new Date(sale.createdAt).toLocaleString("sw-TZ")} · {sale.lines.length} bidhaa</Text>{sale.lines.map((line,index)=><Text key={line.id??index} style={s.muted}>{line.productName} × {line.quantity}</Text>)}<Text style={s.total}>{formatTZS(sale.total)}</Text><Button label={supabaseConfigured?"Thibitisha refund nzima ("+refundPaymentMethod+")":"Refund nzima (demo)"} quiet onPress={()=>refundSale(sale)}/></View>)}{sales.filter(sale=>sale.status==="refunded").length>0&&<Text style={s.foot}>Risiti zilizorejeshwa kikamilifu: {sales.filter(sale=>sale.status==="refunded").length}</Text>}</>}
   {screen==="Sync"&&<><Text style={s.pageTitle}>Offline Sync Review</Text><Text style={s.muted}>Mauzo yaliyohifadhiwa kwenye simu lakini bado hayajathibitishwa na server. Usifute rekodi hizi kama fedha tayari zimepokelewa.</Text><View style={s.panel}><Metric label="MAUZO YANAYOSUBIRI" value={String(pendingOutbox.length)}/><Text style={s.muted}>Hali ya mtandao: {isConnected===true?"ONLINE":isConnected===false?"OFFLINE":"INAKAGUA"}</Text></View>{pendingOutbox.length===0?<Text style={s.notice}>Hakuna mauzo yanayosubiri kusawazishwa.</Text>:pendingOutbox.map(item=><View key={item.idempotencyKey} style={s.panel}><Text style={s.item}>{item.sale.receiptNumber}</Text><Text style={s.muted}>{new Date(item.queuedAt).toLocaleString("sw-TZ")} · {item.items.length} bidhaa</Text>{item.sale.lines.map((line,index)=><Text key={line.productId+index} style={s.muted}>{line.productName} × {line.quantity} · {formatTZS(line.lineTotal)}</Text>)}<Text style={s.total}>{formatTZS(item.sale.total)}</Text><Text style={s.notice}>{item.syncIssue==="PRICE_CHANGED"?"Bei ya server imebadilika. Muamala umefungwa kwa ukaguzi wa mmiliki; thibitisha bei na mteja kabla ya kuamua hatua inayofuata.":item.syncIssue==="STOCK_CHANGED"?"Stock ya server haitoshi. Kagua stock na uthibitishe kama mauzo yalifanyika kabla ya kuendelea.":item.syncIssue==="SYNC_FAILED"?"Server haikupokea muamala. Jaribu tena baada ya kuthibitisha intaneti na hali ya database.":"Inasubiri kusawazishwa; bado si mauzo yaliyothibitishwa."}</Text>{(!item.syncIssue||item.syncIssue==="SYNC_FAILED")&&<Button label="Jaribu kusawazisha tena" quiet onPress={()=>retryPendingSale(item.idempotencyKey)}/>}</View>)}<Text style={s.foot}>Bei au stock ikibadilika, app haibadilishi bei kimyakimya wala haifuti mauzo. Mmiliki anapaswa kulinganisha risiti ya mteja na rekodi za server kabla ya kuchukua hatua.</Text></>}
   {screen==="Payments"&&<><Text style={s.pageTitle}>Payment Instructions</Text><Text style={s.muted}>Manual payment details supplied by the business owner. Confirm the recipient and amount before sending.</Text><View style={s.panel}><Text style={s.eyebrow}>HALOPESA</Text><Text style={s.paymentNumber}>0621665181</Text><Text style={s.item}>REORNADA BINARY RHESPICIOUS</Text><Text style={s.muted}>Use this number for HaloPesa payments.</Text></View><View style={s.panel}><Text style={s.eyebrow}>M-PESA</Text><Text style={s.paymentNumber}>0797665181</Text><Text style={s.item}>ELIAS PAUL MARWA</Text><Text style={s.muted}>Use this number for M-Pesa payments.</Text></View><Text style={s.notice}>IMPORTANT: These are manual payment instructions only. App payment verification, automatic Pro activation and provider API callbacks are not connected yet. Never mark a payment as successful based only on a screenshot or customer message.</Text></>}
   {screen==="Reports"&&<><Text style={s.pageTitle}>Ripoti za Biashara</Text><Text style={s.muted}>{supabaseConfigured ? "Muhtasari wa miamala iliyopakiwa kutoka database ya duka." : "Muhtasari wa data ya majaribio pekee."}</Text><View style={s.panel}><Text style={s.heading}>Chagua kipindi</Text><View style={s.row}>{([{id:"today",label:"Leo"},{id:"7d",label:"Siku 7"},{id:"30d",label:"Siku 30"}] as const).map(option=><Pressable key={option.id} onPress={()=>setReportRange(option.id)} style={[s.navItem,reportRange===option.id&&s.navOn]}><Text style={[s.navText,reportRange===option.id&&s.navTextOn]}>{option.label}</Text></Pressable>)}</View><View style={s.row}>{([{id:"year",label:"Mwaka huu"},{id:"all",label:"Tangu mwanzo"}] as const).map(option=><Pressable key={option.id} onPress={()=>setReportRange(option.id)} style={[s.navItem,reportRange===option.id&&s.navOn]}><Text style={[s.navText,reportRange===option.id&&s.navTextOn]}>{option.label}</Text></Pressable>)}</View></View><View style={s.panel}><Text style={s.heading}>Pakua / Shiriki Ripoti</Text><Text style={s.muted}>PDF kwa ripoti rasmi, au CSV inayofunguka kwenye Microsoft Excel na programu nyingine za spreadsheet.</Text><View style={s.row}><View style={s.flex}><Button label="Tengeneza PDF" onPress={()=>exportReport("pdf")}/></View><View style={s.flex}><Button label="Export Excel (CSV)" quiet onPress={()=>exportReport("csv")}/></View></View></View><Metric label="MAUZO YALIYOTHIBITISHWA" value={formatTZS(reportSalesValue)}/><Metric label="IDADI YA MAUZO" value={String(reportSales.filter(sale=>sale.status!=="pending_sync").length)}/><Metric label="REFUNDS (JUMLA YA HISTORIA)" value={formatTZS(refundTotal)}/><Metric label="GHARAMA ZA KIPINDI" value={formatTZS(reportExpenseValue)}/><Metric label="FAIDA HALISI YA MAKADIRIO" value={formatTZS(reportProfit)}/><Text style={s.heading}>Ripoti za kufunga siku za tawi</Text>{dailyClosings.length===0?<Text style={s.muted}>Hakuna ripoti za kufunga siku zilizowasilishwa kwenye tawi hili.</Text>:dailyClosings.map(row=><View key={row.id} style={s.panel}><Text style={s.item}>{new Date(row.closed_at).toLocaleString("sw-TZ")} · {row.sales_count} mauzo</Text><Text style={s.muted}>Mauzo: {formatTZS(Number(row.total_sales))} · Cash inayotarajiwa: {formatTZS(Number(row.expected_cash))}</Text><Text style={s.muted}>Cash iliyohesabiwa: {formatTZS(Number(row.counted_cash))} · Tofauti: {formatTZS(Number(row.cash_difference))}</Text><Text style={s.notice}>Hali: {row.review_status==="approved"?"IMEIDHINISHWA":row.review_status==="needs_review"?"INAHITAJI UKAGUZI":"INASUBIRI MAPITIO"}</Text>{row.review_status==="pending"&&<View style={s.row}><View style={s.flex}><Button label="Idhinisha" onPress={()=>reviewDailyClosing(row.id,"approved")}/></View><View style={s.flex}><Button label="Kagua zaidi" quiet onPress={()=>reviewDailyClosing(row.id,"needs_review")}/></View></View>}</View>)}<Text style={s.foot}>Ripoti inachuja mauzo na gharama kwa tarehe ya muamala. Refunds zinaonyeshwa kama jumla ya historia kwa sababu snapshot ya sasa haina tarehe ya kila refund. Mauzo yanayosubiri sync hayahesabiwi. Faida ni makadirio kabla ya kodi na gharama ambazo hazijaingizwa.</Text></>}
     {screen==="DayClose"&&<><Text style={s.pageTitle}>Ufunguzi na Kufunga Siku</Text><Text style={s.muted}>Kila tawi lina session yake. Thibitisha cash ya mwanzo kabla ya mauzo, kisha funga siku baada ya kuhesabu cash halisi.</Text>{activeSession?<View style={s.panel}><Text style={s.eyebrow}>SESSION ILIYO WAZI</Text><Text style={s.item}>Imefunguliwa: {new Date(activeSession.opened_at).toLocaleString("sw-TZ")}</Text><Text style={s.muted}>Cash ya mwanzo: {formatTZS(activeSession.opening_cash)}</Text><TextInput value={countedCash} onChangeText={setCountedCash} placeholder="Cash halisi iliyohesabiwa (TZS)" placeholderTextColor="#8194A5" keyboardType="decimal-pad" style={s.field}/>{activeSession.opened_by===userId||effectiveRole==="owner"||effectiveRole==="manager"?<Button label={sessionBusy?"Inafunga...":"Funga siku na tuma ripoti"} onPress={closeCashSession}/>:<Text style={s.notice}>Session imefunguliwa na mfanyakazi mwingine. Ni yeye au usimamizi pekee unaoweza kuifunga.</Text>}<Text style={s.foot}>Kama kuna mauzo offline yanayosubiri, yafanyie sync kabla ya kufunga.</Text></View>:<View style={s.panel}><Text style={s.eyebrow}>HAKUNA SESSION ILIYO WAZI</Text><Text style={s.muted}>Hakikisha cash ya mwanzo imehesabiwa kisha fungua siku ya tawi hili.</Text><TextInput value={openingCash} onChangeText={setOpeningCash} placeholder="Cash ya mwanzo (TZS)" placeholderTextColor="#8194A5" keyboardType="decimal-pad" style={s.field}/><Button label={sessionBusy?"Inafungua...":"Fungua siku ya biashara"} onPress={openCashSession}/></View>}</>}
   {screen==="Owner"&&isPlatformAdmin&&<PlatformOwnerDashboard/>}
     {screen==="Staff"&&effectiveRole==="owner"&&<StaffManagement/>}
     {screen==="Subscription"&&effectiveRole==="owner"&&<SubscriptionManagement/>}
  </ScrollView>
 </SafeAreaView>;
}
const s=StyleSheet.create({
 safe:{flex:1,backgroundColor:"#081522"},header:{paddingTop:12,paddingBottom:14,paddingHorizontal:17,alignItems:"center",justifyContent:"center"},eyebrow:{color:"#43C99A",fontSize:10,fontWeight:"800",letterSpacing:1.5},brand:{color:"#F4F7FA",fontSize:19,fontWeight:"900"},gold:{color:"#D7B56D"},logoImage:{width:230,height:145,alignSelf:"center",marginBottom:7},headerText:{alignItems:"center"},navScroll:{maxHeight:52},nav:{flexDirection:"row",gap:7,paddingHorizontal:12,paddingBottom:8},navItem:{paddingHorizontal:16,paddingVertical:11,alignItems:"center",backgroundColor:"#102438",borderRadius:11},field:{backgroundColor:"#0B1B2A",borderWidth:1,borderColor:"#2B4B61",borderRadius:9,color:"#F4F7FA",paddingHorizontal:12,paddingVertical:11,marginTop:9,fontSize:13},paymentNumber:{color:"#F2D99F",fontSize:25,fontWeight:"900",letterSpacing:1,marginTop:9,marginBottom:6},navOn:{backgroundColor:"#174A40",borderWidth:1,borderColor:"#43C99A"},navText:{color:"#91A4B5",fontSize:12,fontWeight:"700"},navTextOn:{color:"#75E0B8"},content:{padding:16,paddingBottom:40,maxWidth:900,width:"100%",alignSelf:"center"},hero:{padding:20,backgroundColor:"#102438",borderRadius:17,borderWidth:1,borderColor:"#1D3A50",marginBottom:12},heroTitle:{color:"#FFF",fontSize:25,fontWeight:"900",marginTop:8},muted:{color:"#91A4B5",fontSize:12,marginTop:4},row:{flexDirection:"row",gap:10,marginBottom:10},flex:{flex:1},metric:{flex:1,minHeight:82,padding:13,backgroundColor:"#102438",borderRadius:14,borderWidth:1,borderColor:"#1D3A50",marginBottom:9,justifyContent:"center"},label:{color:"#91A4B5",fontSize:9,fontWeight:"800"},value:{color:"#F4F7FA",fontSize:17,fontWeight:"900",marginTop:8},heading:{color:"#FFF",fontSize:17,fontWeight:"800",marginTop:12,marginBottom:8},pageTitle:{color:"#FFF",fontSize:24,fontWeight:"900"},button:{backgroundColor:"#16785C",padding:13,borderRadius:11,alignItems:"center",justifyContent:"center",marginTop:7},quiet:{backgroundColor:"#173247",borderWidth:1,borderColor:"#2B4B61"},buttonText:{color:"#F5FFFA",fontSize:12,fontWeight:"800"},notice:{color:"#75E0B8",backgroundColor:"#102D2C",padding:12,borderRadius:10,fontSize:12,marginTop:14},foot:{color:"#8194A5",fontSize:11,lineHeight:17,marginTop:15},list:{flexDirection:"row",alignItems:"center",gap:10,padding:13,backgroundColor:"#102438",borderWidth:1,borderColor:"#1D3A50",borderRadius:13,marginTop:9},item:{color:"#F4F7FA",fontSize:14,fontWeight:"800"},stock:{color:"#75E0B8",fontWeight:"900",backgroundColor:"#173D36",padding:9,borderRadius:8,fontSize:11},panel:{backgroundColor:"#102438",borderWidth:1,borderColor:"#1D3A50",padding:14,borderRadius:14,marginTop:15},total:{color:"#F2D99F",fontSize:18,fontWeight:"900",marginTop:14}
});


export default function App() { return <AuthGate><Dashboard /></AuthGate>; }
