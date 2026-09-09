/** Root document shell owns shared metadata and the fixed dark presentation for every route. */

import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Model Atlas",
  description: "Independent model rankings for Intelligence, Agentic capability, Speed, and Value.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" data-model-atlas-theme="dark">
      <body>{children}</body>
    </html>
  );
}
