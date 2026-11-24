import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabaseAnonKey && !supabaseUrl.includes("tu-proyecto")
);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export type SesionEstado = "activo" | "bloqueado" | "finalizado";

export interface SesionSinPantallas {
  id: string;
  folio: string;
  alias: string;
  codigo_evento: string;
  canal: string;
  estado: SesionEstado;
  tiempo_activo_seg: number;
  faltas: number;
  created_at: string;
  updated_at: string;
}

export const FOLIO_TTL_MS = 30 * 60 * 1000; // 30 minutos

export function getCutoffIso(): string {
  return new Date(Date.now() - FOLIO_TTL_MS).toISOString();
}

export function isSessionExpired(
  sesion: Pick<SesionSinPantallas, "updated_at" | "created_at">
): boolean {
  const refTime = new Date(sesion.updated_at || sesion.created_at).getTime();
  if (Number.isNaN(refTime)) return false;
  return Date.now() - refTime > FOLIO_TTL_MS;
}

const LOCAL_KEY = "sp_sesiones_local_v1";

export function listLocalSessions(): SesionSinPantallas[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SesionSinPantallas[];
    const active = parsed.filter((s) => !isSessionExpired(s));
    if (active.length !== parsed.length) {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(active));
    }
    return active;
  } catch {
    return [];
  }
}

export function saveLocalSession(sesion: SesionSinPantallas): void {
  if (typeof window === "undefined") return;
  const all = listLocalSessions().filter((s) => s.id !== sesion.id);
  all.unshift(sesion);
  localStorage.setItem(LOCAL_KEY, JSON.stringify(all.slice(0, 50)));
}

export function getLocalSession(id: string): SesionSinPantallas | null {
  return listLocalSessions().find((s) => s.id === id) || null;
}

export function getLocalSessionByFolio(folio: string): SesionSinPantallas | null {
  return (
    listLocalSessions().find((s) => s.folio.toUpperCase() === folio.toUpperCase()) || null
  );
}

export function updateLocalSession(
  id: string,
  patch: Partial<SesionSinPantallas>
): SesionSinPantallas | null {
  const current = getLocalSession(id);
  if (!current) return null;
  const updated = { ...current, ...patch, updated_at: new Date().toISOString() };
  saveLocalSession(updated);
  return updated;
}

export async function purgeExpiredSessions(): Promise<void> {
  listLocalSessions();
  if (!supabase) return;
  try {
    await supabase
      .from("sesiones_sin_pantallas")
      .delete()
      .lt("updated_at", getCutoffIso());
  } catch {
    // Si RLS aún no tiene política de delete, el filtro por updated_at en lecturas sigue aplicando
  }
}
