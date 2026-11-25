const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

export type Session = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: "ADMIN" | "MEMBER";
  };
  organization?: {
    id: string;
    name: string;
    slug: string;
    plan: string;
  };
};

const sessionKey = "saas-kit-session";
export const sessionEvent = "northstar-session";

// Some browsers allow reads while rejecting writes (e.g. quota limits).
// Keep this tab's sign-in/sign-out authoritative if a write fails.
let tabSession: Session | null = null;
let tabOnly = false;
export const sessionStore = {
  get(): Session | null {
    if (tabOnly) return tabSession;
    let raw: string | null;
    try { raw = localStorage.getItem(sessionKey); }
    catch { return tabSession; }
    try {
      const candidate: Session | null = raw ? JSON.parse(raw) : null;
      tabSession = candidate?.accessToken && candidate.refreshToken && candidate.user?.id ? candidate : null;
    } catch { tabSession = null; }
    return tabSession;
  },
  set(session: Session) {
    tabSession = session;
    try { localStorage.setItem(sessionKey, JSON.stringify(session)); tabOnly = false; }
    catch { tabOnly = true; }
    window.dispatchEvent(new Event(sessionEvent));
  },
  clear() {
    tabSession = null;
    try { localStorage.removeItem(sessionKey); tabOnly = false; }
    catch { tabOnly = true; }
    window.dispatchEvent(new Event(sessionEvent));
  }
};

export class ApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly details?: Record<string, unknown>) {
    super(message);
  }
}

function request(path: string, options: RequestInit, accessToken?: string) {
  return fetch(API_URL + path, { ...options, headers: {
    "Content-Type": "application/json",
    ...(accessToken ? { Authorization: "Bearer " + accessToken } : {}), ...options.headers
  } });
}

let refreshing: { token: string; promise: Promise<string> } | undefined;
function renew(session: Session): Promise<string> {
  if (refreshing?.token === session.refreshToken) return refreshing.promise;
  const promise = (async () => {
    const response = await request("/auth/refresh", { method: "POST", body: JSON.stringify({ refreshToken: session.refreshToken }) });
    if (sessionStore.get()?.refreshToken !== session.refreshToken) throw new Error("Session changed.");
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) sessionStore.clear();
      throw new ApiError(response.status, response.status === 401 || response.status === 403 ? "Please sign in again." : "Could not renew your session. Try again.");
    }
    const { accessToken, role } = await response.json();
    if (sessionStore.get()?.refreshToken !== session.refreshToken) throw new Error("Session changed.");
    sessionStore.set({ ...session, accessToken, user: { ...session.user, role: role ?? session.user.role } });
    return accessToken;
  })().finally(() => { if (refreshing?.token === session.refreshToken) refreshing = undefined; });
  refreshing = { token: session.refreshToken, promise };
  return promise;
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const session = sessionStore.get();
  let response = await request(path, options, session?.accessToken);
  if (response.status === 401 && session && !path.startsWith("/auth/")) {
    const current = sessionStore.get();
    if (!current || current.refreshToken !== session.refreshToken) throw new Error("Session changed.");
    const token = current.accessToken === session.accessToken ? await renew(current) : current.accessToken;
    response = await request(path, options, token);
  }
  if (response.status === 204) return undefined as T;
  let payload;
  try { payload = await response.json(); }
  catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError(response.ok ? 502 : response.status, response.ok ? "The server returned an unreadable response. Please retry." : "Request failed");
  }
  if (!response.ok) throw new ApiError(response.status, payload?.message ?? "Request failed", payload?.details);
  return payload as T;
}

export const authApi = {
  login: (email: string, password: string) =>
    api<Session>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    }),
  register: (body: { name: string; email: string; password: string; organizationName: string }) =>
    api<Session>("/auth/register", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  logout: (refreshToken?: string) =>
    api<void>("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken })
    })
};
