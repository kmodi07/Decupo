import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Decupo", template: "%s | Decupo" },
  description: "Say the dream. Watch it happen. Cupi plans your mission, estimates credits, and a crew of specialist agents does the bounded work with your approval.",
  icons: { icon: "/assets/cupi-mascot.png" },
};

export const viewport: Viewport = {
  themeColor: "#141329",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body className="bg-cream text-midnight">{children}</body>
    </html>
  );
}
