import { getPayPalAccessToken, paypalBaseUrl } from "@/lib/paypal";

/** Only redirect back to a local path, never another site. */
function safeReturnPath(value: string | null): string {
  if (!value) return "/";

  try {
    const path = new URL(value, "http://daily-pour.local").pathname;
    return path.startsWith("/") && !path.startsWith("//") ? path : "/";
  } catch {
    return "/";
  }
}

function redirectWithStatus(request: Request, returnTo: string, status: string) {
  const separator = returnTo.includes("?") ? "&" : "?";
  return Response.redirect(
    new URL(`${returnTo}${separator}paypal=${status}`, request.url),
    303,
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const orderId = url.searchParams.get("token");
  const returnTo = safeReturnPath(url.searchParams.get("returnTo"));

  if (!orderId) {
    return redirectWithStatus(request, returnTo, "error");
  }

  try {
    const accessToken = await getPayPalAccessToken();

    const response = await fetch(
      `${paypalBaseUrl()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(20_000),
      },
    );

    if (!response.ok) {
      return redirectWithStatus(request, returnTo, "error");
    }

    return redirectWithStatus(request, returnTo, "paid");
  } catch {
    return redirectWithStatus(request, returnTo, "error");
  }
}
