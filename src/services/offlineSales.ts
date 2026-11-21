import AsyncStorage from "@react-native-async-storage/async-storage";
import type { DebtEntry, Expense, Product, Sale } from "../domain/types";

export interface PendingSale {
  shopId: string;
  idempotencyKey: string;
  items: { product_id: string; quantity: number }[];
  sale: Sale;
  queuedAt: string;
}

const keyFor = (shopId: string) => `gunx:offline-sales:v1:${shopId}`;

export async function readPendingSales(shopId: string): Promise<PendingSale[]> {
  if (!shopId) return [];
  try {
    const raw = await AsyncStorage.getItem(keyFor(shopId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as PendingSale[] : [];
  } catch {
    return [];
  }
}

export async function writePendingSales(shopId: string, items: PendingSale[]): Promise<void> {
  if (!shopId) throw new Error("Shop ID inahitajika kuhifadhi mauzo yanayosubiri.");
  await AsyncStorage.setItem(keyFor(shopId), JSON.stringify(items));
}

const productsKeyFor = (shopId: string) => `gunx:product-cache:v1:${shopId}`;

export async function readCachedProducts(shopId: string): Promise<Product[]> {
  if (!shopId) return [];
  try {
    const raw = await AsyncStorage.getItem(productsKeyFor(shopId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as Product[] : [];
  } catch {
    return [];
  }
}

export async function writeCachedProducts(shopId: string, products: Product[]): Promise<void> {
  if (!shopId) return;
  await AsyncStorage.setItem(productsKeyFor(shopId), JSON.stringify(products));
}

export interface CachedBusinessSnapshot {
  sales: Sale[];
  expenses: Expense[];
  debts: DebtEntry[];
  refundTotal: number;
  cachedAt: string;
}

const snapshotKeyFor = (shopId: string) => `gunx:business-cache:v1:${shopId}`;

export async function readCachedBusinessSnapshot(shopId: string): Promise<CachedBusinessSnapshot | null> {
  if (!shopId) return null;
  try {
    const raw = await AsyncStorage.getItem(snapshotKeyFor(shopId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedBusinessSnapshot;
    if (!Array.isArray(parsed.sales) || !Array.isArray(parsed.expenses) || !Array.isArray(parsed.debts) || !Number.isFinite(parsed.refundTotal)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeCachedBusinessSnapshot(shopId: string, snapshot: CachedBusinessSnapshot): Promise<void> {
  if (!shopId) return;
  await AsyncStorage.setItem(snapshotKeyFor(shopId), JSON.stringify(snapshot));
}
