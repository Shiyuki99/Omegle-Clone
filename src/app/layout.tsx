import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Roulette — Random Video Chat",
  description: "Meet strangers face-to-face over secure WebRTC. Anonymous, instant, peer-to-peer video chat.",
  keywords: ["WebRTC", "video chat", "random chat", "roulette", "peer to peer"],
  authors: [{ name: "Roulette" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "Roulette — Random Video Chat",
    description: "Meet strangers face-to-face over secure WebRTC.",
    url: "https://chat.z.ai",
    siteName: "Roulette",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Roulette — Random Video Chat",
    description: "Meet strangers face-to-face over secure WebRTC.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
