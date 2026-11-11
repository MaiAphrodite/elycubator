export interface IncubationSettings {
  targetTemp: number;
  targetHumidity: number;
  tempKp: number;
  tempKi: number;
  tempKd: number;
  modeAuto: boolean;
  dayCount: number;
  startedAt: Date | null;
  turnerTest: boolean;
  targetTempSet: number;
  targetTempHatch: number;
  setKp: number;
  setKi: number;
  setKd: number;
  hatchKp: number;
  hatchKi: number;
  hatchKd: number;
}

export function liveDayCount(settings: IncubationSettings): number {
  if (settings.dayCount <= 0 || !settings.startedAt) return 0;
  const elapsedSec = Math.floor((Date.now() - settings.startedAt.getTime()) / 1000);
  return 1 + Math.floor(elapsedSec / 86400);
}

export function activeProfile(settings: IncubationSettings, day: number) {
  if (day >= 19) {
    return {
      targetTemp: settings.targetTempHatch,
      kp: settings.hatchKp,
      ki: settings.hatchKi,
      kd: settings.hatchKd,
    };
  }
  if (day > 0) {
    return {
      targetTemp: settings.targetTempSet,
      kp: settings.setKp,
      ki: settings.setKi,
      kd: settings.setKd,
    };
  }
  return {
    targetTemp: settings.targetTemp,
    kp: settings.tempKp,
    ki: settings.tempKi,
    kd: settings.tempKd,
  };
}

export function fanState(humidity: number, temperature: number, targetTemp: number, prevKipas: number): number {
  if (humidity > 60.0 || temperature > targetTemp + 0.2) return 1;
  if (humidity <= 58.0 && temperature <= targetTemp) return 0;
  return prevKipas;
}

export function incubationView(settings: IncubationSettings) {
  const day = liveDayCount(settings);
  const profile = activeProfile(settings, day);
  return {
    suhu: null,
    target_suhu: profile.targetTemp,
    mode_auto: settings.modeAuto ? 1 : 0,
    hari_ke: day,
    turner_test: settings.turnerTest ? 1 : 0,
    target_suhu_set: settings.targetTempSet,
    target_suhu_hatch: settings.targetTempHatch,
    kp_set: settings.setKp,
    ki_set: settings.setKi,
    kd_set: settings.setKd,
    kp_hatch: settings.hatchKp,
    ki_hatch: settings.hatchKi,
    kd_hatch: settings.hatchKd,
    kp: profile.kp,
    ki: profile.ki,
    kd: profile.kd,
    waktu_mulai: settings.startedAt ? Math.floor(settings.startedAt.getTime() / 1000) : 0,
  };
}
