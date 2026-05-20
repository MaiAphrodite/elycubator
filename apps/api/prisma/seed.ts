import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: "postgres://postgres:postgres@localhost:51214/template1",
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const DEVICE_MAC = "AA:BB:CC:DD:EE:FF";
const DEVICE_NICKNAME = "Incubator Alpha";

async function seed() {
  console.log("🌱 Seeding database...\n");

  const user = await prisma.user.upsert({
    where: { email: "mai@elycubator.local" },
    update: {},
    create: {
      email: "mai@elycubator.local",
      name: "Mai",
    },
  });
  console.log(`👤 User: ${user.name} (${user.id})`);

  const device = await prisma.device.upsert({
    where: { macAddress: DEVICE_MAC },
    update: {
      isClaimed: true,
      nickname: DEVICE_NICKNAME,
      userId: user.id,
      pairingCode: null,
    },
    create: {
      macAddress: DEVICE_MAC,
      isClaimed: true,
      nickname: DEVICE_NICKNAME,
      userId: user.id,
      pairingCode: null,
    },
  });
  console.log(`📦 Device: ${device.nickname} (${device.id})`);
  console.log(`   MAC: ${device.macAddress}`);

  const settings = await prisma.settings.upsert({
    where: { deviceId: device.id },
    update: {},
    create: {
      deviceId: device.id,
      targetTemp: 37.5,
      targetHumidity: 55.0,
      tempKp: 2.0,
      tempKi: 0.5,
      tempKd: 1.0,
      humidKp: 1.5,
      humidKi: 0.3,
      humidKd: 0.5,
      turnIntervalHrs: 4,
      turnAngle: 90,
    },
  });
  console.log(`⚙ Settings: ${settings.id}`);

  await prisma.telemetry.deleteMany({ where: { deviceId: device.id } });

  const readings = generateTelemetryHistory(device.id, 50);
  await prisma.telemetry.createMany({ data: readings });
  console.log(`📊 Telemetry: ${readings.length} historical readings seeded`);

  console.log("\n✅ Seed complete!");
  console.log(`\n   Device ID for simulator: ${device.id}`);
  console.log(`   MAC Address: ${DEVICE_MAC}`);
}

function generateTelemetryHistory(deviceId: string, count: number) {
  const now = Date.now();
  let temp = 28.0;
  let humidity = 70.0;
  let lampDuty = 0;
  let fanDuty = 0;

  const readings = [];

  for (let i = 0; i < count; i++) {
    const tempError = 37.5 - temp;
    lampDuty = Math.max(0, Math.min(100, tempError * 12 + (Math.random() - 0.5) * 6));
    const humidError = humidity - 55.0;
    fanDuty = Math.max(0, Math.min(100, humidError * 6 + (Math.random() - 0.5) * 6));

    temp += (lampDuty / 100) * 0.4 * 2;
    temp -= (fanDuty / 100) * 0.2 * 2;
    temp += 0.04 * (28 - temp) * 2;
    temp += (Math.random() - 0.5) * 0.5;
    temp = Math.max(20, Math.min(45, temp));

    humidity -= (fanDuty / 100) * 1.2 * 2;
    humidity += 0.02 * (70 - humidity) * 2;
    humidity += (Math.random() - 0.5) * 2;
    humidity = Math.max(25, Math.min(85, humidity));

    readings.push({
      deviceId,
      temperature: Number(temp.toFixed(2)),
      humidity: Number(humidity.toFixed(2)),
      lampDuty: Number(lampDuty.toFixed(1)),
      fanDuty: Number(fanDuty.toFixed(1)),
      servoAngle: 0,
      timestamp: new Date(now - (count - i) * 2000),
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
