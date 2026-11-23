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

const LOCAL_KEY = "sp_sesiones_local_v1";

export function listLocalSessions(): SesionSinPantallas[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as SesionSinPantallas[]) : [];
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
