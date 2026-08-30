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
  title: "Beuro — AI teammates that show their work",
  description:
    "Beuro is your team of AI agents. They search the live web, open real pages, and cite every source — so you can check the work instead of trusting it.",
  keywords: ["Beuro", "AI teammates", "AI agents", "open source", "automation"],
  icons: {
    // The scaffold shipped this pointing at https://z-cdn.chatglm.cn — a
    // third-party CDN from the sandbox this project was built in. It failed to
    // load, it is not our mark, and it made every visitor's browser call out
    // to someone else's infrastructure. Serve our own from /public instead.
    icon: "/logo.svg",
  },
  openGraph: {
    title: "Beuro — AI teammates that show their work",
    description:
      "AI teammates you can give real work to. They search the live web, open real pages, and cite every source — so you can check the work instead of trusting it.",
    siteName: "Beuro",
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
