import { supabase } from "../lib/supabase";
import type { PaymentMethod } from "../domain/types";

export interface CheckoutLineInput {
  product_id: string;
  quantity: number;
}

export interface CheckoutInput {
  shopId: string;
  branchId: string;
  idempotencyKey: string;
  items: CheckoutLineInput[];
  paymentMethod: PaymentMethod;
  amountPaid?: number;
  customerId?: string;
  expectedTotal?: number;
}

export interface CheckoutResult {
  saleId: string;
  receiptNumber: string;
  total: number;
}

/**
 * Calls the server-side checkout transaction.
 * The server recalculates prices from the products table and locks stock rows.
 * Keep the same idempotencyKey when retrying the same checkout after a timeout.
 */
export async function submitCheckout(input: CheckoutInput): Promise<CheckoutResult> {
  if (!supabase) throw new Error("Supabase haijaunganishwa. Weka environment variables kwanza.");
  if (!input.shopId || !input.branchId || !input.idempotencyKey) throw new Error("Shop ID na idempotency key vinahitajika.");
  if (!input.items.length) throw new Error("Weka angalau bidhaa moja.");
  for (const item of input.items) {
    if (!item.product_id || !Number.isFinite(item.quantity) || item.quantity <= 0) {
      throw new Error("Bidhaa au kiasi si sahihi.");
    }
  }

  const { data, error } = await supabase.rpc("checkout_sale_in_branch", {
    p_shop_id: input.shopId,
    p_branch_id: input.branchId,
    p_idempotency_key: input.idempotencyKey,
    p_items: input.items,
    p_payment_method: input.paymentMethod,
    p_amount_paid: input.amountPaid ?? null,
    p_customer_id: input.customerId ?? null,
    p_expected_total: input.expectedTotal ?? null,
  });

  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.sale_id || !row?.receipt_number) {
    throw new Error("Server haikurudisha risiti ya mauzo iliyothibitishwa.");
  }
  return {
    saleId: row.sale_id,
    receiptNumber: row.receipt_number,
    total: Number(row.sale_total),
  };
}
