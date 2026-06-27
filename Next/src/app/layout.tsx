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
  title: "DiceCam",
  description: "Random video chat — meet strangers face-to-face over WebRTC.",
  keywords: ["WebRTC", "video chat", "random chat", "DiceCam", "peer to peer"],
  authors: [{ name: "DiceCam" }],
  icons: {
    icon: [
      { url: "/dicecam-logo.svg", type: "image/svg+xml" },
      { url: "/dicecam-logo.png", type: "image/png", sizes: "512x512" },
    ],
    apple: "/dicecam-logo.png",
  },
  openGraph: {
    title: "DiceCam",
    description: "Random video chat — meet strangers face-to-face over WebRTC.",
    url: "https://chat.z.ai",
    siteName: "DiceCam",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "DiceCam",
    description: "Random video chat — meet strangers face-to-face over WebRTC.",
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
