import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import type { Expense, Sale } from "../domain/types";
import type { RefundRecord } from "../domain/money";
import { countSales, formatTZS, isCountableSale, netProfit, totalSales } from "../domain/money";

export interface BusinessReportInput {
  businessName: string;
  periodLabel: string;
  sales: Sale[];
  expenses: Expense[];
  refundTotal: number;
  refunds?: RefundRecord[];
  generatedAt?: Date;
}

const htmlEntities: Record<string,string> = {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","\'":"&#39;"};
const escapeHtml = (value: string) => value.replace(/[&<>"\']/g, char => htmlEntities[char] ?? char);
const csvCell = (value: string | number) => {
  let text = String(value);
  if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
};
const safeFileName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "gunx";

export async function exportBusinessReportPdf(input: BusinessReportInput): Promise<void> {
  const generated = input.generatedAt ?? new Date();
  const sales = input.sales.filter(isCountableSale);
  const revenue = totalSales(sales, input.refundTotal);
  const expenses = input.expenses.reduce((sum, item) => sum + item.amount, 0);
  const profit = netProfit(sales, input.expenses, input.refunds ?? []);
  const saleRows = sales.map(sale => `<tr><td>${escapeHtml(sale.receiptNumber)}</td><td>${escapeHtml(new Date(sale.createdAt).toLocaleString("sw-TZ"))}</td><td>${sale.lines.reduce((sum,line)=>sum+line.quantity,0)}</td><td>${escapeHtml(formatTZS(sale.total))}</td><td>${escapeHtml(sale.status)}</td></tr>`).join("");
  const expenseRows = input.expenses.map(item => `<tr><td>${escapeHtml(item.description)}</td><td>${escapeHtml(item.category)}</td><td>${escapeHtml(new Date((item.expenseDate ?? item.createdAt).slice(0,10)+"T00:00:00").toLocaleDateString("sw-TZ"))}</td><td>${escapeHtml(formatTZS(item.amount))}</td></tr>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  body{font-family:Arial,sans-serif;color:#132333;padding:28px}header{background:#081522;color:#fff;padding:22px;border-radius:12px}header h1{margin:0;color:#e5bd58}header p{color:#9ddfc4;margin:7px 0 0}.brand{font-size:12px;letter-spacing:3px;color:#43c99a}h2{font-size:16px;margin-top:26px;color:#102438}.metrics{display:flex;gap:10px;margin-top:16px}.metric{flex:1;background:#eef5f2;padding:12px;border-radius:8px}.metric small{display:block;color:#526779;font-size:9px}.metric strong{display:block;margin-top:8px;font-size:15px}table{width:100%;border-collapse:collapse;font-size:10px;margin-top:10px}th{background:#102438;color:#fff;text-align:left}td,th{padding:8px;border-bottom:1px solid #dce5e9}footer{margin-top:28px;font-size:9px;color:#687b89} .gold{color:#e5bd58}</style></head><body>
  <header><div class="brand">GUNX SMART BUSINESS</div><h1>${escapeHtml(input.businessName || "Business Report")}</h1><p>Ripoti ya biashara · ${escapeHtml(input.periodLabel)}</p></header>
  <div class="metrics"><div class="metric"><small>MAUZO YALIYOTHIBITISHWA</small><strong>${escapeHtml(formatTZS(revenue))}</strong></div><div class="metric"><small>GHARAMA</small><strong>${escapeHtml(formatTZS(expenses))}</strong></div><div class="metric"><small>FAIDA HALISI (MAKADIRIO)</small><strong>${escapeHtml(formatTZS(profit))}</strong></div></div>
  <h2>Mauzo (${countSales(sales)})</h2><table><thead><tr><th>Risiti</th><th>Tarehe</th><th>Bidhaa</th><th>Jumla</th><th>Hali</th></tr></thead><tbody>${saleRows || '<tr><td colspan="5">Hakuna mauzo katika kipindi hiki</td></tr>'}</tbody></table>
  <h2>Gharama (${input.expenses.length})</h2><table><thead><tr><th>Maelezo</th><th>Kategoria</th><th>Tarehe</th><th>Kiasi</th></tr></thead><tbody>${expenseRows || '<tr><td colspan="4">Hakuna gharama katika kipindi hiki</td></tr>'}</tbody></table>
  <footer>Refunds za kipindi kilichochaguliwa: ${escapeHtml(formatTZS(input.refundTotal))}. Takwimu za faida ni makadirio; hakiki hesabu na miamala kabla ya maamuzi ya fedha. Imetengenezwa ${escapeHtml(generated.toLocaleString("sw-TZ"))}.</footer></body></html>`;
  const file = await Print.printToFileAsync({ html, base64: false });
  if (!(await Sharing.isAvailableAsync())) throw new Error("Kushiriki faili hakupatikani kwenye kifaa hiki.");
  await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", dialogTitle: "Shiriki ripoti ya GUNX", UTI: "com.adobe.pdf" });
}

export async function exportBusinessReportCsv(input: BusinessReportInput): Promise<void> {
  const sales = input.sales.filter(isCountableSale);
  const rows: (string | number)[][] = [
    ["GUNX SMART BUSINESS", input.businessName],
    ["Kipindi", input.periodLabel],
    ["Tarehe ya kutengeneza", (input.generatedAt ?? new Date()).toISOString()],
    [],
    ["MUHTASARI", "TZS"],
    ["Mauzo baada ya refunds", totalSales(sales, input.refundTotal)],
    ["Gharama", input.expenses.reduce((sum,item)=>sum+item.amount,0)],
    ["Faida halisi (makadirio)", netProfit(sales,input.expenses,input.refunds ?? [])],
    ["Refunds za kipindi", input.refundTotal],
    [],
    ["MAUZO", "Risiti", "Tarehe", "Idadi ya bidhaa", "Jumla TZS", "Hali"],
    ...sales.map(sale => ["Sale",sale.receiptNumber,sale.createdAt,sale.lines.reduce((sum,line)=>sum+line.quantity,0),sale.total,sale.status]),
    [],
    ["GHARAMA", "Maelezo", "Kategoria", "Tarehe", "Kiasi TZS"],
    ...input.expenses.map(item=>["Expense",item.description,item.category,item.expenseDate ?? item.createdAt,item.amount])
  ];
  const csv = "\uFEFF" + rows.map(row=>row.map(csvCell).join(",")).join("\r\n");
  const directory = FileSystem.documentDirectory;
  if (!directory) throw new Error("Hifadhi ya nyaraka haipatikani kwenye kifaa hiki.");
  const uri = directory + safeFileName(input.businessName) + "-ripoti-" + Date.now() + ".csv";
  await FileSystem.writeAsStringAsync(uri,csv,{encoding:FileSystem.EncodingType.UTF8});
  if (!(await Sharing.isAvailableAsync())) throw new Error("Kushiriki faili hakupatikani kwenye kifaa hiki.");
  await Sharing.shareAsync(uri,{mimeType:"text/csv",dialogTitle:"Shiriki ripoti ya GUNX",UTI:"public.comma-separated-values-text"});
}
