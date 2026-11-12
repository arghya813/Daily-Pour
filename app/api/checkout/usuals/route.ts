import { findCategory, findProduct, formatUsd } from "@/lib/products";
import { createPayPalOrder } from "@/lib/paypal";

type IncomingItem = {
  productId?: unknown;
  quantity?: unknown;
};

/**
 * Create one bill for several usuals at once. Every price is recalculated on
 * the server and a single PayPal order is created only after the customer asks
 * for the bill.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    items?: unknown;
  } | null;

  if (!Array.isArray(body?.items) || body.items.length === 0) {
    return Response.json(
      { error: "Add at least one item to the usuals bill." },
      { status: 400 },
    );
  }

  if (body.items.length > 30) {
    return Response.json(
      { error: "That is too many items for one usuals bill." },
      { status: 400 },
    );
  }

  const quantities = new Map<string, number>();

  for (const raw of body.items as IncomingItem[]) {
    const productId =
      typeof raw?.productId === "string" ? raw.productId : "";
    const product = findProduct(productId);

    if (!product) {
      return Response.json(
        { error: "One of those items is not in the catalog." },
        { status: 400 },
      );
    }

    const requested = typeof raw.quantity === "number" ? raw.quantity : 1;
    const quantity = Math.min(9, Math.max(1, Math.floor(requested)));
    const combined = (quantities.get(product.id) ?? 0) + quantity;
    quantities.set(product.id, Math.min(9, combined));
  }

  const items = [...quantities.entries()].flatMap(([productId, quantity]) => {
    const product = findProduct(productId);
    return product ? [{ product, quantity }] : [];
  });

  const total = items.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0,
  );

  const checkout = await createPayPalOrder({
    items,
    origin: new URL(request.url).origin,
    returnTo: "/usuals",
  });

  const bill = {
    items: items.map(({ product, quantity }) => ({
      productId: product.id,
      name: product.name,
      category: product.category,
      categoryName:
        findCategory(product.category)?.name ?? product.category,
      quantity,
      unitPrice: formatUsd(product.price),
      lineTotal: formatUsd(product.price * quantity),
      description: product.description,
      notes: product.notes,
    })),
    itemCount: items.reduce((count, item) => count + item.quantity, 0),
    total: formatUsd(total),
  };

  const memory = {
    lastCategory: items[items.length - 1]?.product.category,
    updates: items.map(({ product, quantity }) => ({
      category: product.category,
      productId: product.id,
      quantity,
    })),
  };

  if (!checkout.ok) {
    return Response.json({
      intent: "bill",
      bill,
      memory,
      warning: checkout.error,
    });
  }

  return Response.json({
    intent: "bill",
    bill,
    memory,
    link: {
      url: checkout.approvalUrl,
      label: `Pay ${checkout.total} with PayPal`,
    },
  });
}
