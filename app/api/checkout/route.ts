import { findCategory, findProduct, formatUsd } from "@/lib/products";
import { createPayPalCheckout } from "@/lib/paypal";

/**
 * Create the bill after the customer confirms a recommendation. This is the
 * only place where a PayPal order is created, so no checkout can happen from a
 * misheard proposal.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    productId?: unknown;
    quantity?: unknown;
  } | null;

  const productId =
    typeof body?.productId === "string" ? body.productId : "";
  const product = findProduct(productId);

  if (!product) {
    return Response.json(
      { error: "That item is not in the catalog." },
      { status: 400 },
    );
  }

  const requestedQuantity =
    typeof body?.quantity === "number" ? body.quantity : 1;
  const quantity = Math.min(9, Math.max(1, Math.floor(requestedQuantity)));
  const category = findCategory(product.category);
  const unitPrice = formatUsd(product.price);
  const total = formatUsd(product.price * quantity);

  const checkout = await createPayPalCheckout({
    product,
    quantity,
    origin: new URL(request.url).origin,
  });

  const memory = {
    category: product.category,
    productId: product.id,
    lastCategory: product.category,
  };

  const bill = {
    productId: product.id,
    name: product.name,
    category: product.category,
    categoryName: category?.name ?? product.category,
    quantity,
    unitPrice,
    total,
    description: product.description,
    notes: product.notes,
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
