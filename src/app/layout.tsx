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
    "GrokBok is your team of always-on agents. They have their own computer, work inside tools and apps like you do, and keep working 24/7.",
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
