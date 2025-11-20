import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nytelligence ROI - Marketing AI Workflow ROI Calculator",
  description: "Calculate ROI for marketing AI workflows with deterministic calculations and AI-powered benchmarks",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

