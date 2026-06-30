import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"

import { Providers } from "@/providers"

import "./globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  metadataBase: new URL("https://wizz.subhranshu.com"),
  title: {
    default: "Wizz AI",
    template: "%s | Wizz AI",
  },
  description: "Manage your Wizz RAG chatbot — sources, logs, and configuration.",
  openGraph: {
    title: "Wizz AI",
    description: "Manage your Wizz RAG chatbot — sources, logs, and configuration.",
    url: "https://wizz.subhranshu.com",
    siteName: "Wizz AI",
    locale: "en_US",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
  twitter: {
    title: "Wizz AI",
    card: "summary",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}

    >
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
