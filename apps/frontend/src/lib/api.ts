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

export const sessionStore = {
  get: () => {
    const raw = localStorage.getItem("saas-kit-session");
    return raw ? (JSON.parse(raw) as Session) : null;
  },
  set: (session: Session) => localStorage.setItem("saas-kit-session", JSON.stringify(session)),
  clear: () => localStorage.removeItem("saas-kit-session")
};

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const session = sessionStore.get();
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
      ...options.headers
    }
  });

  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message ?? "Request failed");
  }
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
