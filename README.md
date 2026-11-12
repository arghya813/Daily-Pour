# Daily Pour — Conversational AI Checkout Agent

A Next.js demo where the **entire order happens in chat**. You can order any item from the store — coffee, tea, pastries, groceries, electronics or household supplies — by name, or ask for "my usual". Pour suggests the exact item first, remembers a favourite **per genre** (only after you allow it), and creates the bill plus a real PayPal checkout link once you confirm.

There is also a separate **Usuals** page (`/usuals`): one card per genre, a combined bag, one bill and one PayPal checkout. The chat is the conversational checkout; Usuals is the fast reorder shelf.

## How it works

1. Your message + recent conversation + the saved usuals and recent orders go to `/api/chat`.
2. Gemini returns structured JSON: `intent` (`chat` or `checkout`), `productId`, and `quantity`.
3. On `checkout`, the server recalculates the price from `lib/products.ts` and returns a **proposal** — no PayPal order is created yet.
4. The chat shows the recommendation with **Yes, make the bill** and **Choose something else**.
5. Only after you confirm does the browser call `/api/checkout`, which creates the PayPal order and returns the bill + approval link. Both appear in the chat bubble.
6. If memory is on, the ordered item becomes that genre's usual and is added to your recent orders.
7. When PayPal redirects back to `/api/checkout/capture`, the payment is captured and the result appears in chat.

## Usuals page

1. `/usuals` shows one card per genre. The saved usual is preselected; the dropdown can pick any other item in that genre.
2. Set a quantity (1–9) and **Add to bag**. The bag holds items from several genres together.
3. **Make the bill** calls `/api/checkout/usuals`. The server recalculates every price, combines duplicate lines, and creates one PayPal order with all line items.
4. If memory is on, each billed item becomes its genre's new usual and is appended to recent orders. Without consent, the bill still works but nothing is saved.
5. PayPal returns to `/usuals`, where the payment result is shown.
6. Without PayPal credentials the bill still appears, with the clear setup warning instead of a fake link.

## Voice ordering

Tap the microphone in the chat composer and speak your order, for example “order my usual coffee beans”. The final transcript fills the composer so you can check it before pressing **Send** — voice never submits an order or a payment on its own. Interim words appear while you speak, and microphone or network problems show a short, actionable message.

- Voice uses the browser's Web Speech API. It works in Chrome and Edge (desktop and Android); unsupported browsers show a disabled mic and a Chrome/Edge hint.
- Microphone access must be allowed for the site. Voice only works in a secure context: `http://localhost` in development or an `https://` deployment.
- Nothing is recorded or stored by the app; the transcript is simply placed in the text box.
- You still confirm the recommendation and approve the payment in PayPal as usual.

## Catalog & memory

- `lib/products.ts` holds the catalog. Each product has a `category` (genre): `coffee`, `tea`, `pastry`, `grocery`, `electronics`, `household`.
- `defaultUsuals` starts empty: genres get a favourite only after you order from them. If you ask for a genre with no saved usual, the assistant lists that genre's items instead of guessing.
- **Memory is consent-first.** Nothing is written to `localStorage` until you click **Remember my preferences**. Choose **Not now** and the chat still works, but nothing is saved.
- With consent, memory lives in `localStorage` as `{ coffee: "ethiopia", grocery: "whole-milk", ... }` (`pour-usuals`), plus the most recently ordered genre (`pour-last-category`) and up to 20 recent orders (`pour-orders`).
- "my usual tea" uses the tea favourite; a bare "my usual" uses the most recently ordered genre. "Order my last order again" uses the newest entry in `pour-orders`.
- Any catalog item can be ordered even if it has never been ordered before. Matching handles plurals and distinctive words, so "banana" and "bananas" both find the right item without confusing "banana bread".
- To add a vertical or item, add a `Category` and `Product` entry in `lib/products.ts` — the Gemini schema, prompt, fallback parser, UI pills and prices all follow automatically.

| Piece | File |
| --- | --- |
| Chat UI (consent, recommendation, bill) | `app/page.tsx` |
| Usuals page (genre cards, bag, combined bill) | `app/usuals/page.tsx` |
| Chat / Usuals navigation | `components/site-nav.tsx` |
| Shared consent + device memory | `lib/pour-memory.ts` |
| Voice-to-text composer hook | `lib/use-voice-input.ts` |
| Gemini intent extraction + proposal | `app/api/chat/route.ts` |
| Confirmed single-item bill + PayPal order | `app/api/checkout/route.ts` |
| Confirmed multi-item usuals bill + PayPal order | `app/api/checkout/usuals/route.ts` |
| Product catalog + server-side prices | `lib/products.ts` |
| PayPal order creation helper | `lib/paypal.ts` |
| PayPal return/capture | `app/api/checkout/capture/route.ts` |

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Then fill in `.env.local`:

```bash
GEMINI_API_KEY=...          # required
GEMINI_MODEL=gemini-3.5-flash
PAYPAL_CLIENT_ID=...        # sandbox app credentials
PAYPAL_CLIENT_SECRET=...
PAYPAL_ENV=sandbox
```

Get PayPal **sandbox** credentials from the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/applications/sandbox). Use a sandbox personal account to test the payment.

If you don't want to use the Orders API, set `PAYPAL_ME_HANDLE` instead — the app falls back to a `paypal.me` link. Without either, the chat replies with a clear setup message instead of a fake link.

## Try these

- "Order my usual coffee beans" → Pour proposes your saved coffee; confirm to make the bill.
- "Get me my usual tea" → remembers the tea genre separately.
- "Add two almond croissants" → proposes pastry, then makes the bill for 2.
- "Add a gallon of milk" → proposes Whole Milk and saves it as the grocery usual after you confirm.
- "Get me a USB-C cable" → same flow for electronics; each genre keeps its own memory.
- "Order my last order again" → proposes your most recent order.
- "Add three bananas" → quantity-aware grocery proposal.
- "I'll take the Colombia Supremo" → proposes a coffee you have never ordered before.
- "What is my usual?" → lists your saved favourites without creating a bill.
- "What's the lightest roast?" → answers without creating a bill.
- "Do you sell headphones?" → says the shop doesn't carry it and suggests something close.
- Click **Choose something else** on a proposal → asks for a different item without creating a bill.
- Open **Usuals** in the header → pick one item per genre, add them to the bag, and make one combined bill.
- Tap the **mic** and say “add a gallon of milk” → the words appear in the composer; review them, then press Send.
- On **Usuals**, the saved favourite starts preselected; change the dropdown to order something new from that genre.
- Without memory, **Usuals** still lets you pick any item and check out; it just does not save the choice.

## Notes

- `GEMINI_MODEL` must be a model your key can access. List valid models with:
  `curl "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY"`
- Structured output uses the standard `generateContent` endpoint with a response schema, so order parsing is not regex-based.
- A deterministic fallback parser handles clear orders, last-order requests and catalog/usual questions when Gemini is rate-limited or unreachable. It only acts on explicit ordering language.
- Prices are always recalculated on the server; the browser cannot change the amount.
- A PayPal order is created only by `/api/checkout` (chat) or `/api/checkout/usuals` (Usuals), after the customer asks for the bill.
- An order is only captured when PayPal redirects back to `/api/checkout/capture`. The capture route returns to the page that started checkout.
- Saved usuals and recent orders are stored in `localStorage` only after the customer allows memory, and are updated per genre when a bill is created.
- This store sells its own catalog. It does not place orders on Amazon or Flipkart, since those marketplaces do not accept PayPal and require their own seller/affiliate APIs.

This is a demo. Prices and products are sample data. Nothing is marked paid until PayPal approves and captures the payment.
