"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Headphones, Radio, ShieldAlert, ArrowRight, Disc3 } from "lucide-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

export default function CheckInPage() {
  const router = useRouter();
  const [alias, setAlias] = useState("");
  const [codigoEvento, setCodigoEvento] = useState("BERLIN-UTVAM");
  const [canal, setCanal] = useState<"DJ-EN-VIVO" | "CANAL-BACKUP">("DJ-EN-VIVO");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleCheckIn(e: React.FormEvent) {
    e.preventDefault();
    const cleanAlias = alias.trim();
    const cleanCode = codigoEvento.trim().toUpperCase() || "BERLIN-UTVAM";

    if (!cleanAlias) {
      setError("Escribe un alias o apodo de prueba para entrar.");
      return;
    }

    setLoading(true);
    setError("");

    const folio = `SP-${Math.floor(1000 + Math.random() * 9000)}`;

    if (!isSupabaseConfigured || !supabase) {
      setError("Falta configurar NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      setLoading(false);
      return;
    }

    const { data, error: dbError } = await supabase
      .from("sesiones_sin_pantallas")
      .insert({
        folio,
        alias: cleanAlias,
        codigo_evento: cleanCode,
        canal,
        estado: "activo",
        tiempo_activo_seg: 0,
        faltas: 0,
      })
      .select("id")
      .single();

    if (dbError || !data) {
      setError(dbError?.message || "No se pudo registrar tu entrada. Revisa Supabase.");
      setLoading(false);
      return;
    }

    sessionStorage.setItem("sp_session_id", data.id);
    router.push(`/pista?id=${data.id}`);
  }

  return (
    <div className="flex flex-1 flex-col justify-between gap-6">
      <div>
        <header className="mb-8 flex items-center justify-between border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-lime-400/40 bg-lime-400/10 text-lime-400">
              <Headphones className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white">SIN PANTALLAS</h1>
              <p className="text-xs text-zinc-400">Silent Party · Modo Enfoque</p>
            </div>
          </div>
          <Link
            href="/dj"
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-lime-400 hover:text-lime-400"
          >
            <Disc3 className="h-3.5 w-3.5" />
            Cabina DJ
          </Link>
        </header>

        <section className="mb-6 rounded-2xl border border-zinc-800 bg-[#121217] p-5">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-lime-400">
            Regla de la pista
          </p>
          <p className="text-sm leading-relaxed text-zinc-300">
            Conecta tus audífonos y mantén esta pantalla abierta. Si sales a otra app o
            minimizas, la música se detiene y el organizador debe reactivar tu acceso.
          </p>
        </section>

        <form onSubmit={handleCheckIn} className="space-y-4">
          <div>
            <label htmlFor="alias" className="mb-1.5 block text-xs font-medium text-zinc-300">
              Alias o nombre de prueba
            </label>
            <input
              id="alias"
              type="text"
              maxLength={30}
              placeholder="Ej. Alex_701"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-white placeholder-zinc-500 outline-none focus:border-lime-400"
            />
          </div>

          <div>
            <label htmlFor="codigo" className="mb-1.5 block text-xs font-medium text-zinc-300">
              Código del evento
            </label>
            <input
              id="codigo"
              type="text"
              maxLength={24}
              value={codigoEvento}
              onChange={(e) => setCodigoEvento(e.target.value)}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm uppercase text-white outline-none focus:border-lime-400"
            />
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-medium text-zinc-300">
              Fuente de audio
            </span>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setCanal("DJ-EN-VIVO")}
                className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition ${
                  canal === "DJ-EN-VIVO"
                    ? "border-lime-400 bg-lime-400/10 text-white"
                    : "border-zinc-800 bg-zinc-900 text-zinc-400"
                }`}
              >
                <Radio className="h-4 w-4 text-lime-400" />
                <span className="text-xs font-semibold">DJ en Vivo</span>
                <span className="text-[11px] text-zinc-400">Transmisión real</span>
              </button>

              <button
                type="button"
                onClick={() => setCanal("CANAL-BACKUP")}
                className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition ${
                  canal === "CANAL-BACKUP"
                    ? "border-lime-400 bg-lime-400/10 text-white"
                    : "border-zinc-800 bg-zinc-900 text-zinc-400"
                }`}
              >
                <Headphones className="h-4 w-4 text-lime-400" />
                <span className="text-xs font-semibold">Canal Backup</span>
                <span className="text-[11px] text-zinc-400">Beat integrado</span>
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-lime-400 px-4 py-3.5 text-sm font-bold text-zinc-950 transition hover:bg-lime-300 disabled:opacity-50"
          >
            {loading ? "Registrando acceso..." : "Entrar a la pista"}
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>
      </div>

      <footer className="border-t border-zinc-900 pt-4 text-center">
        <Link
          href="/folio"
          className="text-xs text-zinc-400 underline-offset-4 hover:text-zinc-200 hover:underline"
        >
          Consultar un folio existente
        </Link>
      </footer>
    </div>
  );
}
