export class PIDController {
  private integral = 0;
  private prevError = 0;
  private kp: number;
  private ki: number;
  private kd: number;
  private readonly outputMin: number;
  private readonly outputMax: number;

  constructor(
    kp: number,
    ki: number,
    kd: number,
    outputMin = 0,
    outputMax = 100,
  ) {
    this.kp = kp;
    this.ki = ki;
    this.kd = kd;
    this.outputMin = outputMin;
    this.outputMax = outputMax;
  }

  compute(setpoint: number, measured: number, dt: number): number {
    const error = setpoint - measured;

    this.integral += error * dt;
    this.integral = Math.max(-50, Math.min(50, this.integral));

    const derivative = dt > 0 ? (error - this.prevError) / dt : 0;
    this.prevError = error;

    const raw = this.kp * error + this.ki * this.integral + this.kd * derivative;
    return Math.max(this.outputMin, Math.min(this.outputMax, raw));
  }

  updateGains(kp: number, ki: number, kd: number): void {
    this.kp = kp;
    this.ki = ki;
    this.kd = kd;
  }

  reset(): void {
    this.integral = 0;
    this.prevError = 0;
  }
}
