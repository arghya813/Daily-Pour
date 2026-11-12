"use client";

import { useEffect, useRef, useState } from "react";
import { SiteNav } from "@/components/site-nav";
import { usePourMemory } from "@/lib/pour-memory";
import { categories, findProduct, formatUsd, products } from "@/lib/products";

type BasketLine = {
  productId: string;
  quantity: number;
};

type BillItem = {
  productId: string;
  name: string;
  category: string;
  categoryName: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
  description: string;
  notes: string;
};

type Bill = {
  items: BillItem[];
  itemCount: number;
  total: string;
};

type CheckoutLink = {
  url: string;
  label: string;
};

function clampQuantity(value: number): number {
  return Math.min(9, Math.max(1, Math.floor(value)));
}

const productsByCategory = Object.fromEntries(
  categories.map((category) => [
    category.id,
    products.filter((product) => product.category === category.id),
  ]),
) as Record<string, typeof products>;

export default function UsualsPage() {
  const {
    consent,
    ready,
    usuals,
    orders,
    grantConsent,
    denyConsent,
    saveUsual,
    saveOrder,
  } = usePourMemory();

  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [basket, setBasket] = useState<BasketLine[]>([]);
  const [bill, setBill] = useState<Bill | null>(null);
  const [link, setLink] = useState<CheckoutLink | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeShown = useRef(false);

  useEffect(() => {
    if (noticeShown.current) return;
    noticeShown.current = true;

    setNotice(
      (() => {
        const status = new URLSearchParams(window.location.search).get(
          "paypal",
        );
        if (!status) return null;

        return status === "paid"
          ? "Payment received — your usuals are on the way."
          : status === "cancelled"
            ? "PayPal checkout was cancelled. Your bag is still here."
            : "PayPal could not complete that payment. Please try again.";
      })(),
    );
  }, []);

  function selectedProductId(categoryId: string): string {
    const chosen = overrides[categoryId] ?? usuals[categoryId];
    const options = productsByCategory[categoryId] ?? [];

    if (chosen && options.some((product) => product.id === chosen)) {
      return chosen;
    }

    return options[0]?.id ?? "";
  }

  function quantityFor(categoryId: string): number {
    return quantities[categoryId] ?? 1;
  }

  function changeQuantity(categoryId: string, delta: number) {
    setQuantities((current) => ({
      ...current,
      [categoryId]: clampQuantity((current[categoryId] ?? 1) + delta),
    }));
  }

  function resetBill() {
    setBill(null);
    setLink(null);
    setWarning(null);
    setError(null);
  }

  function addLine(productId: string, quantity = 1) {
    if (!findProduct(productId)) return;

    setBasket((current) => {
      const existing = current.find((line) => line.productId === productId);

      if (existing) {
        return current.map((line) =>
          line.productId === productId
            ? {
                ...line,
                quantity: clampQuantity(line.quantity + quantity),
              }
            : line,
        );
      }

      return [...current, { productId, quantity: clampQuantity(quantity) }];
    });

    resetBill();
  }

  function addFromCategory(categoryId: string) {
    const productId = selectedProductId(categoryId);
    if (productId) addLine(productId, quantityFor(categoryId));
  }

  function changeBasketQuantity(productId: string, delta: number) {
    setBasket((current) =>
      current.map((line) =>
        line.productId === productId
          ? { ...line, quantity: clampQuantity(line.quantity + delta) }
          : line,
      ),
    );
    resetBill();
  }

  function removeLine(productId: string) {
    setBasket((current) =>
      current.filter((line) => line.productId !== productId),
    );
    resetBill();
  }

  async function makeBill() {
    if (basket.length === 0 || isCheckingOut) return;

    setIsCheckingOut(true);
    resetBill();

    try {
      const response = await fetch("/api/checkout/usuals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: basket }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Could not make the usuals bill.");
      }

      const nextBill = data.bill as Bill | undefined;
      if (!nextBill || !Array.isArray(nextBill.items)) {
        throw new Error("The bill came back empty.");
      }

      setBill(nextBill);
      setLink((data.link as CheckoutLink | undefined) ?? null);
      setWarning(typeof data.warning === "string" ? data.warning : null);
      setBasket([]);

      const memory = data.memory as { updates?: unknown } | undefined;

      if (memory && Array.isArray(memory.updates)) {
        for (const update of memory.updates as Array<{
          category?: unknown;
          productId?: unknown;
          quantity?: unknown;
        }>) {
          if (
            typeof update.category === "string" &&
            typeof update.productId === "string"
          ) {
            saveUsual(update.category, update.productId);
            saveOrder(
              update.productId,
              typeof update.quantity === "number" ? update.quantity : 1,
            );
          }
        }
      }
    } catch (billError) {
      setError(
        billError instanceof Error
          ? billError.message
          : "Could not make the usuals bill. Please try again.",
      );
    } finally {
      setIsCheckingOut(false);
    }
  }

  const basketLines = basket.flatMap((line) => {
    const product = findProduct(line.productId);
    return product ? [{ ...line, product }] : [];
  });

  const itemCount = basketLines.reduce((sum, line) => sum + line.quantity, 0);
  const basketTotal = basketLines.reduce(
    (sum, line) => sum + line.product.price * line.quantity,
    0,
  );

  const recentOrders = [...orders]
    .reverse()
    .filter(
      (order, index, all) =>
        all.findIndex((entry) => entry.productId === order.productId) ===
        index,
    )
    .slice(0, 4);

  return (
    <main className="min-h-screen bg-[#f6f4ee] px-4 py-6 text-[#252a27] sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8e5dc] pb-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-xl font-bold tracking-tight">
              daily pour<span className="text-[#bc8255]">.</span>
            </div>
            <SiteNav />
          </div>
          <span className="rounded-full border border-[#e4e0d6] bg-white px-2.5 py-1 text-[11px] text-[#777b74]">
            {!ready
              ? "Loading memory…"
              : consent === "granted"
                ? "Memory on this device"
                : "Memory off"}
          </span>
        </header>

        <section className="py-9">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#85877d]">
            Usuals
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
            Your shelf,{" "}
            <span className="font-serif italic text-[#315e51]">
              already picked.
            </span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#747970]">
            Every genre keeps its own favourite. Pick a quantity for the usuals
            you want, add them to one bag, and Pour makes a single bill with one
            PayPal checkout.
          </p>
        </section>

        {notice && (
          <div
            role="status"
            className="mb-4 rounded-xl border border-[#cfe0d3] bg-[#f1f6ef] px-4 py-3 text-sm text-[#45634b]"
          >
            {notice}
          </div>
        )}

        {ready && consent === "unknown" && (
          <div className="mb-5 rounded-2xl border border-[#e8e5dc] bg-[#fbfaf4] px-5 py-4">
            <p className="text-sm font-semibold">Let Pour remember your usuals?</p>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-[#747970]">
              Pour saves each genre&apos;s favourite and your recent orders on
              this device. Nothing is stored until you allow it — ordering still
              works either way.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={grantConsent}
                className="rounded-lg bg-[#315e51] px-3 py-2 text-xs font-semibold text-white hover:bg-[#24483f]"
              >
                Remember my preferences
              </button>
              <button
                type="button"
                onClick={denyConsent}
                className="rounded-lg border border-[#e0ddd2] bg-white px-3 py-2 text-xs font-medium text-[#666b64] hover:bg-[#f7f6f1]"
              >
                Not now
              </button>
            </div>
          </div>
        )}

        {ready && consent === "denied" && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e8e5dc] bg-white px-5 py-4">
            <p className="text-xs leading-5 text-[#747970]">
              Memory is off, so a usual is not saved after checkout. You can
              still buy anything in the catalog.
            </p>
            <button
              type="button"
              onClick={grantConsent}
              className="rounded-lg border border-[#e0ddd2] bg-white px-3 py-2 text-xs font-medium text-[#666b64] hover:bg-[#f7f6f1]"
            >
              Turn memory on
            </button>
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr] lg:items-start">
          <section aria-label="Usuals by genre" className="space-y-3">
            {categories.map((category) => {
              const options = productsByCategory[category.id] ?? [];
              const productId = selectedProductId(category.id);
              const product = findProduct(productId);
              const usualProduct = findProduct(usuals[category.id] ?? "");
              const quantity = quantityFor(category.id);

              return (
                <article
                  key={category.id}
                  className="rounded-2xl border border-[#e8e5dc] bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">{category.name}</p>
                      <p className="mt-0.5 text-[11px] text-[#858980]">
                        {usualProduct
                          ? `Saved usual: ${usualProduct.name}`
                          : consent === "granted"
                            ? "No usual saved yet — pick one below."
                            : "Pick any item below."}
                      </p>
                    </div>
                    <span className="rounded-full bg-[#f1f6ef] px-2.5 py-1 text-[10px] font-medium text-[#45634b]">
                      {options.length} items
                    </span>
                  </div>

                  <label className="mt-3 block">
                    <span className="sr-only">Choose a {category.name} item</span>
                    <select
                      value={productId}
                      disabled={!ready}
                      onChange={(event) => {
                        setOverrides((current) => ({
                          ...current,
                          [category.id]: event.target.value,
                        }));
                      }}
                      className="w-full rounded-lg border border-[#e4e2da] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#78947e] disabled:opacity-60"
                    >
                      {options.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name} — {formatUsd(option.price)}
                        </option>
                      ))}
                    </select>
                  </label>

                  {product && (
                    <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-[11px] text-[#858980]">
                        {product.description} · {product.notes}
                      </p>
                      <p className="text-sm font-semibold">
                        {formatUsd(product.price * quantity)}
                      </p>
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1 rounded-lg border border-[#e4e2da] bg-white p-1">
                      <button
                        type="button"
                        disabled={!ready || quantity <= 1}
                        onClick={() => changeQuantity(category.id, -1)}
                        aria-label={`Fewer ${category.name}`}
                        className="grid h-7 w-7 place-items-center rounded-md text-sm font-semibold text-[#666b64] hover:bg-[#f3f2ec] disabled:opacity-40"
                      >
                        −
                      </button>
                      <span className="min-w-6 text-center text-xs font-semibold">
                        {quantity}
                      </span>
                      <button
                        type="button"
                        disabled={!ready || quantity >= 9}
                        onClick={() => changeQuantity(category.id, 1)}
                        aria-label={`More ${category.name}`}
                        className="grid h-7 w-7 place-items-center rounded-md text-sm font-semibold text-[#666b64] hover:bg-[#f3f2ec] disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={!ready || !product}
                      onClick={() => addFromCategory(category.id)}
                      className="rounded-lg bg-[#315e51] px-3 py-2 text-xs font-semibold text-white hover:bg-[#24483f] disabled:opacity-60"
                    >
                      Add to bag
                    </button>
                  </div>
                </article>
              );
            })}

            {ready && consent === "granted" && recentOrders.length > 0 && (
              <div className="rounded-2xl border border-[#e8e5dc] bg-white p-4 shadow-sm">
                <p className="text-sm font-semibold">Recent orders</p>
                <p className="mt-0.5 text-[11px] text-[#858980]">
                  Add a past order back to the bag.
                </p>
                <div className="mt-3 space-y-2">
                  {recentOrders.map((order) => {
                    const product = findProduct(order.productId);
                    if (!product) return null;

                    return (
                      <div
                        key={order.productId}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#eeece6] px-3 py-2"
                      >
                        <p className="text-xs text-[#555b55]">
                          {product.name} × {order.quantity}
                          <span className="text-[#9a9d94]">
                            {" "}
                            · {formatUsd(product.price * order.quantity)}
                          </span>
                        </p>
                        <button
                          type="button"
                          onClick={() => addLine(product.id, order.quantity)}
                          className="rounded-lg border border-[#e0e9df] bg-[#f7faf5] px-2.5 py-1.5 text-[11px] font-medium text-[#456451] hover:bg-[#eef4ec]"
                        >
                          Add again
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          <aside className="space-y-4 lg:sticky lg:top-6">
            <div className="rounded-2xl border border-[#e8e5dc] bg-white p-5 shadow-sm">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-semibold">Usuals bag</p>
                <p className="text-[11px] text-[#858980]">
                  {itemCount} {itemCount === 1 ? "item" : "items"}
                </p>
              </div>

              {basketLines.length === 0 ? (
                <p className="mt-3 rounded-xl border border-dashed border-[#e4e0d6] px-3 py-5 text-center text-xs leading-5 text-[#858980]">
                  Add a usual from any genre. They all go into one bill.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {basketLines.map((line) => (
                    <div
                      key={line.productId}
                      className="rounded-xl border border-[#eeece6] px-3 py-2"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-xs font-semibold">
                          {line.product.name}
                        </p>
                        <p className="text-xs font-semibold">
                          {formatUsd(line.product.price * line.quantity)}
                        </p>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              changeBasketQuantity(line.productId, -1)
                            }
                            disabled={line.quantity <= 1}
                            aria-label={`Fewer ${line.product.name}`}
                            className="grid h-6 w-6 place-items-center rounded-md border border-[#e4e2da] text-xs font-semibold text-[#666b64] hover:bg-[#f3f2ec] disabled:opacity-40"
                          >
                            −
                          </button>
                          <span className="min-w-6 text-center text-[11px] font-semibold">
                            {line.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              changeBasketQuantity(line.productId, 1)
                            }
                            disabled={line.quantity >= 9}
                            aria-label={`More ${line.product.name}`}
                            className="grid h-6 w-6 place-items-center rounded-md border border-[#e4e2da] text-xs font-semibold text-[#666b64] hover:bg-[#f3f2ec] disabled:opacity-40"
                          >
                            +
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeLine(line.productId)}
                          className="text-[10px] font-medium text-[#9a6b5b] hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 flex items-baseline justify-between border-t border-dashed border-[#e4e0d6] pt-3">
                <p className="text-xs font-medium text-[#555b55]">Total</p>
                <p className="text-lg font-bold">{formatUsd(basketTotal)}</p>
              </div>

              <button
                type="button"
                onClick={() => void makeBill()}
                disabled={!ready || basketLines.length === 0 || isCheckingOut}
                className="mt-3 w-full rounded-lg bg-[#315e51] px-4 py-3 text-sm font-semibold text-white hover:bg-[#24483f] disabled:opacity-60"
              >
                {isCheckingOut ? "Making the bill…" : "Make the bill"}
              </button>
              <p className="mt-2 text-center text-[10px] leading-4 text-[#999c94]">
                One bill, one PayPal order. Prices are confirmed on the server.
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-xl border border-[#e6cfc7] bg-[#fbf1ee] px-4 py-3 text-xs leading-5 text-[#8a4c36]"
              >
                {error}
              </div>
            )}

            {bill && (
              <div className="rounded-2xl border border-[#cfe0d3] bg-white p-5 shadow-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7f9186]">
                    Bill
                  </p>
                  <p className="text-[11px] text-[#858980]">
                    {bill.itemCount} {bill.itemCount === 1 ? "item" : "items"}
                  </p>
                </div>

                <div className="mt-3 space-y-2">
                  {bill.items.map((item) => (
                    <div
                      key={item.productId}
                      className="flex items-baseline justify-between gap-3 text-xs"
                    >
                      <p className="text-[#555b55]">
                        {item.name} × {item.quantity}
                        <span className="text-[#9a9d94]">
                          {" "}
                          · {item.categoryName}
                        </span>
                      </p>
                      <p className="font-medium">{item.lineTotal}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex items-baseline justify-between border-t border-dashed border-[#dde5da] pt-3">
                  <p className="text-xs font-medium text-[#555b55]">Total</p>
                  <p className="text-lg font-bold">{bill.total}</p>
                </div>

                {link && (
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 flex items-center justify-center rounded-lg bg-[#ffc439] px-3 py-2.5 text-sm font-bold text-[#003087] transition hover:bg-[#f5ba2e]"
                  >
                    {link.label}
                  </a>
                )}

                {warning && (
                  <p className="mt-3 rounded-lg border border-[#eadfbe] bg-[#fbf7e9] px-3 py-2 text-[11px] leading-5 text-[#7a6636]">
                    {warning}
                  </p>
                )}

                <p className="mt-3 text-center text-[10px] leading-4 text-[#999c94]">
                  {consent === "granted"
                    ? "These items are now saved as their genres' usuals."
                    : "Memory is off, so this order is not saved as a usual."}
                </p>
              </div>
            )}
          </aside>
        </div>

        <footer className="py-8 text-center text-[11px] leading-5 text-[#999c94]">
          {ready
            ? consent === "granted"
              ? "Memory is on for this device. You approve every payment in PayPal."
              : consent === "denied"
                ? "Memory is off — nothing is saved. You approve every payment in PayPal."
                : "Nothing is saved until you allow memory. You approve every payment in PayPal."
            : "Loading your saved usuals…"}
        </footer>
      </div>
    </main>
  );
}
