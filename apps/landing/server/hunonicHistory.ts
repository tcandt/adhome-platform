import crypto from "node:crypto";
import path from "node:path";
import { promises as fs } from "node:fs";
import { getSnapshotDirectory, type HunonicCloudMeter } from "./hunonicAdapter";

export interface HunonicHistoryPoint {
  date: string;
  kwh: number;
  secondaryKwh: number | null;
  solarKwh: number | null;
}
interface DeviceHistory {
  name: string;
  points: HunonicHistoryPoint[];
  syncedAt: string;
  backfilled: boolean;
}
export interface HunonicHistoryStore {
  version: 1;
  devices: Record<string, DeviceHistory>;
  failedDeviceIds: string[];
}
function filename(orgId: string, account: string) {
  const key = crypto
    .createHash("sha256")
    .update(`${orgId}:${account}`)
    .digest("hex");
  return path.join(getSnapshotDirectory(), `hunonic_history_${key}.json`);
}
export async function readHunonicHistory(
  orgId: string,
  account: string,
): Promise<HunonicHistoryStore> {
  try {
    return JSON.parse(await fs.readFile(filename(orgId, account), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return { version: 1, devices: {}, failedDeviceIds: [] };
}
export async function fetchHunonicHistory(
  baseUrl: string,
  token: string,
  rootId: string,
  start: string,
  end: string,
): Promise<HunonicHistoryPoint[]> {
  const response = await fetch(
    `${baseUrl.replace(/\/$/, "")}/atmwifi/getDataGraph?token_id=${encodeURIComponent(token)}`,
    {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      body: new URLSearchParams({
        token_id: token,
        root_id: rootId,
        type: "2",
        time_start: start,
        time_end: end,
        year: end.slice(0, 4),
      }),
    },
  );
  const payload = await response.json();
  if (
    !response.ok ||
    payload.status !== true ||
    !Array.isArray(payload.data?.graph_data)
  )
    throw new Error("Hunonic chưa trả lịch sử điện hợp lệ.");
  const optionalNumber = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0
      ? value
      : null;
  return payload.data.graph_data.map((point: any) => {
    const date = String(point.label || "").slice(0, 10);
    const kwh = optionalNumber(point.value);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      date < start ||
      date > end ||
      kwh === null
    )
      throw new Error("Lịch sử Hunonic chứa ngày hoặc chỉ số không hợp lệ.");
    return {
      date,
      kwh,
      secondaryKwh: optionalNumber(point.value_2),
      solarKwh: optionalNumber(point.solar),
    };
  });
}
/** First import requests all provider-retained dates; subsequent imports reconcile 30 days. */
export async function syncHunonicHistory(
  orgId: string,
  account: string,
  token: string,
  devices: HunonicCloudMeter[],
  now = new Date(),
) {
  const store = await readHunonicHistory(orgId, account);
  const end = now.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
  const recent = new Date(now.getTime() - 29 * 86400000).toLocaleDateString(
    "en-CA",
    { timeZone: "Asia/Ho_Chi_Minh" },
  );
  const baseUrl =
    process.env.HUNONIC_API_BASE_URL ||
    process.env.HUNONIC_BASE_URL ||
    "https://api.hunonicpro.com/v2";
  const failed: string[] = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(3, devices.length) }, async () => {
      while (cursor < devices.length) {
        const device = devices[cursor++];
        try {
          const previous = store.devices[device.id];
          const start = previous?.backfilled ? recent : device.createdDate;
          if (!start || start > end)
            throw new Error(
              "Thiếu ngày tạo thiết bị để xác minh đầy đủ lịch sử.",
            );
          const points: HunonicHistoryPoint[] = [];
          // Provider downsamples broad date ranges to 40 points. Request <= 30 days
          // per call to retain daily precision across every historical month.
          for (let from = start; from <= end;) {
            const until = new Date(
              Date.parse(from + "T00:00:00Z") + 29 * 86400000,
            )
              .toISOString()
              .slice(0, 10);
            const to = until < end ? until : end;
            points.push(
              ...(await fetchHunonicHistory(
                baseUrl,
                token,
                device.id,
                from,
                to,
              )),
            );
            from = new Date(Date.parse(to + "T00:00:00Z") + 86400000)
              .toISOString()
              .slice(0, 10);
          }
          const merged = new Map(
            (previous?.points || []).map((point) => [point.date, point]),
          );
          for (const point of points) merged.set(point.date, point);
          store.devices[device.id] = {
            name: device.name,
            points: [...merged.values()].sort((a, b) =>
              a.date.localeCompare(b.date),
            ),
            syncedAt: now.toISOString(),
            backfilled: true,
          };
        } catch {
          failed.push(device.id);
        }
      }
    }),
  );
  store.failedDeviceIds = failed;
  const file = filename(orgId, account);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, JSON.stringify(store), "utf8");
  await fs.rename(temp, file);
  return store;
}
