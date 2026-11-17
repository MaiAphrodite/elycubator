import {
  Alert,
  Box,
  Button,
  SimpleGrid,
  Stack,
  Text,
} from "@mantine/core";
import { DownloadRegular, DropRegular, ThermometerRegular, WarningRegular } from "@mingcute/react/core-regular";
import { useMediaQuery } from "@mantine/hooks";
import { motion } from "framer-motion";
import { slideDown, staggerContainer } from "../lib/motion";
import {
  ActuatorCard,
  ControlLoopCard,
  CycleCard,
  DeviceCard,
  StatCard,
} from "../components/dashboard";
import { PageHeader } from "../components/PageHeader";
import { AssistantPanel } from "../components/AssistantPanel";
import { useTelemetryStream } from "../hooks/useTelemetryStream";
import { useIncubation, HATCHER_START_DAY } from "../hooks/useIncubation";
import { useFrameAge } from "../hooks/useFrameAge";
import { formatElapsed } from "../lib/time";

const STALE_AFTER_MS = 8000;

export function DashboardPage() {
  const {
    current,
    history,
    deviceId,
    lampEnabled,
    fanEnabled,
    settings,
    lastReceivedAt,
    setLampEnabled,
    setFanEnabled,
    triggerServo,
    exportAsCsv,
  } = useTelemetryStream();
  const { incubation } = useIncubation();
  const frameAge = useFrameAge(lastReceivedAt);
  const isPhone = useMediaQuery("(max-width: 30em)");
  // The navbar eats 268px, so three stat columns only fit past 62em.
  const isWide = useMediaQuery("(min-width: 62em)");

  const targetTemp = incubation?.target_suhu ?? settings?.targetTemp ?? null;
  const targetHumidity = settings?.targetHumidity ?? null;
  const hasData = lastReceivedAt !== null;
  const isStale = frameAge !== null && frameAge > STALE_AFTER_MS;
  const hatcherActive = Boolean(
    incubation && incubation.mode_auto === 1 && incubation.hari_ke >= HATCHER_START_DAY,
  );

  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="show">
      <Stack gap="lg" p={{ base: "xs", sm: "md" }}>
        <PageHeader
          title="Dashboard"
          subtitle={`last reading ${current.time}`}
          actions={
            <Button
              variant="default"
              size="compact-sm"
              leftSection={<DownloadRegular size={16} />}
              onClick={exportAsCsv}
              disabled={history.length === 0}
              aria-label={`Export ${history.length} readings as CSV`}
            >
              {history.length} rows
            </Button>
          }
        />

        {isStale && (
          <motion.div variants={slideDown} initial="hidden" animate="show">
          <Alert
            icon={<WarningRegular size={18} />}
            color="amber"
            variant="light"
            radius="lg"
            title="No new data"
          >
            <Text size="sm">
              Last reading was {formatElapsed(frameAge)} ago. Values below may be out of
              date.
            </Text>
          </Alert>
          </motion.div>
        )}

        <SimpleGrid cols={{ base: 2, lg: 3 }} spacing={isPhone ? "xs" : "md"}>
          <StatCard
            compact={isPhone}
            label="Temperature"
            value={hasData ? `${current.temperature.toFixed(1)}°C` : "—"}
            subtitle={
              targetTemp
                ? isPhone
                  ? `→ ${targetTemp.toFixed(1)}°C`
                  : `Target ${targetTemp.toFixed(1)}°C`
                : "Target not set"
            }
            icon={<ThermometerRegular size={24} />}
            color="amber"
            delta={hasData && targetTemp !== null ? current.temperature - targetTemp : null}
            deltaUnit="°C"
            trend={hasData ? history.map((reading) => reading.temperature) : []}
            targetValue={targetTemp ?? undefined}
          />
          <StatCard
            compact={isPhone}
            label="Humidity"
            value={hasData ? `${current.humidity.toFixed(1)}%` : "—"}
            subtitle={
              targetHumidity
                ? isPhone
                  ? `→ ${targetHumidity.toFixed(1)}%`
                  : `Target ${targetHumidity.toFixed(1)}%`
                : "Target not set"
            }
            icon={<DropRegular size={24} />}
            color="sage"
            delta={hasData && targetHumidity !== null ? current.humidity - targetHumidity : null}
            deltaUnit="%"
            trend={hasData ? history.map((reading) => reading.humidity) : []}
            targetValue={targetHumidity ?? undefined}
          />
          <Box style={{ gridColumn: isWide ? "auto" : "1 / -1" }}>
            <CycleCard
              hariKe={incubation?.hari_ke ?? 0}
              modeAuto={incubation?.mode_auto ?? 1}
              startedAt={incubation?.waktu_mulai ?? 0}
              targetTemp={targetTemp}
            />
          </Box>
        </SimpleGrid>

        <ActuatorCard
          lampDuty={current.lampDuty}
          fanDuty={current.fanDuty}
          servoAngle={current.servoAngle}
          lampEnabled={lampEnabled}
          fanEnabled={fanEnabled}
          onToggleLamp={() => setLampEnabled(!lampEnabled)}
          onToggleFan={() => setFanEnabled(!fanEnabled)}
          onTriggerServo={triggerServo}
          lampHistory={history.map((reading) => reading.lampDuty)}
          fanHistory={history.map((reading) => reading.fanDuty)}
          turnIntervalHrs={settings?.turnIntervalHrs ?? null}
          turnAngle={settings?.turnAngle ?? null}
        />

        <AssistantPanel deviceId={deviceId} />

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          <ControlLoopCard
            kp={incubation?.kp ?? null}
            ki={incubation?.ki ?? null}
            kd={incubation?.kd ?? null}
            modeAuto={incubation?.mode_auto ?? 1}
            hatcherActive={hatcherActive}
            setter={
              incubation
                ? {
                    kp: incubation.kp_set,
                    ki: incubation.ki_set,
                    kd: incubation.kd_set,
                    target: incubation.target_suhu_set,
                  }
                : null
            }
            hatcher={
              incubation
                ? {
                    kp: incubation.kp_hatch,
                    ki: incubation.ki_hatch,
                    kd: incubation.kd_hatch,
                    target: incubation.target_suhu_hatch,
                  }
                : null
            }
          />
          <DeviceCard
            deviceId={deviceId}
            bufferedReadings={history.length}
            frameAge={frameAge}
          />
        </SimpleGrid>
      </Stack>
    </motion.div>
  );
}
