export type ID = string;
export type PaymentMethod = "cash" | "mobile_money" | "bank" | "credit";
export type SaleStatus = "completed" | "partially_paid" | "refunded" | "pending_sync";
export interface Product { id: ID; name: string; sku: string; unit: string; costPrice: number; sellingPrice: number; stockQuantity: number; reorderLevel: number; active: boolean; }
export interface SaleLine { id?: ID; productId: ID; productName: string; quantity: number; unitPrice: number; unitCost: number; lineTotal: number; }
export interface Sale { id: ID; receiptNumber: string; createdAt: string; lines: SaleLine[]; subtotal: number; discount: number; total: number; amountPaid: number; balance: number; paymentMethod: PaymentMethod; status: SaleStatus; }
export interface Expense { id: ID; description: string; category: string; amount: number; createdAt: string; expenseDate?: string; }
export interface Customer { id: ID; name: string; phone?: string; }
export interface DebtEntry { id: ID; customerId: ID; customerName: string; saleId: ID; originalAmount: number; amountPaid: number; balance: number; createdAt: string; }
export interface StockMovement { id: ID; productId: ID; type: "stock_in" | "sale" | "return" | "adjustment"; quantityChange: number; note: string; createdAt: string; }
