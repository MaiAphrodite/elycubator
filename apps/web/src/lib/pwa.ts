/**
 * Service worker registration. Production only: in dev it would fight Vite's
 * module reloading and cache half-rebuilt chunks.
 */
export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* offline support is a bonus, never a reason to break the app */
    });
  });
}
