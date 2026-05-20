import { Elysia, t } from 'elysia';
import { prisma } from '../db';
import { websocket } from '@elysiajs/websocket';

// A simple in-memory pub-sub registry for active WebSocket connections.
// Maps a deviceId to an array of active WebSocket client channels.
const activeClients = new Map<string, any[]>();

export const telemetryRoutes = new Elysia({ prefix: '/api/telemetry' })
  .use(websocket())
  
  /**
   * Hardware Ingestion Endpoint
   * ESP32/Wokwi posts sensor readings here continuously.
   */
  .post('/', async ({ body, set }) => {
    const { macAddress, temperature, humidity, o2Level } = body;

    // Validate hardware exists
    const device = await prisma.device.findUnique({
      where: { macAddress }
    });

    if (!device) {
      set.status = 404;
      return { success: false, error: "Device not found." };
    }

    if (!device.isClaimed) {
      set.status = 403;
      return { success: false, error: "Device must be claimed before transmitting telemetry." };
    }

    // Persist reading to the Data Tier (PostgreSQL)
    const telemetry = await prisma.telemetry.create({
      data: {
        deviceId: device.id,
        temperature,
        humidity,
        o2Level
      }
    });

    // Real-Time Broadcast
    // If any Web SPA clients are currently viewing this specific incubator's dashboard,
    // we instantly push the new reading to them via WebSockets.
    const clients = activeClients.get(device.id);
    if (clients && clients.length > 0) {
      clients.forEach(ws => {
        ws.send(JSON.stringify({
          type: "NEW_TELEMETRY",
          data: telemetry
        }));
      });
    }

    return { success: true, message: "Telemetry recorded." };
  }, {
    body: t.Object({
      macAddress: t.String(),
      temperature: t.Optional(t.Numeric()),
      humidity: t.Optional(t.Numeric()),
      o2Level: t.Optional(t.Numeric())
    })
  })

  /**
   * Web SPA Real-Time Graph Stream
   * React connects here: wss://<domain>/api/telemetry/stream?deviceId=UUID
   */
  .ws('/stream', {
    query: t.Object({
      deviceId: t.String()
    }),
    open(ws) {
      const deviceId = ws.data.query.deviceId;
      
      // Register this client to listen for updates on this specific device
      if (!activeClients.has(deviceId)) {
        activeClients.set(deviceId, []);
      }
      activeClients.get(deviceId)?.push(ws);
      
      console.log(`[WS] Client connected to device stream: ${deviceId}`);
    },
    close(ws) {
      const deviceId = ws.data.query.deviceId;
      
      // Remove this client when they close the dashboard
      const clients = activeClients.get(deviceId) || [];
      const updatedClients = clients.filter(client => client !== ws);
      
      if (updatedClients.length === 0) {
        activeClients.delete(deviceId);
      } else {
        activeClients.set(deviceId, updatedClients);
      }
      
      console.log(`[WS] Client disconnected from device stream: ${deviceId}`);
    }
  });
