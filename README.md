# Sin Pantallas — Prototipo MVP (Ruta B)

Aplicación web funcional de **Silent Party + Modo Enfoque** con transmisión de audio del DJ en vivo vía WebRTC y persistencia en Supabase.

## 1. Configurar Supabase (1 minuto)
1. Crea un proyecto gratuito en Supabase (o usa uno existente).
2. Ve a **SQL Editor**, pega el contenido de `supabase_schema.sql` y ejecútalo.
3. En **Project Settings → API**, copia tu `Project URL` y tu `anon public key`.

## 2. Correr en local y desplegar en Vercel
```bash
npm install
cp .env.example .env.local
# Pega tu NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local
npm run dev
```

## 3. Cómo probar el audio del DJ en vivo y el bloqueo
1. **En la laptop o teléfono del DJ:** abre `/dj`, elige tu micrófono o interfaz de audio y toca **"Transmitir audio en vivo"**.
2. **En el teléfono del asistente (otro dispositivo):** abre `/`, escribe un alias de prueba, elige **DJ en Vivo** y toca **"Entrar a la pista"**.
3. En `/pista`, toca **"Conectar audífonos y empezar"**. Escucharás al DJ en tiempo real y el cronómetro avanzará.
4. **Prueba de salida:** cambia de app o minimiza el navegador; el audio se detendrá, sumará 1 falta y se bloqueará la pantalla hasta que el organizador presione **"Reactivar"** en `/dj` (o uses el PIN `2026`).
5. Al terminar, toca **"Terminar sesión y ver mi folio"** para consultar el comprobante guardado en `/folio`.
