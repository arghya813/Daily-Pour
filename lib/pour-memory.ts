"use client";

import { useEffect, useState } from "react";
import { defaultUsuals, findCategory, findProduct } from "@/lib/products";

export type Consent = "unknown" | "granted" | "denied";

export type StoredOrder = {
  productId: string;
  quantity: number;
  at: number;
};

const USUALS_STORAGE_KEY = "pour-usuals";
const LAST_CATEGORY_KEY = "pour-last-category";
const ORDERS_STORAGE_KEY = "pour-orders";
const CONSENT_KEY = "pour-consent";
const MAX_STORED_ORDERS = 20;

export function loadUsuals(): Record<string, string> {
  const next: Record<string, string> = { ...defaultUsuals };

  try {
    const stored = window.localStorage.getItem(USUALS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Record<string, unknown>;
      for (const [categoryId, productId] of Object.entries(parsed)) {
        if (typeof productId !== "string") continue;
        const product = findProduct(productId);
        if (product && product.category === categoryId) {
          next[categoryId] = productId;
        }
      }
      return next;
    }

    // Migrate the old single "usual" value.
    const legacy = window.localStorage.getItem("pour-usual");
    const product = legacy ? findProduct(legacy) : undefined;
    if (product) next[product.category] = product.id;
  } catch {
    // Ignore malformed storage and fall back to defaults.
  }

  return next;
}

export function loadOrders(): StoredOrder[] {
  try {
    const stored = window.localStorage.getItem(ORDERS_STORAGE_KEY);
    if (!stored) return [];

    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (item): item is StoredOrder =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as StoredOrder).productId === "string" &&
          findProduct((item as StoredOrder).productId) !== undefined,
      )
      .map((item) => ({
        productId: item.productId,
        quantity: Math.min(9, Math.max(1, Math.floor(item.quantity ?? 1))),
        at: typeof item.at === "number" ? item.at : Date.now(),
      }))
      .slice(-MAX_STORED_ORDERS);
  } catch {
    return [];
  }
}

export function loadLastCategory(usuals: Record<string, string>): string {
  try {
    const stored = window.localStorage.getItem(LAST_CATEGORY_KEY);
    if (stored && findCategory(stored) && usuals[stored]) return stored;
  } catch {
    // Ignore malformed storage.
  }

  return Object.keys(usuals)[0] ?? "coffee";
}

export function hasStoredConsent(): boolean {
  try {
    return window.localStorage.getItem(CONSENT_KEY) === "granted";
  } catch {
    return false;
  }
}

export function usePourMemory() {
  const [consent, setConsent] = useState<Consent>("unknown");
  const [ready, setReady] = useState(false);
  const [usuals, setUsuals] = useState<Record<string, string>>({});
  const [orders, setOrders] = useState<StoredOrder[]>([]);
  const [lastCategory, setLastCategory] = useState("coffee");

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- one-time hydration read from localStorage */
    try {
      if (hasStoredConsent()) {
        const savedUsuals = loadUsuals();
        setConsent("granted");
        setUsuals(savedUsuals);
        setOrders(loadOrders());
        setLastCategory(loadLastCategory(savedUsuals));
      }
    } catch {
      // Memory must never block the chat — fall through and mark ready.
    } finally {
      setReady(true);
    }

    // Safety net: never leave the composer disabled waiting on storage.
    const fallback = window.setTimeout(() => setReady(true), 1500);
    /* eslint-enable react-hooks/set-state-in-effect */

    return () => window.clearTimeout(fallback);
  }, []);

  function grantConsent() {
    try {
      window.localStorage.setItem(CONSENT_KEY, "granted");
    } catch {
      // Storage may be unavailable; memory still works for this session.
    }

    const savedUsuals = loadUsuals();
    setConsent("granted");
    setUsuals(savedUsuals);
    setOrders(loadOrders());
    setLastCategory(loadLastCategory(savedUsuals));
  }

  function denyConsent() {
    setConsent("denied");
    setUsuals({});
    setOrders([]);
  }

  function saveUsual(category: string, productId: string) {
    if (consent !== "granted") return;

    setUsuals((current) => {
      const next = { ...current, [category]: productId };
      try {
        window.localStorage.setItem(USUALS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage errors.
      }
      return next;
    });

    setLastCategory(category);
    try {
      window.localStorage.setItem(LAST_CATEGORY_KEY, category);
    } catch {
      // Ignore storage errors.
    }
  }

  function recordOrders(
    entries: Array<{ productId: string; quantity: number }>,
  ) {
    if (consent !== "granted" || entries.length === 0) return;

    setOrders((current) => {
      const now = Date.now();
      const next = [
        ...current,
        ...entries.map((entry) => ({
          productId: entry.productId,
          quantity: entry.quantity,
          at: now,
        })),
      ].slice(-MAX_STORED_ORDERS);

      try {
        window.localStorage.setItem(
          ORDERS_STORAGE_KEY,
          JSON.stringify(next),
        );
      } catch {
        // Ignore storage errors.
      }
      return next;
    });
  }

  function saveOrder(productId: string, quantity: number) {
    recordOrders([{ productId, quantity }]);
  }

  return {
    consent,
    ready,
    usuals,
    orders,
    lastCategory,
    grantConsent,
    denyConsent,
    saveUsual,
    saveOrder,
    recordOrders,
  };
}
