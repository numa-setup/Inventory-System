// Offline POS queue. When a sale can't reach the server (no network), it's
// stored here and replayed on reconnect. Every sale carries its idempotency_key
// so a replay can never double-count — if the original actually reached the
// server, the retry just returns the existing sale.

import type { PaymentInput } from "@/features/pos/actions";

export interface QueuedSalePayload {
  lines: { variant_id: string; product_id: string; qty: number; unit_price: number; discount?: number }[];
  customer_id: string | null;
  /** Customer name captured at the till (free walk-in name or a linked customer). */
  customer_name?: string | null;
  payments: PaymentInput[];
  discount: number;
}

export interface QueuedSale {
  idempotency_key: string;
  ts: number;
  payload: QueuedSalePayload;
}

const DB_NAME = "hgs-pos";
const STORE = "kv";
const KEY = "sale-queue";

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function read(): Promise<QueuedSale[]> {
  if (typeof indexedDB === "undefined") return [];
  try {
    const db = await idbOpen();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as QueuedSale[]) ?? []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

async function write(list: QueuedSale[]): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await idbOpen();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(list, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* best effort */
  }
}

export async function enqueueSale(sale: QueuedSale): Promise<void> {
  const q = await read();
  q.push(sale);
  await write(q);
}

export async function getQueue(): Promise<QueuedSale[]> {
  return read();
}

export async function removeFromQueue(key: string): Promise<void> {
  await write((await read()).filter((s) => s.idempotency_key !== key));
}

export async function queueCount(): Promise<number> {
  return (await read()).length;
}
