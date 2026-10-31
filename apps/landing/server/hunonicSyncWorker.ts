import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import {
  HunonicCloudClient,
  validateKwhReading,
  exportAtomicJsonSnapshot,
  type HunonicJsonSnapshot,
  type HunonicMeterSnapshotItem,
} from './hunonicAdapter';
import { decryptSecret } from './cryptoVault';

export interface HunonicSyncWorkerOptions {
  prisma: PrismaClient;
  orgId: string;
  actorId?: string;
  triggerType?: 'MANUAL_JOB' | 'CRON_HOURLY';
}

/**
 * Background Sync Worker for Hunonic IoT Meters (HUN-03, HUN-04, CRON-02)
 * Decouples Hunonic external API latency from user page-load operations.
 * Writes verified records to PostgreSQL and publishes atomic JSON snapshots.
 */
export async function executeHunonicBackgroundSync(
  options: HunonicSyncWorkerOptions
): Promise<HunonicJsonSnapshot> {
  const { prisma, orgId, actorId = 'system_worker', triggerType = 'MANUAL_JOB' } = options;

  const jobId = `sync_job_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  // 1. Create or register Sync Job record
  await prisma.integrationSyncJob.create({
    data: {
      id: jobId,
      orgId,
      providerId: 'HUNONIC',
      jobType: triggerType,
      status: 'RUNNING',
      startedAt: new Date(),
    },
  });

  try {
    // 2. Load and decrypt Hunonic credentials
    const conn = await prisma.integrationConnection.findUnique({
      where: {
        orgId_providerId: { orgId, providerId: 'HUNONIC' },
      },
    });

    const credsJson = (conn?.credentialsJson as any) || {};
    let phone = credsJson.phone || '0901234567';
    let password = credsJson.password;
    if (credsJson.encryptedPassword) {
      try {
        password = decryptSecret(credsJson.encryptedPassword);
      } catch {
        password = credsJson.password;
      }
    }

    const client = new HunonicCloudClient();
    const loginResult = await client.login(phone, password);
    const token = loginResult.token;

    // 3. Find all configured meters for this organization
    const meters = await prisma.electricMeter.findMany({
      where: {
        orgId,
        hunonicDeviceId: { not: null },
      },
      include: {
        room: {
          select: { id: true, code: true, buildingId: true, electricBillingMode: true },
        },
      },
    });

    const periodKey = new Date().toISOString().slice(0, 7); // YYYY-MM
    let syncedCount = 0;
    let failedCount = 0;
    const snapshotItems: HunonicMeterSnapshotItem[] = [];

    // 4. Query telemetry per meter and persist to PostgreSQL
    for (const meter of meters) {
      const deviceId = meter.hunonicDeviceId!;
      try {
        let telemetry: any = null;
        let attempt = 0;
        const maxRetries = 2;
        while (attempt <= maxRetries) {
          try {
            telemetry = await client.fetchDeviceTelemetry(token, deviceId, meter.cumulativeKwh || 120.0);
            break;
          } catch (fetchErr) {
            attempt++;
            if (attempt > maxRetries) {
              throw fetchErr;
            }
            await new Promise((r) => setTimeout(r, 100 * attempt));
          }
        }
        const kwhValid = validateKwhReading(meter.cumulativeKwh, telemetry.cumulativeKwh);

        const quality: 'VALID' | 'STALE' | 'OFFLINE' | 'SUSPICIOUS' = !telemetry.isOnline
          ? 'OFFLINE'
          : telemetry.status === 'STALE'
          ? 'STALE'
          : !kwhValid.isValid
          ? 'SUSPICIOUS'
          : 'VALID';

        // Update ElectricMeter state in database
        await prisma.electricMeter.update({
          where: { id: meter.id },
          data: {
            cumulativeKwh: telemetry.cumulativeKwh,
            instantPowerW: telemetry.instantPowerW,
            connectionStatus: telemetry.status,
            lastSyncedAt: new Date(),
          },
        });

        // Record reading in MeterReading table
        if (quality === 'VALID' || quality === 'STALE') {
          await prisma.meterReading.create({
            data: {
              meterId: meter.id,
              periodKey,
              readingKwh: telemetry.cumulativeKwh,
              source: 'HUNONIC_AUTO',
              recordedByActor: actorId,
            },
          });
        }

        // Track exception in BillingPeriod if quality is not valid
        if (quality !== 'VALID') {
          await prisma.billingPeriod.upsert({
            where: {
              orgId_buildingId_periodKey: {
                orgId,
                buildingId: meter.room.buildingId,
                periodKey,
              },
            },
            create: {
              orgId,
              buildingId: meter.room.buildingId,
              periodKey,
              status: 'EXCEPTION',
              exceptionCount: 1,
            },
            update: {
              status: 'EXCEPTION',
              exceptionCount: { increment: 1 },
            },
          });
        }

        syncedCount++;
        snapshotItems.push({
          buildingId: meter.room.buildingId,
          roomId: meter.roomId,
          roomCode: meter.room.code,
          meterId: meter.id,
          hunonicDeviceId: deviceId,
          meterType: (meter.meterType as any) || 'ROOM',
          provider: 'HUNONIC',
          reading: {
            basis: (meter.readingBasis as any) || 'CUMULATIVE',
            valueKwh: telemetry.cumulativeKwh,
            instantPowerW: telemetry.instantPowerW,
            measuredAt: telemetry.lastReportedAt.toISOString(),
            quality,
          },
          tariff: {
            mode: (meter.tariffMode as any) || 'custom',
            verifiedRateVnd: meter.tariffRateVnd || 3800,
            verifiedAt: (meter.tariffVerifiedAt || new Date()).toISOString(),
          },
          syncStatus: 'SUCCESS',
        });
      } catch (meterErr) {
        failedCount++;
        snapshotItems.push({
          buildingId: meter.room.buildingId,
          roomId: meter.roomId,
          roomCode: meter.room.code,
          meterId: meter.id,
          hunonicDeviceId: deviceId,
          meterType: (meter.meterType as any) || 'ROOM',
          provider: 'HUNONIC',
          reading: {
            basis: (meter.readingBasis as any) || 'CUMULATIVE',
            valueKwh: meter.cumulativeKwh || 0,
            instantPowerW: 0,
            measuredAt: new Date().toISOString(),
            quality: 'OFFLINE',
          },
          tariff: {
            mode: (meter.tariffMode as any) || 'custom',
            verifiedRateVnd: meter.tariffRateVnd || 3800,
            verifiedAt: (meter.tariffVerifiedAt || new Date()).toISOString(),
          },
          syncStatus: 'ERROR',
        });
      }
    }

    // 5. Assemble standard JSON snapshot
    const snapshot: HunonicJsonSnapshot = {
      schemaVersion: 1,
      orgId,
      syncJobId: jobId,
      exportedAt: new Date().toISOString(),
      status: failedCount === 0 ? 'SUCCESS' : syncedCount > 0 ? 'PARTIAL' : 'ERROR',
      summary: {
        totalMeters: meters.length,
        syncedMeters: syncedCount,
        failedMeters: failedCount,
      },
      meters: snapshotItems,
    };

    // 6. Atomically export JSON snapshot
    const snapshotPath = await exportAtomicJsonSnapshot(snapshot);

    // 7. Update Sync Job record
    await prisma.integrationSyncJob.update({
      where: { id: jobId },
      data: {
        status: snapshot.status,
        totalItems: meters.length,
        syncedItems: syncedCount,
        failedItems: failedCount,
        snapshotPath,
        completedAt: new Date(),
      },
    });

    // 8. Update IntegrationConnection lastSyncedAt
    await prisma.integrationConnection.updateMany({
      where: { orgId, providerId: 'HUNONIC' },
      data: {
        lastSyncedAt: new Date(),
        status: 'VERIFIED',
      },
    });

    return snapshot;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await prisma.integrationSyncJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        errorMessage: errorMsg,
        completedAt: new Date(),
      },
    });
    throw err;
  }
}

