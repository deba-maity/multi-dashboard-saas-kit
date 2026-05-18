import { createContext, useContext, useMemo, useState } from "react";
import { authApi, Session, sessionStore } from "../lib/api";

type AuthContextValue = {
  session: Session | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => sessionStore.get());

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      login: async (email, password) => {
        const next = await authApi.login(email, password);
        sessionStore.set(next);
        setSession(next);
      },
      logout: async () => {
        const refreshToken = session?.refreshToken;
        sessionStore.clear();
        setSession(null);
        await authApi.logout(refreshToken).catch(() => undefined);
      }
    }),
    [session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
};
