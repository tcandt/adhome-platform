import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  BellRing,
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  Droplets,
  KeyRound,
  Loader2,
  Lock,
  RefreshCw,
  Save,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { SETTINGS_TABS_CONFIG } from '@/app/navigation/navigationConfig';
import { CONSOLE_CSRF_HEADER, useAuth } from '@/app/providers/AuthContext';
import { useNavigation } from '@/app/providers/NavigationContext';
import { usePortfolio } from '@/app/providers/PortfolioContext';
import { AccountManagementView } from './AccountManagementView';

interface IntegrationRow {
  id: string;
  providerId: string;
  category: string;
  displayName: string;
  isEnabled: boolean;
  status: string;
  accountLabel: string;
  hasCredentials: boolean;
  secretHint: string | null;
  capabilities: string[];
  apiVersion: string | null;
  lastTestedAt: string | null;
}

interface NotificationChannelRow {
  id: string;
  channelType: string;
  displayName: string;
  isEnabled: boolean;
  status: string;
  targetLabel: string;
  hasCredentials: boolean;
  secretHint: string | null;
  subscribedEvents: string[];
  retryMaxAttempts: number;
}

interface CronJobRow {
  id: string;
  jobKey: string;
  displayName: string;
  cronExpression: string;
  timezone: string;
  isEnabled: boolean;
  lastRunStatus: string;
  lastRunAt: string | null;
}

interface BuildingTariffRow {
  id: string;
  code: string;
  name: string;
  status: string;
  electricRateVnd: number | null;
  waterBillingMethod: string | null;
  waterRateVnd: number | null;
}

interface AuditLogRow {
  id: string;
  actorEmail: string;
  actorRole: string;
  entityType: string;
  action: string;
  summary: string;
  createdAt: string;
}

interface LoginAuditRow {
  id: string;
  emailAttempted: string;
  outcome: string;
  clientIp: string;
  createdAt: string;
}

export const SettingsWorkspaceView: React.FC = () => {
  const { user, hasCapability } = useAuth();
  const canManageSettings = hasCapability('canManageSettings');
  const { settingsTab, setSettingsTab } = useNavigation();
  const { allBuildings, refreshPortfolio } = usePortfolio();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Organization form
  const [orgName, setOrgName] = useState('');
  const [orgHotline, setOrgHotline] = useState('');
  const [orgEmail, setOrgEmail] = useState('');
  const [orgAddress, setOrgAddress] = useState('');

  // Tariffs form
  const [defaultElectricRateVnd, setDefaultElectricRateVnd] = useState(3800);
  const [defaultWaterMethod, setDefaultWaterMethod] = useState('PER_M3');
  const [defaultWaterRateVnd, setDefaultWaterRateVnd] = useState(15000);
  const [defaultDepositMonths, setDefaultDepositMonths] = useState(1);
  const [buildingTariffs, setBuildingTariffs] = useState<BuildingTariffRow[]>(
    []
  );

  // Integrations, Notification Channels, Cron & Audits
  const [integrations, setIntegrations] = useState<IntegrationRow[]>([]);
  const [notificationChannels, setNotificationChannels] = useState<
    NotificationChannelRow[]
  >([]);
  const [cronJobs, setCronJobs] = useState<CronJobRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [loginAudits, setLoginAudits] = useState<LoginAuditRow[]>([]);

  // Per-card editing buffers for secrets / labels
  const [secretInputs, setSecretInputs] = useState<Record<string, string>>({});
  const [labelInputs, setLabelInputs] = useState<Record<string, string>>({});

  const loadSettings = useCallback(async () => {
    if (!canManageSettings) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/v1/console/v2/settings', {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setErrorMsg(data.message || 'Không thể tải cấu hình hệ thống.');
        return;
      }

      if (data.organization) {
        setOrgName(data.organization.name || '');
        setOrgHotline(data.organization.hotline || '');
        setOrgEmail(data.organization.contactEmail || '');
        setOrgAddress(data.organization.addressSummary || '');
        setDefaultElectricRateVnd(
          Number(data.organization.defaultElectricRateVnd ?? 3800)
        );
        setDefaultWaterMethod(data.organization.defaultWaterMethod || 'PER_M3');
        setDefaultWaterRateVnd(
          Number(data.organization.defaultWaterRateVnd ?? 15000)
        );
        setDefaultDepositMonths(
          Number(data.organization.defaultDepositMonths ?? 1)
        );
      }

      setBuildingTariffs(
        Array.isArray(data.buildingTariffs) ? data.buildingTariffs : []
      );
      const intList: IntegrationRow[] = Array.isArray(data.integrations)
        ? data.integrations
        : [];
      const notifList: NotificationChannelRow[] = Array.isArray(
        data.notificationChannels
      )
        ? data.notificationChannels
        : [];
      setIntegrations(intList);
      setNotificationChannels(notifList);
      setCronJobs(Array.isArray(data.cronJobs) ? data.cronJobs : []);
      setAuditLogs(Array.isArray(data.auditLogs) ? data.auditLogs : []);
      setLoginAudits(Array.isArray(data.loginAudits) ? data.loginAudits : []);

      const nextLabels: Record<string, string> = {};
      for (const item of intList) {
        nextLabels[`INT:${item.providerId}`] = item.accountLabel || '';
      }
      for (const ch of notifList) {
        nextLabels[`CH:${ch.channelType}`] = ch.targetLabel || '';
      }
      setLabelInputs(nextLabels);
      setSecretInputs({});
    } catch {
      setErrorMsg('Không thể kết nối máy chủ cấu hình PostgreSQL.');
    } finally {
      setIsLoading(false);
    }
  }, [canManageSettings]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const patchSettingsSection = async (
    section: string,
    body: Record<string, unknown>,
    okMessage: string
  ) => {
    setIsSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`/api/v1/console/v2/settings/${section}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': CONSOLE_CSRF_HEADER,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setErrorMsg(data.message || 'Không thể lưu thay đổi cấu hình.');
        return;
      }
      setSuccessMsg(okMessage);
      await Promise.all([loadSettings(), refreshPortfolio()]);
    } catch {
      setErrorMsg('Lỗi kết nối khi lưu cấu hình.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!canManageSettings) {
    return (
      <div
        data-testid="console-settings-forbidden"
        className="p-10 text-center bg-white dark:bg-[#111827] border border-rose-200 dark:border-rose-900 rounded-2xl"
      >
        <Lock className="w-9 h-9 text-rose-500 mx-auto mb-2.5" />
        <h2 className="text-base font-bold text-slate-900 dark:text-white">
          Phân hệ Cài đặt &amp; Thiết lập chỉ dành cho Quản trị viên (Admin)
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Tài khoản hiện tại ({user?.email}) không có quyền{' '}
          <code>settings.manage</code>.
        </p>
      </div>
    );
  }

  const paymentIntegrations = integrations.filter(
    (i) => i.category === 'PAYMENT'
  );
  const hunonicIntegration = integrations.find(
    (i) => i.providerId === 'HUNONIC'
  );

  const renderStatusBadge = (status: string) => {
    if (status === 'VERIFIED') {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          Đã xác thực
        </span>
      );
    }
    if (status === 'DISABLED') {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          Đã lưu khóa · Chờ kích hoạt adapter
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
        Chưa cấu hình (UNCONFIGURED)
      </span>
    );
  };

  return (
    <div className="space-y-4" data-testid="console-settings-workspace">
      {/* 8-TAB NAVIGATION BAR */}
      <div className="bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-xl p-2 overflow-x-auto">
        <div
          role="tablist"
          aria-label="Các mục Cài đặt và Thiết lập hệ thống"
          className="flex items-center gap-1 min-w-max"
        >
          {SETTINGS_TABS_CONFIG.map((tab) => {
            const isActive = settingsTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                data-testid={`settings-tab-${tab.id}`}
                onClick={() => {
                  setErrorMsg(null);
                  setSuccessMsg(null);
                  setSettingsTab(tab.id);
                }}
                className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-500/15 text-brand-primary dark:text-blue-400 font-bold'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {errorMsg && (
        <div
          data-testid="settings-error-banner"
          className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div
          data-testid="settings-success-banner"
          className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* TAB 2: STAFF & RBAC (uses standalone PostgreSQL AccountManagementView) */}
      {settingsTab === 'staff' ? (
        <AccountManagementView />
      ) : isLoading ? (
        <div className="p-12 bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl flex items-center justify-center gap-2 text-xs text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin text-brand-primary" />
          <span>Đang tải cấu hình hệ thống từ PostgreSQL...</span>
        </div>
      ) : (
        <>
          {/* TAB 1: ORGANIZATION & BUILDINGS */}
          {settingsTab === 'organization' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void patchSettingsSection(
                    'organization',
                    {
                      name: orgName,
                      hotline: orgHotline,
                      contactEmail: orgEmail,
                      addressSummary: orgAddress,
                    },
                    'Đã cập nhật thông tin tổ chức trên PostgreSQL.'
                  );
                }}
                className="lg:col-span-6 p-5 bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl space-y-4"
              >
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-brand-primary" />
                  Thông tin pháp nhân &amp; Liên hệ vận hành
                </h3>

                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Tên tổ chức / Thương hiệu vận hành *
                  </label>
                  <input
                    data-testid="input-org-name"
                    type="text"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">
                      Hotline tổng đài *
                    </label>
                    <input
                      data-testid="input-org-hotline"
                      type="text"
                      value={orgHotline}
                      onChange={(e) => setOrgHotline(e.target.value)}
                      className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">
                      Email liên hệ chính thức
                    </label>
                    <input
                      type="email"
                      value={orgEmail}
                      onChange={(e) => setOrgEmail(e.target.value)}
                      className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Địa chỉ văn phòng đại diện *
                  </label>
                  <input
                    type="text"
                    value={orgAddress}
                    onChange={(e) => setOrgAddress(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                    required
                  />
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    data-testid="submit-org-settings"
                    type="submit"
                    disabled={isSaving}
                    className="px-4 py-2 text-xs font-bold bg-brand-primary hover:bg-brand-hover text-white rounded-xl inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isSaving ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    <span>Lưu thông tin tổ chức</span>
                  </button>
                </div>
              </form>

              <div className="lg:col-span-6 p-5 bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl space-y-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Danh mục tòa nhà thuộc tổ chức ({allBuildings.length} tòa)
                </h3>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {allBuildings.map((b) => (
                    <div
                      key={b.id}
                      className="py-3 flex items-center justify-between gap-2"
                    >
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white">
                          {b.code} — {b.name}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {b.streetAddress}, {b.ward} · {b.stats.totalRooms}{' '}
                          phòng ({b.stats.floorsCount} tầng)
                        </div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          b.status === 'ACTIVE'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        }`}
                      >
                        {b.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: TARIFFS (ELECTRIC + 3 WATER METHODS) */}
          {settingsTab === 'tariffs' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void patchSettingsSection(
                  'tariffs',
                  {
                    defaultElectricRateVnd,
                    defaultWaterMethod,
                    defaultWaterRateVnd,
                    defaultDepositMonths,
                    buildingOverrides: buildingTariffs.map((b) => ({
                      buildingId: b.id,
                      electricRateVnd: b.electricRateVnd,
                      waterBillingMethod: b.waterBillingMethod,
                      waterRateVnd: b.waterRateVnd,
                    })),
                  },
                  'Đã cập nhật biểu giá điện & 3 phương thức tính nước trên PostgreSQL.'
                );
              }}
              className="p-5 bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl space-y-5"
            >
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Droplets className="w-4 h-4 text-cyan-600" />
                  Chính sách biểu giá mặc định toàn tổ chức (Số nguyên VND)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Thứ tự ưu tiên kế thừa: Hợp đồng / Phòng ghi đè → Tòa nhà ghi
                  đè → Mặc định tổ chức.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Đơn giá điện mặc định (VND/kWh)
                  </label>
                  <input
                    data-testid="input-default-electric-rate"
                    type="number"
                    min={0}
                    step={100}
                    value={defaultElectricRateVnd}
                    onChange={(e) =>
                      setDefaultElectricRateVnd(
                        parseInt(e.target.value, 10) || 0
                      )
                    }
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Phương thức tính nước mặc định
                  </label>
                  <select
                    data-testid="select-default-water-method"
                    value={defaultWaterMethod}
                    onChange={(e) => setDefaultWaterMethod(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold"
                  >
                    <option value="PER_M3">
                      1. Theo đồng hồ đo (VND / m³)
                    </option>
                    <option value="PER_PERSON">
                      2. Theo đầu người (VND / người / tháng)
                    </option>
                    <option value="FIXED_PER_ROOM">
                      3. Khoán cố định theo phòng (VND / phòng / tháng)
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Đơn giá nước mặc định (VND)
                  </label>
                  <input
                    data-testid="input-default-water-rate"
                    type="number"
                    min={0}
                    step={1000}
                    value={defaultWaterRateVnd}
                    onChange={(e) =>
                      setDefaultWaterRateVnd(parseInt(e.target.value, 10) || 0)
                    }
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Số tháng đặt cọc mặc định
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={12}
                    value={defaultDepositMonths}
                    onChange={(e) =>
                      setDefaultDepositMonths(parseInt(e.target.value, 10) || 1)
                    }
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  Ghi đè biểu giá riêng cho từng tòa nhà (bỏ trống = kế thừa mặc
                  định tổ chức)
                </h4>
                <div className="space-y-2">
                  {buildingTariffs.map((b, idx) => (
                    <div
                      key={b.id}
                      className="grid grid-cols-1 md:grid-cols-4 gap-2.5 items-center p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/70 text-xs"
                    >
                      <div className="font-bold text-slate-900 dark:text-white">
                        {b.code} — {b.name}
                      </div>
                      <input
                        type="number"
                        min={0}
                        placeholder={`Điện mặc định (${defaultElectricRateVnd}đ)`}
                        value={b.electricRateVnd ?? ''}
                        onChange={(e) => {
                          const val =
                            e.target.value === ''
                              ? null
                              : parseInt(e.target.value, 10) || 0;
                          setBuildingTariffs((prev) =>
                            prev.map((row, i) =>
                              i === idx ? { ...row, electricRateVnd: val } : row
                            )
                          );
                        }}
                        className="px-2.5 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                      />
                      <select
                        value={b.waterBillingMethod || ''}
                        onChange={(e) => {
                          const val = e.target.value || null;
                          setBuildingTariffs((prev) =>
                            prev.map((row, i) =>
                              i === idx
                                ? { ...row, waterBillingMethod: val }
                                : row
                            )
                          );
                        }}
                        className="px-2.5 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                      >
                        <option value="">Kế thừa phương thức nước</option>
                        <option value="PER_M3">Theo đồng hồ (m³)</option>
                        <option value="PER_PERSON">Theo đầu người</option>
                        <option value="FIXED_PER_ROOM">Khoán cố định</option>
                      </select>
                      <input
                        type="number"
                        min={0}
                        placeholder={`Nước mặc định (${defaultWaterRateVnd}đ)`}
                        value={b.waterRateVnd ?? ''}
                        onChange={(e) => {
                          const val =
                            e.target.value === ''
                              ? null
                              : parseInt(e.target.value, 10) || 0;
                          setBuildingTariffs((prev) =>
                            prev.map((row, i) =>
                              i === idx ? { ...row, waterRateVnd: val } : row
                            )
                          );
                        }}
                        className="px-2.5 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  data-testid="submit-tariffs-settings"
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 text-xs font-bold bg-brand-primary hover:bg-brand-hover text-white rounded-xl inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSaving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span>Lưu cấu hình biểu giá</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 4: NOTIFICATION CHANNELS */}
          {settingsTab === 'notifications' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {notificationChannels.map((ch) => {
                const labelKey = `CH:${ch.channelType}`;
                const secretKey = `CH:${ch.channelType}`;
                return (
                  <div
                    key={ch.id}
                    data-testid={`notification-channel-card-${ch.channelType}`}
                    className="p-5 bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          <BellRing className="w-4 h-4 text-brand-primary" />
                          {ch.displayName}
                        </h3>
                        <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                          {ch.channelType} · Tối đa {ch.retryMaxAttempts} lần
                          thử lại
                        </p>
                      </div>
                      {renderStatusBadge(ch.status)}
                    </div>

                    <div className="space-y-2.5 text-xs">
                      <div>
                        <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                          Định danh kênh nhận (OA ID / Chat ID / Page ID)
                        </label>
                        <input
                          type="text"
                          value={labelInputs[labelKey] || ''}
                          onChange={(e) =>
                            setLabelInputs((prev) => ({
                              ...prev,
                              [labelKey]: e.target.value,
                            }))
                          }
                          placeholder="Nhập ID kênh hoặc tài khoản đích"
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                          Access Token / Bot Secret{' '}
                          {ch.secretHint
                            ? `(Đang lưu: ${ch.secretHint})`
                            : '(Chưa lưu khóa)'}
                        </label>
                        <div className="relative">
                          <KeyRound className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="password"
                            value={secretInputs[secretKey] || ''}
                            onChange={(e) =>
                              setSecretInputs((prev) => ({
                                ...prev,
                                [secretKey]: e.target.value,
                              }))
                            }
                            placeholder="Nhập khóa mới để cập nhật (API không bao giờ trả lại khóa gốc)"
                            className="w-full pl-8 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <span className="text-[11px] text-slate-400">
                          Sự kiện: {ch.subscribedEvents.join(', ')}
                        </span>
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() =>
                            void patchSettingsSection(
                              'notification-channel',
                              {
                                channelType: ch.channelType,
                                targetLabel: labelInputs[labelKey] || '',
                                secretToken: secretInputs[secretKey] || '',
                                isEnabled: Boolean(
                                  secretInputs[secretKey] || ch.hasCredentials
                                ),
                              },
                              `Đã lưu cấu hình kênh ${ch.displayName}.`
                            )
                          }
                          className="px-3.5 py-1.5 text-xs font-bold bg-brand-primary text-white rounded-xl hover:bg-brand-hover"
                        >
                          Lưu cấu hình
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 5: PAYMENT GATEWAYS (SEPAY / PAYOS / TINGEE) */}
          {settingsTab === 'payments' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {paymentIntegrations.map((p) => {
                const labelKey = `INT:${p.providerId}`;
                const secretKey = `INT:${p.providerId}`;
                return (
                  <div
                    key={p.id}
                    data-testid={`payment-provider-card-${p.providerId}`}
                    className="p-5 bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <CreditCard className="w-4 h-4 text-brand-primary" />
                            {p.displayName}
                          </h3>
                          <span className="text-[10.5px] font-mono text-slate-400">
                            {p.providerId} · {p.apiVersion || 'v1'}
                          </span>
                        </div>
                        {renderStatusBadge(p.status)}
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {p.capabilities.map((cap) => (
                          <span
                            key={cap}
                            className="rounded-md bg-blue-50 dark:bg-blue-950/50 px-2 py-0.5 font-mono text-[10px] font-semibold text-blue-700 dark:text-blue-300"
                          >
                            {cap}
                          </span>
                        ))}
                      </div>

                      <div className="space-y-2.5 text-xs">
                        <div>
                          <label className="block font-semibold mb-1">
                            Số tài khoản / Merchant ID
                          </label>
                          <input
                            type="text"
                            value={labelInputs[labelKey] || ''}
                            onChange={(e) =>
                              setLabelInputs((prev) => ({
                                ...prev,
                                [labelKey]: e.target.value,
                              }))
                            }
                            placeholder="VD: VA-ADHOME-001"
                            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold mb-1">
                            Webhook / Checksum Secret{' '}
                            {p.secretHint ? `(${p.secretHint})` : ''}
                          </label>
                          <input
                            type="password"
                            value={secretInputs[secretKey] || ''}
                            onChange={(e) =>
                              setSecretInputs((prev) => ({
                                ...prev,
                                [secretKey]: e.target.value,
                              }))
                            }
                            placeholder="Nhập API Key / Checksum Key"
                            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                          />
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() =>
                        void patchSettingsSection(
                          'integration',
                          {
                            providerId: p.providerId,
                            accountLabel: labelInputs[labelKey] || '',
                            secretToken: secretInputs[secretKey] || '',
                            isEnabled: Boolean(
                              secretInputs[secretKey] || p.hasCredentials
                            ),
                          },
                          `Đã cập nhật thông tin kết nối ${p.displayName}.`
                        )
                      }
                      className="w-full py-2 text-xs font-bold bg-brand-primary hover:bg-brand-hover text-white rounded-xl"
                    >
                      Lưu cấu hình {p.displayName}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 6: HUNONIC SMART METER */}
          {settingsTab === 'hunonic' && hunonicIntegration && (
            <div
              data-testid="hunonic-settings-card"
              className="max-w-2xl p-5 bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl space-y-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-500" />
                    {hunonicIntegration.displayName}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Đồng bộ chỉ số công tơ điện thông minh theo chuẩn hợp đồng
                    tích hợp 3 lớp (Provider Contract → Adapter → Config). Không
                    hiển thị trạng thái &ldquo;Online&rdquo; giả lập khi chưa có
                    kết nối xác thực thực tế.
                  </p>
                </div>
                {renderStatusBadge(hunonicIntegration.status)}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-semibold mb-1">
                    Tài khoản Hunonic (SĐT / Email)
                  </label>
                  <input
                    type="text"
                    value={labelInputs['INT:HUNONIC'] || ''}
                    onChange={(e) =>
                      setLabelInputs((prev) => ({
                        ...prev,
                        'INT:HUNONIC': e.target.value,
                      }))
                    }
                    placeholder="0905xxxxxx"
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">
                    API Token / Mật khẩu ứng dụng{' '}
                    {hunonicIntegration.secretHint
                      ? `(${hunonicIntegration.secretHint})`
                      : ''}
                  </label>
                  <input
                    type="password"
                    value={secretInputs['INT:HUNONIC'] || ''}
                    onChange={(e) =>
                      setSecretInputs((prev) => ({
                        ...prev,
                        'INT:HUNONIC': e.target.value,
                      }))
                    }
                    placeholder="Nhập khóa kết nối Hunonic"
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() =>
                    void patchSettingsSection(
                      'integration',
                      {
                        providerId: 'HUNONIC',
                        accountLabel: labelInputs['INT:HUNONIC'] || '',
                        secretToken: secretInputs['INT:HUNONIC'] || '',
                        isEnabled: Boolean(
                          secretInputs['INT:HUNONIC'] ||
                            hunonicIntegration.hasCredentials
                        ),
                      },
                      'Đã lưu cấu hình tài khoản đồng hồ Hunonic.'
                    )
                  }
                  className="px-4 py-2 text-xs font-bold bg-brand-primary hover:bg-brand-hover text-white rounded-xl"
                >
                  Lưu cấu hình Hunonic
                </button>
              </div>
            </div>
          )}

          {/* TAB 7: CRON SCHEDULER */}
          {settingsTab === 'cron' && (
            <div className="p-5 bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-brand-primary" />
                  Lịch tác vụ tự động (Múi giờ cố định: Asia/Ho_Chi_Minh)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Cấu hình biểu thức Cron 5 trường chuẩn cho chốt chỉ số, dự
                  thảo hóa đơn và quét nhắc hạn hợp đồng.
                </p>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {cronJobs.map((job, idx) => (
                  <div
                    key={job.id}
                    className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white">
                        {job.displayName}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        Key: {job.jobKey} · Timezone: {job.timezone} · Lần chạy
                        cuối: {job.lastRunStatus}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={job.cronExpression}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCronJobs((prev) =>
                            prev.map((j, i) =>
                              i === idx ? { ...j, cronExpression: val } : j
                            )
                          );
                        }}
                        className="w-36 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-xs"
                      />
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={job.isEnabled}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setCronJobs((prev) =>
                              prev.map((j, i) =>
                                i === idx ? { ...j, isEnabled: checked } : j
                              )
                            );
                          }}
                          className="rounded text-brand-primary"
                        />
                        <span className="font-semibold">
                          {job.isEnabled ? 'Bật' : 'Tắt'}
                        </span>
                      </label>
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() =>
                          void patchSettingsSection(
                            'cron',
                            {
                              jobKey: job.jobKey,
                              cronExpression: job.cronExpression,
                              isEnabled: job.isEnabled,
                            },
                            `Đã lưu lịch tự động: ${job.displayName}`
                          )
                        }
                        className="px-3 py-1.5 rounded-lg font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100"
                      >
                        Lưu
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 8: AUDIT LOGS & SECURITY */}
          {settingsTab === 'audit' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-7 p-5 bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-brand-primary" />
                    Nhật ký thao tác nghiệp vụ (ConsoleAuditLog)
                  </h3>
                  <button
                    type="button"
                    onClick={() => void loadSettings()}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-brand-primary hover:underline"
                  >
                    <RefreshCw className="w-3 h-3" /> Làm mới
                  </button>
                </div>
                <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {auditLogs.length === 0 ? (
                    <p className="py-6 text-center text-slate-500">
                      Chưa ghi nhận thao tác thay đổi dữ liệu mới.
                    </p>
                  ) : (
                    auditLogs.map((log) => (
                      <div key={log.id} className="py-2.5 space-y-0.5">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {log.summary}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {new Date(log.createdAt).toLocaleString('vi-VN')} ·{' '}
                          {log.actorEmail} ({log.actorRole}) · {log.action}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="lg:col-span-5 p-5 bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl space-y-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Lịch sử xác thực đăng nhập
                </h3>
                <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {loginAudits.map((item) => (
                    <div
                      key={item.id}
                      className="py-2.5 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-mono font-semibold text-slate-800 dark:text-slate-100">
                          {item.emailAttempted}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {new Date(item.createdAt).toLocaleString('vi-VN')} ·
                          IP {item.clientIp}
                        </div>
                      </div>
                      <span
                        className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          item.outcome === 'SUCCESS'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                        }`}
                      >
                        {item.outcome}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

