import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch as request, clearSession, getAccessToken } from "../lib/api";

interface User {
  id: string;
  email: string;
  name: string;
}

interface AuthContextType {
  token: string | null;
  user: User | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  apiFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getAccessToken());
  const [user, setUser] = useState<User | null>(() => {
    const savedUser = localStorage.getItem("user");
    return savedUser ? JSON.parse(savedUser) : null;
  });

  const navigate = useNavigate();

  const login = useCallback((newToken: string, newUser: User) => {
    localStorage.setItem("token", newToken);
    localStorage.setItem("user", JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }, []);

  const logout = useCallback(() => {
    const current = getAccessToken();
    fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
      headers: current ? { Authorization: `Bearer ${current}` } : {},
    }).catch(() => {});
    clearSession();
  }, []);

  useEffect(() => {
    const onExpired = () => {
      setToken(null);
      setUser(null);
      navigate("/login", { replace: true });
    };
    const onToken = (event: Event) => {
      const next = (event as CustomEvent<string>).detail;
      if (next) setToken(next);
    };
    window.addEventListener("auth:expired", onExpired);
    window.addEventListener("auth:token", onToken);
    return () => {
      window.removeEventListener("auth:expired", onExpired);
      window.removeEventListener("auth:token", onToken);
    };
  }, [navigate]);

  useEffect(() => {
    if (!getAccessToken()) return;
    let cancelled = false;
    request("/api/auth/me")
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          clearSession();
          return;
        }
        const body = await res.json().catch(() => null);
        if (body?.data) {
          const fresh: User = {
            id: body.data.id,
            email: body.data.email,
            name: body.data.name ?? "",
          };
          localStorage.setItem("user", JSON.stringify(fresh));
          setUser(fresh);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AuthContext.Provider value={{ token, user, login, logout, apiFetch: request }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
