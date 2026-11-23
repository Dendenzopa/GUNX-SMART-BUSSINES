import AsyncStorage from "@react-native-async-storage/async-storage";
import type { DebtEntry, Expense, Product, Sale } from "../domain/types";

export interface PendingSale {
  shopId: string;
  branchId: string;
  idempotencyKey: string;
  items: { product_id: string; quantity: number }[];
  sale: Sale;
  queuedAt: string;
  syncIssue?: string;
}

const keyFor = (shopId: string, userId: string | null, role: string) =>
  role === "owner" ? `gunx:offline-sales:v1:${shopId}` : `gunx:offline-sales:v2:${shopId}:${userId ?? "unknown"}`;

export async function readPendingSales(shopId: string, userId: string | null, role: string): Promise<PendingSale[]> {
  if (!shopId || !userId) return [];
  try {
    const raw = await AsyncStorage.getItem(keyFor(shopId,userId,role));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as PendingSale[] : [];
  } catch {
    return [];
  }
}

export async function writePendingSales(shopId: string, userId: string | null, role: string, items: PendingSale[]): Promise<void> {
  if (!shopId || !userId) throw new Error("Shop ID na user ID vinahitajika kuhifadhi mauzo yanayosubiri.");
  await AsyncStorage.setItem(keyFor(shopId,userId,role), JSON.stringify(items));
}

const productsKeyFor = (shopId: string, branchId: string) => `gunx:product-cache:v2:${shopId}:${branchId}`;

export async function readCachedProducts(shopId: string, branchId: string): Promise<Product[]> {
  if (!shopId || !branchId) return [];
  try {
    const raw = await AsyncStorage.getItem(productsKeyFor(shopId,branchId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as Product[] : [];
  } catch {
    return [];
  }
}

export async function writeCachedProducts(shopId: string, branchId: string, products: Product[]): Promise<void> {
  if (!shopId || !branchId) return;
  await AsyncStorage.setItem(productsKeyFor(shopId,branchId), JSON.stringify(products));
}

export interface CachedBusinessSnapshot {
  sales: Sale[];
  expenses: Expense[];
  debts: DebtEntry[];
  refundTotal: number;
  cachedAt: string;
}

const snapshotKeyFor = (shopId: string, userId: string | null, branchId: string) => `gunx:business-cache:v3:${shopId}:${branchId}:${userId ?? "unknown"}`;

export async function readCachedBusinessSnapshot(shopId: string, userId: string | null, branchId: string): Promise<CachedBusinessSnapshot | null> {
  if (!shopId || !userId || !branchId) return null;
  try {
    const raw = await AsyncStorage.getItem(snapshotKeyFor(shopId,userId,branchId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedBusinessSnapshot;
    if (!Array.isArray(parsed.sales) || !Array.isArray(parsed.expenses) || !Array.isArray(parsed.debts) || !Number.isFinite(parsed.refundTotal)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeCachedBusinessSnapshot(shopId: string, userId: string | null, branchId: string, snapshot: CachedBusinessSnapshot): Promise<void> {
  if (!shopId || !userId || !branchId) return;
  await AsyncStorage.setItem(snapshotKeyFor(shopId,userId,branchId), JSON.stringify(snapshot));
}
