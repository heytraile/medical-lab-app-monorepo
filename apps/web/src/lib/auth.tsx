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
  isCloudMode,
  profileFromAuthUser,
  supabase,
  supabaseConfigured,
  updateProfile,
  type Profile,
  type ProfileRole,
  type Session,
} from "./supabase";
import {
  setAuthInvalidatedHandler,
  setCloudAuthRefreshProvider,
  setCloudAuthTokenProvider,
  setEdgeAuthRefreshProvider,
  setEdgeAuthTokenProvider,
  type AuthInvalidationScope,
  api,
} from "./api";
import {
  clearStoredDevice,
  getStoredDevice,
  storeDevice,
  type StoredDevice,
} from "./device";

type AuthState = {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  role: ProfileRole | null;
  /** Access token for the API (edge JWT, Supabase JWT, or dev:role when unset). */
  accessToken: string | null;
  /** Edge JWT when signed in on the lab PC (edge mode). */
  edgeAccessToken: string | null;
  /** Supabase JWT for cloud API calls — separate from edge JWT in edge mode. */
  cloudAccessToken: string | null;
  /** True when cloud API calls can authenticate (Supabase session or cloud-mode dev token). */
  hasCloudSession: boolean;
  /** True when using localStorage dev role (no real session). */
  isDevSession: boolean;
  displayName: string;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Dev-only: pretend to be a role when nothing else is configured */
  useDevRole: (role: ProfileRole) => void;
  refreshProfile: () => Promise<void>;
  saveFullName: (fullName: string) => Promise<void>;
  /** Cloud mode only — signed in but this browser has no lab-issued device yet. */
  needsDeviceEnrollment: boolean;
  /** Cloud mode only — call after redeeming a one-time enrollment code. */
  completeDeviceEnrollment: (device: StoredDevice) => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

const DEV_TOKEN_KEY = "lis-dev-role";
const EDGE_TOKEN_KEY = "lis-edge-token";

type EdgeSession = {
  accessToken: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: ProfileRole;
  };
};

function profileFromEdgeUser(user: EdgeSession["user"]): Profile {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    full_name: user.fullName,
  };
}

async function validateSupabaseSession(session: Session): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.auth.getUser(session.access_token);
  return !error && Boolean(data.user);
}

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
  // --- Edge mode: offline-capable login against this lab's own edge API ---
  const [edgeSession, setEdgeSession] = useState<EdgeSession | null>(() => {
    if (typeof window === "undefined" || isCloudMode) return null;
    const raw = localStorage.getItem(EDGE_TOKEN_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as EdgeSession;
    } catch {
      return null;
    }
  });

  // --- Cloud mode: Supabase Auth (admin/authorizer only) ---
  const [ready, setReady] = useState(!isCloudMode || !supabaseConfigured);
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
    if (typeof window === "undefined" || !isCloudMode) return null;
    if (supabaseConfigured) return null;
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
  const [deviceVersion, setDeviceVersion] = useState(0);

  useEffect(() => {
    if (!isCloudMode) {
      setReady(true);
      if (!supabaseConfigured || !supabase) return;

      // Edge mode still needs Supabase session for admin/authorizer cloud API
      // calls (release queue, review requests) after dual login at sign-in.
      const client = supabase;
      let cancelled = false;
      void client.auth.getSession().then(({ data }) => {
        if (cancelled) return;
        setSession(data.session);
      });
      const { data: sub } = client.auth.onAuthStateChange((_event, next) => {
        setSession(next);
      });
      return () => {
        cancelled = true;
        sub.subscription.unsubscribe();
      };
    }

    if (!supabaseConfigured || !supabase) {
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

    const client = supabase;
    let cancelled = false;
    void client.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      const nextSession = data.session;
      if (nextSession) {
        const valid = await validateSupabaseSession(nextSession);
        if (!valid) {
          await client.auth.signOut();
          setSession(null);
          setProfile(null);
          setReady(true);
          return;
        }
      }
      setSession(nextSession);
      if (nextSession?.user) {
        setDevRole(null);
        localStorage.removeItem(DEV_TOKEN_KEY);
        const loaded =
          (await fetchProfile(nextSession.user.id)) ??
          profileFromAuthUser(nextSession.user);
        setProfile(loaded);
      }
      setReady(true);
    });

    const { data: sub } = client.auth.onAuthStateChange(async (_event, next) => {
      if (next?.access_token) {
        const valid = await validateSupabaseSession(next);
        if (!valid) {
          await client.auth.signOut();
          setSession(null);
          setProfile(null);
          return;
        }
      }
      setSession(next);
      if (next?.user) {
        setDevRole(null);
        localStorage.removeItem(DEV_TOKEN_KEY);
        void (async () => {
          const loaded =
            (await fetchProfile(next.user.id)) ?? profileFromAuthUser(next.user);
          setProfile(loaded);
        })();
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

  useEffect(() => {
    setEdgeAuthRefreshProvider(async () => edgeSession?.accessToken ?? null);

    setCloudAuthRefreshProvider(async () => {
      if (devRole) return `dev:${devRole}`;
      if (!supabase) return null;
      const { data, error } = await supabase.auth.refreshSession();
      if (error || !data.session) return null;
      setSession(data.session);
      return data.session.access_token;
    });

    setAuthInvalidatedHandler((scope: AuthInvalidationScope) => {
      void (async () => {
        if (scope === "cloud" || scope === "all") {
          setDevRole(null);
          localStorage.removeItem(DEV_TOKEN_KEY);
          if (supabase) await supabase.auth.signOut();
          setSession(null);
          if (isCloudMode) setProfile(null);
        }
        if (scope === "edge" || scope === "all") {
          setEdgeSession(null);
          localStorage.removeItem(EDGE_TOKEN_KEY);
        }
      })();
    });
  }, [devRole, edgeSession]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!isCloudMode) {
      const result = await api.edgeLogin(email, password);
      const next: EdgeSession = {
        accessToken: result.accessToken,
        user: {
          id: result.user.id,
          email: result.user.email,
          fullName: result.user.fullName,
          role: result.user.role,
        },
      };
      localStorage.setItem(EDGE_TOKEN_KEY, JSON.stringify(next));
      setEdgeSession(next);

      // Admin/authorizer also need a Supabase session for cloud API routes
      // (release queue, review requests) while using the edge SPA locally.
      if (
        supabase &&
        (result.user.role === "admin" || result.user.role === "authorizer")
      ) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          console.warn(
            "[auth] Edge login OK but cloud session failed:",
            error.message,
          );
        }
      }
      return;
    }

    if (!supabase) {
      throw new Error("Sign-in is not available right now.");
    }
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;

    // Cloud login always requires a lab-issued device. If this browser is
    // already enrolled, log the login now; otherwise the enrollment screen
    // (needsDeviceEnrollment) will call completeDeviceEnrollment instead.
    if (getStoredDevice()) {
      await api.deviceSession().catch(() => undefined);
    }
  }, []);

  const signOut = useCallback(async () => {
    setDevRole(null);
    localStorage.removeItem(DEV_TOKEN_KEY);
    if (supabase) await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setEdgeSession(null);
    localStorage.removeItem(EDGE_TOKEN_KEY);
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
    if (!isCloudMode) {
      if (!edgeSession) return;
      const loaded = await api.edgeMe().catch(() => null);
      if (loaded) {
        setEdgeSession((prev) =>
          prev
            ? {
                ...prev,
                user: {
                  id: loaded.id,
                  email: loaded.email,
                  fullName: loaded.fullName,
                  role: loaded.role,
                },
              }
            : prev,
        );
      }
      return;
    }
    const uid = session?.user?.id;
    if (!uid) return;
    const loaded =
      (await fetchProfile(uid)) ??
      (session?.user ? profileFromAuthUser(session.user) : null);
    if (loaded) setProfile(loaded);
  }, [session?.user, edgeSession]);

  const saveFullName = useCallback(
    async (fullName: string) => {
      const uid = session?.user?.id;
      if (!uid) {
        throw new Error("Sign in to update your name.");
      }
      const next = await updateProfile(uid, { full_name: fullName });
      setProfile(next);
    },
    [session?.user?.id],
  );

  const completeDeviceEnrollment = useCallback(
    async (device: StoredDevice) => {
      storeDevice(device);
      setDeviceVersion((v) => v + 1);
      await api.deviceSession().catch(() => undefined);
    },
    [],
  );

  const effectiveProfile = isCloudMode
    ? profile
    : edgeSession
      ? profileFromEdgeUser(edgeSession.user)
      : null;
  const role: ProfileRole | null = isCloudMode
    ? profile?.role ?? devRole
    : edgeSession?.user.role ?? null;
  const isDevSession = isCloudMode && Boolean(devRole) && !session;

  const edgeAccessToken = edgeSession?.accessToken ?? null;

  const cloudAccessToken = useMemo(() => {
    if (session?.access_token) return session.access_token;
    if (isCloudMode && devRole) return `dev:${devRole}`;
    // Edge SPA: release queue and reports call the cloud API. When Supabase
    // sign-in did not attach after edge login (common in local dev), fall back
    // to the same dev bearer the cloud API accepts outside production.
    if (
      !isCloudMode &&
      import.meta.env.DEV &&
      edgeSession &&
      (edgeSession.user.role === "authorizer" ||
        edgeSession.user.role === "admin")
    ) {
      return `dev:${edgeSession.user.role}`;
    }
    return null;
  }, [session, devRole, edgeSession]);

  const hasCloudSession = Boolean(cloudAccessToken);

  const accessToken = useMemo(() => {
    if (!isCloudMode) return edgeAccessToken;
    if (session?.access_token) return session.access_token;
    if (devRole) return `dev:${devRole}`;
    return null;
  }, [session, devRole, edgeAccessToken]);

  const displayName = useMemo(
    () =>
      authDisplayName({
        profile: effectiveProfile,
        role,
        sessionEmail: session?.user?.email,
      }),
    [effectiveProfile, role, session?.user?.email],
  );

  const needsDeviceEnrollment = useMemo(() => {
    if (!isCloudMode) return false;
    if (!session) return false;
    void deviceVersion; // recompute when a device is stored
    return !getStoredDevice();
  }, [session, deviceVersion]);

  const value: AuthState = {
    ready,
    session,
    profile: effectiveProfile,
    role,
    accessToken,
    edgeAccessToken,
    cloudAccessToken,
    hasCloudSession,
    isDevSession,
    displayName,
    signIn,
    signOut,
    useDevRole,
    refreshProfile,
    saveFullName,
    needsDeviceEnrollment,
    completeDeviceEnrollment,
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

export function isAdmin(role: ProfileRole | null): boolean {
  return role === "admin";
}

/** Authorizers and admins may release results and acknowledge review requests. */
export function canAuthorize(role: ProfileRole | null): boolean {
  return role === "authorizer" || role === "admin";
}

/** @deprecated Use canAuthorize */
export function canRelease(role: ProfileRole | null) {
  return canAuthorize(role);
}

export { clearStoredDevice };
