import { useState, useEffect } from 'react';
import { AppShell, Title, Container, Group, Button, Grid, Text, NumberInput, Card as MantineCard, Progress, Burger } from '@mantine/core';
import { Card, Metric, Text as TremorText, Flex, ProgressBar, AreaChart, BadgeDelta } from '@tremor/react';
import { motion } from 'framer-motion';
import { Thermometer, Droplets, Wind, Activity, Download, AlertTriangle, Egg, LayoutDashboard, Settings, History } from 'lucide-react';
import { useDisclosure } from '@mantine/hooks';

// Types
interface TelemetryData {
  time: string;
  temperature: number;
  humidity: number;
  o2Level: number;
}

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } }
};

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

export function Dashboard() {
  const [opened, { toggle }] = useDisclosure();
  const [liveData, setLiveData] = useState<TelemetryData>({
    time: new Date().toLocaleTimeString(),
    temperature: 37.5,
    humidity: 55.0,
    o2Level: 20.9
  });

  const [history, setHistory] = useState<TelemetryData[]>([]);
  const [targetTemp, setTargetTemp] = useState<number | string>(37.5);
  const [targetHumidity, setTargetHumidity] = useState<number | string>(55.0);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const newReading = {
        time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        temperature: 37.0 + Math.random() * 1.0,
        humidity: 54.0 + Math.random() * 2.0,
        o2Level: 20.8 + Math.random() * 0.2
      };

      setLiveData(newReading);
      setHistory(prev => {
        const updated = [...prev, newReading];
        return updated.length > 20 ? updated.slice(updated.length - 20) : updated;
      });
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const exportCSV = () => {
    const csvContent = "data:text/csv;charset=utf-8," 
      + "Time,Temperature,Humidity,O2 Level\n"
      + history.map(e => `${e.time},${e.temperature.toFixed(2)},${e.humidity.toFixed(2)},${e.o2Level.toFixed(2)}`).join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "incubator_telemetry.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 250, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Egg size={28} className="text-blue-500" />
            <Title order={3} className="tracking-tight text-slate-800 dark:text-slate-100">Elycubator</Title>
          </Group>
          <BadgeDelta deltaType="increase" isIncreasePositive={true} size="sm">
            Status: Online
          </BadgeDelta>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md" className="space-y-4">
        <Button variant="light" color="blue" fullWidth justify="flex-start" leftSection={<LayoutDashboard size={18} />}>Dashboard</Button>
        <Button variant="subtle" color="gray" fullWidth justify="flex-start" leftSection={<History size={18} />}>History</Button>
        <Button variant="subtle" color="gray" fullWidth justify="flex-start" leftSection={<Settings size={18} />}>Settings</Button>
      </AppShell.Navbar>

      <AppShell.Main className="bg-slate-50 dark:bg-slate-900 min-h-screen">
        <Container size="xl" py="lg">
          <motion.div variants={container} initial="hidden" animate="show">
            <motion.div variants={item}>
              <Group justify="space-between" mb="xl">
                <div>
                  <Title order={2} className="text-slate-800 dark:text-slate-100">Incubator Alpha</Title>
                  <Text size="sm" c="dimmed" className="mt-1 flex items-center gap-2">
                    <Activity size={14} /> ID: 482-911 • Last synced: {liveData.time}
                  </Text>
                </div>
                <Group>
                  <Button variant="white" color="gray" onClick={exportCSV} leftSection={<Download size={16} />} className="shadow-sm">Export Data</Button>
                  <Button variant="filled" color="red" leftSection={<AlertTriangle size={16} />} className="shadow-md transition-transform hover:scale-105">Emergency Stop</Button>
                </Group>
              </Group>
            </motion.div>

            <Grid mb="xl">
              <Grid.Col span={{ base: 12, sm: 4 }}>
                <motion.div variants={item}>
                  <Card decoration="top" decorationColor="teal" className="shadow-sm hover:shadow-md transition-shadow ring-1 ring-slate-200 dark:ring-slate-800">
                    <Flex alignItems="center" justifyContent="between">
                      <TremorText>Temperature</TremorText>
                      <Thermometer className="text-teal-500 opacity-50" size={20} />
                    </Flex>
                    <Metric className="mt-2 text-slate-800 dark:text-slate-100">{liveData.temperature.toFixed(1)} &deg;C</Metric>
                    <Flex className="mt-4">
                      <TremorText>Target: {targetTemp} &deg;C</TremorText>
                      <TremorText>{Math.round((liveData.temperature / Number(targetTemp)) * 100)}%</TremorText>
                    </Flex>
                    <ProgressBar value={(liveData.temperature / Number(targetTemp)) * 100} className="mt-2" color="teal" />
                  </Card>
                </motion.div>
              </Grid.Col>

              <Grid.Col span={{ base: 12, sm: 4 }}>
                <motion.div variants={item}>
                  <Card decoration="top" decorationColor="blue" className="shadow-sm hover:shadow-md transition-shadow ring-1 ring-slate-200 dark:ring-slate-800">
                    <Flex alignItems="center" justifyContent="between">
                      <TremorText>Humidity</TremorText>
                      <Droplets className="text-blue-500 opacity-50" size={20} />
                    </Flex>
                    <Metric className="mt-2 text-slate-800 dark:text-slate-100">{liveData.humidity.toFixed(1)}%</Metric>
                    <Flex className="mt-4">
                      <TremorText>Target: {targetHumidity}%</TremorText>
                      <TremorText>{Math.round((liveData.humidity / Number(targetHumidity)) * 100)}%</TremorText>
                    </Flex>
                    <ProgressBar value={(liveData.humidity / Number(targetHumidity)) * 100} className="mt-2" color="blue" />
                  </Card>
                </motion.div>
              </Grid.Col>

              <Grid.Col span={{ base: 12, sm: 4 }}>
                <motion.div variants={item}>
                  <Card decoration="top" decorationColor="indigo" className="shadow-sm hover:shadow-md transition-shadow ring-1 ring-slate-200 dark:ring-slate-800">
                    <Flex alignItems="center" justifyContent="between">
                      <TremorText>O2 Levels</TremorText>
                      <Wind className="text-indigo-500 opacity-50" size={20} />
                    </Flex>
                    <Metric className="mt-2 text-slate-800 dark:text-slate-100">{liveData.o2Level.toFixed(1)}%</Metric>
                    <Flex className="mt-4">
                      <TremorText>Optimal Range: 20-21%</TremorText>
                    </Flex>
                    <ProgressBar value={(liveData.o2Level / 21) * 100} className="mt-2" color="indigo" />
                  </Card>
                </motion.div>
              </Grid.Col>
            </Grid>

            <Grid>
              <Grid.Col span={{ base: 12, lg: 8 }}>
                <motion.div variants={item} className="h-full">
                  <Card className="h-full shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
                    <Title order={4} mb="md" className="text-slate-800 dark:text-slate-100 font-semibold">Live Telemetry History</Title>
                    <AreaChart
                      className="h-72 mt-4"
                      data={history}
                      index="time"
                      categories={["temperature", "humidity"]}
                      colors={["teal", "blue"]}
                      valueFormatter={(number) => number.toFixed(1)}
                      yAxisWidth={40}
                      showAnimation={true}
                    />
                  </Card>
                </motion.div>
              </Grid.Col>

              <Grid.Col span={{ base: 12, lg: 4 }}>
                <motion.div variants={item} className="space-y-4">
                  <MantineCard shadow="sm" padding="lg" radius="md" withBorder className="bg-white dark:bg-slate-800">
                    <Title order={4} mb="md" className="text-slate-800 dark:text-slate-100 font-semibold flex items-center gap-2">
                      <Settings size={18} /> Setpoints
                    </Title>
                    
                    <NumberInput
                      label="Target Temperature (&deg;C)"
                      value={targetTemp}
                      onChange={setTargetTemp}
                      decimalScale={1}
                      step={0.1}
                      min={20}
                      max={45}
                      mb="md"
                      classNames={{ input: 'focus:border-blue-500' }}
                    />

                    <NumberInput
                      label="Target Humidity (%)"
                      value={targetHumidity}
                      onChange={setTargetHumidity}
                      decimalScale={1}
                      step={1}
                      min={30}
                      max={90}
                      mb="xl"
                      classNames={{ input: 'focus:border-blue-500' }}
                    />

                    <Button fullWidth variant="light" color="blue" className="transition-transform hover:scale-[1.02]">
                      Update Setpoints
                    </Button>
                  </MantineCard>
                  
                  <MantineCard shadow="sm" padding="lg" radius="md" withBorder className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-800 border-blue-100 dark:border-slate-700">
                    <Flex alignItems="center" justifyContent="between" className="mb-2">
                      <Title order={4} className="text-slate-800 dark:text-slate-100 font-semibold">Estimated Hatch</Title>
                      <Egg size={20} className="text-indigo-500" />
                    </Flex>
                    <Text size="xl" fw={800} className="text-blue-600 dark:text-blue-400">June 14, 2026</Text>
                    <Text size="sm" className="text-slate-500 dark:text-slate-400">25 Days Remaining</Text>
                    <Progress value={20} mt="md" animated color="indigo" size="md" radius="xl" />
                  </MantineCard>
                </motion.div>
              </Grid.Col>
            </Grid>
          </motion.div>
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
