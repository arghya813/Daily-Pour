import {
  categories,
  defaultUsuals,
  findCategory,
  findMentionedCategory,
  findMentionedProduct,
  findProduct,
  formatUsd,
  products,
  type Product,
} from "@/lib/products";

type HistoryItem = {
  role: "user" | "assistant";
  text: string;
};

type StoredOrder = {
  productId: string;
  quantity: number;
};

type ModelResult = {
  reply: string;
  intent: "chat" | "checkout";
  productId?: string;
  quantity?: number;
};

type Proposal = {
  productId: string;
  name: string;
  category: string;
  categoryName: string;
  quantity: number;
  unitPrice: string;
  total: string;
  description: string;
  notes: string;
};

type GeminiOutcome = {
  result: ModelResult | null;
  status: number;
  error: string;
};

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const GEMINI_TIMEOUT_MS = 30_000;
const MAX_HISTORY = 12;

const responseSchema = {
  type: "object",
  properties: {
    reply: { type: "string" },
    intent: { type: "string", enum: ["chat", "checkout"] },
    productId: {
      type: "string",
      enum: products.map((product) => product.id),
    },
    quantity: { type: "integer", minimum: 1, maximum: 9 },
  },
  required: ["reply", "intent"],
};

const QUANTITY_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
};

function normalizeHistory(value: unknown): HistoryItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (item): item is HistoryItem =>
        typeof item === "object" &&
        item !== null &&
        (item as HistoryItem).role !== undefined &&
        ((item as HistoryItem).role === "user" ||
          (item as HistoryItem).role === "assistant") &&
        typeof (item as HistoryItem).text === "string",
    )
    .map((item) => ({
      role: item.role,
      text: item.text.slice(0, 1000),
    }))
    .slice(-MAX_HISTORY);
}

function normalizeUsuals(value: unknown): Record<string, string> {
  const usuals: Record<string, string> = { ...defaultUsuals };

  if (typeof value !== "object" || value === null) return usuals;

  for (const [categoryId, productId] of Object.entries(value)) {
    if (typeof productId !== "string") continue;
    const product = findProduct(productId);
    if (product && product.category === categoryId) {
      usuals[categoryId] = productId;
    }
  }

  return usuals;
}

function normalizeOrders(value: unknown): StoredOrder[] {
  if (!Array.isArray(value)) return [];

  return value
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
    }))
    .slice(-20);
}

function buildProposal(product: Product, quantity: number): Proposal {
  return {
    productId: product.id,
    name: product.name,
    category: product.category,
    categoryName: findCategory(product.category)?.name ?? product.category,
    quantity,
    unitPrice: formatUsd(product.price),
    total: formatUsd(product.price * quantity),
    description: product.description,
    notes: product.notes,
  };
}

function parseModelJson(text: string): ModelResult | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;

  try {
    const parsed = JSON.parse(
      cleaned.slice(start, end + 1),
    ) as Partial<ModelResult>;

    if (typeof parsed.reply !== "string" || !parsed.reply.trim()) return null;
    if (parsed.intent !== "chat" && parsed.intent !== "checkout") return null;

    return {
      reply: parsed.reply.trim(),
      intent: parsed.intent,
      productId:
        typeof parsed.productId === "string" ? parsed.productId : undefined,
      quantity:
        typeof parsed.quantity === "number" ? parsed.quantity : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Small deterministic parser used when Gemini is unavailable (for example a
 * quota or network error). It only acts on clear ordering language, so it can
 * never turn a question into an order.
 */
function parseFallback(
  message: string,
  usuals: Record<string, string>,
  lastCategory: string,
  orders: StoredOrder[],
): ModelResult | null {
  const text = message.toLowerCase();

  const explicitVerb =
    /\b(order|buy|add|get|grab|send|want|checkout|purchase)\b|\bi'?ll (take|have)\b|\bgive me\b/.test(
      text,
    );
  const question = /\b(what|which|how|do you|can you|tell me)\b/.test(text);
  const saysUsual = /\b(my|the) usual\b/.test(text);

  const lastOrder = orders[orders.length - 1];
  const lastOrderProduct = lastOrder
    ? findProduct(lastOrder.productId)
    : undefined;

  const asksLastOrder =
    lastOrderProduct !== undefined &&
    (/\bwhat did i\b[^?]*\b(buy|order|get)\b/.test(text) ||
      /\b(what|which)\b[^?]*\b(last|previous)\b[^?]*\b(order|buy|bought|get|got)\b/.test(
        text,
      ));
  if (asksLastOrder) {
    return {
      reply: `Your last order was ${lastOrderProduct.name} × ${lastOrder.quantity} (${formatUsd(
        lastOrderProduct.price * lastOrder.quantity,
      )}). Want me to set that up again?`,
      intent: "checkout",
      productId: lastOrderProduct.id,
      quantity: lastOrder.quantity,
    };
  }

  const saysLastOrder =
    /\b(last order|previous order|last time|same (thing|one)|that again)\b/.test(
      text,
    );

  if (saysLastOrder && !lastOrderProduct) {
    return {
      reply:
        "You don’t have a previous order saved yet. Tell me what you’d like — I’ll remember it after this order.",
      intent: "chat",
    };
  }

  const asksUsual = /\b(what|which)\b[^?]*\busual/.test(text);
  if (asksUsual) {
    const saved = categories
      .filter((item) => usuals[item.id])
      .map((item) => {
        const product = findProduct(usuals[item.id]);
        return `${item.name}: ${product?.name ?? "none yet"}`;
      })
      .join(", ");

    return {
      reply: saved
        ? `Your saved usuals are ${saved}.`
        : "You don’t have any saved usuals yet — order something and I’ll remember it.",
      intent: "chat",
    };
  }

  const asksCatalog =
    /\b(what|which)\b[^?]*\b(sell|have|menu|catalog|new)\b/.test(text);
  if (asksCatalog) {
    const shelves = categories
      .map(
        (item) =>
          `${item.name} (${products.filter((product) => product.category === item.id).length})`,
      )
      .join(", ");

    return {
      reply: `We carry ${shelves}. Ask for any item by name — coffee, tea, pastries, groceries, electronics or household supplies — and I’ll set up the order.`,
      intent: "chat",
    };
  }

  const asksAvailability =
    !saysUsual &&
    /\b(do you|can you)\b[^?]*\b(sell|have|carry|stock)\b/.test(text);
  if (asksAvailability) {
    const product = findMentionedProduct(text);

    if (product) {
      return {
        reply: `Yes — ${product.name} is ${formatUsd(
          product.price,
        )}. Want me to make the bill?`,
        intent: "checkout",
        productId: product.id,
        quantity: 1,
      };
    }

    return {
      reply:
        "We don’t carry that right now. We stock coffee, tea, pastries, groceries, electronics and household supplies — ask for any item by name.",
      intent: "chat",
    };
  }

  if (!explicitVerb && !(saysUsual && !question)) return null;

  const category = findMentionedCategory(text);
  let product = findMentionedProduct(text);
  let quantityOverride: number | undefined;

  if (!product && saysLastOrder && lastOrderProduct) {
    product = lastOrderProduct;
    quantityOverride = lastOrder.quantity;
  }

  if (!product && saysUsual) {
    const categoryId = category?.id ?? lastCategory;
    const savedCategory = findCategory(categoryId);
    const usualId = usuals[categoryId];
    product = usualId ? findProduct(usualId) : undefined;

    if (!product) {
      const options = products
        .filter((item) => item.category === categoryId)
        .map((item) => `${item.name} (${formatUsd(item.price)})`)
        .join(", ");

      return {
        reply: `You don’t have a saved ${(savedCategory?.name ?? categoryId).toLowerCase()} usual yet. We have ${options}. Which one would you like?`,
        intent: "chat",
      };
    }
  }

  if (!product && category) {
    const usualId = usuals[category.id];
    product = usualId ? findProduct(usualId) : undefined;

    if (!product) {
      const options = products
        .filter((item) => item.category === category.id)
        .map((item) => `${item.name} (${formatUsd(item.price)})`)
        .join(", ");

      return {
        reply: `Which ${category.name.toLowerCase()} item would you like? We have ${options}.`,
        intent: "chat",
      };
    }
  }

  if (!product) {
    return {
      reply:
        "I couldn’t find that item in our catalog. We carry coffee, tea, pastries, groceries, electronics and household supplies — tell me the exact item name and I’ll set up the order.",
      intent: "chat",
    };
  }

  const explicitNumber = text.match(/\b([1-9])\b/);
  const numberWord = text.match(
    /\b(one|two|three|four|five|six|seven|eight|nine)\b/,
  );
  const quantity =
    quantityOverride ??
    (explicitNumber
      ? Number(explicitNumber[1])
      : numberWord
        ? QUANTITY_WORDS[numberWord[1]] ?? 1
        : 1);

  return {
    reply: `Did you mean ${product.name} × ${quantity} for ${formatUsd(
      product.price * quantity,
    )}? Confirm and I’ll make the bill.`,
    intent: "checkout",
    productId: product.id,
    quantity,
  };
}

async function callGemini(prompt: string, apiKey: string): Promise<GeminiOutcome> {
  try {
    const response = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema,
          temperature: 0.6,
        },
      }),
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        result: null,
        status: response.status,
        error:
          data?.error?.message ??
          `Gemini request failed (${response.status}).`,
      };
    }

    const text = (data?.candidates?.[0]?.content?.parts ?? [])
      .map((part: { text?: string }) => part.text ?? "")
      .join("")
      .trim();

    return {
      result: parseModelJson(text),
      status: 502,
      error: "Gemini returned an unexpected response. Please try again.",
    };
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return {
        result: null,
        status: 504,
        error: "Gemini took too long to respond. Please try again.",
      };
    }

    return {
      result: null,
      status: 502,
      error: "Could not reach Gemini. Please try again.",
    };
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    message?: unknown;
    history?: unknown;
    usuals?: unknown;
    lastCategory?: unknown;
    orders?: unknown;
  } | null;

  const message =
    typeof body?.message === "string" ? body.message.trim() : "";

  if (!message) {
    return Response.json({ error: "Please enter a message." }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return Response.json(
      { error: "GEMINI_API_KEY is missing from .env.local." },
      { status: 500 },
    );
  }

  const usuals = normalizeUsuals(body?.usuals);
  const orders = normalizeOrders(body?.orders);
  const lastOrder = orders[orders.length - 1];
  const lastOrderProduct = lastOrder
    ? findProduct(lastOrder.productId)
    : undefined;
  const lastCategory =
    typeof body?.lastCategory === "string" &&
    findCategory(body.lastCategory) &&
    usuals[body.lastCategory]
      ? body.lastCategory
      : Object.keys(usuals)[0] ?? "coffee";

  const catalog = categories
    .map((category) => {
      const items = products
        .filter((product) => product.category === category.id)
        .map(
          (product) =>
            `  - ${product.name} (id: ${product.id}): ${product.description}, ${formatUsd(product.price)} — ${product.notes}`,
        )
        .join("\n");
      return `${category.name} (genre id: ${category.id}):\n${items}`;
    })
    .join("\n\n");

  const usualLines = categories
    .filter((category) => usuals[category.id])
    .map((category) => {
      const product = findProduct(usuals[category.id]);
      return `- ${category.name} (genre id: ${category.id}): ${
        product ? `${product.name} (id: ${product.id})` : "none yet"
      }`;
    })
    .join("\n");

  const history = normalizeHistory(body?.history);
  const transcript = history
    .map(
      (item) => `${item.role === "user" ? "Customer" : "Pour"}: ${item.text}`,
    )
    .join("\n");

  const prompt = `
You are Pour, the shopping assistant for Daily Pour, an online store with several genres: coffee, tea, pastry, grocery, electronics and household. You are the whole checkout experience: there is no separate order form.

Catalog, grouped by genre:
${catalog}

The customer's saved usuals (one per genre):
${usualLines}
Most recently ordered genre: ${lastCategory}
Most recent order: ${
    lastOrderProduct && lastOrder
      ? `${lastOrderProduct.name} × ${lastOrder.quantity}`
      : "none yet"
  }

When the customer says "my last order", "the thing I got last time", "same as before" or "order that again", use the most recent order.

Conversation so far:
${transcript || "(no earlier messages)"}

Customer: ${message}

Decide the customer's intent:
- "checkout": they want to order something now — e.g. "order my usual coffee beans", "my usual tea", "I'll take the Colombia", "add two croissants", "get me a USB-C cable", "add a gallon of milk", "yes please", or they are changing the item/quantity.
- "chat": everything else — questions, browsing, recommendations, small talk.

When intent is checkout:
- productId must be one of the catalog ids above. Any catalog item from any genre can be ordered, even if the customer has never ordered it before.
- If they refer to "my usual" or "the usual" for a genre, use that genre's saved usual.
- If they say "my usual" without naming a genre, use the saved usual for the most recently ordered genre (${lastCategory}).
- If the genre has no saved usual yet, do not guess: ask which item from that genre they want.
- quantity is 1 unless they say otherwise, and must be between 1 and 9.
- reply with a short recommendation that includes the item name, quantity, and exact total, and asks them to confirm before the bill is made.
When intent is chat:
- Omit productId and quantity. Answer helpfully in 1-3 sentences.

Rules:
- Only recommend items from the catalog above. Never invent products or prices.
- If the customer asks for an item or genre the shop does not carry, say so and suggest the closest catalog option.
- Never say an order was placed or paid. The app shows a recommendation, then creates a bill and a PayPal approval link only after the customer confirms.
- Keep replies to 1-3 short sentences, warm and conversational.

Return only JSON that matches the schema.
`;

  const gemini = await callGemini(prompt, apiKey);
  const result =
    gemini.result ?? parseFallback(message, usuals, lastCategory, orders);

  if (!result) {
    const quotaExceeded = gemini.status === 429;
    return Response.json(
      {
        error: quotaExceeded
          ? "Gemini's free daily quota is used up (about 20 messages/day). It resets at midnight Pacific Time (~1:30 PM IST). Clear catalog orders still work in the meantime, or add billing to your Gemini key for a higher limit."
          : gemini.error,
      },
      { status: gemini.status },
    );
  }

  if (result.intent !== "checkout") {
    return Response.json({ reply: result.reply, intent: "chat" });
  }

  const product =
    findProduct(result.productId ?? "") ??
    findProduct(usuals[lastCategory] ?? "") ??
    lastOrderProduct;

  if (!product) {
    return Response.json({
      reply:
        "Happy to help — which item would you like? You can name anything from our catalog.",
      intent: "chat",
    });
  }

  const quantity = Math.min(
    9,
    Math.max(1, Math.floor(result.quantity ?? 1)),
  );

  // Only propose here. The bill and the PayPal order are created after the
  // customer confirms, from /api/checkout.
  return Response.json({
    reply: result.reply,
    intent: "propose",
    proposal: buildProposal(product, quantity),
  });
}
