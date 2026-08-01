import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HookFlow Console",
  description: "Liquidity intelligence and confidential flow protection for Uniswap v4 on Ethereum Sepolia."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
