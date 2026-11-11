export interface Device {
  id: string;
  macAddress: string;
  nickname: string | null;
  claimed: boolean;
  createdAt: string;
}

export interface PendingDevice {
  macAddress: string;
  createdAt: string;
}
