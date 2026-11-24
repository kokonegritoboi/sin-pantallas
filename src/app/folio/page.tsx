"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Award, ArrowLeft, Search, CheckCircle2, AlertTriangle } from "lucide-react";
import {
  supabase,
  SesionSinPantallas,
  getLocalSession,
  getLocalSessionByFolio,
  isSessionExpired,
  purgeExpiredSessions,
  getCutoffIso,
} from "@/lib/supabase";

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
    purgeExpiredSessions();
    if (!idParam) {
      setLoading(false);
      return;
    }

    if (!supabase || idParam.startsWith("loc-")) {
      const local = getLocalSession(idParam);
      if (local && !isSessionExpired(local)) setSesion(local);
      else setError("Este folio no existe o expiró después de 30 minutos.");
      setLoading(false);
      return;
    }

    supabase
      .from("sesiones_sin_pantallas")
      .select("*")
      .eq("id", idParam)
      .gte("updated_at", getCutoffIso())
      .single()
      .then(({ data, error: err }) => {
        if (err || !data) {
          setError("Este folio no existe o expiró después de 30 minutos.");
        } else {
          setSesion(data as SesionSinPantallas);
        }
        setLoading(false);
      });
  }, [idParam]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!folioQuery.trim()) return;
    setLoading(true);
    setError("");
    await purgeExpiredSessions();

    if (!supabase) {
      const local = getLocalSessionByFolio(folioQuery.trim());
      if (local && !isSessionExpired(local)) setSesion(local);
      else {
        setSesion(null);
        setError("No existe un folio activo con ese código (expiran tras 30 minutos).");
      }
      setLoading(false);
      return;
    }

    const { data, error: err } = await supabase
      .from("sesiones_sin_pantallas")
      .select("*")
      .eq("folio", folioQuery.trim().toUpperCase())
      .gte("updated_at", getCutoffIso())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (err || !data) {
      setSesion(null);
      setError("No existe un folio activo con ese código (expiran tras 30 minutos).");
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
          className="inline-flex items-center gap-1.5 rounded-full bg-[#C9F72D] px-5 py-2.5 text-xs font-extrabold text-[#0b0d10]"
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
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12 md:gap-5">
          <section className="flex flex-col justify-between rounded-[28px] bg-[#C9F72D] p-6 text-[#0b0d10] md:col-span-6">
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
            <p className="mt-6 text-sm font-bold">
              {sesion.alias} · <span className="opacity-75">{sesion.codigo_evento}</span>
            </p>
          </section>

          <div className="flex flex-col justify-between gap-3 md:col-span-6">
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
