import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Daily Pour — Usuals",
  description:
    "Reorder your saved usuals across every genre in one bill and pay with PayPal.",
};

export default function UsualsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
