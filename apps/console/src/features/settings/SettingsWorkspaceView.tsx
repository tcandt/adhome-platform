import React, { useCallback, useEffect, useState } from 'react';
import { notifySave } from '@/shared/ui/SaveToast';
import {
  AlertCircle,
  BellRing,
  Building2,
  CheckCircle2,
  Clock,
  Droplets,
  KeyRound,
  Loader2,
  Lock,
  RefreshCw,
  Save,
  ShieldCheck,
  Sliders,
  Zap,
} from 'lucide-react';
import { SETTINGS_TABS_CONFIG } from '@/app/navigation/navigationConfig';
import { CONSOLE_CSRF_HEADER, useAuth } from '@/app/providers/AuthContext';
import { useNavigation } from '@/app/providers/NavigationContext';
import { usePortfolio } from '@/app/providers/PortfolioContext';
import { AccountManagementView } from './AccountManagementView';
import { PaymentIntegrationHub } from './PaymentIntegrationHub';
import { ZaloBotSettings } from './ZaloBotSettings';
import { DataManagement } from './DataManagement';
import { VndAmountInput } from '@/shared/ui/VndAmountInput';
import { SettingsNavigation } from './SettingsNavigation';
import { SettingsDialog } from '@/shared/ui/SettingsDialog';
import { SettingsButton } from '@/shared/ui/SettingsButton';
import { HunonicSettingsModal } from '@/features/modules/modals/HunonicSettingsModal';

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
  buildingScopeId: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
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

const cronToMinutes = (expression?: string) => {
  if (!expression) return 60;
  const minute = expression.match(/^\*\/(\d+) \* \* \* \*$/);
  if (minute) return Number(minute[1]);
  if (expression === '0 * * * *') return 60;
  const hour = expression.match(/^0 \*\/(\d+) \* \* \*$/);
  if (hour) return Number(hour[1]) * 60;
  if (expression === '0 0 * * *') return 1440;
  return 60;
};

export const SettingsWorkspaceView: React.FC = () => {
  const { user, hasCapability } = useAuth();
  const canManageSettings = hasCapability('canManageSettings');
  const { settingsTab, setSettingsTab } = useNavigation();
  const { allBuildings, refreshPortfolio } = usePortfolio();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [hunonicModalOpen, setHunonicModalOpen] = useState(false);

  // Organization form
  const [orgName, setOrgName] = useState('');
  const [orgHotline, setOrgHotline] = useState('');
  const [orgEmail, setOrgEmail] = useState('');
  const [orgAddress, setOrgAddress] = useState('');

  // Tariffs form
  const [defaultElectricRateVnd, setDefaultElectricRateVnd] = useState<number | null>(3800);
  const [defaultWaterMethod, setDefaultWaterMethod] = useState('PER_M3');
  const [defaultWaterRateVnd, setDefaultWaterRateVnd] = useState<number | null>(15000);
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
  const [businessPage, setBusinessPage] = useState(1);
  const [loginPage, setLoginPage] = useState(1);
  const [businessPageCount, setBusinessPageCount] = useState(1);
  const [loginPageCount, setLoginPageCount] = useState(1);
  const [auditLoading, setAuditLoading] = useState(false);

  // Per-card editing buffers for secrets / labels
  const [secretInputs, setSecretInputs] = useState<Record<string, string>>({});
  const [labelInputs, setLabelInputs] = useState<Record<string, string>>({});
  const [editingChannel, setEditingChannel] = useState<NotificationChannelRow | null>(null);

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

  const loadAuditPages = useCallback(async () => {
    if (!canManageSettings || settingsTab !== 'audit') return;
    setAuditLoading(true);
    try {
      const [businessResponse, loginResponse] = await Promise.all([
        fetch(`/api/v1/console/v2/settings/business-logs?page=${businessPage}`, { credentials: 'include' }),
        fetch(`/api/v1/console/v2/settings/login-logs?page=${loginPage}`, { credentials: 'include' }),
      ]);
      const [business, login] = await Promise.all([businessResponse.json(), loginResponse.json()]);
      if (!businessResponse.ok || !loginResponse.ok) throw new Error(business.message || login.message || 'Không thể tải nhật ký.');
      setAuditLogs(business.items);
      setLoginAudits(login.items);
      setBusinessPageCount(business.pageCount);
      setLoginPageCount(login.pageCount);
      if (businessPage > business.pageCount) setBusinessPage(business.pageCount);
      if (loginPage > login.pageCount) setLoginPage(login.pageCount);
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Không thể tải nhật ký.');
    } finally { setAuditLoading(false); }
  }, [businessPage, canManageSettings, loginPage, settingsTab]);
  useEffect(() => { void loadAuditPages(); }, [loadAuditPages]);

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
        notifySave(false, 'Không thể lưu cấu hình', data.message || 'Máy chủ từ chối thao tác.');
        return;
      }
      await Promise.all([loadSettings(), refreshPortfolio()]);
      setSuccessMsg(okMessage);
      notifySave(true, okMessage);
    } catch {
      setErrorMsg('Lỗi kết nối khi lưu cấu hình.');
      notifySave(false, 'Không thể lưu cấu hình', 'Lỗi kết nối máy chủ.');
    } finally {
      setIsSaving(false);
    }
  };

  const saveHunonic = async () => {
    const phone = (labelInputs['INT:HUNONIC'] || '').trim();
    const password = secretInputs['INT:HUNONIC'] || '';
    if (!phone) {
      setErrorMsg('Nhập số điện thoại hoặc email Hunonic.');
      return;
    }
    setIsSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const response = await fetch('/api/v1/console/integrations/hunonic/test', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': CONSOLE_CSRF_HEADER },
        body: JSON.stringify({ phone, ...(password ? { password } : {}), isEnabled: true }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok || !data.verified) {
        throw new Error(data.message || 'Hunonic chưa xác minh kết nối. Kiểm tra tài khoản và mật khẩu.');
      }
      await Promise.all([loadSettings(), refreshPortfolio()]);
      setSecretInputs(prev => ({ ...prev, 'INT:HUNONIC': '' }));
      setSuccessMsg('Đã xác minh và kết nối Hunonic.');
      notifySave(true, 'Đã kết nối Hunonic');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không thể kết nối Hunonic.';
      setErrorMsg(message);
      notifySave(false, 'Chưa kết nối Hunonic', message);
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
      <div className="grid min-w-0 gap-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-5">
        <SettingsNavigation
          activeTab={settingsTab}
          onChange={(tab) => {
            setErrorMsg(null);
            setSuccessMsg(null);
            setSettingsTab(tab);
          }}
        />

        <main className="min-w-0 space-y-4">
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
                className="lg:col-span-7 p-5 bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl space-y-4"
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

              <div className="lg:col-span-5 p-5 bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl space-y-3">
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
                    defaultElectricRateVnd: defaultElectricRateVnd ?? 0,
                    defaultWaterMethod,
                    defaultWaterRateVnd: defaultWaterRateVnd ?? 0,
                    defaultDepositMonths,
                    buildingOverrides: buildingTariffs.map((b) => ({
                      buildingId: b.id,
                      electricRateVnd: b.electricRateVnd,
                      waterBillingMethod: b.waterBillingMethod,
                      waterRateVnd: b.waterRateVnd,
                    })),
                  },
                  'Đã lưu biểu giá.'
                );
              }}
              className="p-5 bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl space-y-5"
            >
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Droplets className="w-4 h-4 text-cyan-600" />
                  Biểu giá mặc định
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ưu tiên: Hợp đồng / Phòng → Tòa nhà → Tổ chức.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Đơn giá điện mặc định (VND/kWh)
                  </label>
                  <VndAmountInput
                    data-testid="input-default-electric-rate"
                    value={defaultElectricRateVnd}
                    onChange={setDefaultElectricRateVnd}
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
                  <VndAmountInput
                    data-testid="input-default-water-rate"
                    value={defaultWaterRateVnd}
                    onChange={setDefaultWaterRateVnd}
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
                  Giá riêng theo tòa nhà · Để trống để kế thừa
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
                      <VndAmountInput
                        aria-label={`Giá điện ${b.name}`}
                        placeholder={`Điện · ${(defaultElectricRateVnd ?? 0).toLocaleString('vi-VN')} đ`}
                        value={b.electricRateVnd}
                        onChange={(val) => {
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
                      <VndAmountInput
                        aria-label={`Giá nước ${b.name}`}
                        placeholder={`Nước · ${(defaultWaterRateVnd ?? 0).toLocaleString('vi-VN')} đ`}
                        value={b.waterRateVnd}
                        onChange={(val) => {
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
            <div className="space-y-2">
              {notificationChannels.filter(ch => ch.channelType !== 'ZALO_BOT').map((ch) => {
                const labelKey = `CH:${ch.channelType}`;
                const secretKey = `CH:${ch.channelType}`;
                return (
                  <div
                    key={ch.id}
                    data-testid={`notification-channel-card-${ch.channelType}`}
                    className="flex min-h-16 min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-200/90 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-[#111827]"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10"><BellRing className="h-4 w-4" /></span>
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          {ch.displayName}
                        </h3>
                        <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                          Tối đa {ch.retryMaxAttempts} lần thử lại
                        </p>
                      </div>
                      <div className="hidden sm:block">{renderStatusBadge(ch.status)}</div>
                    </div>
                    <SettingsButton type="button" onClick={() => setEditingChannel(ch)}>Thiết lập</SettingsButton>
                    {editingChannel?.id === ch.id && <SettingsDialog title={ch.displayName} description={`Cấu hình kênh và tối đa ${ch.retryMaxAttempts} lần thử lại.`} busy={isSaving} onClose={() => setEditingChannel(null)}>
                    <div className="space-y-4">{ch.channelType === 'ZALO_OA' ? (
                      <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                        <p className="font-semibold">Zalo OA chưa sẵn sàng gửi tin.</p>
                        <details><summary className="cursor-pointer font-semibold">Điều kiện kết nối</summary><p className="mt-2 leading-5">Cần App được OA cấp quyền, webhook xác thực, ZBS liên kết và mẫu tin được duyệt. Lưu OA ID hoặc token chưa kích hoạt gửi tin.</p></details>
                        <a className="inline-block font-semibold underline underline-offset-2" href="https://oa.zalo.me/home/documents/guides/Khoi-tao-ung-dung-va-cap-quyen_117071366476220195" target="_blank" rel="noreferrer">Xem hướng dẫn OA</a>
                      </div>
                    ) : <div className="space-y-2.5 text-xs">
                      <div>
                        <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                          ID kênh nhận
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
                          Khóa truy cập {ch.secretHint ? '· Đã lưu' : '· Chưa lưu'}
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
                            placeholder="Nhập khóa mới để cập nhật"
                            className="w-full pl-8 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                        <span className="min-w-0 text-[11px] text-slate-500">
                          {ch.subscribedEvents.length} loại thông báo
                        </span>
                        <SettingsButton primary
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
                        >
                          Lưu kênh
                        </SettingsButton>
                      </div>
                    </div>} </div></SettingsDialog>}
                  </div>
                );
              })}
              <ZaloBotSettings />
            </div>
          )}

          {/* Payment Integration Hub: multiple connections and receiving accounts */}
          {settingsTab === 'payments' && <PaymentIntegrationHub />}

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
                    Xác minh tài khoản để kết nối và đồng bộ công tơ.
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
                    Mật khẩu Hunonic {hunonicIntegration.secretHint ? '· Đã lưu' : ''}
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
                    placeholder={hunonicIntegration.hasCredentials ? 'Để trống nếu dùng mật khẩu đã lưu' : 'Nhập mật khẩu Hunonic'}
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>
              </div>

              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 text-xs dark:border-slate-700 dark:bg-slate-700">
                {[
                  ['Trạng thái', hunonicIntegration.isEnabled ? 'Đang bật' : 'Đang tắt'],
                  ['Thông tin xác thực', hunonicIntegration.hasCredentials ? 'Đã lưu bảo mật' : 'Chưa lưu'],
                  ['Xác minh gần nhất', hunonicIntegration.lastTestedAt ? new Date(hunonicIntegration.lastTestedAt).toLocaleString('vi-VN') : 'Chưa có'],
                  ['Đồng bộ gần nhất', hunonicIntegration.lastSyncedAt ? new Date(hunonicIntegration.lastSyncedAt).toLocaleString('vi-VN') : 'Chưa có'],
                  ['Phiên bản API', hunonicIntegration.apiVersion || 'Mặc định'],
                  ['Phạm vi', hunonicIntegration.buildingScopeId ? 'Một tòa nhà' : 'Toàn tổ chức'],
                  ['Khả năng', `${hunonicIntegration.capabilities.length} chức năng`],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-3 bg-white px-3 py-2.5 dark:bg-[#111827]">
                    <dt className="text-slate-500">{label}</dt>
                    <dd className="text-right font-semibold text-slate-800 dark:text-slate-100">{value}</dd>
                  </div>
                ))}
              </dl>

              {hunonicIntegration.status === 'ERROR' && hunonicIntegration.lastError && (
                <div role="alert" className="flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{hunonicIntegration.lastError}</span>
                </div>
              )}

              <div className="flex justify-end">
                <SettingsButton
                  primary
                  type="button"
                  disabled={isSaving}
                  onClick={() => void saveHunonic()}
                >
                  {isSaving ? 'Đang xác minh…' : 'Kết nối Hunonic'}
                </SettingsButton>
                <SettingsButton
                  type="button"
                  onClick={() => setHunonicModalOpen(true)}
                  className="ml-2"
                >
                  <Sliders className="h-4 w-4" />
                  Mở cấu hình đầy đủ
                </SettingsButton>
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
                        type={job.jobKey === 'HUNONIC_HOURLY_SYNC' ? 'number' : 'text'}
                        min={job.jobKey === 'HUNONIC_HOURLY_SYNC' ? 1 : undefined}
                        max={job.jobKey === 'HUNONIC_HOURLY_SYNC' ? 1440 : undefined}
                        aria-label={job.jobKey === 'HUNONIC_HOURLY_SYNC' ? 'Chu kỳ đồng bộ Hunonic theo phút' : undefined}
                        value={job.jobKey === 'HUNONIC_HOURLY_SYNC' ? cronToMinutes(job.cronExpression) : job.cronExpression}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCronJobs((prev) =>
                            prev.map((j, i) =>
                              i === idx ? { ...j, cronExpression: job.jobKey === 'HUNONIC_HOURLY_SYNC' ? Number(val) < 60 ? `*/${Number(val)} * * * *` : Number(val) === 1440 ? '0 0 * * *' : `0 */${Math.max(1, Math.trunc(Number(val) / 60))} * * *` : val } : j
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
                              ...(job.jobKey === 'HUNONIC_HOURLY_SYNC' ? { intervalMinutes: cronToMinutes(job.cronExpression) } : {}),
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
                    Nhật ký thao tác nghiệp vụ
                  </h3>
                  <button
                    type="button"
                    onClick={() => void loadAuditPages()}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-brand-primary hover:underline"
                  >
                    <RefreshCw className="w-3 h-3" /> Làm mới
                  </button>
                </div>
                <div className="divide-y divide-slate-100 text-xs dark:divide-slate-800" aria-busy={auditLoading}>
                  {auditLoading ? <p role="status" className="py-6 text-center text-slate-500">Đang tải nhật ký…</p> : auditLogs.length === 0 ? (
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
                <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs dark:border-slate-800"><span>Trang {businessPage}/{businessPageCount}</span><div className="flex gap-2"><button type="button" disabled={auditLoading || businessPage <= 1} onClick={() => setBusinessPage(p => p - 1)} className="min-h-10 rounded-lg border px-3 disabled:opacity-40">Trước</button><button type="button" disabled={auditLoading || businessPage >= businessPageCount} onClick={() => setBusinessPage(p => p + 1)} className="min-h-10 rounded-lg border px-3 disabled:opacity-40">Sau</button></div></div>
              </div>

              <div className="lg:col-span-5 p-5 bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl space-y-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Lịch sử xác thực đăng nhập
                </h3>
                <div className="divide-y divide-slate-100 text-xs dark:divide-slate-800" aria-busy={auditLoading}>
                  {auditLoading ? <p role="status" className="py-6 text-center text-slate-500">Đang tải lịch sử…</p> : loginAudits.length === 0 ? <p className="py-6 text-center text-slate-500">Chưa có lượt đăng nhập.</p> : loginAudits.map((item) => (
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
                <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs dark:border-slate-800"><span>Trang {loginPage}/{loginPageCount}</span><div className="flex gap-2"><button type="button" disabled={auditLoading || loginPage <= 1} onClick={() => setLoginPage(p => p - 1)} className="min-h-10 rounded-lg border px-3 disabled:opacity-40">Trước</button><button type="button" disabled={auditLoading || loginPage >= loginPageCount} onClick={() => setLoginPage(p => p + 1)} className="min-h-10 rounded-lg border px-3 disabled:opacity-40">Sau</button></div></div>
              </div>
            </div>
          )}
          {settingsTab === 'data' && (user?.role === 'ORG_ADMIN' ? <DataManagement /> : <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm dark:border-slate-800 dark:bg-[#111827]">Chỉ quản trị viên được quản lý dữ liệu.</p>)}
        </>
      )}
        </main>
      </div>
      <HunonicSettingsModal
        isOpen={hunonicModalOpen}
        onClose={() => setHunonicModalOpen(false)}
        onSyncTriggered={async () => { await Promise.all([loadSettings(), refreshPortfolio()]); }}
      />
    </div>
  );
};

