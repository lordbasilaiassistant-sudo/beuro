import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GrokBok — AI teammates that finish the work",
  description:
    "Beuro is your team of AI agents. They search the live web, open real pages, and cite every source — so you can check the work instead of trusting it.",
  keywords: ["GrokBok", "AI teammates", "AI agents", "bots", "automation"],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "GrokBok — AI teammates that finish the work",
    description:
      "AI teammates you can give real work to. Bots sign in to your tools, use them just like you do, and come back with finished work.",
    siteName: "GrokBok",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-black text-zinc-100`}
      >
        {children}
        <SonnerToaster theme="dark" position="bottom-right" />
      </body>
    </html>
  );
}
