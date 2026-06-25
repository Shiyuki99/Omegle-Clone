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
  title: "estin-megel",
  description: "Random video chat — meet strangers face-to-face over WebRTC.",
  keywords: ["WebRTC", "video chat", "random chat", "estin-megel", "peer to peer"],
  authors: [{ name: "estin-megel" }],
  icons: {
    icon: [
      { url: "/estin-megel-logo.svg", type: "image/svg+xml" },
      { url: "/estin-megel-logo.png", type: "image/png", sizes: "512x512" },
    ],
    apple: "/estin-megel-logo.png",
  },
  openGraph: {
    title: "estin-megel",
    description: "Random video chat — meet strangers face-to-face over WebRTC.",
    url: "https://chat.z.ai",
    siteName: "estin-megel",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "estin-megel",
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
