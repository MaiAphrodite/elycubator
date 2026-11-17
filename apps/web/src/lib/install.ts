/**
 * Install (add to home screen) plumbing.
 *
 * Chrome fires `beforeinstallprompt` once per page load, sometimes before React
 * has mounted, so the listener is registered from `main.tsx` at module scope.
 * Catching it in a component effect loses the event and the install button
 * never appears, which is exactly what happened the first time.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function initInstallCapture(): void {
  if (typeof window === "undefined") return;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    emit();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    installed = true;
    emit();
  });
}

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function hasDeferredPrompt(): boolean {
  return deferredPrompt !== null;
}

/** True when the app is already running as an installed app. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function promptInstall(): boolean {
  if (installed || deferredPrompt === null) return false;
  const event = deferredPrompt;
  deferredPrompt = null;
  void event.prompt();
  void event.userChoice.finally(emit);
  emit();
  return true;
}

/** Which instruction string makes sense for this browser. */
export function installHint(): string {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return "Tap Share, then Add to Home Screen.";
  if (/Android/.test(ua)) return "Open the browser menu, then Add to Home screen.";
  return "Use the install icon in the address bar, or the browser menu.";
}
