/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LIS_API_URL?: string;
  readonly VITE_CLOUD_API_URL?: string;
  readonly VITE_LIS_MODE?: string;
  readonly VITE_WS_URL?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
