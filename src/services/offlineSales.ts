import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Sale } from "../domain/types";

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
