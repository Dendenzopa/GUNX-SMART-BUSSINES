import type { Expense, Sale } from "./types";
export const formatTZS = (amount: number): string => new Intl.NumberFormat("sw-TZ", { style: "currency", currency: "TZS", maximumFractionDigits: 0 }).format(Number.isFinite(amount) ? amount : 0);
export const saleGrossProfit = (sale: Sale): number => sale.lines.reduce((sum, line) => sum + (line.unitPrice - line.unitCost) * line.quantity, 0) - sale.discount;
export const totalSales = (sales: Sale[]): number => sales.reduce((sum, sale) => sum + (sale.status === "refunded" ? 0 : sale.total), 0);
export const totalExpenses = (expenses: Expense[]): number => expenses.reduce((sum, expense) => sum + expense.amount, 0);
export const netProfit = (sales: Sale[], expenses: Expense[]): number => sales.reduce((sum, sale) => sum + (sale.status === "refunded" ? 0 : saleGrossProfit(sale)), 0) - totalExpenses(expenses);
