"use client";

import { useEffect, useRef, useState } from "react";
import { SiteNav } from "@/components/site-nav";
import { usePourMemory } from "@/lib/pour-memory";
import { useVoiceInput } from "@/lib/use-voice-input";
import { categories, findProduct } from "@/lib/products";

type CheckoutLink = {
  url: string;
  label: string;
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

type Message = {
  id: number;
  role: "assistant" | "user";
  text: string;
  link?: CheckoutLink;
  proposal?: Proposal;
  bill?: Proposal;
};

const suggestions = [
  "Order my usual coffee beans",
  "Order my last order again",
  "Add a gallon of milk",
  "Get me a USB-C cable",
  "What do you sell?",
];

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 0,
      role: "assistant",
      text: "Hi! Tell me what you’d like to order — or ask for your usual. I’ll show you the exact item first, then make the bill and put a PayPal button right here once you confirm.",
    },
  ]);
  const [input, setInput] = useState("");
  const {
    consent,
    ready,
    usuals,
    orders,
    lastCategory,
    grantConsent: grantMemory,
    denyConsent: denyMemory,
    saveUsual,
    saveOrder,
  } = usePourMemory();
  const [pending, setPending] = useState<{
    id: number;
    proposal: Proposal;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const noticeShown = useRef(false);
  const nextId = useRef(1);
  const {
    supported: voiceSupported,
    listening: voiceListening,
    interim: voiceInterim,
    error: voiceError,
    toggle: toggleVoice,
  } = useVoiceInput((text) => {
    setInput((current) => (current.trim() ? `${current.trim()} ${text}` : text));
    requestAnimationFrame(() => inputRef.current?.focus());
  });

  function addMessage(message: Omit<Message, "id">): number {
    const id = nextId.current;
    nextId.current += 1;
    setMessages((current) => [...current, { ...message, id }]);
    return id;
  }

  function grantConsent() {
    grantMemory();
    addMessage({
      role: "assistant",
      text: "Memory on. I’ll remember your favourites and recent orders on this device, and only use them to suggest what you ask for.",
    });
  }

  function denyConsent() {
    denyMemory();
    addMessage({
      role: "assistant",
      text: "No problem — memory is off. I can still take an order from the catalog; I just won’t save anything.",
    });
  }

  useEffect(() => {
    if (noticeShown.current) return;
    noticeShown.current = true;

    const status = new URLSearchParams(window.location.search).get("paypal");
    if (!status) return;

    const notice =
      status === "paid"
        ? "Payment received — thank you! Your order is on its way."
        : status === "cancelled"
          ? "PayPal checkout was cancelled. Just ask again whenever you’re ready."
          : "PayPal could not complete that payment. Please try again.";

    setMessages((current) => [
      ...current,
      { id: nextId.current++, role: "assistant", text: notice },
    ]);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isLoading]);

  async function createBill(proposal: Proposal) {
    setPending(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: proposal.productId,
          quantity: proposal.quantity,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Could not create the bill.");
      }

      const bill = data.bill as Proposal | undefined;
      if (!bill) throw new Error("The bill came back empty.");

      addMessage({
        role: "assistant",
        text: `Bill ready — ${bill.name} × ${bill.quantity}, ${bill.total}. Tap the PayPal button for the final step.`,
        bill,
        link: data.link,
      });

      const memory = data.memory as
        | { category?: unknown; productId?: unknown }
        | undefined;

      if (
        memory &&
        typeof memory.category === "string" &&
        typeof memory.productId === "string"
      ) {
        saveUsual(memory.category, memory.productId);
        saveOrder(bill.productId, bill.quantity);
      }

      if (typeof data.warning === "string" && data.warning) {
        addMessage({ role: "assistant", text: data.warning });
      }
    } catch (error) {
      addMessage({
        role: "assistant",
        text:
          error instanceof Error
            ? error.message
            : "Could not create the bill. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function sendMessage(text: string) {
    const cleanText = text.trim();
    if (!cleanText || isLoading) return;

    const affirmative =
      /^(yes|yeah|yep|yup|sure|ok|okay|go ahead|do it|make (the )?bill|confirm|pay|set it up)\b/i.test(
        cleanText,
      );
    const negative =
      /^(no|nope|not now|choose something else|something else|different|cancel)\b/i.test(
        cleanText,
      );

    if (pending) {
      if (affirmative) {
        const proposal = pending.proposal;
        addMessage({ role: "user", text: cleanText });
        setInput("");
        await createBill(proposal);
        return;
      }

      if (negative) {
        setPending(null);
        addMessage({ role: "user", text: cleanText });
        addMessage({
          role: "assistant",
          text: "No problem — tell me a different item, or ask what we carry.",
        });
        setInput("");
        return;
      }
    }

    const history = messages.map((message) => ({
      role: message.role,
      text: message.text,
    }));

    setPending(null);
    addMessage({ role: "user", text: cleanText });
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: cleanText,
          history,
          usuals: consent === "granted" ? usuals : {},
          lastCategory,
          orders: consent === "granted" ? orders : [],
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ?? `The assistant failed (${response.status}).`,
        );
      }

      if (data.intent === "propose" && data.proposal) {
        const proposal = data.proposal as Proposal;
        const id = nextId.current;
        nextId.current += 1;

        setMessages((current) => [
          ...current,
          {
            id,
            role: "assistant",
            text:
              data.reply ||
              `Did you mean ${proposal.name} × ${proposal.quantity} for ${proposal.total}?`,
            proposal,
          },
        ]);
        setPending({ id, proposal });
      } else {
        addMessage({
          role: "assistant",
          text: data.reply || "I didn’t catch that. Could you say it another way?",
        });
      }
    } catch (error) {
      addMessage({
        role: "assistant",
        text:
          error instanceof Error
            ? error.message
            : "Something went wrong. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f4ee] px-4 py-6 text-[#252a27] sm:px-8">
      <div className="mx-auto max-w-3xl">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8e5dc] pb-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-xl font-bold tracking-tight">
              daily pour<span className="text-[#bc8255]">.</span>
            </div>
            <SiteNav />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {ready && consent === "granted" &&
              categories.map((category) => {
                const product = findProduct(usuals[category.id] ?? "");
                if (!product) return null;
                return (
                  <span
                    key={category.id}
                    className="rounded-full border border-[#e4e0d6] bg-white px-2.5 py-1 text-[11px] text-[#777b74]"
                  >
                    <span className="text-[#9a9d94]">{category.name}:</span>{" "}
                    {product.name}
                  </span>
                );
              })}
            {ready && consent === "denied" && (
              <button
                type="button"
                onClick={grantConsent}
                className="rounded-full border border-[#e4e0d6] bg-white px-2.5 py-1 text-[11px] text-[#777b74] hover:bg-[#f7f6f1]"
              >
                Memory off · Turn on
              </button>
            )}
          </div>
        </header>

        <section className="py-9">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#85877d]">
            Conversational checkout
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
            Any item.{" "}
            <span className="font-serif italic text-[#315e51]">
              One chat.
            </span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#747970]">
            Order coffee, tea, pastries, groceries, electronics or household
            supplies by name — or ask for your usual. Pour suggests the exact
            item, makes the bill once you confirm, and puts a PayPal button in
            the conversation.
          </p>
        </section>

        <section className="overflow-hidden rounded-2xl border border-[#e8e5dc] bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-[#eeece6] px-5 py-4">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#315e51] font-bold text-white">
              P
            </div>
            <div>
              <p className="text-sm font-semibold">Pour</p>
              <p className="text-xs text-[#858980]">Your personal shopper</p>
            </div>
            <span className="ml-auto rounded-full bg-[#f1f6ef] px-2.5 py-1 text-[11px] font-medium text-[#45634b]">
              PayPal checkout
            </span>
          </div>

          {ready && consent === "unknown" && (
            <div className="border-b border-[#eeece6] bg-[#fbfaf4] px-5 py-4">
              <p className="text-sm font-semibold">
                Let Pour remember you?
              </p>
              <p className="mt-1 max-w-xl text-xs leading-5 text-[#747970]">
                Save your favourites and recent orders on this device so Pour
                can suggest your usual next time. Nothing is stored until you
                allow it.
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

          <div
            className="max-h-[60vh] min-h-[28rem] space-y-4 overflow-y-auto p-5"
            aria-live="polite"
            aria-busy={isLoading}
          >
            {messages.map((message) => {
              const proposal = message.proposal;
              const bill = message.bill;

              return (
                <div
                  key={message.id}
                  className={`flex ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                      message.role === "user"
                        ? "rounded-br-sm bg-[#315e51] text-white"
                        : "rounded-bl-sm bg-[#f3f2ec] text-[#424842]"
                    }`}
                  >
                    {message.text}

                    {proposal && (
                      <div className="mt-3 rounded-xl border border-[#e4e0d6] bg-white p-3 text-[#252a27]">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="text-sm font-semibold">
                            {proposal.name}
                          </p>
                          <p className="text-sm font-semibold">
                            {proposal.total}
                          </p>
                        </div>
                        <p className="mt-0.5 text-xs text-[#858980]">
                          {proposal.description} · {proposal.notes}
                        </p>
                        <p className="mt-1 text-xs text-[#858980]">
                          {proposal.categoryName} · {proposal.quantity} ×{" "}
                          {proposal.unitPrice}
                        </p>

                        {pending?.id === message.id && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                addMessage({
                                  role: "user",
                                  text: "Yes, make the bill",
                                });
                                void createBill(proposal);
                              }}
                              className="rounded-lg bg-[#315e51] px-3 py-2 text-xs font-semibold text-white hover:bg-[#24483f]"
                            >
                              Yes, make the bill
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setPending(null);
                                addMessage({
                                  role: "user",
                                  text: "Choose something else",
                                });
                                addMessage({
                                  role: "assistant",
                                  text: "No problem — tell me a different item, or ask what we carry.",
                                });
                              }}
                              className="rounded-lg border border-[#e0ddd2] bg-white px-3 py-2 text-xs font-medium text-[#666b64] hover:bg-[#f7f6f1]"
                            >
                              Choose something else
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {bill && (
                      <div className="mt-3 rounded-xl border border-[#cfe0d3] bg-white p-3 text-[#252a27]">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7f9186]">
                          Bill
                        </p>
                        <div className="mt-2 flex items-baseline justify-between gap-3">
                          <p className="text-sm font-semibold">
                            {bill.name} × {bill.quantity}
                          </p>
                          <p className="text-xs text-[#777b74]">
                            {bill.unitPrice} each
                          </p>
                        </div>
                        <div className="mt-2 flex items-baseline justify-between border-t border-dashed border-[#dde5da] pt-2">
                          <p className="text-xs font-medium text-[#555b55]">
                            Total
                          </p>
                          <p className="text-base font-bold">{bill.total}</p>
                        </div>
                      </div>
                    )}

                    {message.link && (
                      <a
                        href={message.link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 flex items-center justify-center rounded-lg bg-[#ffc439] px-3 py-2.5 text-sm font-bold text-[#003087] transition hover:bg-[#f5ba2e]"
                      >
                        {message.link.label}
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
            {isLoading && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm bg-[#f3f2ec] px-4 py-3 text-sm text-[#687169]">
                  Pour is thinking…
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t border-[#eeece6] p-4">
            <div className="mb-3 flex flex-wrap gap-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  disabled={isLoading || !ready}
                  onClick={() => sendMessage(suggestion)}
                  className="rounded-lg border border-[#e0e9df] bg-[#f7faf5] px-3 py-2 text-left text-xs font-medium text-[#456451] hover:bg-[#eef4ec] disabled:opacity-60"
                >
                  {suggestion}
                </button>
              ))}
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                sendMessage(input);
              }}
              className="flex items-center gap-2"
            >
              <button
                type="button"
                onClick={toggleVoice}
                disabled={isLoading || !ready || voiceSupported !== true}
                aria-label={
                  voiceListening ? "Stop voice input" : "Start voice input"
                }
                aria-pressed={voiceListening}
                title={
                  voiceSupported === false
                    ? "Voice input isn’t supported in this browser. Try Chrome or Edge."
                    : voiceListening
                      ? "Stop listening"
                      : "Speak your order"
                }
                className={`grid h-[46px] w-[46px] shrink-0 place-items-center rounded-lg border transition ${
                  voiceListening
                    ? "border-[#e6b7a8] bg-[#fdf0eb] text-[#b4553f]"
                    : "border-[#e4e2da] bg-white text-[#587064] hover:bg-[#f7f8f4]"
                } disabled:cursor-not-allowed disabled:opacity-45`}
              >
                {voiceListening ? (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    className="h-5 w-5"
                    aria-hidden="true"
                  >
                    <rect x="8" y="3" width="8" height="11" rx="4" />
                    <path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" />
                  </svg>
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    className="h-5 w-5"
                    aria-hidden="true"
                  >
                    <rect x="9" y="3" width="6" height="11" rx="3" />
                    <path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" />
                  </svg>
                )}
              </button>
              <input
                ref={inputRef}
                value={input}
                disabled={isLoading || !ready}
                onChange={(event) => setInput(event.target.value)}
                placeholder={
                  voiceListening
                    ? voiceInterim || "Listening…"
                    : "Message Pour…"
                }
                className="min-w-0 flex-1 rounded-lg border border-[#e4e2da] px-4 py-3 text-sm outline-none focus:border-[#78947e]"
              />
              <button
                type="submit"
                disabled={isLoading || !ready}
                className="rounded-lg bg-[#315e51] px-4 py-3 text-sm font-semibold text-white hover:bg-[#24483f] disabled:opacity-60"
              >
                {isLoading ? "Thinking…" : "Send"}
              </button>
            </form>
            {(voiceListening || voiceInterim || voiceError) && (
              <p
                aria-live="polite"
                className={`mt-2 rounded-lg px-3 py-2 text-xs leading-5 ${
                  voiceError
                    ? "bg-[#fdf2ef] text-[#a4492f]"
                    : "bg-[#f1f6ef] text-[#45634b]"
                }`}
              >
                {voiceError ??
                  (voiceInterim
                    ? `“${voiceInterim}”`
                    : "Listening — speak now. Your words fill the box so you can review before sending.")}
              </p>
            )}
            {voiceSupported === false && (
              <p className="mt-2 text-xs leading-5 text-[#999c94]">
                Voice ordering needs Chrome or Edge with microphone access.
              </p>
            )}
            <p className="mt-3 text-center text-xs text-[#999c94]">
              {!ready
                ? "Loading your saved preferences…"
                : consent === "granted"
                  ? "Memory is on for this device. You approve every payment in PayPal."
                  : consent === "denied"
                    ? "Memory is off — nothing is saved. You approve every payment in PayPal."
                    : "Nothing is saved until you allow memory. You approve every payment in PayPal."}
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
