export interface TelemetryReading {
  readonly time: string;
  readonly temperature: number;
  readonly humidity: number;
  readonly lampDuty: number;
  readonly fanDuty: number;
  readonly servoAngle: number;
}

export interface DeviceSetpoints {
  readonly targetTemp: number;
  readonly targetHumidity: number;
}

export interface PIDGains {
  readonly kp: number;
  readonly ki: number;
  readonly kd: number;
}

export interface DeviceSettings {
  readonly targetTemp: number;
  readonly targetHumidity: number;
  readonly tempPid: PIDGains;
  readonly humidPid: PIDGains;
  readonly turnIntervalHrs: number;
  readonly turnAngle: number;
  readonly lampEnabled: boolean;
  readonly fanEnabled: boolean;
}
