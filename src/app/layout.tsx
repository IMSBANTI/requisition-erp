import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IMS GROUP — Requisition Approval System",
  description: "Enterprise Requisition and Approval Workflow for IMS, CLAN, SCL, and TradePULSE",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen text-gray-900 bg-[#F8F9FA] antialiased">
        {children}
      </body>
    </html>
  );
}
