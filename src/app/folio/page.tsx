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
    <div className="flex flex-1 flex-col gap-6">
      <header className="flex items-center justify-between border-b border-zinc-800 pb-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-300 hover:text-lime-400"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al inicio
        </Link>
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Comprobante
        </span>
      </header>

      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          placeholder="Buscar folio (ej. SP-4821)"
          value={folioQuery}
          onChange={(e) => setFolioQuery(e.target.value)}
          className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 py-2.5 text-sm uppercase text-white placeholder-zinc-500 outline-none focus:border-lime-400"
        />
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-xs font-semibold text-white hover:border-lime-400"
        >
          <Search className="h-3.5 w-3.5" />
          Buscar
        </button>
      </form>

      {loading && <p className="text-sm text-zinc-400">Consultando registro...</p>}

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-xs text-red-300">
          {error}
        </div>
      )}

      {sesion && (
        <section className="rounded-2xl border border-zinc-800 bg-[#121217] p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs text-zinc-400">Folio de participación</p>
              <h2 className="text-2xl font-extrabold tracking-tight text-lime-400">
                {sesion.folio}
              </h2>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-lime-400/10 text-lime-400">
              <Award className="h-6 w-6" />
            </div>
          </div>

          <dl className="space-y-3 border-t border-zinc-800 pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-zinc-400">Asistente</dt>
              <dd className="font-semibold text-white">{sesion.alias}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-400">Evento</dt>
              <dd className="font-mono text-zinc-200">{sesion.codigo_evento}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-400">Tiempo sin pantallas</dt>
              <dd className="font-mono text-lg font-bold text-white">
                {formatTime(sesion.tiempo_activo_seg)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-400">Salidas detectadas</dt>
              <dd className="font-semibold text-white">{sesion.faltas}</dd>
            </div>
            <div className="flex items-center justify-between pt-1">
              <dt className="text-zinc-400">Resultado</dt>
              <dd>
                {sesion.faltas === 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-lime-400/15 px-3 py-1 text-xs font-semibold text-lime-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Pista Limpia (Recompensa)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-3 py-1 text-xs font-semibold text-amber-300">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Completado con faltas
                  </span>
                )}
              </dd>
            </div>
          </dl>
        </section>
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
