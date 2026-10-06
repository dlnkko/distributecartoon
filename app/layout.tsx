import type { Metadata } from "next";
import { Fraunces, Outfit, Syne } from "next/font/google";
import Script from "next/script";
import { CANONICAL_ORIGIN } from "@/lib/site";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(CANONICAL_ORIGIN),
  title: "Clickframes",
  description: "Turn scripts into Pixar or claymation shorts.",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${outfit.variable} ${syne.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="h-full bg-[var(--bg)] text-[var(--ink)]">
        {children}
        <Script
          src="https://datafa.st/js/script.js"
          strategy="afterInteractive"
          data-website-id="dfid_NrT3UwgJ0tJJcoGUebtX0"
          data-domain="clickframes.app"
        />
      </body>
    </html>
  );
}
