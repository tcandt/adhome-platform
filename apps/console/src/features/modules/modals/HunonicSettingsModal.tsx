import React, { useEffect, useRef, useState } from "react";
import { Button as AnimatedButton } from "@animate-ui/react/primitives/buttons/button";
import { ShimmeringText } from "@animate-ui/react/primitives/texts/shimmering";
import { Dialog } from "@animate-ui/react/primitives/base-ui/dialog";
import { Progress } from "@animate-ui/react/primitives/base-ui/progress";
import {
  X,
  Zap,
  Wifi,
  Layers,
  RefreshCw,
  Search,
  WandSparkles,
  Save,
  Sliders,
  Eye,
  EyeOff,
  Clock,
  Activity,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { CONSOLE_CSRF_HEADER, useAuth } from "@/app/providers/AuthContext";
import { usePortfolio } from "@/app/providers/PortfolioContext";
import { MoneyInput } from "@/shared/ui/MoneyInput";

type Tab = "api" | "meters" | "tariff" | "schedule" | "history";
interface Meter {
  id: string;
  meterSerial?: string;
  deviceName?: string | null;
  providerDeviceId?: string | null;
  homeName?: string | null;
  providerRoomName?: string | null;
  monthReportedKwh?: number | null;
  reportedMonth?: string | null;
  instantPowerW?: number | null;
  providerReportedAt?: string | null;
  inventoryFetchedAt?: string | null;
  isMissing?: boolean;
  isMock?: boolean;
  hunonicDeviceId?: string;
  meterType?: string;
  connectionStatus?: string;
  cumulativeKwh?: number | null;
  tariffMode?: string | null;
  tariffRateVnd?: number | null;
  tariffVerifiedAt?: string | null;
  room?: { id: string; code: string };
}
interface SyncJob {
  id: string;
  startedAt: string;
  status: string;
  totalItems: number;
  syncedItems: number;
  failedItems?: number;
  completedAt?: string | null;
  errorMessage?: string;
}
interface TariffHistoryItem {
  id: string;
  actorEmail: string;
  summary: string;
  createdAt: string;
  metadata?: { rootId?: string; mode?: string; rateVnd?: number };
}
interface HunonicCronJob {
  jobKey: string;
  cronExpression: string;
  isEnabled: boolean;
  lastRunStatus?: string;
  lastRunAt?: string | null;
}
export interface HunonicSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgId?: string;
  initialTab?: Tab;
  onSyncTriggered?: () => void | Promise<void>;
}
const inputClass =
  "h-11 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-base outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 sm:text-sm";
const buttonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800";
const tabs = [
  { id: "api", label: "Kết nối", icon: Wifi },
  { id: "meters", label: "Công tơ", icon: Layers },
  { id: "tariff", label: "Biểu giá", icon: Sliders },
  { id: "schedule", label: "Đồng bộ", icon: Clock },
  { id: "history", label: "Lịch sử", icon: Activity },
] as const;
const dateLabel = (value?: string | null) =>
  value ? new Date(value).toLocaleString("vi-VN") : "Chưa có";

async function request(path: string, method = "GET", body?: unknown) {
  const response = await fetch(`/api/v1/console/integrations/hunonic/${path}`, {
    method,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(method !== "GET"
        ? {
            "Content-Type": "application/json",
            "X-Requested-With": CONSOLE_CSRF_HEADER,
          }
        : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok)
    throw new Error(
      [data.message, data.detail].filter(Boolean).join(" ") ||
        "Không thể kết nối máy chủ. Vui lòng thử lại.",
    );
  return data;
}
async function settingsRequest(path = "", method = "GET", body?: unknown) {
  const response = await fetch(`/api/v1/console/v2/settings${path}`, {
    method,
    credentials: "include",
    headers: { Accept: "application/json", ...(method === "GET" ? {} : { "Content-Type": "application/json", "X-Requested-With": CONSOLE_CSRF_HEADER }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.message || "Không thể lưu lịch đồng bộ.");
  return data;
}
const cronToMinutes = (expression?: string) => {
  if (!expression) return 60;
  const minute = expression.match(/^\*\/(\d+) \* \* \* \*$/);
  if (minute) return Number(minute[1]);
  if (expression === "0 * * * *") return 60;
  const hour = expression.match(/^0 \*\/(\d+) \* \* \*$/);
  if (hour) return Number(hour[1]) * 60;
  if (expression === "0 0 * * *") return 1440;
  return 60;
};

export const HunonicSettingsModal: React.FC<HunonicSettingsModalProps> = ({
  isOpen,
  onClose,
  initialTab = "api",
  onSyncTriggered,
}) => {
  const { hasCapability } = useAuth();
  const { rooms } = usePortfolio();
  const canConfigure = hasCapability("canManageSettings");
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [enabled, setEnabled] = useState(false);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [hasPassword, setHasPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [connected, setConnected] = useState(false);
  const [lastConnectedAt, setLastConnectedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    error: boolean;
    text: string;
  } | null>(null);
  const [meters, setMeters] = useState<Meter[]>([]);
  const [meterSearchOpen, setMeterSearchOpen] = useState(false);
  const [meterQuery, setMeterQuery] = useState("");
  const [jobs, setJobs] = useState<SyncJob[]>([]);
  const [electricHistory, setElectricHistory] = useState<{
    devices: Record<
      string,
      {
        name: string;
        syncedAt: string;
        points: { date: string; kwh: number }[];
      }
    >;
    failedDeviceIds: string[];
  } | null>(null);
  const [inventoryAt, setInventoryAt] = useState<string | null>(null);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [assignmentDrafts, setAssignmentDrafts] = useState<
    Record<string, string>
  >({});
  const [rate, setRate] = useState(3800);
  const [tariffErrors, setTariffErrors] = useState<
    { id: string; device: string; reason: string }[]
  >([]);
  const [tariffMode, setTariffMode] = useState<"custom" | "residential">(
    "custom",
  );
  const [tariffLoading, setTariffLoading] = useState(false);
  const [tariffLoadedAt, setTariffLoadedAt] = useState<string | null>(null);
  const [tariffHistory, setTariffHistory] = useState<TariffHistoryItem[]>([]);
  const [tariffLoaded, setTariffLoaded] = useState(false);
  const [syncIntervalMinutes, setSyncIntervalMinutes] = useState(60);
  const [syncScheduleEnabled, setSyncScheduleEnabled] = useState(false);
  const [syncCronJob, setSyncCronJob] = useState<HunonicCronJob | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    if (!isOpen) {
      generation.current++;
      return;
    }
    const version = ++generation.current;
    setActiveTab(initialTab);
    setBusy(false);
    setMessage(null);
    setPassword("");
    setShowPassword(false);
    setConnected(false);
    setTariffLoaded(false);
    setTariffLoadedAt(null);
    setTariffHistory([]);
    setLoading(true);
    Promise.all([request("config"), request("meters"), request("sync-jobs"), settingsRequest().catch(() => ({ cronJobs: [] }))])
      .then(([config, list, history, settings]) => {
        if (generation.current !== version) return;
        const connection = config.connection;
        setPhone(connection.phone || "");
        setEnabled(Boolean(connection.isEnabled));
        setHasPassword(Boolean(connection.hasPassword));
        setConnected(connection.status === "VERIFIED" && connection.isEnabled);
        setLastConnectedAt(
          connection.status === "VERIFIED" ? connection.lastTestedAt : null,
        );
        setMeters(list.meters || []);
        setInventoryAt(list.syncedAt || null);
        setJobs(history.syncJobs || []);
        setElectricHistory(history.history || null);
        const cron = (settings.cronJobs || []).find((job: HunonicCronJob) => job.jobKey === "HUNONIC_HOURLY_SYNC") || null;
        setSyncCronJob(cron);
        setSyncScheduleEnabled(Boolean(cron?.isEnabled));
        setSyncIntervalMinutes(cronToMinutes(cron?.cronExpression));
        if (connection.lastError)
          setMessage({ error: true, text: connection.lastError });
      })
      .catch((error) => {
        if (generation.current === version)
          setMessage({ error: true, text: error.message });
      })
      .finally(() => {
        if (generation.current === version) setLoading(false);
      });
    return () => {
      generation.current++;
    };
  }, [isOpen, initialTab]);
  useEffect(() => {
    bodyRef.current?.scrollTo(0, 0);
  }, [activeTab]);
  useEffect(() => {
    if (!isOpen || activeTab !== "tariff" || !connected || tariffLoaded || tariffLoading)
      return;
    const version = generation.current;
    setTariffLoading(true);
    request("tariff")
      .then((data) => {
        if (generation.current !== version) return;
        const tariffs = new Map<string, { mode: string | null; rateVnd: number | null; verifiedAt: string | null; error?: string | null }>(
          (data.tariffs || []).map((item: any) => [item.rootId, item]),
        );
        const nextMeters = meters.map((meter) => {
          const current = tariffs.get(meter.hunonicDeviceId || "");
          return current
            ? { ...meter, tariffMode: current.mode, tariffRateVnd: current.rateVnd, tariffVerifiedAt: current.verifiedAt }
            : meter;
        });
        setMeters(nextMeters);
        setTariffHistory(data.history || []);
        setTariffLoadedAt(data.loadedAt || null);
        setTariffLoaded(true);
        const configured = nextMeters.filter((meter) => meter.tariffMode && meter.tariffRateVnd != null);
        if (configured.length) {
          const firstMode = configured[0].tariffMode as "custom" | "residential";
          const sameMode = configured.every((meter) => meter.tariffMode === firstMode);
          const sameRate = configured.every((meter) => meter.tariffRateVnd === configured[0].tariffRateVnd);
          if (sameMode) setTariffMode(firstMode);
          if (sameMode && sameRate && configured[0].tariffRateVnd != null) setRate(configured[0].tariffRateVnd);
        }
      })
      .catch((error) => {
        if (generation.current === version) {
          setTariffLoaded(true);
          setMessage({ error: true, text: error instanceof Error ? error.message : "Không tải được biểu giá Hunonic." });
        }
      })
      .finally(() => {
        if (generation.current === version) setTariffLoading(false);
      });
  }, [activeTab, connected, isOpen, meters, tariffLoaded, tariffLoading]);

  async function run(action: (current: () => boolean) => Promise<void>) {
    if (busy) return;
    const version = generation.current;
    setBusy(true);
    setMessage(null);
    try {
      await action(() => generation.current === version);
    } catch (error) {
      if (generation.current === version)
        setMessage({
          error: true,
          text: error instanceof Error ? error.message : "Thao tác thất bại.",
        });
    } finally {
      if (generation.current === version) setBusy(false);
    }
  }
  async function connect() {
    await run(async (current) => {
      try {
        const data = await request("test", "POST", {
          phone,
          password: password || undefined,
          isEnabled: enabled,
        });
        if (!current()) return;
        setConnected(data.verified === true);
        if (data.verified === true) {
          setPassword("");
          setHasPassword(true);
          setLastConnectedAt(data.lastTestedAt);
          const list = await request("meters");
          if (!current()) return;
          setMeters(list.meters || []);
          setInventoryAt(list.syncedAt || null);
          onSyncTriggered?.();
        }
        setMessage({ error: enabled && !data.verified, text: data.message });
      } catch (error) {
        if (current()) setConnected(false);
        throw error;
      }
    });
  }
  async function refreshMeters() {
    await run(async (current) => {
      const data = await request(connected ? "devices" : "meters");
      if (!current()) return;
      setMeters(data.meters || []);
      setInventoryAt(data.syncedAt || null);
      if (connected) onSyncTriggered?.();
    });
  }
  async function sync() {
    await run(async (current) => {
      const data = await request("sync-jobs", "POST");
      if (!current()) return;
      if (!data.jobId)
        throw new Error("Máy chủ chưa trả về mã tác vụ để theo dõi đồng bộ.");
      setMessage({ error: false, text: "Đang đồng bộ với Hunonic…" });
      for (let attempt = 0; attempt < 45 && current(); attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        if (!current()) return;
        const history = await request("sync-jobs");
        if (!current()) return;
        setJobs(history.syncJobs || []);
        setElectricHistory(history.history || null);
        const job = ((history.syncJobs as SyncJob[]) || []).find(
          (item) => item.id === data.jobId,
        );
        if (!job || ["PENDING", "RUNNING"].includes(job.status)) continue;
        const list = await request("meters");
        const config = await request("config");
        if (!current()) return;
        setMeters(list.meters || []);
        setInventoryAt(list.syncedAt || null);
        setConnected(
          config.connection.status === "VERIFIED" &&
            config.connection.isEnabled === true,
        );
        onSyncTriggered?.();
        if (job.status !== "SUCCESS")
          throw new Error(
            job.errorMessage ||
              "Đồng bộ chưa hoàn tất cho tất cả công tơ; xem Lịch sử.",
          );
        setMessage({
          error: false,
          text: `Đã đồng bộ ${job.syncedItems}/${job.totalItems} công tơ. Dữ liệu đã được cập nhật.`,
        });
        return;
      }
      if (current())
        setMessage({
          error: false,
          text: "Tác vụ vẫn đang chạy. Xem kết quả trong Lịch sử.",
        });
    });
  }
  const realMeters = meters.filter(
    (meter) =>
      meter.hunonicDeviceId &&
      !meter.isMissing &&
      !meter.isMock &&
      !meter.hunonicDeviceId.startsWith("MOCK-"),
  );
  const assignedMeters = realMeters.filter((meter) => Boolean(meter.room));
  const runningJob = jobs.find((job) =>
    ["PENDING", "RUNNING"].includes(job.status),
  );
  const latestCompletedJob = jobs.find(
    (job) => !["PENDING", "RUNNING"].includes(job.status),
  );
  const runningProcessed = runningJob
    ? (runningJob.syncedItems || 0) + (runningJob.failedItems || 0)
    : 0;
  const runningProgress =
    runningJob && runningJob.totalItems > 0
      ? Math.min(100, Math.round((runningProcessed / runningJob.totalItems) * 100))
      : null;

  const normalizeSearch = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .toLowerCase();
  const searchQuery = normalizeSearch(meterQuery.trim());
  const visibleMeters = realMeters.filter((meter) =>
    normalizeSearch(
      [
        meter.deviceName,
        meter.hunonicDeviceId,
        meter.providerDeviceId,
        meter.meterSerial,
        meter.homeName,
        meter.providerRoomName,
        meter.room?.code,
      ]
        .filter(Boolean)
        .join(" "),
    ).includes(searchQuery),
  );

  function smartAssignMeters() {
    const normalized = (value: string) =>
      normalizeSearch(value).replace(/[^a-z0-9]+/g, " ").trim();
    const matchesCode = (value: string, code: string) =>
      Boolean(code) && ` ${normalized(value)} `.includes(` ${normalized(code)} `);
    const drafts = { ...assignmentDrafts };
    const occupied = new Set(
      meters.map((meter) => drafts[meter.hunonicDeviceId!] ?? meter.room?.id),
    );
    const proposals = realMeters.flatMap((meter) => {
      const deviceId = meter.hunonicDeviceId!;
      if (drafts[deviceId] !== undefined || meter.room?.id || !connected)
        return [];
      const names = [meter.providerRoomName, meter.deviceName].filter(
        (name): name is string => Boolean(name),
      );
      let candidates = rooms.filter(
        (room) =>
          room.occupancyStatus !== "ARCHIVED" &&
          !occupied.has(room.id) &&
          names.some((name) => matchesCode(name, room.code)),
      );
      if (candidates.length > 1) {
        candidates = candidates.filter((room) =>
          [meter.homeName, ...names].some(
            (name) => name && matchesCode(name, room.buildingCode),
          ),
        );
      }
      return candidates.length === 1
        ? [{ deviceId, roomId: candidates[0].id }]
        : [];
    });
    let count = 0;
    for (const proposal of proposals) {
      if (proposals.filter((item) => item.roomId === proposal.roomId).length !== 1)
        continue;
      drafts[proposal.deviceId] = proposal.roomId;
      count++;
    }
    setAssignmentDrafts(drafts);
    setMessage({
      error: false,
      text: count
        ? `Đã đề xuất gán ${count} công tơ. Kiểm tra và bấm Lưu gán phòng để lưu.`
        : "Không tìm thấy cặp công tơ và phòng khớp duy nhất để gán thêm.",
    });
  }

  if (!isOpen) return null;
  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[120] bg-slate-950/50 backdrop-blur-[2px]" />
        <Dialog.Viewport
          data-testid="hunonic-settings-modal"
          className="fixed inset-0 z-[121] flex items-center justify-center p-2 sm:p-3"
        >
          <Dialog.Popup
            from="bottom"
            data-testid="hunonic-settings-popup"
            className="flex h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 sm:h-[94dvh] sm:max-h-[94dvh]"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 p-4 dark:border-slate-800 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/40">
                  <Zap className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <Dialog.Title className="text-base font-semibold">
                    Tích hợp Hunonic
                  </Dialog.Title>
                  <Dialog.Description className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Kết nối tài khoản và quản lý công tơ điện
                  </Dialog.Description>
                </div>
              </div>
              <Dialog.Close
                aria-label="Đóng cấu hình Hunonic"
                data-testid="btn-close-hunonic-modal"
                className="-mr-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </Dialog.Close>
            </div>
            <div
              role="tablist"
              aria-label="Cấu hình Hunonic"
              className="grid shrink-0 grid-cols-5 border-b border-slate-200 bg-slate-50/60 px-2 dark:border-slate-800 dark:bg-slate-800/30"
            >
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    aria-controls={`hunonic-panel-${tab.id}`}
                    id={`hunonic-tab-${tab.id}`}
                    data-testid={`hunonic-tab-${tab.id}`}
                    onClick={() => {
                      setActiveTab(tab.id);
                      setMessage(null);
                    }}
                    className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 border-b-2 px-1 text-[10px] font-semibold sm:flex-row sm:gap-2 sm:text-xs ${activeTab === tab.id ? "border-blue-600 text-blue-700 dark:text-blue-300" : "border-transparent text-slate-500 dark:text-slate-400"}`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="whitespace-nowrap">{tab.label}</span>
                  </button>
                );
              })}
            </div>
            <div
              ref={bodyRef}
              role="tabpanel"
              aria-labelledby={`hunonic-tab-${activeTab}`}
              id={`hunonic-panel-${activeTab}`}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6"
            >
              {loading ? (
                <p className="py-12 text-center text-sm text-slate-500">
                  Đang tải cấu hình…
                </p>
              ) : (
                <>
                  {activeTab === "api" && (
                    <div className="space-y-5">
                      <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
                        <span>
                          <span className="block text-sm font-semibold">
                            Kích hoạt tích hợp
                          </span>
                          <span className="mt-1 block text-xs text-slate-500">
                            Lưu thay đổi bằng nút bên dưới.
                          </span>
                        </span>
                        <input
                          type="checkbox"
                          aria-label="Kích hoạt tích hợp Hunonic"
                          checked={enabled}
                          disabled={!canConfigure || busy}
                          onChange={(event) => setEnabled(event.target.checked)}
                          className="h-5 w-5 shrink-0 accent-blue-600"
                        />
                      </label>
                      <div className="space-y-2">
                        <label
                          htmlFor="hunonic-phone"
                          className="block text-xs font-medium"
                        >
                          Tài khoản Hunonic
                        </label>
                        <input
                          id="hunonic-phone"
                          data-testid="hunonic-phone"
                          autoComplete="username"
                          value={phone}
                          disabled={!canConfigure || busy}
                          onChange={(event) => {
                            setPhone(event.target.value);
                            setConnected(false);
                          }}
                          placeholder="Số điện thoại hoặc email"
                          className={inputClass}
                        />
                      </div>
                      <div className="space-y-2">
                        <label
                          htmlFor="hunonic-password"
                          className="block text-xs font-medium"
                        >
                          Mật khẩu
                        </label>
                        <div className="relative">
                          <input
                            id="hunonic-password"
                            data-testid="hunonic-password"
                            type={showPassword ? "text" : "password"}
                            autoComplete="current-password"
                            value={password}
                            disabled={!canConfigure || busy}
                            onChange={(event) =>
                              setPassword(event.target.value)
                            }
                            placeholder={
                              hasPassword
                                ? "Để trống để dùng mật khẩu đã lưu"
                                : "Nhập mật khẩu Hunonic"
                            }
                            className={`${inputClass} pr-12`}
                          />
                          <button
                            type="button"
                            aria-label={
                              showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"
                            }
                            onClick={() => setShowPassword((value) => !value)}
                            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400"
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
                        <p
                          data-testid="hunonic-connection-status"
                          className={`text-xs font-semibold ${connected ? "text-emerald-700 dark:text-emerald-300" : "text-slate-600 dark:text-slate-300"}`}
                        >
                          {connected
                            ? "Tài khoản đã được xác minh"
                            : "Chưa có kết nối được xác minh"}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          Xác minh gần nhất: {dateLabel(lastConnectedAt)}
                        </p>
                      </div>
                      <button
                        type="button"
                        data-testid="hunonic-test-connection"
                        disabled={busy || !canConfigure}
                        onClick={connect}
                        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        <RefreshCw
                          className={`h-4 w-4 ${busy ? "animate-spin" : ""}`}
                        />
                        {busy
                          ? "Đang xử lý…"
                          : enabled
                            ? "Lưu & kết nối"
                            : "Lưu cấu hình"}
                      </button>
                    </div>
                  )}
                  {activeTab === "meters" && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-xs font-semibold">
                            Công tơ ({realMeters.length})
                          </h3>
                          <p className="mt-1 text-[10px] text-slate-400">
                            Đồng bộ: {dateLabel(inventoryAt)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            aria-label="Tìm công tơ"
                            title="Tìm công tơ"
                            aria-expanded={meterSearchOpen}
                            aria-controls="hunonic-meter-search"
                            onClick={() => {
                              setMeterSearchOpen(!meterSearchOpen);
                              setMeterQuery("");
                            }}
                            className={`${buttonClass} w-11 border-0 px-0 text-blue-700 dark:text-blue-300`}
                          >
                            <Search className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            data-testid="hunonic-smart-assign-meters"
                            aria-label="Gán công tơ thông minh"
                            title="Gán công tơ thông minh"
                            disabled={busy || !canConfigure || !realMeters.length}
                            onClick={smartAssignMeters}
                            className={`${buttonClass} w-11 border-0 px-0 text-blue-700 dark:text-blue-300`}
                          >
                            <WandSparkles className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            data-testid="hunonic-refresh-meters"
                            aria-label="Làm mới công tơ"
                            title="Làm mới công tơ"
                            disabled={busy}
                            onClick={refreshMeters}
                            className={`${buttonClass} w-11 border-0 px-0 text-blue-700 dark:text-blue-300`}
                          >
                            <RefreshCw
                              className={`h-4 w-4 ${busy ? "animate-spin" : ""}`}
                            />
                          </button>
                          <button
                            type="button"
                            aria-label="Lưu gán phòng"
                            title="Lưu gán phòng"
                            disabled={
                              busy ||
                              !canConfigure ||
                              !meters.some(
                                (meter) =>
                                  assignmentDrafts[meter.hunonicDeviceId!] !==
                                    undefined &&
                                  assignmentDrafts[meter.hunonicDeviceId!] !==
                                    (meter.room?.id || ""),
                              )
                            }
                            className={`${buttonClass} w-11 border-0 px-0 text-blue-700 dark:text-blue-300`}
                            onClick={() =>
                              void run(async (current) => {
                                const changes = meters.filter(
                                  (meter) =>
                                    assignmentDrafts[meter.hunonicDeviceId!] !==
                                      undefined &&
                                    assignmentDrafts[meter.hunonicDeviceId!] !==
                                      (meter.room?.id || ""),
                                );
                                // Release mappings first so a batch can move devices into newly freed rooms.
                                changes.sort(
                                  (a, b) =>
                                    Number(
                                      Boolean(
                                        assignmentDrafts[a.hunonicDeviceId!],
                                      ),
                                    ) -
                                    Number(
                                      Boolean(
                                        assignmentDrafts[b.hunonicDeviceId!],
                                      ),
                                    ),
                                );
                                const saved: string[] = [];
                                const failed: string[] = [];
                                for (const meter of changes) {
                                  try {
                                    await request("assign", "POST", {
                                      roomId:
                                        assignmentDrafts[
                                          meter.hunonicDeviceId!
                                        ],
                                      previousRoomId: meter.room?.id,
                                      hunonicDeviceId: meter.hunonicDeviceId,
                                    });
                                    saved.push(meter.hunonicDeviceId!);
                                  } catch {
                                    failed.push(
                                      meter.deviceName ||
                                        meter.hunonicDeviceId!,
                                    );
                                  }
                                }
                                const list = await request("meters");
                                if (!current()) return;
                                setMeters(list.meters || []);
                                setInventoryAt(list.syncedAt || null);
                                setAssignmentDrafts((drafts) => {
                                  const next = { ...drafts };
                                  for (const id of saved) delete next[id];
                                  return next;
                                });
                                onSyncTriggered?.();
                                setMessage({
                                  error: failed.length > 0,
                                  text: failed.length
                                    ? `Đã lưu ${saved.length}/${changes.length}. Chưa lưu: ${failed.join(", ")}.`
                                    : `Đã lưu ${saved.length} thay đổi gán phòng.`,
                                });
                              })
                            }
                          >
                            <Save className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      {meterSearchOpen && (
                        <input
                          id="hunonic-meter-search"
                          autoFocus
                          type="search"
                          aria-label="Tìm công tơ theo tên, mã hoặc phòng"
                          placeholder="Tìm tên, mã thiết bị, phòng…"
                          value={meterQuery}
                          onChange={(event) =>
                            setMeterQuery(event.target.value)
                          }
                          className={inputClass}
                        />
                      )}
                      {!!realMeters.length && !visibleMeters.length && (
                        <p className="py-6 text-center text-xs text-slate-500">
                          Không tìm thấy công tơ phù hợp.
                        </p>
                      )}
                      {!realMeters.length && (
                        <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500 dark:border-slate-700">
                          Chưa có công tơ. Xác minh tài khoản rồi tải danh sách
                          thiết bị.
                        </p>
                      )}
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {visibleMeters.map((meter) => {
                          const sample =
                            meter.isMock ||
                            /^(MOCK|DEV)-/.test(meter.hunonicDeviceId || "");
                          const status = sample
                            ? "Dữ liệu thử"
                            : meter.isMissing
                              ? "Chưa tìm thấy"
                              : meter.connectionStatus === "ONLINE"
                                ? "Running"
                                : meter.connectionStatus === "OFFLINE"
                                  ? "Mất kết nối"
                                  : meter.connectionStatus === "STALE"
                                    ? "Dữ liệu cũ"
                                    : meter.room
                                      ? "Đã gán · Chưa xác minh live"
                                      : "Chưa xác minh kết nối";
                          return (
                            <div
                              key={meter.id}
                              className="py-3"
                              data-testid="hunonic-meter-row"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p className="min-w-0 flex-1 break-words text-xs font-semibold">
                                  {meter.deviceName ||
                                    "Tên thiết bị chưa xác minh"}
                                </p>
                                <span
                                  className={`shrink-0 rounded px-1.5 py-1 text-[9px] font-medium ${!sample && !meter.isMissing && meter.connectionStatus === "ONLINE" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"}`}
                                >
                                  {status}
                                </span>
                              </div>
                              <p className="mt-1 break-all text-[10px] text-slate-400">
                                Mã gán: {meter.hunonicDeviceId || "Chưa có"}
                                {meter.providerDeviceId
                                  ? ` · ID: ${meter.providerDeviceId}`
                                  : ""}
                              </p>
                              {(meter.homeName || meter.providerRoomName) && (
                                <p className="mt-1 break-words text-[10px] text-slate-500">
                                  Hunonic:{" "}
                                  {[meter.homeName, meter.providerRoomName]
                                    .filter(Boolean)
                                    .join(" / ")}
                                </p>
                              )}
                              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 rounded-lg bg-slate-50 p-2.5 text-[10px] dark:bg-slate-800/50">
                                <div>
                                  <dt className="text-slate-400">Tích lũy</dt>
                                  <dd className="mt-0.5 font-medium">
                                    {meter.cumulativeKwh == null
                                      ? "Chưa có"
                                      : `${meter.cumulativeKwh.toLocaleString("vi-VN")} kWh`}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-slate-400">
                                    {meter.reportedMonth
                                      ? `Tháng ${meter.reportedMonth}`
                                      : "Sản lượng tháng"}
                                  </dt>
                                  <dd className="mt-0.5 font-medium">
                                    {meter.monthReportedKwh == null
                                      ? "Chưa có"
                                      : `${meter.monthReportedKwh.toLocaleString("vi-VN")} kWh`}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-slate-400">Công suất</dt>
                                  <dd className="mt-0.5 font-medium">
                                    {meter.instantPowerW == null
                                      ? "Chưa có"
                                      : `${meter.instantPowerW.toLocaleString("vi-VN")} W`}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-slate-400">
                                    Thiết bị cập nhật
                                  </dt>
                                  <dd className="mt-0.5">
                                    {dateLabel(meter.providerReportedAt)}
                                  </dd>
                                </div>
                              </dl>
                              <p className="mt-2 text-[11px] text-slate-500">
                                {meter.room?.code
                                  ? `Phòng đang gán: ${meter.room.code}`
                                  : "Chưa gán phòng"}
                              </p>
                              {!sample &&
                                !meter.isMissing &&
                                meter.hunonicDeviceId &&
                                canConfigure && (
                                  <div className="mt-2 flex items-center gap-2">
                                    <select
                                      aria-label={`Gán phòng cho ${meter.deviceName || meter.hunonicDeviceId}`}
                                      value={
                                        assignmentDrafts[
                                          meter.hunonicDeviceId!
                                        ] ??
                                        meter.room?.id ??
                                        ""
                                      }
                                      disabled={
                                        busy || (!connected && !meter.room)
                                      }
                                      className="h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900"
                                      onChange={(event) =>
                                        setAssignmentDrafts((drafts) => ({
                                          ...drafts,
                                          [meter.hunonicDeviceId!]:
                                            event.target.value,
                                        }))
                                      }
                                    >
                                      <option value="">
                                        Chọn phòng để gán
                                      </option>
                                      {meter.room &&
                                        !rooms.some(
                                          (room) => room.id === meter.room?.id,
                                        ) && (
                                          <option value={meter.room.id}>
                                            Phòng {meter.room.code} (đang gán)
                                          </option>
                                        )}
                                      {rooms
                                        .filter(
                                          (room) =>
                                            room.occupancyStatus !==
                                              "ARCHIVED" &&
                                            !meters.some(
                                              (other) =>
                                                other.hunonicDeviceId !==
                                                  meter.hunonicDeviceId &&
                                                (assignmentDrafts[
                                                  other.hunonicDeviceId!
                                                ] ?? other.room?.id) ===
                                                  room.id,
                                            ),
                                        )
                                        .map((room) => (
                                          <option key={room.id} value={room.id}>
                                            {room.buildingCode} · {room.code}
                                          </option>
                                        ))}
                                    </select>
                                  </div>
                                )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {activeTab === "tariff" && (
                    <div
                      className="space-y-4"
                      data-testid="card-hunonic-tariff-versioning"
                    >
                      {tariffLoading && (
                        <div role="status" className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-blue-100 bg-blue-50 px-3 text-xs text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
                          <span>Đang đọc cấu hình thực từ Hunonic</span>
                          <ShimmeringText text="Đang tải…" color="currentColor" shimmeringColor="#93c5fd" duration={1.4} />
                        </div>
                      )}
                      {!tariffLoading && tariffLoadedAt && (
                        <div className="flex items-center justify-between gap-3 text-[11px] text-slate-500">
                          <span>Đã đọc trực tiếp từ Hunonic</span>
                          <span className="flex items-center gap-2">
                            {dateLabel(tariffLoadedAt)}
                            <AnimatedButton
                              type="button"
                              aria-label="Tải lại biểu giá từ Hunonic"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700"
                              onClick={() => setTariffLoaded(false)}
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                            </AnimatedButton>
                          </span>
                        </div>
                      )}
                      <fieldset
                        disabled={busy || tariffLoading}
                        className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700"
                      >
                        <label className="flex min-h-11 items-center gap-3 border-b border-slate-100 px-3 text-xs font-semibold dark:border-slate-700">
                          <input
                            type="checkbox"
                            aria-label="Chọn tất cả công tơ"
                            checked={
                              realMeters.length > 0 &&
                              realMeters.every((meter) =>
                                selectedDeviceIds.includes(
                                  meter.hunonicDeviceId!,
                                ),
                              )
                            }
                            ref={(element) => {
                              if (element)
                                element.indeterminate =
                                  realMeters.some((meter) =>
                                    selectedDeviceIds.includes(
                                      meter.hunonicDeviceId!,
                                    ),
                                  ) &&
                                  !realMeters.every((meter) =>
                                    selectedDeviceIds.includes(
                                      meter.hunonicDeviceId!,
                                    ),
                                  );
                            }}
                            onChange={(event) =>
                              setSelectedDeviceIds(
                                event.target.checked
                                  ? realMeters.map(
                                      (meter) => meter.hunonicDeviceId!,
                                    )
                                  : [],
                              )
                            }
                            className="h-4 w-4 accent-blue-600"
                          />
                          Tất cả công tơ{" "}
                          <span className="ml-auto text-slate-400">
                            {
                              realMeters.filter((meter) =>
                                selectedDeviceIds.includes(
                                  meter.hunonicDeviceId!,
                                ),
                              ).length
                            }
                            /{realMeters.length}
                          </span>
                        </label>
                        <div className="max-h-[calc(100dvh-25rem)] min-h-28 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
                          {realMeters.map((meter) => (
                            <label
                              key={meter.hunonicDeviceId}
                              className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-xs"
                            >
                              <input
                                type="checkbox"
                                checked={selectedDeviceIds.includes(
                                  meter.hunonicDeviceId!,
                                )}
                                onChange={(event) =>
                                  setSelectedDeviceIds((ids) => {
                                    if (event.target.checked && meter.tariffMode) {
                                      setTariffMode(meter.tariffMode as "custom" | "residential");
                                      if (meter.tariffRateVnd != null) setRate(meter.tariffRateVnd);
                                    }
                                    return event.target.checked
                                      ? [...ids, meter.hunonicDeviceId!]
                                      : ids.filter((id) => id !== meter.hunonicDeviceId);
                                  })
                                }
                                className="h-4 w-4 shrink-0 accent-blue-600"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block font-semibold">
                                  {meter.deviceName || meter.hunonicDeviceId}
                                </span>
                                <span className="mt-0.5 block break-all text-[10px] text-slate-400">
                                  {meter.hunonicDeviceId}
                                  {meter.room ? ` · ${meter.room.code}` : ""}
                                </span>
                              </span>
                              <span className="shrink-0 text-right text-[11px]" data-testid="hunonic-meter-tariff">
                                {meter.tariffVerifiedAt && meter.tariffRateVnd != null ? (
                                  <>
                                    <span className="block font-semibold text-emerald-700 dark:text-emerald-300">
                                      {meter.tariffMode === 'residential'
                                        ? 'Theo bậc EVN'
                                        : `${meter.tariffRateVnd.toLocaleString('vi-VN')} đ/kWh`}
                                    </span>
                                    <span className="block text-[10px] text-slate-500">
                                      {meter.tariffMode === 'residential' ? 'EVN · ' : 'Cố định · '}Đã xác minh
                                    </span>
                                  </>
                                ) : <span className="text-slate-400">Chưa đọc được giá</span>}
                              </span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                      <div className="grid grid-cols-2 items-end gap-3 [&>div]:min-w-0">
                        <div>
                          <label className="mb-2 block text-xs">
                            Loại biểu giá
                          </label>
                          <select
                            aria-label="Loại biểu giá"
                            disabled={busy || tariffLoading}
                            value={tariffMode}
                            onChange={(event) =>
                              setTariffMode(
                                event.target.value as typeof tariffMode,
                              )
                            }
                            className={inputClass}
                          >
                            <option value="custom">Đơn giá cố định</option>
                            <option value="residential">
                              Biểu giá EVN (Hunonic)
                            </option>
                          </select>
                        </div>
                        {tariffMode === "custom" && (
                          <div>
                            <p className="mb-2 text-xs">Đơn giá (đ/kWh)</p>
                            <MoneyInput
                              className="h-11"
                              disabled={busy || tariffLoading}
                              value={rate}
                              onChange={setRate}
                            />
                          </div>
                        )}
                        {tariffMode === "residential" && (
                          <div className="flex h-11 items-center justify-end text-xs text-slate-500">
                            Theo bậc EVN
                          </div>
                        )}
                      </div>
                      <div className="flex justify-end">
                        <AnimatedButton
                          type="button"
                          disabled={
                            busy ||
                            !realMeters.some((meter) =>
                              selectedDeviceIds.includes(
                                meter.hunonicDeviceId!,
                              ),
                            ) ||
                            !canConfigure ||
                            !connected
                          }
                          aria-label="Lưu & xác minh biểu giá"
                          aria-busy={busy}
                          className={`${buttonClass} text-blue-700 dark:text-blue-300`}
                          onClick={() =>
                            void run(async (current) => {
                              const targets = realMeters.filter((meter) =>
                                selectedDeviceIds.includes(
                                  meter.hunonicDeviceId!,
                                ),
                              );
                              const failed: {
                                id: string;
                                device: string;
                                reason: string;
                              }[] = [];
                              const verifiedRates = new Map<string, Pick<Meter, 'tariffMode' | 'tariffRateVnd' | 'tariffVerifiedAt'>>();
                              setTariffErrors([]);
                              for (const meter of targets) {
                                if (!current()) return;
                                try {
                                  const result = await request(
                                    "tariff",
                                    "POST",
                                    {
                                      rootId: meter.hunonicDeviceId,
                                      mode: tariffMode,
                                      customRateVnd: rate,
                                    },
                                  );
                                  const verified = result.verifiedTariff;
                                  if (
                                    !verified ||
                                    verified.mode !== tariffMode ||
                                    !verified.verifiedAt ||
                                    (tariffMode === "custom" &&
                                      verified.verifiedRateVnd !== rate)
                                  )
                                    throw new Error(
                                      "Chưa xác minh biểu giá thực.",
                                    );
                                  if (current()) setMeters((previous) => previous.map((item) =>
                                    item.hunonicDeviceId === meter.hunonicDeviceId
                                      ? { ...item, tariffMode: verified.mode, tariffRateVnd: verified.verifiedRateVnd, tariffVerifiedAt: verified.verifiedAt }
                                      : item,
                                  ));
                                  verifiedRates.set(meter.hunonicDeviceId!, {
                                    tariffMode: verified.mode,
                                    tariffRateVnd: verified.verifiedRateVnd,
                                    tariffVerifiedAt: verified.verifiedAt,
                                  });
                                } catch (error) {
                                  failed.push({
                                    id: meter.hunonicDeviceId!,
                                    device:
                                      meter.deviceName ||
                                      meter.hunonicDeviceId!,
                                    reason:
                                      error instanceof Error
                                        ? error.message
                                        : "Chưa xác minh được với Hunonic.",
                                  });
                                }
                              }
                              if (!current()) return;
                              setTariffErrors(failed);
                              await onSyncTriggered?.();
                              const list = await request("meters");
                              if (!current()) return;
                              setMeters((list.meters || []).map((item: Meter) => ({
                                ...item,
                                ...verifiedRates.get(item.hunonicDeviceId!),
                              })));
                              setInventoryAt(list.syncedAt || null);
                              if (failed.length) {
                                setTariffLoaded(false);
                                setSelectedDeviceIds(
                                  failed.map((item) => item.id),
                                );
                                setMessage({
                                  error: true,
                                  text: `Đã xác minh ${targets.length - failed.length}/${targets.length} công tơ. ${failed.length} công tơ chưa lưu, đã giữ chọn để thử lại.`,
                                });
                                return;
                              }
                              setMessage({
                                error: false,
                                text: `Đã xác minh biểu giá cho ${targets.length} công tơ.`,
                              });
                              setTariffLoaded(false);
                            })
                          }
                        >
                          {busy ? (
                            <span role="status" aria-live="polite">
                              <ShimmeringText
                                text="Đang xử lý…"
                                color="currentColor"
                                shimmeringColor="#93c5fd"
                                duration={1.4}
                              />
                            </span>
                          ) : (
                            <>
                              <Save className="h-3.5 w-3.5" />
                              Lưu & xác minh biểu giá
                            </>
                          )}
                        </AnimatedButton>
                      </div>
                      {!busy && tariffErrors.length > 0 && (
                        <details className="rounded-lg border border-rose-100 p-3 text-xs dark:border-rose-900">
                          <summary className="cursor-pointer font-semibold text-rose-600">
                            Chi tiết {tariffErrors.length} công tơ chưa lưu
                          </summary>
                          <ul className="mt-2 max-h-44 space-y-2 overflow-y-auto">
                            {tariffErrors.map((error, index) => (
                              <li key={index}>
                                <span className="font-semibold">
                                  {error.device}
                                </span>
                                <p className="mt-0.5 break-words text-[11px] text-slate-500">
                                  {error.reason}
                                </p>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                      <details className="rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-slate-700">
                        <summary className="cursor-pointer font-semibold">Lịch sử thiết lập ({tariffHistory.length})</summary>
                        {!tariffHistory.length ? (
                          <p className="py-3 text-[11px] text-slate-500">Chưa có lần thay đổi biểu giá được ghi nhận.</p>
                        ) : (
                          <div className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
                            {tariffHistory.map((item) => (
                              <div key={item.id} className="py-2">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="font-medium">{item.metadata?.mode === "residential" ? "EVN" : item.metadata?.mode === "custom" ? "Tự thiết lập" : "Cập nhật biểu giá"}</span>
                                  <span className="text-[10px] text-slate-400">{dateLabel(item.createdAt)}</span>
                                </div>
                                <p className="mt-1 break-words text-[11px] text-slate-500">{item.metadata?.rootId ? `${item.metadata.rootId} · ` : ""}{item.metadata?.rateVnd != null ? `${item.metadata.rateVnd.toLocaleString("vi-VN")} đ/kWh · ` : ""}{item.actorEmail}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </details>
                    </div>
                  )}
                  {activeTab === "schedule" && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold">Đồng bộ chỉ số</h3>
                          <p className="mt-1 text-[11px] text-slate-500">
                            {connected ? "Kết nối hiện tại đã xác minh" : "Chưa có kết nối sẵn sàng"}
                          </p>
                        </div>
                        <span className={`h-2.5 w-2.5 rounded-full ${connected ? "bg-emerald-500" : "bg-slate-300"}`} aria-hidden="true" />
                      </div>
                      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 text-xs dark:border-slate-700 dark:bg-slate-700">
                        <div className="bg-white p-3 dark:bg-slate-900">
                          <dt className="text-[11px] text-slate-500">Đã gán phòng</dt>
                          <dd className="mt-1 font-semibold">{assignedMeters.length}/{realMeters.length} công tơ</dd>
                        </div>
                        <div className="bg-white p-3 dark:bg-slate-900">
                          <dt className="text-[11px] text-slate-500">Danh sách thiết bị</dt>
                          <dd className="mt-1 font-semibold">{dateLabel(inventoryAt)}</dd>
                        </div>
                        <div className="col-span-2 bg-white p-3 dark:bg-slate-900">
                          <dt className="text-[11px] text-slate-500">Lượt hoàn tất gần nhất</dt>
                          <dd className="mt-1 font-semibold">
                            {latestCompletedJob
                              ? `${dateLabel(latestCompletedJob.completedAt || latestCompletedJob.startedAt)} · ${latestCompletedJob.syncedItems || 0}/${latestCompletedJob.totalItems || 0} công tơ`
                              : "Chưa có"}
                          </dd>
                        </div>
                      </dl>
                      {runningJob && (
                        <Progress.Root
                          value={runningProgress}
                          className="space-y-2 rounded-lg border border-blue-100 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/30"
                        >
                          <div className="flex items-center justify-between gap-3 text-xs">
                            <Progress.Label className="font-semibold">Đang đồng bộ dữ liệu thật</Progress.Label>
                            <Progress.Value className="tabular-nums text-slate-500">
                              {() =>
                                runningJob.totalItems > 0
                                  ? `${runningProcessed}/${runningJob.totalItems}`
                                  : "Đang chuẩn bị"
                              }
                            </Progress.Value>
                          </div>
                          <Progress.Track className="h-2 overflow-hidden rounded-full bg-blue-100 dark:bg-blue-900">
                            <Progress.Indicator className="h-full rounded-full bg-blue-600" />
                          </Progress.Track>
                        </Progress.Root>
                      )}
                      <AnimatedButton
                        type="button"
                        disabled={busy || Boolean(runningJob) || !connected || assignedMeters.length === 0}
                        onClick={sync}
                        className={buttonClass}
                      >
                        <RefreshCw
                          className={`h-4 w-4 ${busy ? "animate-spin" : ""}`}
                        />
                        {runningJob ? "Đang đồng bộ" : "Đồng bộ ngay"}
                      </AnimatedButton>
                      <div className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h4 className="text-xs font-semibold">Lịch đồng bộ tự động</h4>
                            <p className="mt-1 text-[11px] text-slate-500">Dùng chung với tác vụ Hunonic trong Cài đặt → Cron.</p>
                          </div>
                          <label className="inline-flex items-center gap-2 text-xs font-semibold">
                            <input type="checkbox" checked={syncScheduleEnabled} onChange={(event) => setSyncScheduleEnabled(event.target.checked)} className="h-4 w-4 accent-blue-600" />
                            {syncScheduleEnabled ? "Bật" : "Tắt"}
                          </label>
                        </div>
                        <div className="flex items-end gap-3">
                          <div className="min-w-0 flex-1">
                            <label htmlFor="hunonic-sync-minutes" className="mb-1.5 block text-[11px] text-slate-500">Chu kỳ (phút)</label>
                            <input id="hunonic-sync-minutes" type="number" min="1" max="1440" step="1" value={syncIntervalMinutes} onChange={(event) => setSyncIntervalMinutes(Number(event.target.value))} className={inputClass} />
                          </div>
                          <AnimatedButton
                            type="button"
                            disabled={busy || syncIntervalMinutes < 1 || syncIntervalMinutes > 1440 || (syncIntervalMinutes > 59 && syncIntervalMinutes !== 1440 && syncIntervalMinutes % 60 !== 0)}
                            className={buttonClass}
                            onClick={() => void run(async (current) => {
                              const data = await settingsRequest("/cron", "PATCH", { jobKey: "HUNONIC_HOURLY_SYNC", intervalMinutes: syncIntervalMinutes, isEnabled: syncScheduleEnabled });
                              if (!current()) return;
                              setSyncCronJob(data.cronJob || null);
                              setMessage({ error: false, text: `Đã lưu lịch đồng bộ mỗi ${syncIntervalMinutes} phút.` });
                            })}
                          >
                            <Save className="h-3.5 w-3.5" />
                            Lưu lịch
                          </AnimatedButton>
                        </div>
                        {syncIntervalMinutes > 59 && syncIntervalMinutes !== 1440 && syncIntervalMinutes % 60 !== 0 && (
                          <p role="alert" className="text-[11px] text-amber-700 dark:text-amber-300">Trên 59 phút, nhập theo giờ tròn: 60, 120, 180… hoặc 1440 phút.</p>
                        )}
                        {syncCronJob?.lastRunAt && <p className="text-[11px] text-slate-500">Lần chạy cron gần nhất: {dateLabel(syncCronJob.lastRunAt)} · {syncCronJob.lastRunStatus || "Chưa có trạng thái"}</p>}
                      </div>
                      {connected && assignedMeters.length === 0 && (
                        <p className="text-[11px] text-amber-700 dark:text-amber-300">Cần gán ít nhất một công tơ vào phòng trước khi đồng bộ.</p>
                      )}
                    </div>
                  )}
                  {activeTab === "history" && (
                    <div className="space-y-3">
                      <div className={`flex items-start gap-2 rounded-lg p-3 text-xs ${connected ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"}`}>
                        {connected ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
                        <span>{connected ? `Kết nối hiện tại đã xác minh${lastConnectedAt ? ` lúc ${dateLabel(lastConnectedAt)}` : ""}. Các lỗi bên dưới thuộc từng lượt chạy trong quá khứ.` : "Kết nối hiện tại chưa sẵn sàng. Kiểm tra lại tab Kết nối."}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-xs font-semibold">
                          Lịch sử đồng bộ
                        </h3>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              const data = await request("sync-jobs");
                              setJobs(data.syncJobs || []);
                              setElectricHistory(data.history || null);
                            })
                          }
                          className={`${buttonClass} border-0`}
                        >
                          Làm mới
                        </button>
                      </div>
                      {!jobs.length && (
                        <p className="py-8 text-center text-xs text-slate-500">
                          Chưa có lượt đồng bộ.
                        </p>
                      )}
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {jobs.map((job) => (
                          <div key={job.id} className="space-y-2 py-3">
                            <div className="flex flex-wrap justify-between gap-2 text-xs">
                              <span>Lượt chạy · {dateLabel(job.startedAt)}</span>
                              <span className="font-medium">
                                {(
                                  {
                                    SUCCESS: "Thành công",
                                    RUNNING: "Đang chạy",
                                    ERROR: "Lỗi",
                                    PARTIAL: "Một phần",
                                    FAILED: "Thất bại",
                                  } as Record<string, string>
                                )[job.status] || job.status}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500">
                              {job.syncedItems || 0}/{job.totalItems || 0} công
                              tơ
                            </p>
                            {job.errorMessage && (
                              <div className="space-y-1">
                                <p className="break-words text-[11px] text-rose-600 dark:text-rose-400">{job.errorMessage}</p>
                                {connected && !["PENDING", "RUNNING"].includes(job.status) && (
                                  <p className="text-[11px] text-slate-500">Lỗi tại thời điểm chạy; kết nối hiện tại đã được xác minh.</p>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
              {message && (
                <div
                  role={message.error ? "alert" : "status"}
                  data-testid="hunonic-feedback"
                  className={`mt-4 flex items-start gap-2 rounded-lg p-3 text-xs leading-5 ${message.error ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" : "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"}`}
                >
                  {message.error ? (
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  ) : (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  )}
                  <span>{message.text}</span>
                </div>
              )}
            </div>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
