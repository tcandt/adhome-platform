import crypto from 'node:crypto';

export interface HunonicCredentials {
  phone: string;
  password?: string;
  apiToken?: string;
}

export interface HunonicDeviceSummary {
  deviceId: string;
  name: string;
  type: string; // 'elmeter' | 'atmwifi' | 'switch' etc.
  online: boolean;
  cumulativeKwh: number;
  instantPowerW: number;
  lastReportedAt: string;
}

export interface HunonicTelemetry {
  deviceId: string;
  cumulativeKwh: number;
  instantPowerW: number;
  voltageV?: number;
  currentA?: number;
  isOnline: boolean;
  status: 'ONLINE' | 'OFFLINE' | 'STALE';
  lastReportedAt: Date;
  rawPayload?: Record<string, unknown>;
}

export interface KwhValidationResult {
  isValid: boolean;
  deltaKwh: number;
  warning?: string;
  errorCode?: 'NEGATIVE_DELTA' | 'EXCESSIVE_DELTA' | 'SUSPICIOUS_JUMP';
}

/**
 * Validates delta kWh reading before issuing an electric invoice.
 * Protects against negative delta (tampering/meter rollback) or abnormal jumps (> 2000 kWh/month).
 */
export function validateKwhReading(
  previousKwh: number | null | undefined,
  currentKwh: number,
  isMeterReplaced = false
): KwhValidationResult {
  if (typeof currentKwh !== 'number' || isNaN(currentKwh) || currentKwh < 0) {
    return {
      isValid: false,
      deltaKwh: 0,
      warning: 'Chỉ số điện hiện tại không hợp lệ (nhỏ hơn 0 hoặc không phải số).',
      errorCode: 'NEGATIVE_DELTA',
    };
  }

  const prev = typeof previousKwh === 'number' && !isNaN(previousKwh) ? previousKwh : 0;

  if (isMeterReplaced) {
    return {
      isValid: true,
      deltaKwh: Math.max(0, currentKwh),
      warning: 'Công tơ đã được thay mới; chỉ số kỳ này tính từ mốc 0 của công tơ mới.',
    };
  }

  const delta = Number((currentKwh - prev).toFixed(2));

  if (delta < 0) {
    return {
      isValid: false,
      deltaKwh: delta,
      warning: `Chỉ số điện mới (${currentKwh} kWh) thấp hơn chỉ số kỳ trước (${prev} kWh). Nghi vấn tua công tơ hoặc đổi thiết bị chưa báo cáo.`,
      errorCode: 'NEGATIVE_DELTA',
    };
  }

  // Normal room threshold: 2,000 kWh/month is excessive for a residential serviced apartment
  if (delta > 2000) {
    return {
      isValid: false,
      deltaKwh: delta,
      warning: `Mức tiêu thụ đột biến ${delta} kWh (> 2.000 kWh/tháng). Cần kiểm tra vật lý trước khi xuất hóa đơn.`,
      errorCode: 'EXCESSIVE_DELTA',
    };
  }

  return {
    isValid: true,
    deltaKwh: delta,
  };
}

export type WaterBillingMethod = 'PER_M3' | 'PER_PERSON' | 'FIXED_PER_ROOM';

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
    params.method === 'PER_PERSON' || params.method === 'FIXED_PER_ROOM'
      ? params.method
      : 'PER_M3';

  const rate = Math.max(0, Math.trunc(Number(params.rateVnd) || 0));

  if (method === 'PER_PERSON') {
    const occupants = Math.max(1, Math.trunc(Number(params.occupantsCount) || 1));
    const total = occupants * rate;
    return {
      method,
      rateVnd: rate,
      occupantsCount: occupants,
      totalVnd: total,
      formulaSummary: `${occupants} người × ${rate.toLocaleString('vi-VN')} đ = ${total.toLocaleString('vi-VN')} đ`,
    };
  }

  if (method === 'FIXED_PER_ROOM') {
    return {
      method,
      rateVnd: rate,
      totalVnd: rate,
      formulaSummary: `Khoán trọn gói theo phòng: ${rate.toLocaleString('vi-VN')} đ/tháng`,
    };
  }

  // Default: PER_M3
  const m3 = Math.max(0, Number(params.consumptionM3 ?? 0));
  const total = Math.trunc(m3 * rate);
  return {
    method: 'PER_M3',
    rateVnd: rate,
    consumptionM3: m3,
    totalVnd: total,
    formulaSummary: `${m3} m³ × ${rate.toLocaleString('vi-VN')} đ = ${total.toLocaleString('vi-VN')} đ`,
  };
}

/**
 * Hunonic Cloud Adapter
 * Communicates with Hunonic Mobile/Website Cloud API (api.hunonicpro.com).
 * Includes simulation / test mode fallback when running against mock or sandbox device IDs.
 */
export class HunonicCloudClient {
  private baseUrl: string;
  private tokenCache: Map<string, { token: string; expiresAt: number }> = new Map();

  constructor(baseUrl?: string) {
    this.baseUrl =
      baseUrl || process.env.HUNONIC_API_BASE_URL || 'https://api.hunonicpro.com/v3';
  }

  /**
   * Logs into Hunonic Cloud API to retrieve Bearer token.
   */
  async login(phone: string, password?: string): Promise<{ token: string; user?: unknown }> {
    const cleanPhone = String(phone || '').trim();
    if (!cleanPhone) {
      throw new Error('Số điện thoại tài khoản Hunonic không được để trống.');
    }

    // In test/sandbox or if mock credentials
    if (
      cleanPhone.startsWith('0999') ||
      cleanPhone === '0901234567' ||
      process.env.HUNONIC_MOCK_MODE === 'true' ||
      !password
    ) {
      const mockToken = `mock_hunonic_token_${crypto.createHash('md5').update(cleanPhone).digest('hex')}`;
      this.tokenCache.set(cleanPhone, {
        token: mockToken,
        expiresAt: Date.now() + 86400000,
      });
      return {
        token: mockToken,
        user: { phone: cleanPhone, name: 'AdHome Test Operator' },
      };
    }

    try {
      const resp = await fetch(`${this.baseUrl}/user/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone, password }),
      });

      if (!resp.ok) {
        throw new Error(`Đăng nhập Hunonic Cloud thất bại (HTTP ${resp.status})`);
      }

      const body = (await resp.json()) as { token?: string; accessToken?: string; data?: { token?: string } };
      const token = body.token || body.accessToken || body.data?.token;
      if (!token) {
        throw new Error('Hunonic Cloud không trả về token xác thực hợp lệ.');
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

  /**
   * Fetches telemetry for a specific meter device.
   * Handles offline and stale detection (> 6 hours).
   */
  async fetchDeviceTelemetry(
    token: string,
    deviceId: string,
    fallbackBaselineKwh = 125.4
  ): Promise<HunonicTelemetry> {
    const cleanId = String(deviceId || '').trim();

    // Check if test/sandbox device ID or mock token
    if (token.startsWith('mock_hunonic_token_') || cleanId.startsWith('MOCK-') || cleanId.startsWith('DEV-')) {
      // Deterministic mock based on device ID
      const hash = crypto.createHash('sha256').update(cleanId).digest('hex');
      const offsetKwh = (parseInt(hash.slice(0, 4), 16) % 350) + fallbackBaselineKwh;
      const powerW = (parseInt(hash.slice(4, 8), 16) % 1800) + 120;
      const isOnline = !cleanId.includes('OFFLINE');
      const isStale = cleanId.includes('STALE');

      const reportedDate = isStale
        ? new Date(Date.now() - 10 * 3600000) // 10 hours ago -> STALE
        : new Date();

      return {
        deviceId: cleanId,
        cumulativeKwh: Number(offsetKwh.toFixed(2)),
        instantPowerW: isOnline ? powerW : 0,
        voltageV: isOnline ? 221.5 : 0,
        currentA: isOnline ? Number((powerW / 221.5).toFixed(2)) : 0,
        isOnline,
        status: !isOnline ? 'OFFLINE' : isStale ? 'STALE' : 'ONLINE',
        lastReportedAt: reportedDate,
        rawPayload: { simulated: true, hashSeed: hash.slice(0, 8) },
      };
    }

    try {
      const resp = await fetch(`${this.baseUrl}/devices/${encodeURIComponent(cleanId)}/status`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (!resp.ok) {
        return {
          deviceId: cleanId,
          cumulativeKwh: fallbackBaselineKwh,
          instantPowerW: 0,
          isOnline: false,
          status: 'OFFLINE',
          lastReportedAt: new Date(),
          rawPayload: { errorHttp: resp.status },
        };
      }

      const data = (await resp.json()) as Record<string, any>;
      const kwh = Number(data.kwh ?? data.total_energy ?? data.cumulativeKwh ?? fallbackBaselineKwh);
      const powerW = Number(data.power ?? data.instantPowerW ?? 0);
      const isOnline = Boolean(data.online ?? data.isOnline ?? true);
      const reportedAt = data.updatedAt ? new Date(data.updatedAt) : new Date();

      const hoursSinceReport = (Date.now() - reportedAt.getTime()) / 3600000;
      const status: 'ONLINE' | 'OFFLINE' | 'STALE' = !isOnline
        ? 'OFFLINE'
        : hoursSinceReport > 6
        ? 'STALE'
        : 'ONLINE';

      return {
        deviceId: cleanId,
        cumulativeKwh: Number(kwh.toFixed(2)),
        instantPowerW: powerW,
        isOnline,
        status,
        lastReportedAt: reportedAt,
        rawPayload: data,
      };
    } catch {
      return {
        deviceId: cleanId,
        cumulativeKwh: fallbackBaselineKwh,
        instantPowerW: 0,
        isOnline: false,
        status: 'OFFLINE',
        lastReportedAt: new Date(),
      };
    }
  }
}
