const API_BASE = import.meta.env.VITE_API_URL ?? "";

let refreshInFlight: Promise<boolean> | null = null;

export function getAccessToken(): string | null {
  return localStorage.getItem("token");
}

export function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.dispatchEvent(new Event("auth:expired"));
}

export async function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${API_BASE}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
      .then(async (res) => {
        if (!res.ok) return false;
        const body = await res.json().catch(() => null);
        const token = body?.data?.accessToken;
        if (!token) return false;
        localStorage.setItem("token", token);
        window.dispatchEvent(new CustomEvent("auth:token", { detail: token }));
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

export function authHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return headers;
}

export async function apiFetch(
  path: string,
  options: RequestInit = {},
  allowRefresh = true
): Promise<Response> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: authHeaders(options.headers),
  });

  if (response.status !== 401 || !allowRefresh) return response;

  const refreshed = await refreshSession();
  if (!refreshed) {
    clearSession();
    return response;
  }
  return apiFetch(path, options, false);
}
