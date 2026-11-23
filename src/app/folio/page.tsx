"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Award, ArrowLeft, Search, CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase, SesionSinPantallas } from "@/lib/supabase";

function formatTime(totalSeconds: number) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function FolioContent() {
  const searchParams = useSearchParams();
  const idParam = searchParams.get("id");
  const [sesion, setSesion] = useState<SesionSinPantallas | null>(null);
  const [folioQuery, setFolioQuery] = useState("");
  const [loading, setLoading] = useState(Boolean(idParam));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!idParam || !supabase) {
      setLoading(false);
      return;
    }
    supabase
      .from("sesiones_sin_pantallas")
      .select("*")
      .eq("id", idParam)
      .single()
      .then(({ data, error: err }) => {
        if (err || !data) {
          setError("No encontramos ese registro en la base de datos.");
        } else {
          setSesion(data as SesionSinPantallas);
        }
        setLoading(false);
      });
  }, [idParam]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !folioQuery.trim()) return;
    setLoading(true);
    setError("");
    const { data, error: err } = await supabase
      .from("sesiones_sin_pantallas")
      .select("*")
      .eq("folio", folioQuery.trim().toUpperCase())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (err || !data) {
      setSesion(null);
      setError("No existe un folio con ese código.");
    } else {
      setSesion(data as SesionSinPantallas);
    }
    setLoading(false);
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <header className="flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#14171D] px-3.5 py-2 text-xs font-semibold text-white hover:border-[#C9F72D]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Inicio
        </Link>
        <span className="rounded-full bg-[#14171D] px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
          Comprobante
        </span>
      </header>

      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          placeholder="Buscar folio (ej. SP-4821)"
          value={folioQuery}
          onChange={(e) => setFolioQuery(e.target.value)}
          className="flex-1 rounded-full border border-white/10 bg-[#14171D] px-4 py-2.5 text-sm font-medium uppercase text-white placeholder-zinc-500 outline-none focus:border-[#C9F72D]"
        />
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-full bg-[#C9F72D] px-4 py-2.5 text-xs font-extrabold text-[#0b0d10]"
        >
          <Search className="h-3.5 w-3.5" />
          Buscar
        </button>
      </form>

      {loading && <p className="text-sm text-zinc-400">Consultando registro...</p>}

      {error && (
        <div className="rounded-2xl bg-[#FF4D2E]/15 p-4 text-xs font-medium text-[#FF8A75]">
          {error}
        </div>
      )}

      {sesion && (
        <div className="space-y-3">
          {/* Acid-Lime Folio Hero */}
          <section className="rounded-[28px] bg-[#C9F72D] p-6 text-[#0b0d10]">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider opacity-75">
                  Folio de participación
                </p>
                <h2 className="mt-1 tabular-nums text-4xl font-extrabold tracking-tight">
                  {sesion.folio}
                </h2>
              </div>
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#0b0d10] text-[#C9F72D]">
                <Award className="h-5 w-5" />
              </span>
            </div>
            <p className="mt-4 text-sm font-bold">
              {sesion.alias} · <span className="opacity-75">{sesion.codigo_evento}</span>
            </p>
          </section>

          {/* Bento Metrics */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[24px] bg-[#C9F2E3] p-5 text-[#0b0d10]">
              <p className="text-[11px] font-bold uppercase opacity-70">Tiempo activo</p>
              <p className="mt-1 tabular-nums text-3xl font-extrabold">
                {formatTime(sesion.tiempo_activo_seg)}
              </p>
            </div>
            <div className="rounded-[24px] border border-white/10 bg-[#14171D] p-5 text-white">
              <p className="text-[11px] font-bold uppercase text-zinc-400">Faltas</p>
              <p className="mt-1 tabular-nums text-3xl font-extrabold">{sesion.faltas}</p>
            </div>
          </div>

          <section className="flex items-center justify-between rounded-[24px] border border-white/10 bg-[#14171D] p-5">
            <span className="text-xs font-semibold text-zinc-400">Resultado</span>
            {sesion.faltas === 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#C9F72D] px-3.5 py-1.5 text-xs font-extrabold text-[#0b0d10]">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Pista Limpia (Recompensa)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FF4D2E] px-3.5 py-1.5 text-xs font-extrabold text-white">
                <AlertTriangle className="h-3.5 w-3.5" />
                Completado con faltas
              </span>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export default function FolioPage() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-400">Cargando folio...</p>}>
      <FolioContent />
    </Suspense>
  );
}
