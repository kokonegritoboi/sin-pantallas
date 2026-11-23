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
