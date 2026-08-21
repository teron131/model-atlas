/** Root document shell owns shared metadata and theme bootstrapping for every route. */

import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ThemeBootstrap } from "./shared/ThemeBootstrap";

import "./globals.css";

export const metadata: Metadata = {
  title: "Model Atlas",
  description: "Independent model rankings for Intelligence, Agentic capability, Speed, and Value.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "64x64", type: "image/x-icon" },
      { url: "/icons/icon-128.png", sizes: "128x128", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* The saved theme must be applied before body paint on every route. */}
        <ThemeBootstrap />
      </head>
      <body>{children}</body>
    </html>
  );
}
