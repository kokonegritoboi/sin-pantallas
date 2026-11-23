"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Headphones,
  Radio,
  ShieldAlert,
  ArrowUpRight,
  Disc3,
  Sparkles,
} from "lucide-react";
import {
  supabase,
  isSupabaseConfigured,
  saveLocalSession,
  SesionSinPantallas,
} from "@/lib/supabase";

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
    const now = new Date().toISOString();

    if (isSupabaseConfigured && supabase) {
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
      return;
    }

    const localId = `loc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const localSesion: SesionSinPantallas = {
      id: localId,
      folio,
      alias: cleanAlias,
      codigo_evento: cleanCode,
      canal,
      estado: "activo",
      tiempo_activo_seg: 0,
      faltas: 0,
      created_at: now,
      updated_at: now,
    };
    saveLocalSession(localSesion);
    sessionStorage.setItem("sp_session_id", localId);
    router.push(`/pista?id=${localId}`);
  }

  return (
    <div className="flex flex-1 flex-col justify-between gap-4">
      <header className="flex items-center justify-between">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#14171D] py-1.5 pl-2 pr-3.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#C9F72D] text-[#0b0d10]">
            <Headphones className="h-3.5 w-3.5 stroke-[2.5]" />
          </span>
          <span className="text-xs font-bold tracking-tight text-white">SIN PANTALLAS</span>
        </div>

        <Link
          href="/dj"
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-[#14171D] py-1.5 pl-3.5 pr-1.5 text-xs font-semibold text-zinc-200 transition hover:border-[#C9F72D]"
        >
          Cabina DJ
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-[#C9F72D]">
            <Disc3 className="h-3.5 w-3.5" />
          </span>
        </Link>
      </header>

      <div className="grid flex-1 grid-cols-1 items-stretch gap-3 md:grid-cols-12 md:gap-5">
        <section className="flex flex-col justify-between rounded-[26px] bg-[#C9F72D] p-5 text-[#0b0d10] md:col-span-5 md:p-7">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1 rounded-full bg-[#0b0d10] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#C9F72D]">
              <Sparkles className="h-2.5 w-2.5" />
              Silent Party
            </span>
            <span className="rounded-full border border-[#0b0d10]/20 px-2.5 py-0.5 text-[10px] font-bold">
              MODO ENFOQUE
            </span>
          </div>

          <div className="my-4 md:my-8">
            <h1 className="text-2xl font-extrabold leading-[1.08] tracking-tight md:text-4xl">
              Deja el celular.
              <br />
              Siente la pista.
            </h1>
            <p className="mt-2 text-xs font-medium leading-relaxed text-[#0b0d10]/80 md:text-sm">
              Mantén esta app abierta con tus audífonos puestos. Si sales a otra app, la
              música se pausa y el organizador debe reactivarte.
            </p>
          </div>

          <div className="hidden rounded-2xl bg-[#0b0d10]/10 p-3 text-[11px] font-semibold md:block">
            Disponible en teléfono, tablet y escritorio sin descargas.
          </div>
        </section>

        <form
          onSubmit={handleCheckIn}
          className="flex flex-col justify-between space-y-3 rounded-[26px] border border-white/10 bg-[#14171D] p-5 md:col-span-7 md:p-7"
        >
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="alias"
                  className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-zinc-400"
                >
                  Tu alias de prueba
                </label>
                <input
                  id="alias"
                  type="text"
                  maxLength={30}
                  placeholder="Ej. KOKO"
                  value={alias}
                  onChange={(e) => setAlias(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-[#0b0d10] px-3.5 py-2.5 text-sm font-medium text-white placeholder-zinc-500 outline-none focus:border-[#C9F72D]"
                />
              </div>

              <div>
                <label
                  htmlFor="codigo"
                  className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-zinc-400"
                >
                  Código del evento
                </label>
                <input
                  id="codigo"
                  type="text"
                  maxLength={24}
                  value={codigoEvento}
                  onChange={(e) => setCodigoEvento(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-[#0b0d10] px-3.5 py-2.5 text-sm font-bold uppercase tracking-wider text-white outline-none focus:border-[#C9F72D]"
                />
              </div>
            </div>

            <div>
              <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                Canal de audio
              </span>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setCanal("DJ-EN-VIVO")}
                  className={`flex flex-col justify-between rounded-[18px] p-3.5 text-left transition ${
                    canal === "DJ-EN-VIVO"
                      ? "bg-[#C9F2E3] text-[#0b0d10]"
                      : "border border-white/10 bg-[#0b0d10] text-zinc-300"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <Radio className="h-4 w-4" />
                    <span
                      className={`h-2 w-2 rounded-full ${
                        canal === "DJ-EN-VIVO" ? "bg-[#0b0d10]" : "bg-zinc-600"
                      }`}
                    />
                  </div>
                  <div>
                    <p className="text-xs font-extrabold">DJ en Vivo</p>
                    <p className="text-[11px] opacity-75">Audio en directo</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setCanal("CANAL-BACKUP")}
                  className={`flex flex-col justify-between rounded-[18px] p-3.5 text-left transition ${
                    canal === "CANAL-BACKUP"
                      ? "bg-[#C9F2E3] text-[#0b0d10]"
                      : "border border-white/10 bg-[#0b0d10] text-zinc-300"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <Headphones className="h-4 w-4" />
                    <span
                      className={`h-2 w-2 rounded-full ${
                        canal === "CANAL-BACKUP" ? "bg-[#0b0d10]" : "bg-zinc-600"
                      }`}
                    />
                  </div>
                  <div>
                    <p className="text-xs font-extrabold">Canal Backup</p>
                    <p className="text-[11px] opacity-75">Beat integrado</p>
                  </div>
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-2xl bg-[#FF4D2E]/15 p-3 text-xs font-medium text-[#FF8A75]">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-between rounded-full bg-[#C9F72D] py-2 pl-5 pr-2 text-sm font-extrabold text-[#0b0d10] transition hover:brightness-105 disabled:opacity-50"
          >
            <span>{loading ? "Registrando acceso..." : "Entrar a la pista"}</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0b0d10] text-[#C9F72D]">
              <ArrowUpRight className="h-4 w-4" />
            </span>
          </button>
        </form>
      </div>

      <footer className="pb-1 text-center">
        <Link
          href="/folio"
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-[#14171D] px-4 py-1.5 text-xs font-semibold text-zinc-300 transition hover:border-white/30 hover:text-white"
        >
          Consultar un folio existente
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </footer>
    </div>
  );
}
