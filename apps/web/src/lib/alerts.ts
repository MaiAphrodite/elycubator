/**
 * Alert rules and their tiny store.
 *
 * Thresholds are display decisions, so they live here as named constants and
 * every alert spells out the number it tripped, e.g. "39.9°C, 2.1°C above the
 * 37.8°C target". Nothing claims a safe band the firmware does not have.
 *
 * A rule fires when its condition starts being true, stays quiet while it
 * remains true, and only re-fires for critical rules after a repeat window, so
 * a flapping sensor cannot turn the bell into a slot machine.
 */

export type AlertSeverity = "critical" | "warning" | "info";

export interface AppAlert {
  readonly id: string;
  readonly rule: string;
  readonly severity: AlertSeverity;
  readonly title: string;
  readonly detail: string;
  readonly at: number;
  readonly read: boolean;
}

export interface AlertSnapshot {
  readonly alerts: readonly AppAlert[];
  readonly unread: number;
  readonly permission: NotificationPermission | "unsupported";
}

export interface AlertInput {
  readonly temperature: number;
  readonly humidity: number;
  readonly targetTemp: number | null;
  readonly targetHumidity: number | null;
  readonly frameAgeMs: number | null;
  readonly days: number;
}

/** Stop trusting the readings after this long without a frame. */
export const STALE_AFTER_MS = 15_000;
/** Distance from setpoint worth telling someone about. */
export const TEMP_TOLERANCE_C = 1;
export const HUMIDITY_TOLERANCE_PCT = 10;
/** Above this the temperature alert escalates. */
export const TEMP_CRITICAL_C = 2.5;
/** Hatcher profile takes over from this day, mirroring the API. */
export const HATCHER_START_DAY = 19;

const MAX_ALERTS = 40;
const CRITICAL_REPEAT_MS = 60_000;

interface RuleState {
  active: boolean;
  lastFiredAt: number;
}

const rules = new Map<string, RuleState>();
let alerts: AppAlert[] = [];
const listeners = new Set<() => void>();
let snapshot: AlertSnapshot = { alerts: [], unread: 0, permission: readPermission() };

function readPermission(): NotificationPermission | "unsupported" {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

function emit(): void {
  const unread = alerts.reduce((total, alert) => total + (alert.read ? 0 : 1), 0);
  snapshot = { alerts, unread, permission: readPermission() };
  for (const listener of listeners) listener();
}

/** Browser notification, through the worker where the platform demands it. */
function notify(title: string, body: string, tag: string): void {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  if (document.visibilityState === "visible") return;

  const options = {
    body,
    tag,
    icon: "/brand/icon-192.png",
    badge: "/brand/icon-192.png",
  } satisfies NotificationOptions;

  navigator.serviceWorker?.ready
    .then((registration) => registration.showNotification(title, options))
    .catch(() => {
      try {
        new Notification(title, options);
      } catch {
        /* some browsers only allow notifications from the worker */
      }
    });
}

function fire(rule: string, severity: AlertSeverity, title: string, detail: string): void {
  const now = Date.now();
  const previous = rules.get(rule) ?? { active: false, lastFiredAt: 0 };
  const repeatWindow = severity === "critical" ? CRITICAL_REPEAT_MS : Number.POSITIVE_INFINITY;
  const quiet = previous.active && now - previous.lastFiredAt < repeatWindow;

  rules.set(rule, {
    active: true,
    lastFiredAt: quiet ? previous.lastFiredAt : now,
  });
  if (quiet) return;

  alerts = [
    { id: `${rule}-${now}`, rule, severity, title, detail, at: now, read: false },
    ...alerts,
  ].slice(0, MAX_ALERTS);
  notify(title, detail, rule);
  emit();
}

function resolve(rule: string): void {
  const state = rules.get(rule);
  if (state?.active) rules.set(rule, { ...state, active: false });
}

/** Called on every telemetry frame and on a slow tick while the link is quiet. */
export function evaluateAlerts(input: AlertInput): void {
  const stale = input.frameAgeMs === null || input.frameAgeMs > STALE_AFTER_MS;
  const wasStale = rules.get("telemetry")?.active === true;

  if (stale) {
    fire(
      "telemetry",
      "critical",
      "Not receiving data",
      input.frameAgeMs === null
        ? "No reading has arrived since the app opened."
        : `Last reading was ${Math.round(input.frameAgeMs / 1000)}s ago.`,
    );
  } else {
    resolve("telemetry");
    if (wasStale) {
      fire("telemetry-recovered", "info", "Receiving data again", "Readings are arriving normally.");
    }
  }

  if (stale) return;

  const tempTarget = input.targetTemp;
  if (tempTarget !== null) {
    const drift = input.temperature - tempTarget;
    if (Math.abs(drift) > TEMP_TOLERANCE_C) {
      fire(
        "temperature",
        Math.abs(drift) > TEMP_CRITICAL_C ? "critical" : "warning",
        drift > 0 ? "Too warm" : "Too cold",
        `${input.temperature.toFixed(1)}°C, ${Math.abs(drift).toFixed(1)}°C ${
          drift > 0 ? "above" : "below"
        } the ${tempTarget.toFixed(1)}°C target.`,
      );
    } else {
      resolve("temperature");
    }
  }

  const humidTarget = input.targetHumidity;
  if (humidTarget !== null) {
    const drift = input.humidity - humidTarget;
    if (Math.abs(drift) > HUMIDITY_TOLERANCE_PCT) {
      fire(
        "humidity",
        "warning",
        drift > 0 ? "Too humid" : "Too dry",
        `${input.humidity.toFixed(1)}%, ${Math.abs(drift).toFixed(1)}% ${
          drift > 0 ? "above" : "below"
        } the ${humidTarget.toFixed(0)}% target.`,
      );
    } else {
      resolve("humidity");
    }
  }

  if (input.days >= HATCHER_START_DAY) {
    fire("hatcher", "info", "Hatcher phase", `Day ${input.days}, hatcher profile is active.`);
  }
}

export function subscribeAlerts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAlertSnapshot(): AlertSnapshot {
  return snapshot;
}

export function markAlertsRead(): void {
  alerts = alerts.map((alert) => (alert.read ? alert : { ...alert, read: true }));
  emit();
}

export function clearAlerts(): void {
  alerts = [];
  emit();
}

export async function requestNotificationPermission(): Promise<void> {
  if (typeof Notification === "undefined") return;
  await Notification.requestPermission();
  emit();
}
