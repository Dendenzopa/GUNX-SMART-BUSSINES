import AsyncStorage from "@react-native-async-storage/async-storage";
import type { DebtEntry, Expense, Product, Sale } from "../domain/types";

export interface PendingSale {
  shopId: string;
  idempotencyKey: string;
  items: { product_id: string; quantity: number }[];
  sale: Sale;
  queuedAt: string;
  syncIssue?: string;
}

const keyFor = (shopId: string, userId: string | null, role: string) =>
  `gunx:offline-sales:v3:${shopId}:${userId ?? "unknown"}:${role}`;
const legacyPendingKeyFor = (shopId: string, userId: string | null, role: string) =>
  role === "owner" ? `gunx:offline-sales:v1:${shopId}` : `gunx:offline-sales:v2:${shopId}:${userId ?? "unknown"}`;

export async function readPendingSales(shopId: string, userId: string | null, role: string): Promise<PendingSale[]> {
  if (!shopId || !userId) return [];
  try {
    let raw = await AsyncStorage.getItem(keyFor(shopId,userId,role));
    let fromLegacy = false;
    if (!raw) {
      raw = await AsyncStorage.getItem(legacyPendingKeyFor(shopId,userId,role));
      fromLegacy = Boolean(raw);
    }
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const safeItems = parsed as PendingSale[];
    if (role !== "owner") {
      safeItems.forEach(item => item.sale?.lines?.forEach(line => { line.unitCost = 0; }));
    }
    if (fromLegacy) {
      await AsyncStorage.setItem(keyFor(shopId,userId,role), JSON.stringify(safeItems));
      await AsyncStorage.removeItem(legacyPendingKeyFor(shopId,userId,role));
    }
    return safeItems;
  } catch {
    return [];
  }
}

export async function writePendingSales(shopId: string, userId: string | null, role: string, items: PendingSale[]): Promise<void> {
  if (!shopId || !userId) throw new Error("Shop ID na user ID vinahitajika kuhifadhi mauzo yanayosubiri.");
  await AsyncStorage.setItem(keyFor(shopId,userId,role), JSON.stringify(items));
}

const productsKeyFor = (shopId: string, userId: string | null, role: string, permissionScope: string) => `gunx:product-cache:v3:${shopId}:${userId ?? "unknown"}:${role}:${permissionScope}`;

export async function readCachedProducts(shopId: string, userId: string | null, role: string, permissionScope = ""): Promise<Product[]> {
  if (!shopId) return [];
  try {
    const raw = await AsyncStorage.getItem(productsKeyFor(shopId,userId,role,permissionScope));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as Product[] : [];
  } catch {
    return [];
  }
}

export async function writeCachedProducts(shopId: string, userId: string | null, role: string, products: Product[], permissionScope = ""): Promise<void> {
  if (!shopId) return;
  await AsyncStorage.setItem(productsKeyFor(shopId,userId,role,permissionScope), JSON.stringify(products));
}

export interface CachedBusinessSnapshot {
  sales: Sale[];
  expenses: Expense[];
  debts: DebtEntry[];
  refundTotal: number;
  cachedAt: string;
}

const snapshotKeyFor = (shopId: string, userId: string | null, role: string, permissionScope: string) => `gunx:business-cache:v3:${shopId}:${userId ?? "unknown"}:${role}:${permissionScope}`;

export async function readCachedBusinessSnapshot(shopId: string, userId: string | null, role: string, permissionScope = ""): Promise<CachedBusinessSnapshot | null> {
  if (!shopId || !userId) return null;
  try {
    const raw = await AsyncStorage.getItem(snapshotKeyFor(shopId,userId,role,permissionScope));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedBusinessSnapshot;
    if (!Array.isArray(parsed.sales) || !Array.isArray(parsed.expenses) || !Array.isArray(parsed.debts) || !Number.isFinite(parsed.refundTotal)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeCachedBusinessSnapshot(shopId: string, userId: string | null, role: string, snapshot: CachedBusinessSnapshot, permissionScope = ""): Promise<void> {
  if (!shopId || !userId) return;
  await AsyncStorage.setItem(snapshotKeyFor(shopId,userId,role,permissionScope), JSON.stringify(snapshot));
}
