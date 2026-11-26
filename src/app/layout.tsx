import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Toaster } from "react-hot-toast";

import { ThemeProvider, themeInitScript } from "@/components/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "MediCare ERP — Supply Chain & Inventory",
  description:
    "Internal pharmacy supply chain and inventory management for the central warehouse and branches: indents, FEFO picking, STVs, GRNs, expiry locks and stock analytics.",
  icons: { icon: "/images/medicare-logo.svg" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
        <ThemeProvider>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                borderRadius: "12px",
                background: "#0f172a",
                color: "#f8fafc",
                fontSize: "13px",
                fontWeight: 500,
                padding: "10px 16px",
                boxShadow: "0 10px 30px rgba(15,23,42,0.25)",
              },
              success: { iconTheme: { primary: "#2dd4bf", secondary: "#0f172a" } },
              error: { iconTheme: { primary: "#f87171", secondary: "#0f172a" } },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
