import "./globals.css";

export const metadata = {
  title: "Spribe-OS — Aviator Intelligence Portal",
  description: "Distribution Hub + Brain + Bridge for live Spribe Aviator telemetry.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-void text-white antialiased">
        <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,#1b2452_0%,transparent_55%),radial-gradient(ellipse_at_bottom_right,#3b0f22_0%,transparent_50%)]" />
        {children}
      </body>
    </html>
  );
}
