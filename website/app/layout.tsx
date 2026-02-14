import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Docker Quick Actions — Manage Docker containers from VS Code",
  description:
    "A lightweight VS Code extension to manage Docker containers directly from your editor. Start, stop, restart, view logs, and open terminals — all in one click.",
  keywords: [
    "docker",
    "vscode",
    "extension",
    "containers",
    "devtools",
  ],
  openGraph: {
    title: "Docker Quick Actions",
    description:
      "Manage Docker containers directly from VS Code. Start, stop, view logs, and more.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
