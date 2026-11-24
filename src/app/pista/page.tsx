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
  ArrowLeft,
  ArrowUpRight,
  Check,
} from "lucide-react";
import {
  supabase,
  SesionSinPantallas,
  getLocalSession,
  updateLocalSession,
  isSessionExpired,
  purgeExpiredSessions,
  getCutoffIso,
} from "@/lib/supabase";
import { ICE_SERVERS, SignalMessage } from "@/lib/webrtc";

function formatClock(totalSeconds: number) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, "0")} : ${String(secs).padStart(2, "0")}`;
}

function base64Pcm16ToFloat32(b64: string): Float32Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const pcm = new Int16Array(bytes.buffer);
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) {
    out[i] = pcm[i] / 32768;
  }
  return out;
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
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const listenerIdRef = useRef<string>(`L-${Math.random().toString(36).slice(2, 9)}`);
  const backupIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const relayCtxRef = useRef<AudioContext | null>(null);
  const nextRelayTimeRef = useRef<number>(0);
  const webrtcConnectedRef = useRef(false);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);

  const mutedRef = useRef(muted);
  const audioUnlockedRef = useRef(audioUnlocked);
  const sesionRef = useRef(sesion);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    audioUnlockedRef.current = audioUnlocked;
  }, [audioUnlocked]);

  useEffect(() => {
    sesionRef.current = sesion;
  }, [sesion]);

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

  const stopRelayAudio = useCallback(() => {
    nextRelayTimeRef.current = 0;
    if (relayCtxRef.current) {
      relayCtxRef.current.close().catch(() => {});
      relayCtxRef.current = null;
    }
  }, []);

  const stopAllAudio = useCallback(() => {
    stopBackupBeat();
    stopRelayAudio();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.srcObject = null;
      audioRef.current.removeAttribute("src");
    }
    webrtcConnectedRef.current = false;
  }, [stopBackupBeat, stopRelayAudio]);

  const startBackupBeat = useCallback(() => {
    if (backupIntervalRef.current || audioCtxRef.current) return;
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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

  // Limpieza garantizada si el usuario sale al menú o cierra la vista
  useEffect(() => {
    return () => {
      stopAllAudio();
      pcRef.current?.close();
      pcRef.current = null;
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, [stopAllAudio]);

  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      return;
    }

    purgeExpiredSessions();

    if (!supabase || sessionId.startsWith("loc-")) {
      const local = getLocalSession(sessionId);
      if (local && !isSessionExpired(local)) {
        setSesion(local);
        setSeconds(local.tiempo_activo_seg);
      }
      setLoading(false);
      return;
    }

    supabase
      .from("sesiones_sin_pantallas")
      .select("*")
      .eq("id", sessionId)
      .gte("updated_at", getCutoffIso())
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
          if (updated.estado === "activo" && audioUnlockedRef.current) {
            audioRef.current?.play().catch(() => {});
            if (relayCtxRef.current?.state === "suspended") {
              relayCtxRef.current.resume().catch(() => {});
            }
          }
          if (updated.estado === "bloqueado") {
            audioRef.current?.pause();
            stopBackupBeat();
            if (relayCtxRef.current?.state === "running") {
              relayCtxRef.current.suspend().catch(() => {});
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase?.removeChannel(dbChannel);
    };
  }, [sessionId, stopBackupBeat]);

  useEffect(() => {
    if (!sesion || sesion.estado !== "activo" || !audioUnlocked) return;

    const timer = setInterval(() => {
      setSeconds((prev) => {
        const next = prev + 1;
        if (next % 5 === 0) {
          if (supabase && !sesion.id.startsWith("loc-")) {
            supabase
              .from("sesiones_sin_pantallas")
              .update({ tiempo_activo_seg: next, updated_at: new Date().toISOString() })
              .eq("id", sesion.id)
              .then(() => {});
          } else {
            updateLocalSession(sesion.id, { tiempo_activo_seg: next });
          }
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
        if (relayCtxRef.current?.state === "running") {
          relayCtxRef.current.suspend().catch(() => {});
        }
        const nuevasFaltas = sesion.faltas + 1;

        setSesion((prev) =>
          prev ? { ...prev, estado: "bloqueado", faltas: nuevasFaltas } : prev
        );

        if (supabase && !sesion.id.startsWith("loc-")) {
          await supabase
            .from("sesiones_sin_pantallas")
            .update({
              estado: "bloqueado",
              faltas: nuevasFaltas,
              tiempo_activo_seg: seconds,
              updated_at: new Date().toISOString(),
            })
            .eq("id", sesion.id);
        } else {
          updateLocalSession(sesion.id, {
            estado: "bloqueado",
            faltas: nuevasFaltas,
            tiempo_activo_seg: seconds,
          });
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [sesion, audioUnlocked, seconds, stopBackupBeat]);

  useEffect(() => {
    if (!audioUnlocked || !sesion || sesion.canal === "CANAL-BACKUP" || !supabase) {
      if (audioUnlocked && sesion && sesion.estado === "activo") {
        if (sesion.canal === "CANAL-BACKUP" || !supabase) {
          setDjStatus("backup");
          if (!mutedRef.current) startBackupBeat();
        }
      }
      return () => {
        stopBackupBeat();
      };
    }

    const roomName = `webrtc-sp-${sesion.codigo_evento.trim().toUpperCase()}`;
    const signalChannel = supabase.channel(roomName, {
      config: { broadcast: { self: false } },
    });
    const listenerId = listenerIdRef.current;
    let relayTimer: NodeJS.Timeout | null = null;

    const requestRelay = () => {
      if (webrtcConnectedRef.current) return;
      signalChannel.send({
        type: "broadcast",
        event: "signal",
        payload: { type: "need-relay", listenerId } satisfies SignalMessage,
      });
    };

    const playRelayChunk = (sampleRate: number, pcm16B64: string) => {
      if (
        webrtcConnectedRef.current ||
        mutedRef.current ||
        sesionRef.current?.estado !== "activo"
      ) {
        return;
      }

      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;

      if (!relayCtxRef.current) {
        relayCtxRef.current = new AudioContextClass();
      }
      const ctx = relayCtxRef.current;
      if (ctx.state === "suspended") ctx.resume().catch(() => {});

      const samples = base64Pcm16ToFloat32(pcm16B64);
      const buffer = ctx.createBuffer(1, samples.length, sampleRate);
      buffer.copyToChannel(samples, 0);

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);

      const now = ctx.currentTime;
      if (nextRelayTimeRef.current < now) {
        nextRelayTimeRef.current = now + 0.04;
      }
      src.start(nextRelayTimeRef.current);
      nextRelayTimeRef.current += buffer.duration;

      stopBackupBeat();
      setDjStatus("conectado");
    };

    const setupPeer = () => {
      pcRef.current?.close();
      pendingCandidatesRef.current = [];
      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;

      pc.ontrack = (event) => {
        const remoteStream = event.streams[0] || new MediaStream([event.track]);
        if (audioRef.current) {
          audioRef.current.srcObject = remoteStream;
          audioRef.current.muted = mutedRef.current;
          audioRef.current.play().catch(() => {});
        }
        webrtcConnectedRef.current = true;
        if (relayTimer) clearTimeout(relayTimer);
        stopBackupBeat();
        stopRelayAudio();
        setDjStatus("conectado");
      };

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === "failed" || pc.iceConnectionState === "disconnected") {
          webrtcConnectedRef.current = false;
          requestRelay();
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
          webrtcConnectedRef.current = false;
          signalChannel.send({
            type: "broadcast",
            event: "signal",
            payload: { type: "listener-join", listenerId } satisfies SignalMessage,
          });
          if (relayTimer) clearTimeout(relayTimer);
          relayTimer = setTimeout(requestRelay, 3500);
        } else if (msg.type === "offer" && msg.listenerId === listenerId) {
          const pc = setupPeer();
          await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          const queued = pendingCandidatesRef.current;
          pendingCandidatesRef.current = [];
          for (const cand of queued) {
            await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
          }
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          signalChannel.send({
            type: "broadcast",
            event: "signal",
            payload: {
              type: "answer",
              listenerId,
              sdp: { type: answer.type, sdp: answer.sdp },
            } satisfies SignalMessage,
          });
        } else if (
          msg.type === "ice-candidate" &&
          msg.listenerId === listenerId &&
          msg.from === "dj"
        ) {
          if (pcRef.current && pcRef.current.remoteDescription) {
            await pcRef.current
              .addIceCandidate(new RTCIceCandidate(msg.candidate))
              .catch(() => {});
          } else {
            pendingCandidatesRef.current.push(msg.candidate);
          }
        } else if (msg.type === "relay-audio") {
          playRelayChunk(msg.sampleRate, msg.pcm16);
        } else if (msg.type === "dj-stop") {
          webrtcConnectedRef.current = false;
          stopRelayAudio();
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
          relayTimer = setTimeout(requestRelay, 3500);
        }
      });

    return () => {
      if (relayTimer) clearTimeout(relayTimer);
      pcRef.current?.close();
      pcRef.current = null;
      supabase?.removeChannel(signalChannel);
      stopAllAudio();
    };
  }, [audioUnlocked, sesion?.codigo_evento, sesion?.canal, startBackupBeat, stopBackupBeat, stopRelayAudio, stopAllAudio]);

  async function handleUnlockAudio() {
    setAudioUnlocked(true);
    if (audioRef.current) {
      audioRef.current.muted = muted;
      audioRef.current.play().catch(() => {});
    }
    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass && !relayCtxRef.current) {
        const ctx = new AudioContextClass();
        if (ctx.state === "suspended") await ctx.resume();
        relayCtxRef.current = ctx;
      }
    } catch {
      // Opcional
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
      if (relayCtxRef.current?.state === "running") {
        relayCtxRef.current.suspend().catch(() => {});
      }
    } else {
      if (relayCtxRef.current?.state === "suspended") {
        relayCtxRef.current.resume().catch(() => {});
      }
      if (djStatus === "backup" && sesion?.estado === "activo") {
        startBackupBeat();
      }
    }
  }

  async function handleLocalPinUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (pinInput.trim() !== "2026" || !sesion) return;

    if (supabase && !sesion.id.startsWith("loc-")) {
      await supabase
        .from("sesiones_sin_pantallas")
        .update({ estado: "activo", updated_at: new Date().toISOString() })
        .eq("id", sesion.id);
    } else {
      const updated = updateLocalSession(sesion.id, { estado: "activo" });
      if (updated) setSesion(updated);
      if (djStatus === "backup" && !muted) startBackupBeat();
    }
    setPinInput("");
  }

  async function handleFinish() {
    stopAllAudio();
    pcRef.current?.close();
    pcRef.current = null;
    wakeLockRef.current?.release().catch(() => {});
    if (sesion) {
      if (supabase && !sesion.id.startsWith("loc-")) {
        await supabase
          .from("sesiones_sin_pantallas")
          .update({
            estado: "finalizado",
            tiempo_activo_seg: seconds,
            updated_at: new Date().toISOString(),
          })
          .eq("id", sesion.id);
      } else {
        updateLocalSession(sesion.id, { estado: "finalizado", tiempo_activo_seg: seconds });
      }
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
        <p className="text-sm text-zinc-300">No hay una sesión activa registrada o tu folio expiró.</p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full bg-[#C9F72D] px-5 py-3 text-sm font-extrabold text-[#0b0d10]"
        >
          <ArrowLeft className="h-4 w-4" />
          Ir al Check-in
        </Link>
      </div>
    );
  }

  const litDots = Math.min(24, Math.floor(seconds / 15));

  return (
    <div className="flex flex-1 flex-col justify-between gap-4">
      <audio ref={audioRef} autoPlay playsInline className="hidden" />

      <header className="flex items-center justify-between">
        <div className="inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-[#14171D] py-1.5 pl-3 pr-4">
          <span className="h-2.5 w-2.5 rounded-full bg-[#C9F72D]" />
          <div>
            <p className="text-xs font-extrabold text-white">{sesion.alias}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              {sesion.folio} · {sesion.codigo_evento}
            </p>
          </div>
        </div>

        <button
          onClick={toggleMute}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-[#14171D] text-white transition hover:border-[#C9F72D]"
          aria-label="Silenciar"
        >
          {muted ? (
            <VolumeX className="h-4 w-4 text-[#FF4D2E]" />
          ) : (
            <Volume2 className="h-4 w-4 text-[#C9F72D]" />
          )}
        </button>
      </header>

      {sesion.estado === "bloqueado" ? (
        <section className="flex flex-1 flex-col justify-between rounded-[28px] bg-[#FF4D2E] p-6 text-[#0b0d10]">
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-[#0b0d10] px-3 py-1 text-[11px] font-bold uppercase text-[#FF4D2E]">
              Sesión pausada
            </span>
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0b0d10] text-[#FF4D2E]">
              <Lock className="h-5 w-5" />
            </span>
          </div>

          <div className="my-6">
            <h2 className="text-3xl font-extrabold leading-tight md:text-4xl">
              Saliste de la pista.
            </h2>
            <p className="mt-2 text-sm font-medium text-[#0b0d10]/85">
              Cambiaste de app o minimizaste la pantalla. La música se detuvo y acumulaste{" "}
              <strong>{sesion.faltas} falta(s)</strong>.
            </p>
          </div>

          <div className="space-y-3 rounded-[22px] bg-[#0b0d10] p-4 text-white">
            <p className="text-xs text-zinc-300">
              Pide al organizador que te reactive desde la Cabina DJ o ingresa el PIN:
            </p>
            <form onSubmit={handleLocalPinUnlock} className="flex max-w-sm gap-2">
              <input
                type="password"
                inputMode="numeric"
                placeholder="PIN (2026)"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                className="flex-1 rounded-full border border-white/15 bg-[#14171D] px-4 py-2 text-center text-sm font-bold text-white outline-none focus:border-[#C9F72D]"
              />
              <button
                type="submit"
                className="rounded-full bg-[#C9F72D] px-5 py-2 text-xs font-extrabold text-[#0b0d10]"
              >
                Reactivar
              </button>
            </form>
          </div>
        </section>
      ) : !audioUnlocked ? (
        <section className="flex flex-1 flex-col justify-between rounded-[28px] bg-[#C9F2E3] p-6 text-[#0b0d10] md:p-8">
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-[#0b0d10] px-3 py-1 text-[11px] font-bold uppercase text-[#C9F2E3]">
              Paso 2 de 3
            </span>
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0b0d10] text-[#C9F72D]">
              <Headphones className="h-5 w-5" />
            </span>
          </div>

          <div className="my-8 max-w-lg">
            <h2 className="text-3xl font-extrabold leading-tight md:text-4xl">
              Ponte tus audífonos y entra.
            </h2>
            <p className="mt-2.5 text-sm font-medium text-[#0b0d10]/75">
              Toca el botón inferior para desbloquear el audio en tu dispositivo y comenzar a
              sumar tiempo sin pantallas.
            </p>
          </div>

          <button
            onClick={handleUnlockAudio}
            className="flex w-full max-w-md items-center justify-between rounded-full bg-[#0b0d10] py-2 pl-5 pr-2 text-sm font-extrabold text-[#C9F72D] transition hover:opacity-90"
          >
            <span>Conectar audífonos</span>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#C9F72D] text-[#0b0d10]">
              <ArrowUpRight className="h-4 w-4" />
            </span>
          </button>
        </section>
      ) : (
        <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-12 md:gap-5">
          <div className="flex flex-col gap-3 md:col-span-6">
            <section className="rounded-[28px] bg-[#C9F2E3] p-5 text-[#0b0d10] md:p-6">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider opacity-70">
                  Tiempo sin pantallas
                </span>
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0b0d10] text-[#C9F72D]">
                  <Check className="h-3.5 w-3.5 stroke-[3]" />
                </span>
              </div>
              <p className="tabular-nums text-5xl font-extrabold tracking-tight md:text-6xl">
                {formatClock(seconds)}
              </p>
              <div className="mt-1 flex gap-16 text-[10px] font-bold uppercase tracking-widest opacity-60">
                <span>MIN</span>
                <span>SEG</span>
              </div>
            </section>

            <section className="rounded-[28px] bg-[#C9F72D] p-5 text-[#0b0d10]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Radio className="h-4 w-4 stroke-[2.5]" />
                  <span className="text-xs font-extrabold uppercase tracking-wider">
                    {djStatus === "conectado"
                      ? "DJ en vivo conectado"
                      : djStatus === "backup"
                      ? "Canal Backup activo"
                      : "Esperando señal del DJ"}
                  </span>
                </div>
                <span className="rounded-full bg-[#0b0d10] px-2.5 py-0.5 text-[10px] font-bold text-[#C9F72D]">
                  {sesion.faltas} FALTAS
                </span>
              </div>

              {djStatus === "esperando" && (
                <button
                  type="button"
                  onClick={() => {
                    setDjStatus("backup");
                    if (!muted) startBackupBeat();
                  }}
                  className="mt-3 rounded-full bg-[#0b0d10] px-4 py-2 text-xs font-bold text-[#C9F72D]"
                >
                  Activar beat de respaldo mientras entra el DJ
                </button>
              )}
            </section>
          </div>

          <section className="flex flex-col justify-between rounded-[28px] border border-white/10 bg-[#14171D] p-5 md:col-span-6 md:p-6">
            <div>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-bold text-white">Racha de enfoque</span>
                <span className="text-[11px] font-semibold text-zinc-400">
                  {litDots}/24 bloques
                </span>
              </div>
              <div className="grid grid-cols-8 gap-2">
                {Array.from({ length: 24 }).map((_, i) => (
                  <div
                    key={i}
                    className={`aspect-square rounded-lg transition-colors ${
                      i < litDots ? "bg-[#C9F72D]" : "bg-white/10"
                    }`}
                  />
                ))}
              </div>
            </div>
            <p className="mt-4 text-xs text-zinc-400">
              Cada cuadro se ilumina cada 15 segundos continuos sin abandonar esta pantalla.
            </p>
          </section>
        </div>
      )}

      <footer>
        <button
          onClick={handleFinish}
          className="flex w-full items-center justify-between rounded-full border border-white/15 bg-[#14171D] py-2 pl-5 pr-2 text-xs font-bold text-white transition hover:border-[#C9F72D]"
        >
          <span>Terminar sesión y ver mi folio</span>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white">
            <LogOut className="h-4 w-4" />
          </span>
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
