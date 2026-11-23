"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Disc3,
  Mic,
  MicOff,
  Music,
  RefreshCw,
  Unlock,
  Users,
} from "lucide-react";
import {
  supabase,
  isSupabaseConfigured,
  SesionSinPantallas,
  listLocalSessions,
  updateLocalSession,
} from "@/lib/supabase";
import { ICE_SERVERS, SignalMessage } from "@/lib/webrtc";

export default function DjPanelPage() {
  const [codigoEvento, setCodigoEvento] = useState("BERLIN-UTVAM");
  const [sourceMode, setSourceMode] = useState<"mic" | "file">("mic");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [audioFileUrl, setAudioFileUrl] = useState<string | null>(null);
  const [audioFileName, setAudioFileName] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [sesiones, setSesiones] = useState<SesionSinPantallas[]>([]);
  const [error, setError] = useState("");

  const streamRef = useRef<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const signalChannelRef = useRef<ReturnType<NonNullable<typeof supabase>["channel"]> | null>(null);
  const meterAnimRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  async function loadAudioInputs() {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const inputs = list.filter((d) => d.kind === "audioinput");
      setDevices(inputs);
      if (inputs[0] && !selectedDeviceId) setSelectedDeviceId(inputs[0].deviceId);
    } catch {
      // Permiso pendiente hasta activar micrófono
    }
  }

  async function fetchSesiones() {
    if (!supabase) {
      setSesiones(listLocalSessions());
      return;
    }
    const { data } = await supabase
      .from("sesiones_sin_pantallas")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) setSesiones(data as SesionSinPantallas[]);
  }

  useEffect(() => {
    loadAudioInputs();
    fetchSesiones();

    if (!supabase) return;
    const dbSub = supabase
      .channel("panel-organizador")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sesiones_sin_pantallas" },
        () => {
          fetchSesiones();
        }
      )
      .subscribe();

    return () => {
      supabase?.removeChannel(dbSub);
    };
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (audioFileUrl) URL.revokeObjectURL(audioFileUrl);
    const url = URL.createObjectURL(file);
    setAudioFileUrl(url);
    setAudioFileName(file.name);
    setError("");
  }

  async function startBroadcast() {
    setError("");

    try {
      let stream: MediaStream;
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioContextClass();
      audioCtxRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();

      if (sourceMode === "file") {
        if (!audioFileUrl || !audioElRef.current) {
          setError("Selecciona primero un archivo MP3 o WAV para transmitir.");
          return;
        }
        audioElRef.current.src = audioFileUrl;
        audioElRef.current.loop = true;
        await audioElRef.current.play();

        const mediaSource = ctx.createMediaElementSource(audioElRef.current);
        const dest = ctx.createMediaStreamDestination();
        mediaSource.connect(dest);
        mediaSource.connect(ctx.destination);
        stream = dest.stream;

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        mediaSource.connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateMeter = () => {
          analyser.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
          meterAnimRef.current = requestAnimationFrame(updateMeter);
        };
        updateMeter();
      } else {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
        await loadAudioInputs();

        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateMeter = () => {
          analyser.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
          meterAnimRef.current = requestAnimationFrame(updateMeter);
        };
        updateMeter();
      }

      streamRef.current = stream;

      if (isSupabaseConfigured && supabase) {
        const roomName = `webrtc-sp-${codigoEvento.trim().toUpperCase()}`;
        const channel = supabase.channel(roomName);
        signalChannelRef.current = channel;

        const connectToListener = async (listenerId: string) => {
          peersRef.current.get(listenerId)?.close();
          const pc = new RTCPeerConnection(ICE_SERVERS);
          peersRef.current.set(listenerId, pc);

          stream.getTracks().forEach((track) => pc.addTrack(track, stream));

          pc.onicecandidate = (event) => {
            if (event.candidate) {
              channel.send({
                type: "broadcast",
                event: "signal",
                payload: {
                  type: "ice-candidate",
                  listenerId,
                  from: "dj",
                  candidate: event.candidate.toJSON(),
                } satisfies SignalMessage,
              });
            }
          };

          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          channel.send({
            type: "broadcast",
            event: "signal",
            payload: { type: "offer", listenerId, sdp: offer } satisfies SignalMessage,
          });
        };

        channel
          .on("broadcast", { event: "signal" }, async ({ payload }) => {
            const msg = payload as SignalMessage;
            if (msg.type === "listener-join") {
              await connectToListener(msg.listenerId);
            } else if (msg.type === "answer") {
              const pc = peersRef.current.get(msg.listenerId);
              if (pc) await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
            } else if (msg.type === "ice-candidate" && msg.from === "listener") {
              const pc = peersRef.current.get(msg.listenerId);
              if (pc) await pc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(() => {});
            }
          })
          .subscribe((status) => {
            if (status === "SUBSCRIBED") {
              channel.send({
                type: "broadcast",
                event: "signal",
                payload: { type: "dj-ready" } satisfies SignalMessage,
              });
            }
          });
      }

      setIsStreaming(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? `No se pudo iniciar el audio: ${err.message}`
          : "Permiso de micrófono/interfaz denegado."
      );
    }
  }

  function stopBroadcast() {
    if (meterAnimRef.current) cancelAnimationFrame(meterAnimRef.current);
    audioElRef.current?.pause();
    signalChannelRef.current?.send({
      type: "broadcast",
      event: "signal",
      payload: { type: "dj-stop" } satisfies SignalMessage,
    });
    if (signalChannelRef.current && supabase) {
      supabase.removeChannel(signalChannelRef.current);
    }
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setAudioLevel(0);
    setIsStreaming(false);
  }

  async function handleReactivate(id: string) {
    if (!supabase || id.startsWith("loc-")) {
      updateLocalSession(id, { estado: "activo" });
      fetchSesiones();
      return;
    }
    await supabase
      .from("sesiones_sin_pantallas")
      .update({ estado: "activo", updated_at: new Date().toISOString() })
      .eq("id", id);
    fetchSesiones();
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <audio ref={audioElRef} className="hidden" />

      <header className="flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#14171D] px-3.5 py-2 text-xs font-semibold text-white hover:border-[#C9F72D]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Check-in
        </Link>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#C9F72D] px-3.5 py-2 text-[11px] font-extrabold uppercase tracking-wider text-[#0b0d10]">
          <Disc3 className="h-3.5 w-3.5" />
          Cabina DJ
        </span>
      </header>

      <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-12 md:gap-5">
        <section className="flex flex-col justify-between space-y-4 rounded-[28px] border border-white/10 bg-[#14171D] p-5 md:col-span-5">
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                Código del evento
              </label>
              <input
                type="text"
                value={codigoEvento}
                onChange={(e) => setCodigoEvento(e.target.value)}
                disabled={isStreaming}
                className="w-full rounded-2xl border border-white/10 bg-[#0b0d10] px-4 py-2.5 text-sm font-bold uppercase text-white outline-none focus:border-[#C9F72D] disabled:opacity-60"
              />
            </div>

            <div>
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                Fuente del DJ
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isStreaming}
                  onClick={() => setSourceMode("mic")}
                  className={`flex items-center justify-center gap-1.5 rounded-2xl py-2.5 text-xs font-bold transition ${
                    sourceMode === "mic"
                      ? "bg-[#C9F2E3] text-[#0b0d10]"
                      : "border border-white/10 bg-[#0b0d10] text-zinc-300"
                  }`}
                >
                  <Mic className="h-3.5 w-3.5" />
                  Mic / Interfaz
                </button>
                <button
                  type="button"
                  disabled={isStreaming}
                  onClick={() => setSourceMode("file")}
                  className={`flex items-center justify-center gap-1.5 rounded-2xl py-2.5 text-xs font-bold transition ${
                    sourceMode === "file"
                      ? "bg-[#C9F2E3] text-[#0b0d10]"
                      : "border border-white/10 bg-[#0b0d10] text-zinc-300"
                  }`}
                >
                  <Music className="h-3.5 w-3.5" />
                  Pista MP3/WAV
                </button>
              </div>
            </div>

            {sourceMode === "mic" ? (
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  Entrada de audio
                </label>
                <select
                  value={selectedDeviceId}
                  onChange={(e) => setSelectedDeviceId(e.target.value)}
                  disabled={isStreaming}
                  className="w-full rounded-2xl border border-white/10 bg-[#0b0d10] px-4 py-2.5 text-xs font-medium text-white outline-none focus:border-[#C9F72D]"
                >
                  {devices.length === 0 ? (
                    <option value="">Entrada predeterminada del dispositivo</option>
                  ) : (
                    devices.map((d, idx) => (
                      <option key={d.deviceId || idx} value={d.deviceId}>
                        {d.label || `Entrada de audio ${idx + 1}`}
                      </option>
                    ))
                  )}
                </select>
              </div>
            ) : (
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  Archivo de audio local
                </label>
                <input
                  type="file"
                  accept="audio/*"
                  disabled={isStreaming}
                  onChange={handleFileChange}
                  className="w-full rounded-2xl border border-white/10 bg-[#0b0d10] px-3 py-2 text-xs text-zinc-300 file:mr-3 file:rounded-full file:border-0 file:bg-[#C9F72D] file:px-3 file:py-1 file:text-xs file:font-bold file:text-[#0b0d10]"
                />
                {audioFileName && (
                  <p className="mt-1 truncate text-[11px] text-[#C9F72D]">{audioFileName}</p>
                )}
              </div>
            )}

            {isStreaming && (
              <div className="space-y-1.5 rounded-2xl bg-[#0b0d10] p-3">
                <div className="flex justify-between text-[11px] font-semibold text-zinc-400">
                  <span>
                    {isSupabaseConfigured
                      ? "Transmitiendo en vivo (WebRTC)"
                      : "Cabina activa en modo local"}
                  </span>
                  <span className="tabular-nums text-[#C9F72D]">{audioLevel}%</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-[#C9F72D] transition-all duration-75"
                    style={{ width: `${audioLevel}%` }}
                  />
                </div>
              </div>
            )}

            {!isSupabaseConfigured && (
              <p className="rounded-2xl bg-[#0b0d10] px-3.5 py-2.5 text-[11px] text-zinc-400">
                Modo local activo. Agrega tus variables de Supabase en Vercel para enviar el audio
                a otros teléfonos.
              </p>
            )}

            {error && <p className="text-xs font-medium text-[#FF8A75]">{error}</p>}
          </div>

          {!isStreaming ? (
            <button
              onClick={startBroadcast}
              className="flex w-full items-center justify-between rounded-full bg-[#C9F72D] py-2 pl-5 pr-2 text-sm font-extrabold text-[#0b0d10] transition hover:brightness-105"
            >
              <span>Transmitir audio en vivo</span>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0b0d10] text-[#C9F72D]">
                <Mic className="h-4 w-4" />
              </span>
            </button>
          ) : (
            <button
              onClick={stopBroadcast}
              className="flex w-full items-center justify-between rounded-full bg-[#FF4D2E] py-2 pl-5 pr-2 text-sm font-extrabold text-white"
            >
              <span>Detener transmisión</span>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0b0d10] text-[#FF4D2E]">
                <MicOff className="h-4 w-4" />
              </span>
            </button>
          )}
        </section>

        <section className="flex flex-col space-y-3 md:col-span-7">
          <div className="flex items-center justify-between px-1">
            <h2 className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-white">
              <Users className="h-4 w-4 text-[#C9F72D]" />
              En pista ({sesiones.length})
            </h2>
            <button
              onClick={fetchSesiones}
              className="inline-flex items-center gap-1 rounded-full bg-[#14171D] px-3 py-1 text-[11px] font-semibold text-zinc-300 hover:text-white"
            >
              <RefreshCw className="h-3 w-3" />
              Actualizar
            </button>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
            {sesiones.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-[22px] border border-white/10 bg-[#14171D] px-4 py-3"
              >
                <div>
                  <p className="text-sm font-bold text-white">
                    {s.alias}{" "}
                    <span className="font-mono text-xs font-medium text-zinc-500">
                      {s.folio}
                    </span>
                  </p>
                  <p className="text-xs text-zinc-400">
                    <span
                      className={
                        s.estado === "activo"
                          ? "font-bold text-[#C9F72D]"
                          : s.estado === "bloqueado"
                          ? "font-bold text-[#FF4D2E]"
                          : "text-zinc-300"
                      }
                    >
                      {s.estado}
                    </span>{" "}
                    · {s.tiempo_activo_seg}s · {s.faltas} faltas
                  </p>
                </div>
                {s.estado === "bloqueado" && (
                  <button
                    onClick={() => handleReactivate(s.id)}
                    className="inline-flex items-center gap-1 rounded-full bg-[#C9F72D] px-3.5 py-1.5 text-xs font-extrabold text-[#0b0d10]"
                  >
                    <Unlock className="h-3.5 w-3.5" />
                    Reactivar
                  </button>
                )}
              </div>
            ))}
            {sesiones.length === 0 && (
              <p className="col-span-full rounded-[22px] border border-white/10 bg-[#14171D] p-5 text-center text-xs text-zinc-500">
                Aún no hay asistentes registrados.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
