import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgres://postgres:postgres@localhost:51214/template1?sslmode=disable",
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const SEED_PASSWORD = "seed-password-123";
const DEVICE_SECRET = process.env.DEVICE_SECRET ?? "dev-device-secret";

async function seed() {
  console.log("🌱 Seeding rich web demo data...\n");

  const passwordHash = await Bun.password.hash(SEED_PASSWORD, {
    algorithm: "argon2id",
  });

  // 1. Seed Main User
  const user = await prisma.user.upsert({
    where: { email: "mai@elycubator.local" },
    update: { passwordHash },
    create: {
      email: "mai@elycubator.local",
      name: "Mai",
      passwordHash,
    },
  });
  console.log(`👤 User: ${user.name} (${user.email})`);

  // --- DEVICE 1: Incubator Alpha (Stable, running perfectly) ---
  const alphaMac = "AA:BB:CC:DD:EE:01";
  const alpha = await prisma.device.upsert({
    where: { macAddress: alphaMac },
    update: { isClaimed: true, nickname: "Incubator Alpha", userId: user.id, pairingCode: null, deviceSecret: DEVICE_SECRET },
    create: { macAddress: alphaMac, isClaimed: true, nickname: "Incubator Alpha", userId: user.id, pairingCode: null, deviceSecret: DEVICE_SECRET },
  });
  
  await prisma.settings.upsert({
    where: { deviceId: alpha.id },
    update: {},
    create: { deviceId: alpha.id, targetTemp: 37.5, targetHumidity: 55.0, tempKp: 2.0, tempKi: 0.5, tempKd: 1.0, humidKp: 1.5, humidKi: 0.3, humidKd: 0.5, turnIntervalHrs: 4, turnAngle: 90 },
  });
  
  await prisma.telemetry.deleteMany({ where: { deviceId: alpha.id } });
  const alphaReadings = generateTelemetryHistory(alpha.id, 100, 37.5, 55.0);
  await prisma.telemetry.createMany({ data: alphaReadings });
  console.log(`✅ Seeded: ${alpha.nickname} (Stable profile, 100 readings)`);

  // --- DEVICE 2: Hatcher Beta (Running hot/humid, struggling to regulate) ---
  const betaMac = "AA:BB:CC:DD:EE:02";
  const beta = await prisma.device.upsert({
    where: { macAddress: betaMac },
    update: { isClaimed: true, nickname: "Hatcher Beta", userId: user.id, pairingCode: null, deviceSecret: DEVICE_SECRET },
    create: { macAddress: betaMac, isClaimed: true, nickname: "Hatcher Beta", userId: user.id, pairingCode: null, deviceSecret: DEVICE_SECRET },
  });
  
  await prisma.settings.upsert({
    where: { deviceId: beta.id },
    update: {},
    create: { deviceId: beta.id, targetTemp: 36.8, targetHumidity: 70.0, tempKp: 1.0, tempKi: 0.1, tempKd: 0.5, humidKp: 1.0, humidKi: 0.1, humidKd: 0.2, turnIntervalHrs: 0, turnAngle: 0 },
  });
  
  await prisma.telemetry.deleteMany({ where: { deviceId: beta.id } });
  const betaReadings = generateTelemetryHistory(beta.id, 100, 38.2, 75.0, true); // Struggling profile
  await prisma.telemetry.createMany({ data: betaReadings });
  console.log(`🔥 Seeded: ${beta.nickname} (Struggling profile, 100 readings)`);

  // --- DEVICE 3: Offline Backup Unit (Claimed, but no recent telemetry) ---
  const gammaMac = "AA:BB:CC:DD:EE:03";
  const gamma = await prisma.device.upsert({
    where: { macAddress: gammaMac },
    update: { isClaimed: true, nickname: "Storage Unit", userId: user.id, pairingCode: null, deviceSecret: DEVICE_SECRET },
    create: { macAddress: gammaMac, isClaimed: true, nickname: "Storage Unit", userId: user.id, pairingCode: null, deviceSecret: DEVICE_SECRET },
  });
  
  await prisma.settings.upsert({
    where: { deviceId: gamma.id },
    update: {},
    create: { deviceId: gamma.id, targetTemp: 25.0, targetHumidity: 50.0, tempKp: 2.0, tempKi: 0.5, tempKd: 1.0, humidKp: 1.5, humidKi: 0.3, humidKd: 0.5, turnIntervalHrs: 0, turnAngle: 0 },
  });
  await prisma.telemetry.deleteMany({ where: { deviceId: gamma.id } });
  console.log(`💤 Seeded: ${gamma.nickname} (Offline, 0 readings)`);

  // --- DEVICE 4: Unclaimed New Device (Waiting to be claimed) ---
  const deltaMac = "AA:BB:CC:DD:EE:04";
  const delta = await prisma.device.upsert({
    where: { macAddress: deltaMac },
    update: { isClaimed: false, nickname: null, userId: null, pairingCode: "123456", deviceSecret: DEVICE_SECRET },
    create: { macAddress: deltaMac, isClaimed: false, nickname: null, userId: null, pairingCode: "123456", deviceSecret: DEVICE_SECRET },
  });
  await prisma.telemetry.deleteMany({ where: { deviceId: delta.id } });
  console.log(`📦 Seeded: Unclaimed Device (MAC: ${delta.macAddress}, PIN: 123456)`);

  console.log("\n🚀 Demo Seed complete!");
  console.log(`Login: mai@elycubator.local / ${SEED_PASSWORD}`);
}

function generateTelemetryHistory(deviceId: string, count: number, targetTemp: number, targetHumid: number, isStruggling = false) {
  const now = Date.now();
  let temp = isStruggling ? targetTemp + 1.5 : targetTemp - 0.5;
  let humidity = isStruggling ? targetHumid + 10.0 : targetHumid - 5.0;
  
  const readings = [];

  for (let i = 0; i < count; i++) {
    const noise = isStruggling ? (Math.random() - 0.5) * 1.5 : (Math.random() - 0.5) * 0.3;
    
    // Simple spring physics towards target
    temp += (targetTemp - temp) * 0.1 + noise;
    humidity += (targetHumid - humidity) * 0.1 + (noise * 2);

    let lampDuty = Math.max(0, Math.min(100, (targetTemp - temp) * 20));
    let fanDuty = Math.max(0, Math.min(100, (humidity - targetHumid) * 10));

    if (isStruggling) {
      lampDuty = Math.random() > 0.8 ? 100 : lampDuty;
      fanDuty = 100; // Fans pinned at 100% trying to lower humidity
    }

    readings.push({
      deviceId,
      temperature: Number(temp.toFixed(2)),
      humidity: Number(humidity.toFixed(2)),
      lampDuty: Number(lampDuty.toFixed(1)),
      fanDuty: Number(fanDuty.toFixed(1)),
      servoAngle: 0,
      timestamp: new Date(now - (count - i) * 60000), // 1 reading per minute
    });
  }

  return readings;
}

seed()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

