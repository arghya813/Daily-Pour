import { type Product, formatUsd } from "@/lib/products";

const SANDBOX_BASE = "https://api-m.sandbox.paypal.com";
const LIVE_BASE = "https://api-m.paypal.com";

export type CheckoutOutcome =
  | {
      ok: true;
      approvalUrl: string;
      mode: "sandbox" | "live" | "paypal.me";
      total: string;
      orderId?: string;
    }
  | { ok: false; error: string };

export function paypalBaseUrl(): string {
  if (process.env.PAYPAL_API_BASE) return process.env.PAYPAL_API_BASE;
  return process.env.PAYPAL_ENV === "live" ? LIVE_BASE : SANDBOX_BASE;
}

export function paypalCredentials():
  | { clientId: string; clientSecret: string }
  | null {
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

function paypalMeLink(total: number): string | null {
  const handle = process.env.PAYPAL_ME_HANDLE?.trim().replace(/^@/, "");
  if (!handle) return null;
  return `https://www.paypal.com/paypalme/${encodeURIComponent(
    handle,
  )}/${total.toFixed(2)}USD`;
}

export async function getPayPalAccessToken(): Promise<string> {
  const credentials = paypalCredentials();

  if (!credentials) {
    throw new Error("PayPal credentials are not configured.");
  }

  const basic = Buffer.from(
    `${credentials.clientId}:${credentials.clientSecret}`,
  ).toString("base64");

  const response = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(20_000),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || typeof data?.access_token !== "string") {
    throw new Error(
      data?.error_description ?? "Could not authenticate with PayPal.",
    );
  }

  return data.access_token;
}

export function paypalErrorMessage(data: unknown, fallback: string): string {
  if (typeof data !== "object" || data === null) return fallback;

  const record = data as {
    message?: unknown;
    details?: Array<{ description?: unknown }>;
  };

  const detail = record.details?.[0]?.description;

  if (typeof detail === "string" && detail) return detail;
  if (typeof record.message === "string" && record.message) {
    return record.message;
  }
  return fallback;
}

export type PayPalOrderItem = {
  product: Product;
  quantity: number;
};

/** Keep PayPal redirects on this site: only a local absolute path is allowed. */
function safeReturnPath(returnTo: string): string {
  try {
    const path = new URL(returnTo, "http://daily-pour.local").pathname;
    return path.startsWith("/") && !path.startsWith("//") ? path : "/";
  } catch {
    return "/";
  }
}

function withStatus(path: string, status: string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}paypal=${status}`;
}

export async function createPayPalOrder({
  items,
  origin,
  returnTo = "/",
}: {
  items: PayPalOrderItem[];
  origin: string;
  returnTo?: string;
}): Promise<CheckoutOutcome> {
  const total = items.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0,
  );

  if (!paypalCredentials()) {
    const fallback = paypalMeLink(total);

    if (fallback) {
      return {
        ok: true,
        approvalUrl: fallback,
        mode: "paypal.me",
        total: formatUsd(total),
      };
    }

    return {
      ok: false,
      error:
        "PayPal is not configured yet. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET (sandbox) to .env.local, or set PAYPAL_ME_HANDLE for a simple payment link.",
    };
  }

  const destination = safeReturnPath(returnTo);
  const description = items
    .map((item) => `${item.product.name} × ${item.quantity}`)
    .join(", ");

  try {
    const accessToken = await getPayPalAccessToken();

    const response = await fetch(`${paypalBaseUrl()}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: items.map((item) => item.product.id).join("-"),
            description: description.slice(0, 127),
            amount: {
              currency_code: "USD",
              value: total.toFixed(2),
              breakdown: {
                item_total: {
                  currency_code: "USD",
                  value: total.toFixed(2),
                },
              },
            },
            items: items.map((item) => ({
              name: item.product.name.slice(0, 127),
              description: item.product.description.slice(0, 127),
              quantity: String(item.quantity),
              unit_amount: {
                currency_code: "USD",
                value: item.product.price.toFixed(2),
              },
              category: "PHYSICAL_GOODS",
            })),
          },
        ],
        application_context: {
          brand_name: "Daily Pour",
          user_action: "PAY_NOW",
          shipping_preference: "NO_SHIPPING",
          return_url: `${origin}/api/checkout/capture?returnTo=${encodeURIComponent(
            destination,
          )}`,
          cancel_url: `${origin}${withStatus(destination, "cancelled")}`,
        },
      }),
      signal: AbortSignal.timeout(20_000),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        ok: false,
        error: paypalErrorMessage(
          data,
          `PayPal could not create the order (${response.status}).`,
        ),
      };
    }

    const links: Array<{ rel?: string; href?: string }> = Array.isArray(
      data?.links,
    )
      ? data.links
      : [];

    const approvalUrl = links.find(
      (link) => link.rel === "approve" || link.rel === "payer-action",
    )?.href;

    if (!approvalUrl) {
      return { ok: false, error: "PayPal did not return a checkout link." };
    }

    return {
      ok: true,
      approvalUrl,
      mode: process.env.PAYPAL_ENV === "live" ? "live" : "sandbox",
      total: formatUsd(total),
      orderId: typeof data?.id === "string" ? data.id : undefined,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not reach PayPal. Please try again.",
    };
  }
}

export async function createPayPalCheckout({
  product,
  quantity,
  origin,
  returnTo,
}: {
  product: Product;
  quantity: number;
  origin: string;
  returnTo?: string;
}): Promise<CheckoutOutcome> {
  return createPayPalOrder({
    items: [{ product, quantity }],
    origin,
    returnTo,
  });
}
