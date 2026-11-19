import React, { useCallback, useEffect, useState } from 'react';
import { notifySave } from '@/shared/ui/SaveToast';
import {
  AlertCircle,
  BellRing,
  Building2,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  Clock,
  Droplets,
  Info,
  KeyRound,
  LayoutGrid,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Pencil,
  Phone,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Sliders,
  Sparkles,
  Square,
  Table,
  X,
  Zap,
} from 'lucide-react';
import { SETTINGS_TABS_CONFIG } from '@/app/navigation/navigationConfig';
import { CONSOLE_CSRF_HEADER, useAuth } from '@/app/providers/AuthContext';
import { useNavigation } from '@/app/providers/NavigationContext';
import { usePortfolio } from '@/app/providers/PortfolioContext';
import { formatVnDateTime } from '@/shared/tokens/designTokens';
import { AccountManagementView } from './AccountManagementView';
import { PaymentIntegrationHub } from './PaymentIntegrationHub';
import { ZaloBotSettings } from './ZaloBotSettings';
import { DataManagement } from './DataManagement';
import { VndAmountInput } from '@/shared/ui/VndAmountInput';
import { SettingsNavigation } from './SettingsNavigation';
import { SettingsDialog } from '@/shared/ui/SettingsDialog';
import { SettingsButton } from '@/shared/ui/SettingsButton';
import { NumberInput } from '@/shared/ui/NumberInput';
import { HunonicSettingsModal } from '@/features/modules/modals/HunonicSettingsModal';
import { VersionHistory } from './VersionHistory';
import { ActionMenu } from '@/shared/ui/ActionMenu';

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

const SETTLEMENT_CRON_PRESETS = [
  { value: '0 23 28 * *', label: '23:00 đêm Ngày cuối cùng của tháng (Khuyên dùng - Chốt tháng cũ & Báo Admin)' },
  { value: '0 6 1 * *', label: '06:00 sáng Ngày 1 hàng tháng (Chốt kỳ đầu tháng)' },
  { value: '0 6 25 * *', label: '06:00 sáng Ngày 25 hàng tháng (Chốt sớm)' },
  { value: '0 6 15 * *', label: '06:00 sáng Ngày 15 hàng tháng (Giữa tháng)' },
  { value: '0 6 * * *', label: '06:00 sáng Hàng ngày' },
  { value: 'CUSTOM', label: 'Tùy chỉnh biểu thức Cron...' },
];

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
  const [isEditingOrg, setIsEditingOrg] = useState(false);
  const [editOrgName, setEditOrgName] = useState('');
  const [editOrgHotline, setEditOrgHotline] = useState('');
  const [editOrgEmail, setEditOrgEmail] = useState('');
  const [editOrgAddress, setEditOrgAddress] = useState('');

  const handleStartEditOrg = () => {
    setEditOrgName(orgName);
    setEditOrgHotline(orgHotline);
    setEditOrgEmail(orgEmail);
    setEditOrgAddress(orgAddress);
    setIsEditingOrg(true);
  };

  const handleCancelEditOrg = () => {
    setIsEditingOrg(false);
  };

  const handleSaveOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await patchSettingsSection(
      'organization',
      {
        name: editOrgName.trim(),
        hotline: editOrgHotline.trim(),
        contactEmail: editOrgEmail.trim(),
        addressSummary: editOrgAddress.trim(),
      },
      'Đã cập nhật thông tin tổ chức.'
    );
    if (ok) {
      setIsEditingOrg(false);
    }
  };

  // Tariffs form
  const [defaultElectricRateVnd, setDefaultElectricRateVnd] = useState<number | null>(0);
  const [defaultWaterMethod, setDefaultWaterMethod] = useState('PER_PERSON');
  const [defaultWaterRateVnd, setDefaultWaterRateVnd] = useState<number | null>(100000);
  const [defaultDepositMonths, setDefaultDepositMonths] = useState(1);
  const [buildingTariffs, setBuildingTariffs] = useState<BuildingTariffRow[]>([]);
  const [tariffViewMode, setTariffViewMode] = useState<'card' | 'table'>('table');
  const [selectedBuildingIds, setSelectedBuildingIds] = useState<string[]>([]);
  const [bulkElectricRateVnd, setBulkElectricRateVnd] = useState<number | null>(null);
  const [bulkWaterMethod, setBulkWaterMethod] = useState<string>('');
  const [bulkWaterRateVnd, setBulkWaterRateVnd] = useState<number | null>(null);

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
          data.organization.defaultElectricRateVnd !== null && data.organization.defaultElectricRateVnd !== undefined
            ? Number(data.organization.defaultElectricRateVnd)
            : 0
        );
        setDefaultWaterMethod(data.organization.defaultWaterMethod || 'PER_PERSON');
        setDefaultWaterRateVnd(
          data.organization.defaultWaterRateVnd !== null && data.organization.defaultWaterRateVnd !== undefined
            ? Number(data.organization.defaultWaterRateVnd)
            : 100000
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
  ): Promise<boolean> => {
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
        return false;
      }
      await Promise.all([loadSettings(), refreshPortfolio()]);
      setSuccessMsg(okMessage);
      notifySave(true, okMessage);
      return true;
    } catch {
      setErrorMsg('Lỗi kết nối khi lưu cấu hình.');
      notifySave(false, 'Không thể lưu cấu hình', 'Lỗi kết nối máy chủ.');
      return false;
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
        <div className="p-12 bg-white dark:bg-[#111827] border border-slate-200/80 dark:border-slate-800 rounded-2xl flex items-center justify-center gap-2 text-xs text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin text-brand-primary" />
          <span>Đang tải cấu hình hệ thống từ PostgreSQL...</span>
        </div>
      ) : (
        <>
          {/* TAB 1: ORGANIZATION & LEGAL INFO */}
          {settingsTab === 'organization' && (
            <div className="max-w-2xl">
              <div className="p-5 sm:p-6 bg-white dark:bg-[#111827] border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-sm space-y-4">
                {/* Header matching modal style */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                      Thông tin pháp nhân &amp; Liên hệ vận hành
                    </h3>
                    <p className="mt-0.5 break-words text-sm text-slate-500 dark:text-slate-400">
                      Thông tin tổ chức hiển thị trên hợp đồng, hóa đơn và thông báo vận hành
                    </p>
                  </div>
                </div>

                {!isEditingOrg ? (
                  /* Read-only specification view formatted like BuildingInfoDialog (Ảnh 2) */
                  <div className="space-y-4">
                    {/* Primary Organization Box */}
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-slate-50 p-3.5 sm:p-4 dark:bg-slate-800/60">
                      <div className="col-span-2 min-w-0">
                        <dt className="text-xs text-slate-500 dark:text-slate-400">
                          Tên tổ chức / Thương hiệu vận hành
                        </dt>
                        <dd className="mt-0.5 break-words text-sm font-semibold text-slate-900 dark:text-white">
                          {orgName || <span className="italic text-slate-400 font-normal">Chưa thiết lập</span>}
                        </dd>
                      </div>
                      <div className="col-span-2 min-w-0">
                        <dt className="text-xs text-slate-500 dark:text-slate-400">
                          Địa chỉ văn phòng đại diện
                        </dt>
                        <dd className="mt-0.5 break-words text-sm leading-5 font-semibold text-slate-800 dark:text-slate-200">
                          {orgAddress || <span className="italic text-slate-400 font-normal">Chưa thiết lập</span>}
                        </dd>
                      </div>
                    </dl>

                    {/* Operational Contacts Section */}
                    <section className="border-t border-slate-200/80 pt-3.5 dark:border-slate-700">
                      <h4 className="mb-2.5 text-sm font-semibold text-slate-900 dark:text-white">
                        Liên hệ vận hành
                      </h4>
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                        <div className="min-w-0">
                          <dt className="text-xs text-slate-500 dark:text-slate-400">Hotline tổng đài</dt>
                          <dd className="mt-0.5 font-mono text-sm font-semibold text-slate-800 dark:text-slate-200">
                            {orgHotline || <span className="italic text-slate-400 font-normal">Chưa thiết lập</span>}
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-xs text-slate-500 dark:text-slate-400">Email liên hệ chính thức</dt>
                          <dd className="mt-0.5 break-words text-sm font-medium text-slate-800 dark:text-slate-200" title={orgEmail}>
                            {orgEmail || <span className="italic text-slate-400 font-normal">Chưa thiết lập</span>}
                          </dd>
                        </div>
                      </dl>
                    </section>

                    {/* Button Chỉnh sửa -> Chuyển về bên dưới card */}
                    {canManageSettings && (
                      <div className="border-t border-slate-200/80 pt-3.5 dark:border-slate-800 flex justify-end">
                        <button
                          type="button"
                          data-testid="btn-edit-org-settings"
                          onClick={handleStartEditOrg}
                          className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors"
                        >
                          <Pencil className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                          <span>Chỉnh sửa</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Edit form */
                  <form onSubmit={handleSaveOrganization} className="space-y-4 pt-1">
                    <div>
                      <label className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                        Tên tổ chức / Thương hiệu vận hành *
                      </label>
                      <input
                        data-testid="input-org-name"
                        type="text"
                        value={editOrgName}
                        onChange={(e) => setEditOrgName(e.target.value)}
                        className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold outline-none focus:border-brand-primary"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                          Hotline tổng đài *
                        </label>
                        <input
                          data-testid="input-org-hotline"
                          type="text"
                          value={editOrgHotline}
                          onChange={(e) => setEditOrgHotline(e.target.value)}
                          className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono outline-none focus:border-brand-primary"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                          Email liên hệ chính thức
                        </label>
                        <input
                          type="email"
                          value={editOrgEmail}
                          onChange={(e) => setEditOrgEmail(e.target.value)}
                          className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-brand-primary"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                        Địa chỉ văn phòng đại diện *
                      </label>
                      <input
                        type="text"
                        value={editOrgAddress}
                        onChange={(e) => setEditOrgAddress(e.target.value)}
                        className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-brand-primary"
                        required
                      />
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={handleCancelEditOrg}
                        disabled={isSaving}
                        className="px-3.5 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
                      >
                        Hủy
                      </button>
                      <button
                        data-testid="submit-org-settings"
                        type="submit"
                        disabled={isSaving}
                        className="px-4 py-2 text-xs font-bold bg-brand-primary hover:bg-brand-hover text-white rounded-xl inline-flex items-center gap-1.5 disabled:opacity-50 shadow-sm transition-colors"
                      >
                        {isSaving ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Save className="w-3.5 h-3.5" />
                        )}
                        <span>Lưu thay đổi</span>
                      </button>
                    </div>
                  </form>
                )}
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
              className="p-5 bg-white dark:bg-[#111827] border border-slate-200/80 dark:border-slate-800 rounded-2xl space-y-5"
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

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
                <div className="flex flex-col justify-end space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 min-h-[36px] flex items-end pb-0.5">
                    Đơn giá điện mặc định (VND/kWh)
                  </label>
                  <VndAmountInput
                    data-testid="input-default-electric-rate"
                    value={defaultElectricRateVnd}
                    onChange={setDefaultElectricRateVnd}
                    className="w-full h-10 text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                  />
                </div>

                <div className="flex flex-col justify-end space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 min-h-[36px] flex items-end pb-0.5">
                    Phương thức tính nước mặc định
                  </label>
                  <select
                    data-testid="select-default-water-method"
                    value={defaultWaterMethod}
                    onChange={(e) => setDefaultWaterMethod(e.target.value)}
                    className="w-full h-10 text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold"
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

                <div className="flex flex-col justify-end space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 min-h-[36px] flex items-end pb-0.5">
                    Đơn giá nước mặc định (VND)
                  </label>
                  <VndAmountInput
                    data-testid="input-default-water-rate"
                    value={defaultWaterRateVnd}
                    onChange={setDefaultWaterRateVnd}
                    className="w-full h-10 text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                  />
                </div>

                <div className="flex flex-col justify-end space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 min-h-[36px] flex items-end pb-0.5">
                    Số tháng đặt cọc mặc định
                  </label>
                  <NumberInput
                    min={0}
                    max={12}
                    value={defaultDepositMonths}
                    onValueChange={value => setDefaultDepositMonths(Math.trunc(value))}
                    className="w-full h-10 text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                {/* Header with Title and View Mode Toggle */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <span>Giá riêng theo tòa nhà ({buildingTariffs.length} tòa)</span>
                      <span className="text-[11px] font-normal text-slate-500">· Để trống để kế thừa giá mặc định</span>
                    </h4>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* View mode toggle: Table / Card */}
                    <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-800">
                      <button
                        type="button"
                        data-testid="toggle-tariff-view-table"
                        onClick={() => setTariffViewMode('table')}
                        className={`p-1.5 rounded-lg text-xs transition-colors ${
                          tariffViewMode === 'table'
                            ? 'bg-white dark:bg-slate-900 text-brand-primary shadow-xs font-bold'
                            : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                        }`}
                        title="Dạng bảng (Table view)"
                      >
                        <Table className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        data-testid="toggle-tariff-view-card"
                        onClick={() => setTariffViewMode('card')}
                        className={`p-1.5 rounded-lg text-xs transition-colors ${
                          tariffViewMode === 'card'
                            ? 'bg-white dark:bg-slate-900 text-brand-primary shadow-xs font-bold'
                            : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                        }`}
                        title="Dạng thẻ (Card view)"
                      >
                        <LayoutGrid className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Bulk Setting Toolbar (when 1 or more buildings are selected) */}
                {selectedBuildingIds.length > 0 && (
                  <div className="p-3.5 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-blue-900 dark:text-blue-200">
                        Đang chọn {selectedBuildingIds.length}/{buildingTariffs.length} tòa nhà để thiết lập hàng loạt:
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedBuildingIds([])}
                        className="text-xs font-medium text-blue-700 hover:underline dark:text-blue-300"
                      >
                        Bỏ chọn tất cả
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
                      <div className="flex flex-col justify-end space-y-1">
                        <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 min-h-[28px] flex items-end pb-0.5">
                          Đơn giá điện áp dụng (VND/kWh)
                        </label>
                        <VndAmountInput
                          placeholder={`Mặc định: ${(defaultElectricRateVnd ?? 0).toLocaleString('vi-VN')} đ`}
                          value={bulkElectricRateVnd}
                          onChange={setBulkElectricRateVnd}
                          className="w-full h-9 px-2.5 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 font-bold"
                        />
                      </div>
                      <div className="flex flex-col justify-end space-y-1">
                        <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 min-h-[28px] flex items-end pb-0.5">
                          Phương thức tính nước áp dụng
                        </label>
                        <select
                          value={bulkWaterMethod}
                          onChange={(e) => setBulkWaterMethod(e.target.value)}
                          className="w-full h-9 px-2.5 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 font-semibold"
                        >
                          <option value="">-- Giữ nguyên phương thức --</option>
                          <option value="PER_M3">1. Theo đồng hồ (m³)</option>
                          <option value="PER_PERSON">2. Theo đầu người</option>
                          <option value="FIXED_PER_ROOM">3. Khoán cố định phòng</option>
                        </select>
                      </div>
                      <div className="flex flex-col justify-end space-y-1">
                        <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 min-h-[28px] flex items-end pb-0.5">
                          Đơn giá nước áp dụng (VND)
                        </label>
                        <VndAmountInput
                          placeholder={`Mặc định: ${(defaultWaterRateVnd ?? 0).toLocaleString('vi-VN')} đ`}
                          value={bulkWaterRateVnd}
                          onChange={setBulkWaterRateVnd}
                          className="w-full h-9 px-2.5 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 font-bold"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setBuildingTariffs((prev) =>
                            prev.map((b) =>
                              selectedBuildingIds.includes(b.id)
                                ? { ...b, electricRateVnd: null, waterBillingMethod: null, waterRateVnd: null }
                                : b
                            )
                          );
                          notifySave(true, 'Đã đặt lại về mặc định', `Đã xóa giá riêng cho ${selectedBuildingIds.length} tòa.`);
                        }}
                        className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 transition-colors"
                      >
                        Kế thừa mặc định tổ chức ({selectedBuildingIds.length} tòa)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setBuildingTariffs((prev) =>
                            prev.map((b) => {
                              if (!selectedBuildingIds.includes(b.id)) return b;
                              return {
                                ...b,
                                ...(bulkElectricRateVnd !== null ? { electricRateVnd: bulkElectricRateVnd } : {}),
                                ...(bulkWaterMethod ? { waterBillingMethod: bulkWaterMethod } : {}),
                                ...(bulkWaterRateVnd !== null ? { waterRateVnd: bulkWaterRateVnd } : {}),
                              };
                            })
                          );
                          notifySave(true, 'Đã áp dụng biểu giá', `Đã áp dụng cho ${selectedBuildingIds.length} tòa nhà đã chọn.`);
                        }}
                        className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-brand-primary text-white hover:bg-brand-hover shadow-xs transition-colors"
                      >
                        Áp dụng cho {selectedBuildingIds.length} tòa đã chọn
                      </button>
                    </div>
                  </div>
                )}

                {/* TABLE VIEW */}
                {tariffViewMode === 'table' ? (
                  <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-700">
                    <table className="w-full text-left text-xs min-w-[720px]">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/60 text-slate-500 font-semibold">
                          <th className="py-2.5 px-3 w-10 text-center">
                            <input
                              type="checkbox"
                              data-testid="checkbox-select-all-tariffs"
                              aria-label="Chọn tất cả tòa nhà"
                              checked={buildingTariffs.length > 0 && selectedBuildingIds.length === buildingTariffs.length}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedBuildingIds(buildingTariffs.map((b) => b.id));
                                } else {
                                  setSelectedBuildingIds([]);
                                }
                              }}
                              className="rounded border-slate-300 text-brand-primary focus:ring-brand-primary"
                            />
                          </th>
                          <th className="py-2.5 px-3 min-w-[140px]">Tòa nhà</th>
                          <th className="py-2.5 px-3 min-w-[150px]">Đơn giá điện (VND/kWh)</th>
                          <th className="py-2.5 px-3 min-w-[180px]">Phương thức tính nước</th>
                          <th className="py-2.5 px-3 min-w-[150px]">Đơn giá nước (VND)</th>
                          <th className="py-2.5 px-3 text-center min-w-[110px]">Trạng thái</th>
                          <th className="py-2.5 px-3 text-right w-12">
                            <span className="sr-only">Thao tác</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {buildingTariffs.map((b, idx) => {
                          const isCustomized =
                            b.electricRateVnd !== null ||
                            b.waterBillingMethod !== null ||
                            b.waterRateVnd !== null;
                          const isSelected = selectedBuildingIds.includes(b.id);

                          return (
                            <tr
                              key={b.id}
                              data-testid={`tariff-row-${b.id}`}
                              className={`transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
                                isSelected ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''
                              }`}
                            >
                              <td className="py-3 px-3 text-center">
                                <input
                                  type="checkbox"
                                  data-testid={`checkbox-building-${b.id}`}
                                  aria-label={`Chọn tòa ${b.name}`}
                                  checked={isSelected}
                                  onChange={() => {
                                    setSelectedBuildingIds((prev) =>
                                      prev.includes(b.id)
                                        ? prev.filter((id) => id !== b.id)
                                        : [...prev, b.id]
                                    );
                                  }}
                                  className="rounded border-slate-300 text-brand-primary focus:ring-brand-primary"
                                />
                              </td>
                              <td className="py-3 px-3">
                                <div className="font-bold text-slate-900 dark:text-white">
                                  {b.name}
                                </div>
                                <div className="text-[11px] text-slate-500 font-mono">
                                  {b.code}
                                </div>
                              </td>
                              <td className="py-3 px-3">
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
                                  className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                                />
                              </td>
                              <td className="py-3 px-3">
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
                                  className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                                >
                                  <option value="">
                                    Kế thừa ({defaultWaterMethod === 'PER_PERSON' ? 'Theo người' : defaultWaterMethod === 'PER_M3' ? 'Theo m³' : 'Khoán'})
                                  </option>
                                  <option value="PER_M3">Theo đồng hồ (m³)</option>
                                  <option value="PER_PERSON">Theo đầu người</option>
                                  <option value="FIXED_PER_ROOM">Khoán cố định phòng</option>
                                </select>
                              </td>
                              <td className="py-3 px-3">
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
                                  className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                                />
                              </td>
                              <td className="py-3 px-3 text-center">
                                {isCustomized ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                    Giá riêng
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                    Kế thừa
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-3 text-right">
                                <div className="flex justify-end">
                                  <ActionMenu
                                    ariaLabel={`Tùy chọn biểu giá ${b.name}`}
                                    contextTitle={b.name}
                                    contextSubtitle={b.code}
                                    items={[
                                      {
                                        label: 'Về mặc định tổ chức',
                                        icon: <RotateCcw className="w-4 h-4 text-slate-500" />,
                                        disabled: !isCustomized,
                                        onClick: () => {
                                          setBuildingTariffs((prev) =>
                                            prev.map((row, i) =>
                                              i === idx
                                                ? {
                                                    ...row,
                                                    electricRateVnd: null,
                                                    waterBillingMethod: null,
                                                    waterRateVnd: null,
                                                  }
                                                : row
                                            )
                                          );
                                          notifySave(true, 'Đã đặt lại về mặc định', `Tòa ${b.name} đã chuyển sang kế thừa giá tổ chức.`);
                                        },
                                      },
                                    ]}
                                  />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  /* CARD VIEW */
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3" data-testid="console-tariffs-cards">
                    {buildingTariffs.map((b, idx) => {
                      const isCustomized =
                        b.electricRateVnd !== null ||
                        b.waterBillingMethod !== null ||
                        b.waterRateVnd !== null;
                      const isSelected = selectedBuildingIds.includes(b.id);

                      return (
                        <div
                          key={b.id}
                          data-testid={`tariff-card-${b.id}`}
                          className={`p-3.5 rounded-2xl border transition-colors space-y-3 ${
                            isSelected
                              ? 'bg-blue-50/30 dark:bg-blue-950/20 border-blue-300 dark:border-blue-800'
                              : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <label className="flex items-center gap-2 cursor-pointer min-w-0">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {
                                  setSelectedBuildingIds((prev) =>
                                    prev.includes(b.id)
                                      ? prev.filter((id) => id !== b.id)
                                      : [...prev, b.id]
                                  );
                                }}
                                className="rounded border-slate-300 text-brand-primary focus:ring-brand-primary"
                              />
                              <div className="min-w-0">
                                <span className="font-bold text-xs text-slate-900 dark:text-white truncate block">
                                  {b.name}
                                </span>
                                <span className="text-[10px] text-slate-500 font-mono">
                                  {b.code}
                                </span>
                              </div>
                            </label>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {isCustomized ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                  Giá riêng
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                  Kế thừa
                                </span>
                              )}
                              <ActionMenu
                                ariaLabel={`Tùy chọn biểu giá ${b.name}`}
                                contextTitle={b.name}
                                contextSubtitle={b.code}
                                items={[
                                  {
                                    label: 'Về mặc định tổ chức',
                                    icon: <RotateCcw className="w-4 h-4 text-slate-500" />,
                                    disabled: !isCustomized,
                                    onClick: () => {
                                      setBuildingTariffs((prev) =>
                                        prev.map((row, i) =>
                                          i === idx
                                            ? {
                                                ...row,
                                                electricRateVnd: null,
                                                waterBillingMethod: null,
                                                waterRateVnd: null,
                                              }
                                            : row
                                        )
                                      );
                                      notifySave(true, 'Đã đặt lại về mặc định', `Tòa ${b.name} đã chuyển sang kế thừa giá tổ chức.`);
                                    },
                                  },
                                ]}
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                                Điện (VND/kWh)
                              </label>
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
                                className="w-full px-2 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                                Phương thức nước
                              </label>
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
                                className="w-full px-2 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                              >
                                <option value="">Kế thừa mặc định</option>
                                <option value="PER_M3">Theo đồng hồ (m³)</option>
                                <option value="PER_PERSON">Theo người</option>
                                <option value="FIXED_PER_ROOM">Khoán phòng</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                                Nước (VND)
                              </label>
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
                                className="w-full px-2 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
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
            <div className="space-y-3">
              <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                <p className="font-semibold flex items-center gap-1.5">
                  <Info className="w-4 h-4 shrink-0 text-blue-600 dark:text-blue-400" />
                  Quy tắc kênh thông báo mặc định
                </p>
                <p className="mt-1 leading-5 text-blue-800 dark:text-blue-300">
                  Hệ thống chỉ được đăng ký <strong>1 trong 4 kênh</strong> làm kênh thông báo mặc định. Khi đã đăng ký hoặc kích hoạt 1 kênh (ví dụ: Zalo Bot), các kênh còn lại sẽ tự động ở trạng thái <strong>Inactive (Không hoạt động)</strong>.
                </p>
              </div>

              <div className="space-y-2">
                {notificationChannels.map((ch) => {
                  if (ch.channelType === 'ZALO_BOT') {
                    return (
                      <ZaloBotSettings
                        key={ch.id}
                        channel={ch}
                        onDefaultChanged={() => void loadSettings()}
                      />
                    );
                  }

                  const labelKey = `CH:${ch.channelType}`;
                  const secretKey = `CH:${ch.channelType}`;
                  return (
                    <div
                      key={ch.id}
                      data-testid={`notification-channel-card-${ch.channelType}`}
                      className="flex min-h-16 min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-[#111827]"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10"><BellRing className="h-4 w-4" /></span>
                        <div className="min-w-0">
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            {ch.displayName}
                            {ch.isEnabled && (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                Kênh mặc định
                              </span>
                            )}
                          </h3>
                          <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                            Tối đa {ch.retryMaxAttempts} lần thử lại
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {ch.isEnabled ? (
                          <span className="hidden sm:inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                            Đang hoạt động · Mặc định
                          </span>
                        ) : (
                          <>
                            <span className="hidden sm:inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                              Không hoạt động (Inactive)
                            </span>
                            {(ch.hasCredentials || ch.secretHint) && (
                              <SettingsButton
                                type="button"
                                disabled={isSaving}
                                onClick={() =>
                                  void patchSettingsSection(
                                    'notification-channel',
                                    {
                                      channelType: ch.channelType,
                                      targetLabel: labelInputs[labelKey] || ch.targetLabel || '',
                                      secretToken: secretInputs[secretKey] || '',
                                      isEnabled: true,
                                    },
                                    `Đã kích hoạt ${ch.displayName} làm kênh thông báo mặc định. Các kênh khác đã chuyển sang Inactive.`
                                  )
                                }
                              >
                                Đặt làm mặc định
                              </SettingsButton>
                            )}
                          </>
                        )}
                        <SettingsButton type="button" onClick={() => setEditingChannel(ch)}>Thiết lập</SettingsButton>
                      </div>

                      {editingChannel?.id === ch.id && (
                        <SettingsDialog
                          title={ch.displayName}
                          description={`Cấu hình kênh thông báo. Chỉ 1 trong 4 kênh được kích hoạt làm mặc định.`}
                          busy={isSaving}
                          onClose={() => setEditingChannel(null)}
                        >
                          <div className="space-y-4">
                            <div className="rounded-lg bg-blue-50 p-2.5 text-[11px] text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
                              Lưu ý: Khi lưu và kích hoạt kênh này làm mặc định, các kênh thông báo khác sẽ tự động chuyển sang trạng thái <strong>Inactive</strong>.
                            </div>

                            {ch.channelType === 'ZALO_OA' ? (
                              <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                                <p className="font-semibold">Zalo OA chưa sẵn sàng gửi tin.</p>
                                <details>
                                  <summary className="cursor-pointer font-semibold">Điều kiện kết nối</summary>
                                  <p className="mt-2 leading-5">Cần App được OA cấp quyền, webhook xác thực, ZBS liên kết và mẫu tin được duyệt. Lưu OA ID hoặc token chưa kích hoạt gửi tin.</p>
                                </details>
                                <a className="inline-block font-semibold underline underline-offset-2" href="https://oa.zalo.me/home/documents/guides/Khoi-tao-ung-dung-va-cap-quyen_117071366476220195" target="_blank" rel="noreferrer">Xem hướng dẫn OA</a>
                              </div>
                            ) : null}

                            <div className="space-y-2.5 text-xs">
                              <div>
                                <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                                  ID kênh nhận
                                </label>
                                <input
                                  type="text"
                                  value={labelInputs[labelKey] ?? ch.targetLabel ?? ''}
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
                                    placeholder={ch.secretHint ? 'Nhập khóa mới để thay thế' : 'Nhập khóa truy cập / token'}
                                    className="w-full pl-8 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                                  />
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                                <span className="min-w-0 text-[11px] text-slate-500">
                                  {ch.subscribedEvents.length} loại thông báo
                                </span>
                                <div className="flex items-center gap-2">
                                  {ch.isEnabled && (
                                    <SettingsButton
                                      type="button"
                                      disabled={isSaving}
                                      onClick={() => {
                                        void patchSettingsSection(
                                          'notification-channel',
                                          {
                                            channelType: ch.channelType,
                                            targetLabel: labelInputs[labelKey] ?? ch.targetLabel ?? '',
                                            secretToken: secretInputs[secretKey] || '',
                                            isEnabled: false,
                                          },
                                          `Đã chuyển kênh ${ch.displayName} sang Inactive.`
                                        );
                                        setEditingChannel(null);
                                      }}
                                    >
                                      Hủy kích hoạt (Inactive)
                                    </SettingsButton>
                                  )}
                                  <SettingsButton
                                    primary
                                    type="button"
                                    disabled={isSaving}
                                    onClick={() => {
                                      void patchSettingsSection(
                                        'notification-channel',
                                        {
                                          channelType: ch.channelType,
                                          targetLabel: labelInputs[labelKey] ?? ch.targetLabel ?? '',
                                          secretToken: secretInputs[secretKey] || '',
                                          isEnabled: true,
                                        },
                                        `Đã lưu và kích hoạt kênh ${ch.displayName} làm kênh thông báo mặc định.`
                                      );
                                      setEditingChannel(null);
                                    }}
                                  >
                                    Lưu & Đặt làm mặc định
                                  </SettingsButton>
                                </div>
                              </div>
                            </div>
                          </div>
                        </SettingsDialog>
                      )}
                    </div>
                  );
                })}
                {/* Fallback if ZALO_BOT is somehow missing from notificationChannels */}
                {notificationChannels.every((c) => c.channelType !== 'ZALO_BOT') && (
                  <ZaloBotSettings onDefaultChanged={() => void loadSettings()} />
                )}
              </div>
            </div>
          )}

          {/* Payment Integration Hub: multiple connections and receiving accounts */}
          {settingsTab === 'payments' && <PaymentIntegrationHub />}

          {/* TAB 6: HUNONIC SMART METER */}
          {settingsTab === 'hunonic' && hunonicIntegration && (
            <div
              data-testid="hunonic-settings-card"
              className="max-w-2xl p-5 bg-white dark:bg-[#111827] border border-slate-200/80 dark:border-slate-800 rounded-2xl space-y-4"
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
                  ['Xác minh gần nhất', hunonicIntegration.lastTestedAt ? formatVnDateTime(hunonicIntegration.lastTestedAt) : 'Chưa có'],
                  ['Đồng bộ gần nhất', hunonicIntegration.lastSyncedAt ? formatVnDateTime(hunonicIntegration.lastSyncedAt) : 'Chưa có'],
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
            <div className="p-5 bg-white dark:bg-[#111827] border border-slate-200/80 dark:border-slate-800 rounded-2xl space-y-4">
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
                {cronJobs.map((job, idx) => {
                  const isSettlementJob = job.jobKey === 'BILLING_PERIOD_CUTOFF';
                  if (isSettlementJob) {
                    const matchedPreset = SETTLEMENT_CRON_PRESETS.find((p) => p.value === job.cronExpression);
                    const selectedPreset = matchedPreset ? matchedPreset.value : 'CUSTOM';
                    return (
                      <div
                        key={job.id}
                        className="p-4 my-2.5 rounded-xl border border-blue-200/90 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/20 space-y-3"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                          <div className="flex items-center gap-2.5">
                            <span className="p-2 rounded-xl bg-blue-500/10 text-brand-primary dark:text-blue-400">
                              <CalendarDays className="w-5 h-5" />
                            </span>
                            <div>
                              <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2 text-[13px]">
                                {job.displayName}
                                <span className="text-[10px] px-1.5 py-0.5 rounded-md font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300">
                                  Tổng hợp kỳ & Hóa đơn
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                                Key: {job.jobKey} · Múi giờ: {job.timezone} · Lần chạy cuối: {job.lastRunStatus}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-semibold">
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
                              <span>{job.isEnabled ? 'Đang bật' : 'Đang tắt'}</span>
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
                              className="px-3 py-1.5 rounded-lg font-bold bg-brand-primary hover:bg-brand-primary/90 text-white text-xs shadow-xs"
                            >
                              Lưu cấu hình
                            </button>
                          </div>
                        </div>

                        {/* Chế độ tổng hợp & Lịch chạy */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-xs">
                          <div className="space-y-1">
                            <label className="font-semibold text-slate-700 dark:text-slate-300">
                              Chế độ tổng hợp kỳ:
                            </label>
                            <select
                              value={
                                job.displayName.includes('Chỉ số')
                                  ? 'METERS_ONLY'
                                  : job.displayName.includes('chu kỳ')
                                  ? 'CYCLE_AWARE'
                                  : job.displayName.includes('Tự động phát hành')
                                  ? 'AUTO_FULL'
                                  : 'AUTO_DRAFT'
                              }
                              onChange={(e) => {
                                const mode = e.target.value;
                                const newTitle =
                                  mode === 'METERS_ONLY'
                                    ? 'Chốt chỉ số điện nước & Khởi tạo dữ liệu kỳ mới'
                                    : mode === 'CYCLE_AWARE'
                                    ? 'Tự động tổng hợp theo chu kỳ hợp đồng & Lập hóa đơn nháp'
                                    : mode === 'AUTO_FULL'
                                    ? 'Tự động tổng hợp & Tự động phát hành gửi khách hàng'
                                    : 'Chốt chỉ số cuối kỳ & khởi tạo bảng tổng hợp nháp';
                                setCronJobs((prev) =>
                                  prev.map((j, i) =>
                                    i === idx ? { ...j, displayName: newTitle } : j
                                  )
                                );
                              }}
                              className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                            >
                              <option value="AUTO_DRAFT">Chế độ A: Tự động nháp &amp; Thông báo nhóm Admin (Khuyên dùng)</option>
                              <option value="METERS_ONLY">Chế độ B: Chốt chỉ số điện nước &amp; Đồng bộ</option>
                              <option value="CYCLE_AWARE">Chế độ C: Theo chu kỳ hợp đồng (1 - 12 tháng)</option>
                              <option value="AUTO_FULL">Chế độ D: Tự động phát hành &amp; Gửi thẳng khách hàng</option>
                            </select>
                          </div>

                          <div className="space-y-1">
                            <label className="font-semibold text-slate-700 dark:text-slate-300">
                              Lịch chạy định kỳ (Asia/Ho_Chi_Minh):
                            </label>
                            <div className="flex gap-2">
                              <select
                                value={selectedPreset}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val !== 'CUSTOM') {
                                    setCronJobs((prev) =>
                                      prev.map((j, i) =>
                                        i === idx ? { ...j, cronExpression: val } : j
                                      )
                                    );
                                  }
                                }}
                                className="flex-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-mono text-[11px]"
                              >
                                {SETTLEMENT_CRON_PRESETS.map((p) => (
                                  <option key={p.value} value={p.value}>
                                    {p.label}
                                  </option>
                                ))}
                              </select>
                              {selectedPreset === 'CUSTOM' && (
                                <input
                                  type="text"
                                  value={job.cronExpression}
                                  onChange={(e) =>
                                    setCronJobs((prev) =>
                                      prev.map((j, i) =>
                                        i === idx ? { ...j, cronExpression: e.target.value } : j
                                      )
                                    )
                                  }
                                  placeholder="* * * * *"
                                  className="w-28 px-2 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono text-xs"
                                />
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Quy tắc thông minh tóm tắt */}
                        <div className="p-2 rounded-lg bg-white/80 dark:bg-slate-900/70 border border-blue-100 dark:border-blue-900/40 text-[11px] text-slate-600 dark:text-slate-400 space-y-1">
                          <div className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300">
                            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                            Quy tắc tự động thông minh đã áp dụng:
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 pl-2">
                            <div className="flex items-start gap-1.5">
                              <span className="text-emerald-500 font-bold shrink-0">✓</span>
                              <span><strong>Bỏ qua phòng trống:</strong> Không tạo hóa đơn nháp cho phòng chưa có hợp đồng / chưa có khách.</span>
                            </div>
                            <div className="flex items-start gap-1.5">
                              <span className="text-emerald-500 font-bold shrink-0">✓</span>
                              <span><strong>Tính theo ngày ở:</strong> Khách vào ở giữa tháng tính tiền phòng &amp; điện nước theo số ngày ở thực tế.</span>
                            </div>
                            <div className="flex items-start gap-1.5">
                              <span className="text-emerald-500 font-bold shrink-0">✓</span>
                              <span><strong>Thông báo nhóm Admin:</strong> Tự động báo nhóm Zalo Admin khi tổng hợp xong để ban quản lý duyệt phát hành.</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
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
                        {job.jobKey === 'HUNONIC_HOURLY_SYNC' ? (
                          <NumberInput
                            min={job.jobKey === 'HUNONIC_HOURLY_SYNC' ? 1 : undefined}
                            max={job.jobKey === 'HUNONIC_HOURLY_SYNC' ? 1440 : undefined}
                            aria-label={
                              job.jobKey === 'HUNONIC_HOURLY_SYNC'
                                ? 'Chu kỳ đồng bộ Hunonic theo phút'
                                : undefined
                            }
                            value={cronToMinutes(job.cronExpression)}
                            onValueChange={(value) => {
                              setCronJobs((prev) =>
                                prev.map((j, i) =>
                                  i === idx
                                    ? {
                                        ...j,
                                        cronExpression:
                                          value < 60
                                            ? `*/${Math.trunc(value)} * * * *`
                                            : value === 1440
                                            ? '0 0 * * *'
                                            : `0 */${Math.max(1, Math.trunc(value / 60))} * * *`,
                                      }
                                    : j
                                )
                              );
                            }}
                            className="w-36 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-xs"
                          />
                        ) : (
                          <input
                            type="text"
                            value={job.cronExpression}
                            onChange={(e) =>
                              setCronJobs((prev) =>
                                prev.map((j, i) =>
                                  i === idx ? { ...j, cronExpression: e.target.value } : j
                                )
                              )
                            }
                            className="w-36 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-xs"
                          />
                        )}
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
                                ...(job.jobKey === 'HUNONIC_HOURLY_SYNC'
                                  ? { intervalMinutes: cronToMinutes(job.cronExpression) }
                                  : {}),
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
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 8: AUDIT LOGS & SECURITY */}
          {settingsTab === 'audit' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-7 p-5 bg-white dark:bg-[#111827] border border-slate-200/80 dark:border-slate-800 rounded-2xl space-y-3">
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
                          {formatVnDateTime(log.createdAt)} ·{' '}
                          {log.actorEmail} ({log.actorRole}) · {log.action}
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs dark:border-slate-800"><span>Trang {businessPage}/{businessPageCount}</span><div className="flex gap-2"><button type="button" disabled={auditLoading || businessPage <= 1} onClick={() => setBusinessPage(p => p - 1)} className="min-h-10 rounded-lg border px-3 disabled:opacity-40">Trước</button><button type="button" disabled={auditLoading || businessPage >= businessPageCount} onClick={() => setBusinessPage(p => p + 1)} className="min-h-10 rounded-lg border px-3 disabled:opacity-40">Sau</button></div></div>
              </div>

              <div className="lg:col-span-5 p-5 bg-white dark:bg-[#111827] border border-slate-200/80 dark:border-slate-800 rounded-2xl space-y-3">
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
                          {formatVnDateTime(item.createdAt)} ·
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
          {settingsTab === 'versions' && <VersionHistory />}
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

