const token = process.env.DEVICE_TOKEN;
if (!token) {
  console.error("Missing DEVICE_TOKEN env");
  process.exit(1);
}

const ws = new WebSocket(`ws://localhost:3000/api/device/stream?token=${token}`);

ws.onopen = () => {
  console.log("✅ WebSocket Connected!");
  console.log("📤 Sending telemetry...");
  ws.send(JSON.stringify({ temperature: 38.0, humidity: 60.5, lampDuty: 10, fanDuty: 20, servoAngle: 0 }));
  
  // Wait a bit to see if we get the initial settings push, then trigger a user update
  setTimeout(() => {
    console.log("Waiting for user to trigger settings update...");
  }, 500);
};

ws.onmessage = (event) => {
  console.log("📥 Received from Server:", event.data);
  const data = JSON.parse(event.data);
  if (data.type === "SETTINGS_UPDATE" && data.payload.targetTemp === 40.0) {
    console.log("🎉 SUCCESS: Received instantaneous settings push from user!");
    process.exit(0);
  }
};

ws.onerror = (error) => {
  console.error("❌ WebSocket Error:", error);
};

ws.onclose = () => {
  console.log("❌ WebSocket Closed");
};

// Timeout after 5s
setTimeout(() => {
  console.error("❌ Test timed out.");
  process.exit(1);
}, 5000);
