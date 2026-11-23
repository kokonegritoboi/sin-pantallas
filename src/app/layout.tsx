import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sin Pantallas — Silent Party MVP",
  description: "Experiencia de fiesta sin celulares con audio en vivo y modo enfoque.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-[#09090b] text-zinc-100 antialiased selection:bg-lime-400 selection:text-black">
        <main className="mx-auto flex min-h-screen max-w-md flex-col px-4 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
