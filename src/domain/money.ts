import type { Expense, Sale } from "./types";

export interface RefundRecord {
  amount: number;
  returnedCost: number;
  createdAt: string;
  saleId?: string;
  items?: { saleItemId: string; quantity: number; returnedCost: number }[];
}

export const formatTZS = (amount: number): string => new Intl.NumberFormat("sw-TZ", { style: "currency", currency: "TZS", maximumFractionDigits: 0 }).format(Number.isFinite(amount) ? amount : 0);
export const saleGrossProfit = (sale: Sale): number | null => {
  if (sale.lines.some(line => !Number.isFinite(line.unitCost))) return null;
  return sale.lines.reduce((sum, line) => sum + (line.unitPrice - line.unitCost) * line.quantity, 0) - sale.discount;
};

// A refunded receipt remains a completed sale transaction. Its refund is recorded
// separately on the refund date so period reports do not rewrite the original sale.
export const isCountableSale = (sale: Sale): boolean => sale.status !== "voided" && sale.status !== "pending_sync";
export const countSales = (sales: Sale[]): number => sales.filter(isCountableSale).length;
export const totalSales = (sales: Sale[], refundTotal = 0): number =>
  sales.reduce((sum, sale) => sum + (isCountableSale(sale) ? sale.total : 0), 0) - refundTotal;
export const totalExpenses = (expenses: Expense[]): number => expenses.reduce((sum, expense) => sum + expense.amount, 0);
export const netProfit = (sales: Sale[], expenses: Expense[], refunds: RefundRecord[] = []): number | null => {
  const profits = sales.filter(isCountableSale).map(saleGrossProfit);
  if (profits.some(profit => profit === null) || refunds.some(refund => !Number.isFinite(refund.returnedCost))) return null;
  const grossProfit = profits.reduce<number>((sum, profit) => sum + (profit ?? 0), 0);
  const refundImpact = refunds.reduce((sum, refund) => sum + refund.amount - refund.returnedCost, 0);
  return grossProfit - refundImpact - totalExpenses(expenses);
};
