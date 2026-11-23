import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

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
      <body
        className={`${jakarta.className} min-h-screen bg-[#0b0d10] text-[#f4f6f0] antialiased selection:bg-[#C9F72D] selection:text-[#0b0d10]`}
      >
        <main className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 py-4 md:max-w-3xl md:px-6 md:py-7 lg:max-w-5xl lg:px-8">
          {children}
        </main>
      </body>
    </html>
  );
}
