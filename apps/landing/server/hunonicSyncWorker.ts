import crypto from "node:crypto";
import { syncHunonicHistory } from "./hunonicHistory";
import type { PrismaClient } from "@prisma/client";
import {
  HunonicCloudClient,
  validateKwhReading,
  exportAtomicJsonSnapshot,
  type HunonicJsonSnapshot,
  type HunonicMeterSnapshotItem,
} from "./hunonicAdapter";
import { readHunonicCredentials } from "./hunonicCredentials";

export interface HunonicSyncWorkerOptions {
  prisma: PrismaClient;
  orgId: string;
  actorId?: string;
  triggerType?: "MANUAL_JOB" | "CRON_HOURLY";
  jobId?: string;
  buildingIds?: string[];
}

/** Import one authoritative catalog per job, including devices not yet assigned to a room. */
export async function executeHunonicBackgroundSync(
  options: HunonicSyncWorkerOptions,
): Promise<HunonicJsonSnapshot> {
  const {
    prisma,
    orgId,
    actorId = "system_worker",
    triggerType = "MANUAL_JOB",
  } = options;
  const jobId =
    options.jobId ||
    `sync_job_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  let connectionVersion: Date | undefined;
  await prisma.integrationSyncJob.create({
    data: {
      id: jobId,
      orgId,
      providerId: "HUNONIC",
      jobType: triggerType,
      status: "RUNNING",
      startedAt: new Date(),
    },
  });
  try {
    const connection = await prisma.integrationConnection.findUnique({
      where: { orgId_providerId: { orgId, providerId: "HUNONIC" } },
    });
    connectionVersion = connection?.updatedAt;
    if (!connection?.isEnabled)
      throw new Error("Tích hợp Hunonic chưa được kích hoạt.");
    const { phone, password } = readHunonicCredentials(
      connection.credentialsJson,
    );
    const client = new HunonicCloudClient();
    const session = await client.login(phone, password);
    if (session.token.startsWith("mock_hunonic_token_"))
      throw new Error("Không đồng bộ dữ liệu thử nghiệm vào công tơ vận hành.");
    const devices = await client.listElectricMeters(session.token);
    const fetchedAt = new Date();
    const byId = new Map(devices.map((device) => [device.id, device]));
    const meters = await prisma.electricMeter.findMany({
      where: {
        orgId,
        hunonicDeviceId: { not: null },
        ...(options.buildingIds
          ? { room: { buildingId: { in: options.buildingIds } } }
          : {}),
      },
      include: {
        room: {
          select: {
            id: true,
            code: true,
            buildingId: true,
            electricBillingMode: true,
          },
        },
      },
    });
    await prisma.integrationSyncJob.update({
      where: { id: jobId },
      data: {
        totalItems: meters.length || devices.length,
        syncedItems: 0,
        failedItems: 0,
      },
    });
    const periodKey = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
    })
      .format(fetchedAt)
      .slice(0, 7);
    let synced = 0;
    let failed = 0;
    const items: HunonicMeterSnapshotItem[] = [];
    for (const meter of meters) {
      const device = byId.get(meter.hunonicDeviceId!);
      const basis =
        device?.cumulativeKwh != null ? "CUMULATIVE" : "MONTHLY_CONSUMPTION";
      const value = device?.cumulativeKwh ?? device?.monthReportedKwh ?? null;
      const validation =
        device?.cumulativeKwh == null
          ? null
          : validateKwhReading(meter.cumulativeKwh, device.cumulativeKwh);
      const quality: HunonicMeterSnapshotItem["reading"]["quality"] = !device
        ? "MISSING"
        : device.online === false
          ? "OFFLINE"
          : device.connectionStatus === "STALE"
            ? "STALE"
            : validation && !validation.isValid
              ? "SUSPICIOUS"
              : value === null ||
                  !device.providerReportedAt ||
                  device.online !== true ||
                  basis !== "CUMULATIVE"
                ? "UNVERIFIED"
                : "VALID";
      await prisma.electricMeter.update({
        where: { id: meter.id },
        data: {
          connectionStatus:
            !device || quality === "SUSPICIOUS"
              ? "UNCONFIGURED"
              : device.connectionStatus,
          instantPowerW: device?.instantPowerW ?? null,
          monthReportedKwh: device?.monthReportedKwh ?? null,
          ...(device ? { readingBasis: basis } : {}),
          ...(quality === "VALID" && device?.cumulativeKwh != null
            ? { cumulativeKwh: device.cumulativeKwh }
            : {}),
          lastSyncedAt: fetchedAt,
        },
      });
      // Monthly consumption and unknown timestamps must never become cumulative billing readings.
      if (
        quality === "VALID" &&
        device?.cumulativeKwh != null &&
        device.providerReportedAt
      ) {
        const recordedAt = new Date(device.providerReportedAt);
        const alreadyRecorded = await prisma.meterReading.findFirst({
          where: {
            meterId: meter.id,
            periodKey,
            readingKwh: device.cumulativeKwh,
            recordedAt,
            source: "HUNONIC_AUTO",
          },
        });
        if (!alreadyRecorded)
          await prisma.meterReading.create({
            data: {
              meterId: meter.id,
              periodKey,
              readingKwh: device.cumulativeKwh,
              recordedAt,
              source: "HUNONIC_AUTO",
              recordedByActor: actorId,
            },
          });
      }

      if (device && value !== null) synced++;
      else failed++;
      items.push({
        buildingId: meter.room.buildingId,
        roomId: meter.roomId,
        roomCode: meter.room.code,
        meterId: meter.id,
        hunonicDeviceId: meter.hunonicDeviceId!,
        meterType: meter.meterType as "ROOM",
        provider: "HUNONIC",
        reading: {
          basis,
          valueKwh: value,
          instantPowerW: device?.instantPowerW ?? null,
          measuredAt: device?.providerReportedAt ?? null,
          quality,
        },
        tariff: {
          mode: meter.tariffMode as "custom",
          verifiedRateVnd: meter.tariffRateVnd,
          verifiedAt: meter.tariffVerifiedAt?.toISOString() || null,
        },
        syncStatus: device && value !== null ? "SUCCESS" : "ERROR",
      });
      await prisma.integrationSyncJob.update({
        where: { id: jobId },
        data: { syncedItems: synced, failedItems: failed },
      });
    }
    const history = await syncHunonicHistory(
      orgId,
      phone,
      session.token,
      devices,
    );
    const historyFailed = history.failedDeviceIds.length;
    const snapshot: HunonicJsonSnapshot = {
      schemaVersion: 1,
      orgId,
      syncJobId: jobId,
      exportedAt: fetchedAt.toISOString(),
      inventorySource: "HUNONIC_V2",
      inventoryAccount: phone,
      inventoryFetchedAt: fetchedAt.toISOString(),
      devices,
      status:
        failed === 0 && historyFailed === 0
          ? "SUCCESS"
          : devices.length > 0
            ? "PARTIAL"
            : "ERROR",
      summary: {
        totalMeters: meters.length,
        syncedMeters: synced,
        failedMeters: failed,
      },
      meters: items,
    };
    const snapshotPath = await exportAtomicJsonSnapshot(snapshot);
    await prisma.integrationSyncJob.update({
      where: { id: jobId },
      data: {
        status: snapshot.status,
        totalItems: meters.length || devices.length,
        syncedItems: meters.length ? synced : devices.length,
        failedItems: failed + historyFailed,
        snapshotPath,
        completedAt: new Date(),
        errorMessage: historyFailed
          ? `${historyFailed} thiết bị chưa tải được lịch sử Hunonic; lịch sử cũ được giữ nguyên.`
          : failed
            ? `${failed} công tơ chưa có dữ liệu từ Hunonic; xem trạng thái từng thiết bị.`
            : null,
      },
    });
    await prisma.integrationConnection.updateMany({
      where: { orgId, providerId: "HUNONIC", updatedAt: connection.updatedAt },
      data: {
        lastSyncedAt: fetchedAt,
        lastTestedAt: fetchedAt,
        status: "VERIFIED",
        lastError: null,
        credentialsJson: {
          ...(connection.credentialsJson as object),
          verification: {
            protocol: "hunonic-mobile-v2",
            phone,
            verifiedAt: fetchedAt.toISOString(),
          },
        },
      },
    });
    return snapshot;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Đồng bộ Hunonic thất bại.";
    await prisma.integrationSyncJob.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        errorMessage: message,
        completedAt: new Date(),
      },
    });
    await prisma.integrationConnection.updateMany({
      where: {
        orgId,
        providerId: "HUNONIC",
        isEnabled: true,
        ...(connectionVersion ? { updatedAt: connectionVersion } : {}),
      },
      data: { status: "ERROR", lastError: message },
    });
    throw error;
  }
}
