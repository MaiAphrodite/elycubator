#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>
#include <ArduinoJson.h>
#include <RBDdimmer.h>
#include <PID_v1.h>
#include <Wire.h>
#include <I2C_LCD.h>
#include <WiFiClientSecure.h>
#include "secrets.h"

// --- KONFIGURASI WIFI & SERVER ---
// ssid, password, pakaiTls, serverHost, serverPort and apiToken come from
// secrets.h, which is gitignored. Copy secrets.example.h to secrets.h.
String urlServer = String(pakaiTls ? "https://" : "http://") + serverHost + ":" + String(serverPort) + "/api.php";
WiFiClientSecure secureClient;
WiFiClient plainClient;

// --- KONFIGURASI LCD 20x4 (ROB TILLAART I2C_LCD) ---
#define SDA_PIN 21
#define SCL_PIN 22
#define LCD_ADDRESS 0x27
I2C_LCD lcd(LCD_ADDRESS);

// --- KONFIGURASI SENSOR DHT22 ---
#define DHTPIN 13
#define DHTTYPE DHT22
DHT dht(DHTPIN, DHTTYPE);

// --- KONFIGURASI PIN RELAY & TOMBOL FISIK ---
#define RELAY_FAN_PIN 26    
#define RELAY_TURNER_PIN 27 
#define BTN_START 32        
#define BTN_STOP 33         

#define TURNER_ON  LOW
#define TURNER_OFF HIGH
#define FAN_ON     LOW
#define FAN_OFF    HIGH

// --- KONFIGURASI AC DIMMER ---
#define DIMMER_PWM_PIN 19
#define DIMMER_ZC_PIN 18
dimmerLamp dimmer(DIMMER_PWM_PIN, DIMMER_ZC_PIN);

// --- VARIABEL PID & KONTROL SUHU ---
float suhuAktual = 0.0, humAktual = 0.0;
double inputSuhu = 0.0, outputDimmer = 0.0;
double targetSuhu = 37.8; 
double Kp = 25.0, Ki = 1.0, Kd = 5.0;
PID myPID(&inputSuhu, &outputDimmer, &targetSuhu, Kp, Ki, Kd, DIRECT);

const float batasOverheatPID = 0.3; 

int powerPemanas = 0;
int hariKe = 0;
bool modeAuto = true;
bool lampEnabled = true;
bool fanEnabled = true;
bool isWiFiConnected = false;
bool lastStartBtn = HIGH, lastStopBtn = HIGH;

// --- VARIABEL KONTROL KIPAS & RAK PUTAR ---
int statusKipas = 0;          
int lastStatusKipas = 0;
bool kipasAutoPID = false;    
bool kipasManualWeb = false;  
bool isTestingFan = false;    
unsigned long previousFanTestMillis = 0;
const unsigned long fanTestDuration = 10000; 

bool isTurning = false;
bool lastIsTurning = false;
unsigned long previousTurnMillis = 0;
const unsigned long turnInterval = 10800000; // 3 Jam
const unsigned long turnDuration = 6000;     // 6 Detik

// --- VARIABEL TIMER (MILLIS) ---
unsigned long previousLocalMillis = 0;
const unsigned long intervalLocal = 1000;    

unsigned long previousServerMillis = 0;
const unsigned long intervalServer = 2000;   

unsigned long previousLcdResyncMillis = 0;
const unsigned long intervalLcdResync = 10000; 

// --- FUNGSI UPDATE TAMPILAN 4 BARIS LCD 20x4 ---
void updateTampilanLCD() {
  if (!lcd.isConnected()) return;

  char baris0[21], baris1[21], baris2[21], baris3[21];

  // Baris 1: Suhu Aktual & Suhu Target
  snprintf(baris0, sizeof(baris0), "SUHU:%04.1f C  ", suhuAktual);

  // Baris 2: Kelembapan Udara (RH)
  snprintf(baris1, sizeof(baris1), "HMDTY:%04.1f %% ", humAktual);

  // Baris 3: Hari Ke-berapa & Fase Inkubasi
  if (hariKe > 0) {
    if (modeAuto && hariKe >= 19) {
      snprintf(baris2, sizeof(baris2), "HARI KE-%02d", hariKe);
    } else {
      snprintf(baris2, sizeof(baris2), "HARI KE-%02d", hariKe);
    }
  } else {
    snprintf(baris2, sizeof(baris2), "HARI KE-00 ");
  }

  // Baris 4: Daya Dimmer, Kipas & WiFi (Atau Info Rak Putar)
  if (isTurning) {
    snprintf(baris3, sizeof(baris3), "Status: PUTAR RAK  ");
  } else {
    snprintf(baris3, sizeof(baris3), "DIM:%02d%% KIP:%s W:%s", 
             powerPemanas, 
             statusKipas == 1 ? "ON " : "OFF", 
             isWiFiConnected ? "OK" : "XX");
  }

  lcd.setCursor(8, 0); lcd.print(baris0);
  lcd.setCursor(8, 1); lcd.print(baris1);
  lcd.setCursor(0, 2); lcd.print(baris2);
  lcd.setCursor(0, 3); lcd.print(baris3);
}

// --- FUNGSI RE-SYNC LCD ---
// Never call lcd.begin() here: re-initialising the HD44780 clears the screen
// and causes a visible flash every time a relay changes state.
void resyncLCD() {
  if (lcd.isConnected()) {
    lcd.backlight();
    lcd.display();
    updateTampilanLCD();
  }
}

// --- FUNGSI HTTP DENGAN TOKEN DEVICE ---
void beginHttp(HTTPClient &http, const String &url) {
  if (pakaiTls) {
    secureClient.setInsecure();
    http.begin(secureClient, url);
  } else {
    http.begin(plainClient, url);
  }
  http.addHeader("X-Device-Token", apiToken);
}

// --- LOGGING ---
unsigned long previousSerialMillis = 0;
const unsigned long intervalSerial = 5000;
int lastHttpCode = 0;

// --- FUNGSI KIRIM TOMBOL FISIK KE SERVER ---
void kirimPerintahKeServer(String aksi) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    String url = urlServer + "?action=" + aksi + "&mac=" + WiFi.macAddress();
    beginHttp(http, url);
    http.GET();
    http.end();
    delay(200); 
  }
}

RTC_NOINIT_ATTR uint32_t bootMagic;
RTC_NOINIT_ATTR uint32_t bootCount;

static const uint32_t BOOT_MAGIC = 0x50494E4B; // "PINK"

const char *resetReasonName(esp_reset_reason_t r) {
  switch (r) {
    case ESP_RST_POWERON:  return "POWERON";
    case ESP_RST_EXT:      return "EXT_PIN";
    case ESP_RST_SW:       return "SOFTWARE";
    case ESP_RST_PANIC:    return "PANIC/CRASH";
    case ESP_RST_INT_WDT:  return "INT_WDT";
    case ESP_RST_TASK_WDT: return "TASK_WDT";
    case ESP_RST_WDT:      return "OTHER_WDT";
    case ESP_RST_DEEPSLEEP:return "DEEPSLEEP";
    case ESP_RST_BROWNOUT: return "BROWNOUT";
    case ESP_RST_SDIO:     return "SDIO";
    default:               return "UNKNOWN";
  }
}

void setup() {
  Serial.begin(115200);
  delay(500);

  if (bootMagic != BOOT_MAGIC) {
    bootMagic = BOOT_MAGIC;
    bootCount = 0;
  }
  bootCount++;

  esp_reset_reason_t reason = esp_reset_reason();
  Serial.println();
  Serial.print(F("[BOOT] #"));
  Serial.print(bootCount);
  Serial.print(F(" reason="));
  Serial.print((int)reason);
  Serial.print(F(" ("));
  Serial.print(resetReasonName(reason));
  Serial.print(F(") heap="));
  Serial.print(ESP.getFreeHeap());
  Serial.print(F(" minHeap="));
  Serial.print(ESP.getMinFreeHeap());
  Serial.println();

  // 1. Inisialisasi Pin Relay & Tombol
  pinMode(RELAY_FAN_PIN, OUTPUT_OPEN_DRAIN);
  pinMode(RELAY_TURNER_PIN, OUTPUT_OPEN_DRAIN);
  digitalWrite(RELAY_FAN_PIN, FAN_OFF); 
  digitalWrite(RELAY_TURNER_PIN, TURNER_OFF); 

  pinMode(BTN_START, INPUT_PULLUP);
  pinMode(BTN_STOP, INPUT_PULLUP);

  // 2. Inisialisasi I2C & LCD Rob Tillaart (Sebelum AC Dimmer aktif)
  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(50000); // Kecepatan stabil 50 kHz untuk paket blok FIFO
  Wire.setTimeOut(50);

  lcd.begin(20, 4);
  lcd.backlight();
  lcd.clear();

  lcd.setCursor(0, 0); lcd.print("Smart Egg Incubator ");
  lcd.setCursor(0, 1); lcd.print("Inisialisasi Sistem ");
  lcd.setCursor(0, 2); lcd.print("Menghubungkan WiFi..");
  lcd.setCursor(0, 3); lcd.print("Mohon Tunggu...     ");

  // 3. Koneksi WiFi
  WiFi.begin(ssid, password);
  int attempt = 0;
  while (WiFi.status() != WL_CONNECTED && attempt < 15) { 
    delay(500); 
    attempt++;
  }
  isWiFiConnected = (WiFi.status() == WL_CONNECTED);

  Serial.println();
  Serial.print(F("[BOOT] WiFi status="));
  Serial.print(WiFi.status());
  Serial.print(F(" connected="));
  Serial.print(isWiFiConnected ? F("yes") : F("no"));
  if (isWiFiConnected) {
    Serial.print(F(" ip="));
    Serial.print(WiFi.localIP());
    Serial.print(F(" rssi="));
    Serial.print(WiFi.RSSI());
    Serial.print(F(" ssid="));
    Serial.print(WiFi.SSID());
  }
  Serial.println();
  Serial.print(F("[BOOT] server="));
  Serial.println(urlServer);
  Serial.print(F("[BOOT] mac="));
  Serial.println(WiFi.macAddress());
  Serial.print(F("[BOOT] DHT pin="));
  Serial.println(DHTPIN);

  // 4. Inisialisasi Sensor DHT22, PID & AC Dimmer
  dht.begin();
  myPID.SetMode(AUTOMATIC);
  myPID.SetOutputLimits(0, 100);
  myPID.SetSampleTime(1000); 

  dimmer.begin(NORMAL_MODE, ON); 
  dimmer.setPower(0);

  previousTurnMillis = millis();
  updateTampilanLCD();
  Serial.println(F("[BOOT] setup selesai"));
  Serial.print(F("[BOOT] freeHeap="));
  Serial.print(ESP.getFreeHeap());
  Serial.print(F(" minFreeHeap="));
  Serial.print(ESP.getMinFreeHeap());
  Serial.println();
}

void loop() {
  unsigned long currentMillis = millis();

  // 1. Pembacaan Tombol Fisik Start & Stop
  bool currentStart = digitalRead(BTN_START);
  bool currentStop = digitalRead(BTN_STOP);
  if (currentStart == LOW && lastStartBtn == HIGH) kirimPerintahKeServer("start");
  if (currentStop == LOW && lastStopBtn == HIGH) kirimPerintahKeServer("stop");
  lastStartBtn = currentStart; 
  lastStopBtn = currentStop;

  // 2. Logika Timer Rak Putar (Auto-Turner)
  if (isTurning) {
    if (currentMillis - previousTurnMillis >= turnDuration) {
      isTurning = false; 
      digitalWrite(RELAY_TURNER_PIN, TURNER_OFF); 
      previousTurnMillis = currentMillis;  
    }
  } else {
    if (modeAuto && hariKe >= 1 && hariKe <= 18) {
      if (currentMillis - previousTurnMillis >= turnInterval) {
        isTurning = true;
        previousTurnMillis = currentMillis;
        digitalWrite(RELAY_TURNER_PIN, TURNER_ON); 
      }
    } else {
      digitalWrite(RELAY_TURNER_PIN, TURNER_OFF); 
    }
  }

  // 3. Timer Tes Kipas 10 Detik
  if (isTestingFan && (currentMillis - previousFanTestMillis >= fanTestDuration)) {
    isTestingFan = false;
  }

  // 4. Pembacaan Sensor, Perhitungan PID, Kontrol Aktuator & Update LCD (Tiap 1 Detik)
  if (currentMillis - previousLocalMillis >= intervalLocal) {
    previousLocalMillis = currentMillis;
    float h = dht.readHumidity();
    float t = dht.readTemperature();

    if (!isnan(t) && !isnan(h)) {
      suhuAktual = t;
      humAktual = h;
      inputSuhu = suhuAktual;
      myPID.Compute();

      powerPemanas = (int)outputDimmer;
      if (powerPemanas > 0 && powerPemanas < 15) powerPemanas = 0; 
      else if (powerPemanas > 90) powerPemanas = 90; 
      if (!lampEnabled) powerPemanas = 0;

      if (suhuAktual >= (targetSuhu + batasOverheatPID)) {
        kipasAutoPID = true;
        // powerPemanas = 0; 
      } else if (suhuAktual <= targetSuhu) {
        kipasAutoPID = false;
      }

      if (powerPemanas == 0) {
        dimmer.setPower(0);
        dimmer.setState(OFF);
      } else {
        dimmer.setState(ON);
        dimmer.setPower(powerPemanas);
      }
    }

    if (fanEnabled && (kipasAutoPID || isTestingFan || kipasManualWeb)) {
      statusKipas = 1;
      digitalWrite(RELAY_FAN_PIN, FAN_ON);
    } else {
      statusKipas = 0;
      digitalWrite(RELAY_FAN_PIN, FAN_OFF);
    }

    // Relay status changes only require a normal redraw. Re-initialising the
    // LCD here makes the display visibly glitch on every turner start/stop.
    if (statusKipas != lastStatusKipas || isTurning != lastIsTurning) {
      lastStatusKipas = statusKipas;
      lastIsTurning = isTurning;
    }
    updateTampilanLCD();
  }

  // 5. Re-Sync Berkala Tiap 10 Detik
  if (currentMillis - previousLcdResyncMillis >= intervalLcdResync) {
    previousLcdResyncMillis = currentMillis;
    resyncLCD();
  }

  // 5b. Log status berkala (diagnostik)
  if (currentMillis - previousSerialMillis >= intervalSerial) {
    previousSerialMillis = currentMillis;
    Serial.print(F("[STAT] suhu="));
    Serial.print(suhuAktual, 1);
    Serial.print(F(" hum="));
    Serial.print(humAktual, 1);
    Serial.print(F(" dim="));
    Serial.print(powerPemanas);
    Serial.print(F(" fan="));
    Serial.print(statusKipas);
    Serial.print(F(" wifi="));
    Serial.print(WiFi.status());
    Serial.print(F(" ip="));
    Serial.print(WiFi.localIP());
    Serial.print(F(" http="));
    Serial.print(lastHttpCode);
    Serial.print(F(" lampEn="));
    Serial.print(lampEnabled ? 1 : 0);
    Serial.print(F(" fanEn="));
    Serial.println(fanEnabled ? 1 : 0);
  }

  // 6. Sinkronisasi Server Web API (Tiap 5 Detik)
  if (currentMillis - previousServerMillis >= intervalServer) {
    previousServerMillis = currentMillis;
    isWiFiConnected = (WiFi.status() == WL_CONNECTED);

    if (isWiFiConnected && !isnan(suhuAktual)) {
      HTTPClient http;
      String url = urlServer + "?action=update_esp&mac=" + WiFi.macAddress() +
                   "&suhu=" + String(suhuAktual, 1) + 
                   "&hum=" + String(humAktual, 1) + "&dimmer=" + String(powerPemanas) +
                   "&kipas=" + String(statusKipas) + "&servo=" + String(isTurning ? 90 : 0);

      beginHttp(http, url);
      int httpCode = http.GET();
      if (httpCode != lastHttpCode) {
        Serial.print(F("[HTTP] code="));
        Serial.print(httpCode);
        Serial.print(F(" url="));
        Serial.println(url);
      }
      lastHttpCode = httpCode;
      
      if (httpCode == HTTP_CODE_OK) {
        String payload = http.getString();
        JsonDocument doc;

        if (!deserializeJson(doc, payload)) {
          if (!doc["kipas_manual"].isNull()) kipasManualWeb = (doc["kipas_manual"].as<int>() == 1);
          if (!doc["lamp_enabled"].isNull()) lampEnabled = (doc["lamp_enabled"].as<int>() == 1);
          if (!doc["fan_enabled"].isNull()) fanEnabled = (doc["fan_enabled"].as<int>() == 1);

          if (!doc["fan_test"].isNull() && doc["fan_test"].as<int>() == 1 && !isTestingFan) {
            isTestingFan = true;
            previousFanTestMillis = currentMillis;
            digitalWrite(RELAY_FAN_PIN, FAN_ON);
          }
          
          if (!doc["target_suhu"].isNull()) targetSuhu = doc["target_suhu"].as<double>(); 
          if (!doc["mode_auto"].isNull()) modeAuto = (doc["mode_auto"].as<int>() == 1); 
          if (!doc["hari_ke"].isNull()) hariKe = doc["hari_ke"].as<int>(); 

          if (!doc["turner_test"].isNull() && doc["turner_test"].as<int>() == 1 && !isTurning) {
            isTurning = true;
            previousTurnMillis = currentMillis;
            digitalWrite(RELAY_TURNER_PIN, TURNER_ON);
          }

          if (!doc["kp"].isNull() && !doc["ki"].isNull() && !doc["kd"].isNull()) {
            double newKp = doc["kp"].as<double>();
            double newKi = doc["ki"].as<double>();
            double newKd = doc["kd"].as<double>();
            if (newKp != Kp || newKi != Ki || newKd != Kd) {
              Kp = newKp; Ki = newKi; Kd = newKd;
              myPID.SetTunings(Kp, Ki, Kd); 
            }
          }
        }
      } else {
        // Keep local PID/fan protection running even when the dashboard is
        // unreachable. Only server-originated manual/test states are cleared.
        kipasManualWeb = false;
        isTestingFan = false;
      }
      http.end();
    } else {
      kipasManualWeb = false;
      isTestingFan = false;
    }
  }
}
