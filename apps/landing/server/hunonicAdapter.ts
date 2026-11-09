import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { signHunonicLogin } from "./hunonicSignature";
import { writeHunonicWebTariff } from "./hunonicWebTariff";
import {
  normalizeHunonicInventory,
  type HunonicCloudMeter,
} from "./hunonicInventory";
export type { HunonicCloudMeter } from "./hunonicInventory";

export interface HunonicCredentials {
  phone: string;
  password?: string;
  apiToken?: string;
}

export type HunonicDeviceSummary = HunonicCloudMeter;

export interface HunonicTelemetry {
  deviceId: string;
  cumulativeKwh: number | null;
  monthReportedKwh: number | null;
  reportedMonth: string | null;
  instantPowerW: number | null;
  isOnline: boolean | null;
  status: "ONLINE" | "OFFLINE" | "STALE" | "UNCONFIGURED";
  lastReportedAt: Date | null;
}

export interface KwhValidationResult {
  isValid: boolean;
  deltaKwh: number;
  warning?: string;
  errorCode?: "NEGATIVE_DELTA" | "EXCESSIVE_DELTA" | "SUSPICIOUS_JUMP";
}

/**
 * Validates delta kWh reading before issuing an electric invoice.
 * Protects against negative delta (tampering/meter rollback) or abnormal jumps (> 2000 kWh/month).
 */
export function validateKwhReading(
  previousKwh: number | null | undefined,
  currentKwh: number,
  isMeterReplaced = false,
): KwhValidationResult {
  if (typeof currentKwh !== "number" || isNaN(currentKwh) || currentKwh < 0) {
    return {
      isValid: false,
      deltaKwh: 0,
      warning:
        "Chỉ số điện hiện tại không hợp lệ (nhỏ hơn 0 hoặc không phải số).",
      errorCode: "NEGATIVE_DELTA",
    };
  }

  const prev =
    typeof previousKwh === "number" && !isNaN(previousKwh) ? previousKwh : 0;

  if (isMeterReplaced) {
    return {
      isValid: true,
      deltaKwh: Math.max(0, currentKwh),
      warning:
        "Công tơ đã được thay mới; chỉ số kỳ này tính từ mốc 0 của công tơ mới.",
    };
  }

  const delta = Number((currentKwh - prev).toFixed(2));

  if (delta < 0) {
    return {
      isValid: false,
      deltaKwh: delta,
      warning: `Chỉ số điện mới (${currentKwh} kWh) thấp hơn chỉ số kỳ trước (${prev} kWh). Nghi vấn tua công tơ hoặc đổi thiết bị chưa báo cáo.`,
      errorCode: "NEGATIVE_DELTA",
    };
  }

  // Normal room threshold: 2,000 kWh/month is excessive for a residential serviced apartment
  if (delta > 2000) {
    return {
      isValid: false,
      deltaKwh: delta,
      warning: `Mức tiêu thụ đột biến ${delta} kWh (> 2.000 kWh/tháng). Cần kiểm tra vật lý trước khi xuất hóa đơn.`,
      errorCode: "EXCESSIVE_DELTA",
    };
  }

  return {
    isValid: true,
    deltaKwh: delta,
  };
}

export type WaterBillingMethod = "PER_M3" | "PER_PERSON" | "FIXED_PER_ROOM";

export interface WaterBillingCalculation {
  method: WaterBillingMethod;
  rateVnd: number;
  consumptionM3?: number;
  occupantsCount?: number;
  totalVnd: number;
  formulaSummary: string;
}

/**
 * Computes water billing amount across 3 enterprise methods:
 * 1. PER_M3: Consumption in cubic meters * unit price
 * 2. PER_PERSON: Number of occupants * fixed rate per occupant
 * 3. FIXED_PER_ROOM: Flat package price per room
 */
export function calculateWaterBill(params: {
  method: string;
  rateVnd: number;
  consumptionM3?: number;
  occupantsCount?: number;
}): WaterBillingCalculation {
  const method: WaterBillingMethod =
    params.method === "PER_PERSON" || params.method === "FIXED_PER_ROOM"
      ? params.method
      : "PER_M3";

  const rate = Math.max(0, Math.trunc(Number(params.rateVnd) || 0));

  if (method === "PER_PERSON") {
    const occupants = Math.max(
      1,
      Math.trunc(Number(params.occupantsCount) || 1),
    );
    const total = occupants * rate;
    return {
      method,
      rateVnd: rate,
      occupantsCount: occupants,
      totalVnd: total,
      formulaSummary: `${occupants} người × ${rate.toLocaleString("vi-VN")} đ = ${total.toLocaleString("vi-VN")} đ`,
    };
  }

  if (method === "FIXED_PER_ROOM") {
    return {
      method,
      rateVnd: rate,
      totalVnd: rate,
      formulaSummary: `Khoán trọn gói theo phòng: ${rate.toLocaleString("vi-VN")} đ/tháng`,
    };
  }

  // Default: PER_M3
  const m3 = Math.max(0, Number(params.consumptionM3 ?? 0));
  const total = Math.trunc(m3 * rate);
  return {
    method: "PER_M3",
    rateVnd: rate,
    consumptionM3: m3,
    totalVnd: total,
    formulaSummary: `${m3} m³ × ${rate.toLocaleString("vi-VN")} đ = ${total.toLocaleString("vi-VN")} đ`,
  };
}

/**
 * Hunonic Cloud Adapter
 * Communicates with Hunonic Mobile/Website Cloud API (api.hunonicpro.com).
 * Includes simulation / test mode fallback when running against mock or sandbox device IDs.
 */
export class HunonicTariffVerificationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HunonicTariffVerificationError";
  }
}

export class HunonicCloudClient {
  private baseUrl: string;
  private tokenCache: Map<string, { token: string; expiresAt: number }> =
    new Map();

  constructor(baseUrl?: string) {
    this.baseUrl =
      baseUrl ||
      process.env.HUNONIC_API_BASE_URL ||
      process.env.HUNONIC_BASE_URL ||
      "https://api.hunonicpro.com/v2";
  }

  /**
   * Logs into Hunonic Cloud API to retrieve Bearer token.
   */
  async login(
    phone: string,
    password?: string,
  ): Promise<{ token: string; user?: unknown }> {
    const cleanPhone = String(phone || "").trim();
    if (!cleanPhone) {
      throw new Error("Số điện thoại tài khoản Hunonic không được để trống.");
    }

    const allowMock =
      process.env.HUNONIC_ALLOW_MOCK === "true" ||
      process.env.HUNONIC_MOCK_MODE === "true" ||
      process.env.NODE_ENV === "test";

    // In test/sandbox ONLY when mock mode is explicitly permitted
    if (
      allowMock &&
      (cleanPhone.startsWith("0999") ||
        cleanPhone === "0901234567" ||
        process.env.HUNONIC_MOCK_MODE === "true" ||
        !password)
    ) {
      const mockToken = `mock_hunonic_token_${crypto.createHash("md5").update(cleanPhone).digest("hex")}`;
      this.tokenCache.set(cleanPhone, {
        token: mockToken,
        expiresAt: Date.now() + 86400000,
      });
      return {
        token: mockToken,
        user: { phone: cleanPhone, name: "AdHome Test Operator" },
      };
    }

    if (!password) {
      throw new Error(
        "Mật khẩu tài khoản Hunonic Cloud không được để trống khi vận hành thực tế.",
      );
    }

    try {
      const fields: Record<string, string> = {
        [cleanPhone.includes("@") ? "email" : "phone"]: cleanPhone,
        password: crypto.createHash("md5").update(password).digest("hex"),
        app_name: "hunonic",
        app_role: "1",
        lang: "vi",
        is_pro_app: "1",
      };
      const form = new FormData();
      for (const [key, value] of Object.entries(fields))
        form.append(key, value);
      form.append("signature", signHunonicLogin(fields));
      const resp = await fetch(
        `${this.baseUrl.replace(/\/$/, "")}/user/login`,
        {
          method: "POST",
          headers: { Accept: "application/json", "Cache-Control": "no-cache" },
          body: form,
          signal: AbortSignal.timeout(15000),
        },
      );

      if (!resp.ok) {
        throw new Error(
          `Đăng nhập Hunonic Cloud thất bại (HTTP ${resp.status})`,
        );
      }

      const body = (await resp.json()) as {
        status?: boolean;
        success?: boolean;
        code?: string;
        token?: string;
        accessToken?: string;
        data?: { token_id?: string; token?: string };
      };
      if (
        body.status !== true &&
        body.success !== true &&
        body.code !== "success"
      )
        throw new Error(
          "Hunonic từ chối đăng nhập. Kiểm tra tài khoản và mật khẩu.",
        );
      const token =
        body.data?.token_id ||
        body.token ||
        body.accessToken ||
        body.data?.token;
      if (typeof token !== "string" || !token.trim()) {
        throw new Error("Hunonic Cloud không trả về token xác thực hợp lệ.");
      }

      this.tokenCache.set(cleanPhone, {
        token,
        expiresAt: Date.now() + 3600000,
      });

      return { token, user: body };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Lỗi kết nối máy chủ Hunonic Cloud: ${msg}`);
    }
  }

  async listElectricMeters(token: string): Promise<HunonicCloudMeter[]> {
    if (!token || token.startsWith("mock_hunonic_token_"))
      throw new Error("Không có phiên Hunonic thực để tải thiết bị.");
    const response = await fetch(
      `${this.baseUrl.replace(/\/$/, "")}/device/listDeviceByHome?token_id=${encodeURIComponent(token)}`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok)
      throw new Error("Không thể tải danh sách thiết bị Hunonic.");
    const payload = (await response.json()) as {
      status?: boolean;
      success?: boolean;
      code?: string;
      data?: unknown;
    };
    if (
      payload.status !== true &&
      payload.success !== true &&
      payload.code !== "success"
    )
      throw new Error("Hunonic từ chối tải danh sách thiết bị.");
    if (!Array.isArray(payload.data))
      throw new Error("Hunonic trả về danh sách thiết bị không hợp lệ.");
    return normalizeHunonicInventory(payload.data);
  }

  /**
   * Fetches telemetry for a specific meter device.
   * Handles offline and stale detection (> 6 hours).
   */
  async fetchDeviceTelemetry(
    token: string,
    deviceId: string,
    _fallbackBaselineKwh?: number,
  ): Promise<HunonicTelemetry> {
    const cleanId = String(deviceId || "").trim();
    const device = (await this.listElectricMeters(token)).find(
      (item) => item.id === cleanId,
    );
    if (!device)
      throw new Error(
        "Không tìm thấy mã thiết bị trong danh sách Hunonic thực.",
      );
    return {
      deviceId: device.id,
      cumulativeKwh: device.cumulativeKwh,
      monthReportedKwh: device.monthReportedKwh,
      reportedMonth: device.reportedMonth,
      instantPowerW: device.instantPowerW,
      isOnline: device.online,
      status: device.connectionStatus,
      lastReportedAt: device.providerReportedAt
        ? new Date(device.providerReportedAt)
        : null,
    };
  }

  /**
   * Fetches electricity rate groups from Hunonic Cloud (/atmwifi/electricityRate).
   */
  async fetchElectricityRateGroups(
    token: string,
    rootId = "root_main",
  ): Promise<HunonicElectricityRateGroup[]> {
    if (!token || token.startsWith("mock_hunonic_token_"))
      throw new Error("Cần phiên Hunonic thực để đọc biểu giá.");

    try {
      const resp = await fetch(
        `${this.baseUrl}/atmwifi/electricityRate?token_id=${encodeURIComponent(token)}&root_id=${encodeURIComponent(rootId)}`,
        {
          signal: AbortSignal.timeout(15000),
          method: "POST",
          body: new URLSearchParams({ token_id: token, root_id: rootId }),
        },
      );

      if (!resp.ok) {
        throw new Error(`Đọc nhóm biểu giá thất bại (HTTP ${resp.status})`);
      }

      const body = (await resp.json()) as any;
      if (
        body.status !== true &&
        body.success !== true &&
        body.code !== "success"
      )
        throw new Error("Hunonic từ chối đọc biểu giá.");
      const groups = Array.isArray(body.data)
        ? body.data
        : Array.isArray(body?.data?.data)
          ? body.data.data
          : [];
      return groups.map((g: any) => ({
        id: String(g.id || ""),
        name: String(g.name || ""),
        rates: (Array.isArray(g.electricity_rate)
          ? g.electricity_rate
          : g.electricity_rate?.price != null
            ? [g.electricity_rate]
            : []
        ).map((r: any) => ({
          id: String(r.id || ""),
          minRate: r.min_rate !== undefined ? Number(r.min_rate) : null,
          maxRate: r.max_rate !== undefined ? Number(r.max_rate) : null,
          name: String(r.name || ""),
          price: r.price !== undefined ? Number(r.price) : null,
          groupName: String(r.group_name || ""),
        })),
        raw: g,
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Lỗi kết nối đọc biểu giá Hunonic: ${msg}`);
    }
  }

  /**
   * Sends tariff updates to Hunonic Cloud (/atmwifi/addElectricityRate)
   * and verifies the change by re-fetching rate groups (HUN-02 Tab 3).
   */
  async applyElectricityRate(
    token: string,
    rootId: string,
    mode: "residential" | "custom",
    customRateVnd = 3800,
    credentials?: { phone: string; password: string },
  ): Promise<{
    success: boolean;
    mode: "residential" | "custom";
    verifiedRateVnd: number;
    verifiedAt: Date;
    rateGroups: HunonicElectricityRateGroup[];
  }> {
    if (!token || token.startsWith("mock_hunonic_token_"))
      throw new Error("Không thể xác minh biểu giá bằng dữ liệu thử nghiệm.");

    try {
      const groupId = mode === "custom" ? "1" : "2";
      const groupName = mode === "custom" ? "Tự thiết lập" : "Sinh hoạt";
      const ratePayload =
        mode === "custom"
          ? [
              {
                id: "custom_0",
                min_rate: 0,
                max_rate: 0,
                price: customRateVnd,
                group_name: groupName,
                name: "Đơn giá khoán cố định",
              },
            ]
          : [];

      const body = {
        token_id: token,
        root_id: rootId,
        electricity_group_id: groupId,
        electricity_group_name: groupName,
        electricity_rate: JSON.stringify(ratePayload),
        ...(mode === "custom"
          ? { rate: customRateVnd, price: customRateVnd, money: customRateVnd }
          : {}),
      };

      const resp = await fetch(
        `${this.baseUrl}/atmwifi/addElectricityRate?token_id=${encodeURIComponent(token)}`,
        {
          signal: AbortSignal.timeout(15000),
          method: "POST",
          body: new URLSearchParams(
            Object.entries(body).map(([key, value]) => [key, String(value)]),
          ),
        },
      );

      if (!resp.ok) {
        throw new Error(
          `Cập nhật biểu giá Hunonic thất bại (HTTP ${resp.status})`,
        );
      }
      const acknowledgment = (await resp.json()) as {
        status?: boolean;
        success?: boolean;
        code?: string;
      };
      if (
        acknowledgment.status !== true &&
        acknowledgment.success !== true &&
        acknowledgment.code !== "success"
      ) {
        throw new Error("Hunonic chưa xác nhận cập nhật biểu giá.");
      }

      // A rate group existing is not proof that this device selected it.
      // Re-read both the device selection and its actual saved rate.
      let freshGroups: HunonicElectricityRateGroup[] = [];
      let verifiedRate: number | null = null;
      let appliedGroup: string | null = null;
      let observedPrice: number | null = null;
      let providerDeviceId: string | undefined;
      const canUseWeb =
        credentials && new URL(this.baseUrl).hostname === "api.hunonicpro.com";
      for (let attempt = 0; attempt < (canUseWeb ? 8 : 4); attempt++) {
        if (attempt === 4) {
          if (!providerDeviceId)
            throw new Error(
              "Hunonic chưa trả về mã thiết bị để xác minh cấu hình.",
            );
          await writeHunonicWebTariff(
            credentials!,
            providerDeviceId,
            groupId,
            mode === "custom" ? customRateVnd : 0,
          );
        }
        if (attempt) await new Promise((resolve) => setTimeout(resolve, 400));
        freshGroups = await this.fetchElectricityRateGroups(token, rootId);
        const device = (await this.listElectricMeters(token)).find(
          (item) => item.id === rootId,
        );
        const selectedGroup = freshGroups.find((group) => group.id === groupId);
        const price = selectedGroup?.rates[0]?.price;
        appliedGroup = device?.electricityGroupId ?? null;
        providerDeviceId = device?.providerDeviceId ?? undefined;
        observedPrice =
          typeof price === "number" && Number.isFinite(price) ? price : null;
        if (
          device?.electricityGroupId === groupId &&
          typeof price === "number" &&
          Number.isFinite(price) &&
          (mode !== "custom" || price === customRateVnd)
        ) {
          verifiedRate = price;
          break;
        }
      }
      if (verifiedRate === null) {
        if (
          appliedGroup === groupId &&
          mode === "custom" &&
          observedPrice === null
        ) {
          throw new HunonicTariffVerificationError(
            "HUNONIC_CUSTOM_RATE_EMPTY",
            `Hunonic đã chọn giá cố định nhưng chưa lưu đơn giá ${customRateVnd.toLocaleString("vi-VN")} đ/kWh.`,
          );
        }
        throw new HunonicTariffVerificationError(
          "HUNONIC_TARIFF_MISMATCH",
          appliedGroup !== groupId
            ? "Nhóm giá đang áp dụng trên Hunonic chưa khớp lựa chọn."
            : `Đơn giá Hunonic đọc lại (${observedPrice ?? "chưa có"} đ/kWh) chưa khớp đơn giá vừa gửi.`,
        );
      }

      return {
        success: true,
        mode,
        verifiedRateVnd: verifiedRate,
        verifiedAt: new Date(),
        rateGroups: freshGroups,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (err instanceof HunonicTariffVerificationError) throw err;
      throw new Error(`Lỗi cập nhật biểu giá Hunonic: ${msg}`);
    }
  }
}

// ===========================================================================
// JSON SNAPSHOT DATA CONTRACT (HUN-04)
// ===========================================================================

export interface HunonicElectricityRateItem {
  id: string;
  minRate: number | null;
  maxRate: number | null;
  name: string | null;
  price: number | null;
  groupName: string | null;
}

export interface HunonicElectricityRateGroup {
  id: string;
  name: string;
  rates: HunonicElectricityRateItem[];
  raw?: unknown;
}

export interface HunonicMeterReadingSnapshot {
  basis: "CUMULATIVE" | "MONTHLY_CONSUMPTION";
  valueKwh: number | null;
  instantPowerW: number | null;
  measuredAt: string | null;
  quality:
    "VALID" | "STALE" | "OFFLINE" | "SUSPICIOUS" | "UNVERIFIED" | "MISSING";
}

export interface HunonicTariffSnapshot {
  mode: "residential" | "custom";
  verifiedRateVnd: number | null;
  verifiedAt: string | null;
}

export interface HunonicMeterSnapshotItem {
  buildingId: string;
  roomId: string;
  roomCode: string;
  meterId: string;
  hunonicDeviceId: string;
  meterType: "ROOM" | "BUILDING_TOTAL" | "COMMON_AREA";
  provider: "HUNONIC";
  reading: HunonicMeterReadingSnapshot;
  tariff: HunonicTariffSnapshot;
  syncStatus: "SUCCESS" | "ERROR";
}

export interface HunonicJsonSnapshot {
  schemaVersion: 1;
  orgId: string;
  syncJobId: string;
  exportedAt: string;
  status: "SUCCESS" | "PARTIAL" | "ERROR";
  summary: {
    totalMeters: number;
    syncedMeters: number;
    failedMeters: number;
  };
  meters: HunonicMeterSnapshotItem[];
  inventorySource?: "HUNONIC_V2";
  inventoryAccount?: string;
  inventoryFetchedAt?: string;
  devices?: HunonicCloudMeter[];
}

/**
 * Standard Snapshot Directory: apps/landing/data/snapshots/
 */
export function getSnapshotDirectory(): string {
  const custom = process.env.SNAPSHOT_DIRECTORY;
  if (custom && custom.trim() !== "") return path.resolve(custom);
  const cwd = process.cwd();
  if (cwd.endsWith("apps\\landing") || cwd.endsWith("apps/landing")) {
    return path.resolve(cwd, "data", "snapshots");
  }
  return path.resolve(cwd, "apps", "landing", "data", "snapshots");
}

/**
 * Atomically publishes a standardized Hunonic JSON snapshot (HUN-04).
 * Uses temporary file writing and atomic rename (fs.rename) to prevent reading partial writes.
 */
export async function exportAtomicJsonSnapshot(
  snapshot: HunonicJsonSnapshot,
  customDir?: string,
): Promise<string> {
  const dir = customDir || getSnapshotDirectory();
  await fs.promises.mkdir(dir, { recursive: true });

  const finalPath = path.join(dir, `hunonic_snapshot_${snapshot.orgId}.json`);
  const tmpPath = path.join(
    dir,
    `hunonic_snapshot_${snapshot.orgId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.tmp`,
  );

  const payload = JSON.stringify(snapshot, null, 2);
  await fs.promises.writeFile(tmpPath, payload, "utf8");

  // Atomic file replacement (Windows and POSIX safe)
  try {
    await fs.promises.rename(tmpPath, finalPath);
  } catch (err) {
    // If destination exists on Windows and direct rename fails, unlink first
    try {
      await fs.promises.unlink(finalPath);
    } catch {
      // Ignore if not exists
    }
    await fs.promises.rename(tmpPath, finalPath);
  }

  return finalPath;
}

/**
 * Reads the latest verified atomic JSON snapshot for an organization (HUN-04).
 * Guaranteed not to call external Hunonic APIs.
 */
export async function readJsonSnapshot(
  orgId: string,
  customDir?: string,
): Promise<HunonicJsonSnapshot | null> {
  const dir = customDir || getSnapshotDirectory();
  const filePath = path.join(dir, `hunonic_snapshot_${orgId}.json`);

  try {
    const raw = await fs.promises.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as HunonicJsonSnapshot;
    if (parsed && parsed.schemaVersion === 1 && parsed.orgId === orgId) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export async function cacheHunonicInventory(
  orgId: string,
  devices: HunonicCloudMeter[],
  account: string,
): Promise<HunonicJsonSnapshot> {
  const previous = await readJsonSnapshot(orgId);
  const now = new Date().toISOString();
  const snapshot: HunonicJsonSnapshot = isHunonicInventoryForAccount(
    previous,
    account,
  )
    ? { ...previous! }
    : {
        schemaVersion: 1,
        orgId,
        syncJobId: `catalog_${Date.now()}`,
        exportedAt: now,
        status: "SUCCESS",
        summary: { totalMeters: 0, syncedMeters: 0, failedMeters: 0 },
        meters: [],
      };
  snapshot.inventorySource = "HUNONIC_V2";
  snapshot.inventoryAccount = account;
  snapshot.inventoryFetchedAt = now;
  snapshot.devices = devices;
  await exportAtomicJsonSnapshot(snapshot);
  return snapshot;
}

export function isHunonicInventoryForAccount(
  snapshot: HunonicJsonSnapshot | null | undefined,
  account: string,
): boolean {
  return Boolean(
    account &&
    snapshot?.inventorySource === "HUNONIC_V2" &&
    snapshot.inventoryAccount === account,
  );
}
