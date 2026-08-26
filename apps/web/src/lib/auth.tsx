import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  fetchProfile,
  supabase,
  supabaseConfigured,
  updateProfile,
  type Profile,
  type ProfileRole,
  type Session,
} from "./supabase";

type AuthState = {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  role: ProfileRole | null;
  /** Access token for cloud API (or dev:role when Supabase unset). */
  accessToken: string | null;
  /** True when using localStorage dev role (no Supabase session). */
  isDevSession: boolean;
  displayName: string;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Dev-only: pretend to be a role when VITE_SUPABASE_* unset */
  useDevRole: (role: ProfileRole) => void;
  refreshProfile: () => Promise<void>;
  saveFullName: (fullName: string) => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

const DEV_TOKEN_KEY = "lis-dev-role";

export function authDisplayName(input: {
  profile: Profile | null;
  role: ProfileRole | null;
  sessionEmail?: string | null;
}): string {
  const full = input.profile?.full_name?.trim();
  if (full) return full;
  const email = input.profile?.email ?? input.sessionEmail ?? null;
  if (email) {
    const local = email.split("@")[0]?.trim();
    if (local) return local;
  }
  if (input.role) return input.role;
  return "Signed in";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!supabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [devRole, setDevRole] = useState<ProfileRole | null>(() => {
    if (typeof window === "undefined") return null;
    const saved = localStorage.getItem(DEV_TOKEN_KEY);
    if (saved === "tech" || saved === "authorizer" || saved === "admin") {
      return saved;
    }
    return null;
  });
  const [profile, setProfile] = useState<Profile | null>(() => {
    if (typeof window === "undefined" || supabaseConfigured) return null;
    const saved = localStorage.getItem(DEV_TOKEN_KEY);
    if (saved === "tech" || saved === "authorizer" || saved === "admin") {
      return {
        id: `dev-${saved}`,
        email: `${saved}@local.dev`,
        role: saved,
        full_name: `Dev ${saved}`,
      };
    }
    return null;
  });

  useEffect(() => {
    if (!supabaseConfigured || !supabase) {
      // Restore synthetic profile for persisted dev role
      if (devRole) {
        setProfile({
          id: `dev-${devRole}`,
          email: `${devRole}@local.dev`,
          role: devRole,
          full_name: `Dev ${devRole}`,
        });
      }
      setReady(true);
      return;
    }

    let cancelled = false;
    void supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      if (data.session?.user) {
        setDevRole(null);
        localStorage.removeItem(DEV_TOKEN_KEY);
        setProfile(await fetchProfile(data.session.user.id));
      }
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next?.user) {
        setDevRole(null);
        localStorage.removeItem(DEV_TOKEN_KEY);
        void fetchProfile(next.user.id).then(setProfile);
        return;
      }
      const saved = localStorage.getItem(DEV_TOKEN_KEY);
      if (saved === "tech" || saved === "authorizer" || saved === "admin") {
        setDevRole(saved);
        setProfile({
          id: `dev-${saved}`,
          email: `${saved}@local.dev`,
          role: saved,
          full_name: `Dev ${saved}`,
        });
      } else {
        setProfile(null);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      throw new Error("Supabase is not configured");
    }
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    setDevRole(null);
    localStorage.removeItem(DEV_TOKEN_KEY);
    if (supabase) await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }, []);

  const useDevRole = useCallback((role: ProfileRole) => {
    localStorage.setItem(DEV_TOKEN_KEY, role);
    setDevRole(role);
    setSession(null);
    setProfile({
      id: `dev-${role}`,
      email: `${role}@local.dev`,
      role,
      full_name: `Dev ${role}`,
    });
  }, []);

  const refreshProfile = useCallback(async () => {
    const uid = session?.user?.id;
    if (!uid) return;
    setProfile(await fetchProfile(uid));
  }, [session?.user?.id]);

  const saveFullName = useCallback(
    async (fullName: string) => {
      const uid = session?.user?.id;
      if (!uid) {
        throw new Error("Sign in with Supabase to update your name");
      }
      const next = await updateProfile(uid, { full_name: fullName });
      setProfile(next);
    },
    [session?.user?.id],
  );

  const role: ProfileRole | null = profile?.role ?? devRole;
  const isDevSession = Boolean(devRole) && !session;

  const accessToken = useMemo(() => {
    if (session?.access_token) return session.access_token;
    if (devRole) return `dev:${devRole}`;
    return null;
  }, [session, devRole]);

  const displayName = useMemo(
    () =>
      authDisplayName({
        profile,
        role,
        sessionEmail: session?.user?.email,
      }),
    [profile, role, session?.user?.email],
  );

  const value: AuthState = {
    ready,
    session,
    profile,
    role,
    accessToken,
    isDevSession,
    displayName,
    signIn,
    signOut,
    useDevRole,
    refreshProfile,
    saveFullName,
  };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function canRelease(role: ProfileRole | null) {
  return role === "authorizer" || role === "admin";
}
