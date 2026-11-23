"use client";

import { Suspense, useEffect, useRef, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Headphones,
  Lock,
  Radio,
  Volume2,
  VolumeX,
  LogOut,
  ShieldCheck,
  ArrowLeft,
} from "lucide-react";
import { supabase, SesionSinPantallas } from "@/lib/supabase";
import { ICE_SERVERS, SignalMessage } from "@/lib/webrtc";

function formatClock(totalSeconds: number) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function PistaContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId =
    searchParams.get("id") ||
    (typeof window !== "undefined" ? sessionStorage.getItem("sp_session_id") : null);

  const [sesion, setSesion] = useState<SesionSinPantallas | null>(null);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [djStatus, setDjStatus] = useState<"esperando" | "conectado" | "backup">("esperando");
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [pinInput, setPinInput] = useState("");
  const [loading, setLoading] = useState(true);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const listenerIdRef = useRef<string>(`L-${Math.random().toString(36).slice(2, 9)}`);
  const backupIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);

  const stopBackupBeat = useCallback(() => {
    if (backupIntervalRef.current) {
      clearInterval(backupIntervalRef.current);
      backupIntervalRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  }, []);

  const startBackupBeat = useCallback(() => {
    if (backupIntervalRef.current) return;
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    audioCtxRef.current = ctx;
    let step = 0;

    const playStep = () => {
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      const now = ctx.currentTime;

      if (step % 2 === 0) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(125, now);
        osc.frequency.exponentialRampToValueAtTime(42, now + 0.14);
        gain.gain.setValueAtTime(0.45, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.19);
      }

      if (step % 4 === 1) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(step % 8 === 1 ? 220 : 261.63, now);
        gain.gain.setValueAtTime(0.09, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.26);
      }
      step = (step + 1) % 8;
    };

    playStep();
    backupIntervalRef.current = setInterval(playStep, 250);
  }, []);

  useEffect(() => {
    if (!sessionId || !supabase) {
      setLoading(false);
      return;
    }

    supabase
      .from("sesiones_sin_pantallas")
      .select("*")
      .eq("id", sessionId)
      .single()
      .then(({ data }) => {
        if (data) {
          const s = data as SesionSinPantallas;
          setSesion(s);
          setSeconds(s.tiempo_activo_seg);
        }
        setLoading(false);
      });

    const dbChannel = supabase
      .channel(`sesion-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sesiones_sin_pantallas",
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          const updated = payload.new as SesionSinPantallas;
          setSesion(updated);
          if (updated.estado === "activo" && audioUnlocked) {
            audioRef.current?.play().catch(() => {});
          }
          if (updated.estado === "bloqueado") {
            audioRef.current?.pause();
            stopBackupBeat();
          }
        }
      )
      .subscribe();

    return () => {
      supabase?.removeChannel(dbChannel);
    };
  }, [sessionId, audioUnlocked, stopBackupBeat]);

  useEffect(() => {
    if (!sesion || sesion.estado !== "activo" || !audioUnlocked) return;

    const timer = setInterval(() => {
      setSeconds((prev) => {
        const next = prev + 1;
        if (next % 5 === 0 && supabase) {
          supabase
            .from("sesiones_sin_pantallas")
            .update({ tiempo_activo_seg: next, updated_at: new Date().toISOString() })
            .eq("id", sesion.id)
            .then(() => {});
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [sesion, audioUnlocked]);

  useEffect(() => {
    if (!sesion || !audioUnlocked) return;

    const handleVisibility = async () => {
      if (document.hidden && sesion.estado === "activo") {
        audioRef.current?.pause();
        stopBackupBeat();
        const nuevasFaltas = sesion.faltas + 1;

        setSesion((prev) =>
          prev ? { ...prev, estado: "bloqueado", faltas: nuevasFaltas } : prev
        );

        if (supabase) {
          await supabase
            .from("sesiones_sin_pantallas")
            .update({
              estado: "bloqueado",
              faltas: nuevasFaltas,
              tiempo_activo_seg: seconds,
              updated_at: new Date().toISOString(),
            })
            .eq("id", sesion.id);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [sesion, audioUnlocked, seconds, stopBackupBeat]);

  useEffect(() => {
    if (!audioUnlocked || !sesion || sesion.canal === "CANAL-BACKUP" || !supabase) {
      if (audioUnlocked && sesion?.canal === "CANAL-BACKUP" && sesion.estado === "activo") {
        setDjStatus("backup");
        if (!muted) startBackupBeat();
      }
      return;
    }

    const roomName = `webrtc-sp-${sesion.codigo_evento}`;
    const signalChannel = supabase.channel(roomName);
    const listenerId = listenerIdRef.current;

    const setupPeer = () => {
      pcRef.current?.close();
      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;

      pc.ontrack = (event) => {
        if (audioRef.current && event.streams[0]) {
          audioRef.current.srcObject = event.streams[0];
          audioRef.current.play().catch(() => {});
          stopBackupBeat();
          setDjStatus("conectado");
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          signalChannel.send({
            type: "broadcast",
            event: "signal",
            payload: {
              type: "ice-candidate",
              listenerId,
              from: "listener",
              candidate: event.candidate.toJSON(),
            } satisfies SignalMessage,
          });
        }
      };

      return pc;
    };

    signalChannel
      .on("broadcast", { event: "signal" }, async ({ payload }) => {
        const msg = payload as SignalMessage;
        if (msg.type === "dj-ready") {
          signalChannel.send({
            type: "broadcast",
            event: "signal",
            payload: { type: "listener-join", listenerId } satisfies SignalMessage,
          });
        } else if (msg.type === "offer" && msg.listenerId === listenerId) {
          const pc = setupPeer();
          await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          signalChannel.send({
            type: "broadcast",
            event: "signal",
            payload: { type: "answer", listenerId, sdp: answer } satisfies SignalMessage,
          });
        } else if (
          msg.type === "ice-candidate" &&
          msg.listenerId === listenerId &&
          msg.from === "dj" &&
          pcRef.current
        ) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(() => {});
        } else if (msg.type === "dj-stop") {
          setDjStatus("esperando");
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          signalChannel.send({
            type: "broadcast",
            event: "signal",
            payload: { type: "listener-join", listenerId } satisfies SignalMessage,
          });
        }
      });

    return () => {
      pcRef.current?.close();
      supabase?.removeChannel(signalChannel);
      stopBackupBeat();
    };
  }, [audioUnlocked, sesion?.codigo_evento, sesion?.canal, muted, startBackupBeat, stopBackupBeat]);

  async function handleUnlockAudio() {
    setAudioUnlocked(true);
    if (audioRef.current) {
      audioRef.current.muted = muted;
      audioRef.current.play().catch(() => {});
    }
    try {
      const nav = navigator as Navigator & {
        wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
      };
      if (nav.wakeLock) {
        wakeLockRef.current = await nav.wakeLock.request("screen");
      }
    } catch {
      // WakeLock opcional
    }
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    if (audioRef.current) audioRef.current.muted = next;
    if (next) {
      stopBackupBeat();
    } else if (djStatus === "backup" && sesion?.estado === "activo") {
      startBackupBeat();
    }
  }

  async function handleLocalPinUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (pinInput.trim() !== "2026" || !sesion || !supabase) return;
    await supabase
      .from("sesiones_sin_pantallas")
      .update({ estado: "activo", updated_at: new Date().toISOString() })
      .eq("id", sesion.id);
    setPinInput("");
  }

  async function handleFinish() {
    stopBackupBeat();
    wakeLockRef.current?.release().catch(() => {});
    if (sesion && supabase) {
      await supabase
        .from("sesiones_sin_pantallas")
        .update({
          estado: "finalizado",
          tiempo_activo_seg: seconds,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sesion.id);
      router.push(`/folio?id=${sesion.id}`);
    } else {
      router.push("/");
    }
  }

  if (loading) {
    return <p className="py-12 text-center text-sm text-zinc-400">Cargando pista...</p>;
  }

  if (!sesion) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <p className="text-sm text-zinc-300">No hay una sesión activa registrada.</p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-xl bg-lime-400 px-4 py-2.5 text-sm font-bold text-zinc-950"
        >
          <ArrowLeft className="h-4 w-4" />
          Ir al Check-in
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col justify-between gap-6">
      <audio ref={audioRef} autoPlay playsInline className="hidden" />

      <header className="flex items-center justify-between border-b border-zinc-800 pb-4">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-lime-400">
            {sesion.codigo_evento} · {sesion.folio}
          </span>
          <h1 className="text-base font-bold text-white">Hola, {sesion.alias}</h1>
        </div>
        <button
          onClick={toggleMute}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-200 hover:border-lime-400"
          aria-label="Silenciar"
        >
          {muted ? <VolumeX className="h-5 w-5 text-red-400" /> : <Volume2 className="h-5 w-5 text-lime-400" />}
        </button>
      </header>

      {sesion.estado === "bloqueado" ? (
        <section className="flex flex-1 flex-col items-center justify-center gap-5 rounded-2xl border border-red-500/50 bg-red-950/20 p-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20 text-red-400">
            <Lock className="h-8 w-8" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Saliste de la pista</h2>
            <p className="mt-2 text-sm text-zinc-300">
              Detectamos que cambiaste de aplicación o minimizaste la pantalla. La música se
              pausó y sumaste una falta ({sesion.faltas}).
            </p>
          </div>
          <p className="rounded-xl border border-zinc-800 bg-zinc-900/90 px-4 py-2.5 text-xs text-zinc-300">
            Pide al organizador que te reactive desde la Cabina DJ o ingresa el PIN de evento:
          </p>
          <form onSubmit={handleLocalPinUnlock} className="flex w-full max-w-xs gap-2">
            <input
              type="password"
              inputMode="numeric"
              placeholder="PIN (2026)"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              className="flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-center text-sm text-white outline-none focus:border-lime-400"
            />
            <button
              type="submit"
              className="rounded-xl bg-lime-400 px-4 py-2 text-xs font-bold text-zinc-950"
            >
              Reactivar
            </button>
          </form>
        </section>
      ) : !audioUnlocked ? (
        <section className="flex flex-1 flex-col items-center justify-center gap-6 rounded-2xl border border-zinc-800 bg-[#121217] p-6 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full border border-lime-400/40 bg-lime-400/10 text-lime-400">
            <Headphones className="h-10 w-10" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Ponte tus audífonos</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Toca el botón para habilitar el audio en tu teléfono y comenzar a sumar tiempo sin
              pantallas.
            </p>
          </div>
          <button
            onClick={handleUnlockAudio}
            className="w-full rounded-xl bg-lime-400 px-5 py-4 text-sm font-bold text-zinc-950 transition hover:bg-lime-300"
          >
            Conectar audífonos y empezar
          </button>
        </section>
      ) : (
        <section className="flex flex-1 flex-col items-center justify-center gap-6 rounded-2xl border border-lime-400/30 bg-[#121217] p-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-lime-400/30 bg-lime-400/10 px-3.5 py-1.5 text-xs font-semibold text-lime-400">
            <ShieldCheck className="h-4 w-4" />
            Modo Sin Pantallas Activo
          </div>

          <div>
            <p className="text-xs uppercase tracking-widest text-zinc-400">Tiempo en pista</p>
            <p className="mt-1 font-mono text-6xl font-black tracking-tight text-white">
              {formatClock(seconds)}
            </p>
          </div>

          <div className="w-full rounded-xl border border-zinc-800 bg-zinc-900/70 p-3.5 text-xs text-zinc-300">
            <div className="flex items-center justify-center gap-2">
              <Radio className="h-4 w-4 text-lime-400" />
              <span>
                {djStatus === "conectado"
                  ? "Recibiendo audio del DJ en vivo"
                  : djStatus === "backup"
                  ? "Reproduciendo Canal Backup (beat local)"
                  : "Esperando señal del DJ en vivo..."}
              </span>
            </div>
            {djStatus === "esperando" && (
              <button
                type="button"
                onClick={() => {
                  setDjStatus("backup");
                  if (!muted) startBackupBeat();
                }}
                className="mt-2.5 text-[11px] font-semibold text-lime-400 underline underline-offset-4"
              >
                Activar beat de respaldo mientras entra el DJ
              </button>
            )}
          </div>

          <p className="text-xs text-zinc-500">
            Faltas registradas: <strong className="text-zinc-300">{sesion.faltas}</strong>
          </p>
        </section>
      )}

      <footer className="flex flex-col gap-2">
        <button
          onClick={handleFinish}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:border-lime-400 hover:text-lime-400"
        >
          <LogOut className="h-4 w-4" />
          Terminar sesión y ver mi folio
        </button>
      </footer>
    </div>
  );
}

export default function PistaPage() {
  return (
    <Suspense fallback={<p className="py-12 text-center text-sm text-zinc-400">Cargando...</p>}>
      <PistaContent />
    </Suspense>
  );
}
