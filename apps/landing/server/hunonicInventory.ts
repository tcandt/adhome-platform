export interface HunonicCloudMeter {
  id: string;
  createdDate?: string | null;
  electricityGroupId?: string | null;
  isShared?: boolean;
  providerDeviceId: string | null;
  name: string;
  homeName: string | null;
  providerRoomName: string | null;
  cumulativeKwh: number | null;
  monthReportedKwh: number | null;
  reportedMonth: string | null;
  instantPowerW: number | null;
  providerReportedAt: string | null;
  online: boolean | null;
  connectionStatus: "ONLINE" | "OFFLINE" | "STALE" | "UNCONFIGURED";
}

function object(value: unknown): Record<string, any> {
  if (typeof value === "string") {
    try {
      return object(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}
function number(value: unknown): number | null {
  if (
    value === "" ||
    value === null ||
    value === undefined ||
    typeof value === "boolean"
  )
    return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
function timestamp(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric =
    typeof value === "number" || /^\d+(\.\d+)?$/.test(String(value))
      ? Number(value)
      : null;
  const parsed = new Date(
    numeric === null
      ? String(value)
      : numeric < 1e12
        ? numeric * 1000
        : numeric,
  );
  return Number.isFinite(parsed.getTime()) &&
    parsed.getTime() <= Date.now() + 5 * 60000
    ? parsed.toISOString()
    : null;
}
function online(value: unknown): boolean | null {
  if ([true, 1, "1", "true"].includes(value as any)) return true;
  if ([false, 0, "0", "false"].includes(value as any)) return false;
  return null;
}

/** Provider fields retain their original units; relay on/off is not connectivity. */
export function normalizeHunonicInventory(homes: unknown): HunonicCloudMeter[] {
  const devices = new Map<string, HunonicCloudMeter>();
  for (const home of Array.isArray(homes) ? homes : []) {
    for (const room of Array.isArray(home.rooms) ? home.rooms : []) {
      for (const device of Array.isArray(room.devices) ? room.devices : []) {
        if (!["elmeter", "ElectricMeter"].includes(device.root_type)) continue;
        const id = String(device.root_id || device.id || "").trim();
        if (!id || /^(MOCK|DEV)-/i.test(id)) continue;
        const extra = object(device.root_extra);
        const data = object(device.data_extra);
        // Hunonic REST connectivity: state=1 online, state=2 offline.
        // Relay power is separately stored in value.turn; status=0 is not offline.
        const state = String(device.state ?? "");
        const isOnline =
          state === "1"
            ? true
            : state === "2"
              ? false
              : online(device.online ?? device.is_online);
        const reportedAt = timestamp(device.timeupdate ?? device.updated_at);
        const stale =
          reportedAt !== null &&
          Date.now() - Date.parse(reportedAt) > 6 * 3600000;
        const meter: HunonicCloudMeter = {
          id,
          isShared: String(device.device_role) === "2",
          electricityGroupId:
            data.electricity_group_id == null
              ? null
              : String(data.electricity_group_id),
          createdDate: /^\d{4}-\d{2}-\d{2}/.test(
            String(device.timecreate || ""),
          )
            ? String(device.timecreate).slice(0, 10)
            : null,
          providerDeviceId: device.id == null ? null : String(device.id),
          name:
            typeof device.name === "string" && device.name.trim()
              ? device.name.trim()
              : id,
          homeName: home.name || home.home_name || null,
          providerRoomName: room.name || room.room_name || null,
          cumulativeKwh: number(
            data.cumulative_kwh ??
              extra.cumulative_kwh ??
              device.cumulative_kwh,
          ),
          monthReportedKwh: number(extra.power_of_month),
          reportedMonth:
            extra.current_month == null ? null : String(extra.current_month),
          instantPowerW: number(data.power_current ?? extra.power_current),
          providerReportedAt: reportedAt,
          online: isOnline,
          connectionStatus:
            isOnline === false
              ? "OFFLINE"
              : isOnline === true
                ? "ONLINE"
                : stale
                  ? "STALE"
                  : "UNCONFIGURED",
        };
        const previous = devices.get(id);
        if (previous && previous.providerDeviceId !== meter.providerDeviceId)
          throw new Error(
            "Hunonic trả về trùng mã thiết bị; chưa thể gán phòng an toàn.",
          );
        devices.set(id, meter);
      }
    }
  }
  return [...devices.values()];
}

export function serializeHunonicInventory(
  devices: HunonicCloudMeter[] | undefined,
  mapped: Array<any>,
  fetchedAt: string | null,
) {
  const inventory = devices || [];
  const result = inventory.map((device) => {
    const saved = mapped.find((meter) => meter.hunonicDeviceId === device.id);
    return {
      id: saved?.id || device.id,
      hunonicDeviceId: device.id,
      providerDeviceId: device.providerDeviceId,
      deviceName: device.name,
      meterSerial: saved?.meterSerial || null,
      homeName: device.homeName,
      providerRoomName: device.providerRoomName,
      meterType: saved?.meterType || "ROOM",
      room: saved?.room || null,
      connectionStatus: device.connectionStatus,
      cumulativeKwh: device.cumulativeKwh,
      monthReportedKwh: device.monthReportedKwh,
      reportedMonth: device.reportedMonth,
      instantPowerW: device.instantPowerW,
      providerReportedAt: device.providerReportedAt,
      inventoryFetchedAt: fetchedAt,
      isMissing: false,
      isMock: false,
      tariffMode: saved?.tariffMode || null,
      tariffRateVnd: saved?.tariffRateVnd ?? null,
      tariffVerifiedAt: saved?.tariffVerifiedAt || null,
    };
  });
  const known = new Set(inventory.map((device) => device.id));
  for (const meter of mapped) {
    if (
      !meter.hunonicDeviceId ||
      /^(MOCK|DEV)-/i.test(meter.hunonicDeviceId) ||
      known.has(meter.hunonicDeviceId)
    )
      continue;
    result.push({
      id: meter.id,
      hunonicDeviceId: meter.hunonicDeviceId,
      providerDeviceId: null,
      deviceName: null as any,
      meterSerial: meter.meterSerial || null,
      homeName: null,
      providerRoomName: null,
      meterType: meter.meterType || "ROOM",
      room: meter.room || null,
      connectionStatus: "UNCONFIGURED",
      cumulativeKwh: null,
      monthReportedKwh: null,
      reportedMonth: null,
      instantPowerW: null,
      providerReportedAt: null,
      inventoryFetchedAt: fetchedAt,
      isMissing: true,
      isMock: /^(MOCK|DEV)-/i.test(meter.hunonicDeviceId),
      tariffMode: meter.tariffMode || null,
      tariffRateVnd: meter.tariffRateVnd ?? null,
      tariffVerifiedAt: meter.tariffVerifiedAt || null,
    });
  }
  return result;
}
