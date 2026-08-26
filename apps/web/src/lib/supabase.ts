import { createClient, type Session, type User } from "@supabase/supabase-js";

const url = import.meta.env?.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env?.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isCloudMode =
  (import.meta.env?.VITE_LIS_MODE as string | undefined) === "cloud";

export const supabaseConfigured = Boolean(url && anon);

export const supabase =
  url && anon
    ? createClient(url, anon, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;

export type ProfileRole = "tech" | "authorizer" | "admin";

export type Profile = {
  id: string;
  email: string | null;
  role: ProfileRole;
  full_name: string | null;
};

export async function fetchProfile(userId: string): Promise<Profile | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, role, full_name")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data as Profile;
}

export async function updateProfile(
  userId: string,
  patch: { full_name: string },
): Promise<Profile> {
  if (!supabase) {
    throw new Error("Supabase is not configured");
  }
  const { data, error } = await supabase
    .from("profiles")
    .update({
      full_name: patch.full_name.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .select("id, email, role, full_name")
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "Could not update profile");
  }
  return data as Profile;
}

export type { Session, User };
