#pragma once
// Copy this file to secrets.h (gitignored) and fill in real values.
//   cp secrets.example.h secrets.h

const char* ssid = "your-2.4ghz-ssid";
const char* password = "your-wifi-password";

// Railway: pakaiTls = true, serverHost = "<app>.up.railway.app", port 443.
// Local: pakaiTls = false, serverHost = LAN IP of the server, port 3000.
const bool pakaiTls = false;
const char* serverHost = "192.168.1.63";
const uint16_t serverPort = 3000;

// Must match LEGACY_API_TOKEN on the server.
const char* apiToken = "REPLACE_WITH_YOUR_LEGACY_API_TOKEN";
