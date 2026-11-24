-- Tabla principal del prototipo Sin Pantallas (solo datos de prueba, sin datos sensibles)
create table if not exists public.sesiones_sin_pantallas (
  id uuid primary key default gen_random_uuid(),
  folio text not null,
  alias text not null,
  codigo_evento text not null default 'BERLIN-UTVAM',
  canal text not null default 'DJ-EN-VIVO',
  estado text not null default 'activo' check (estado in ('activo', 'bloqueado', 'finalizado')),
  tiempo_activo_seg integer not null default 0,
  faltas integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Habilitar Realtime para sincronizar bloqueos/reactivaciones entre organizador y asistentes
alter publication supabase_realtime add table public.sesiones_sin_pantallas;

-- RLS abierto únicamente para pruebas del prototipo académico (sin datos personales reales)
alter table public.sesiones_sin_pantallas enable row level security;

create policy "Acceso lectura prototipo" on public.sesiones_sin_pantallas
  for select using (true);

create policy "Acceso insercion prototipo" on public.sesiones_sin_pantallas
  for insert with check (true);

create policy "Acceso actualizacion prototipo" on public.sesiones_sin_pantallas
  for update using (true);

create policy "Acceso eliminacion prototipo" on public.sesiones_sin_pantallas
  for delete using (true);