import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  ShieldCheck,
  Building2,
  UserPlus,
  RefreshCw,
  CheckCircle2,
  XCircle,
  KeyRound,
  Lock,
  Edit3,
  AlertCircle,
  Loader2,
  Save,
  X,
} from 'lucide-react';
import { useAuth, CONSOLE_CSRF_HEADER } from '@/app/providers/AuthContext';

interface BuildingOption {
  id: string;
  code: string;
  name: string;
  address: string;
}

interface StaffAccountRow {
  id: string;
  email: string;
  displayName: string;
  orgId: string;
  role: 'ADMIN' | 'MANAGER';
  permissions: string[];
  buildingScopes: string[];
  isActive: boolean;
  hasPassword: boolean;
  sessionVersion: number;
  passwordUpdatedAt: string | null;
  createdAt: string;
  updatedAt?: string;
}

const PERMISSION_LABELS: Record<string, { label: string; group: string }> = {
  'overview.read': { label: 'Xem bảng tổng quan KPI', group: 'Vận hành cơ sở' },
  'rooms.read': { label: 'Xem danh sách tòa nhà & phòng', group: 'Vận hành cơ sở' },
  'rooms.manage': { label: 'Cập nhật thông tin phòng nội bộ', group: 'Vận hành cơ sở' },
  'rooms.publish.write': { label: 'Đăng/gỡ phòng công khai Landing Page', group: 'Vận hành cơ sở' },
  'leads.read': { label: 'Xem yêu cầu đặt lịch xem phòng (Lead)', group: 'Vận hành cơ sở' },
  'tenants.manage': { label: 'Quản lý hồ sơ khách thuê & tạm trú', group: 'Hợp đồng & Khách thuê' },
  'deposits.manage': { label: 'Quản lý cọc giữ phòng', group: 'Hợp đồng & Khách thuê' },
  'deposits.refund': { label: 'Duyệt hoàn tiền đặt cọc', group: 'Hợp đồng & Khách thuê' },
  'contracts.manage': { label: 'Tạo & gia hạn hợp đồng thuê', group: 'Hợp đồng & Khách thuê' },
  'settlements.manage': { label: 'Chốt chỉ số điện nước Hunonic', group: 'Hóa đơn & Tài chính' },
  'invoices.manage': { label: 'Phát hành hóa đơn & nhắc nợ', group: 'Hóa đơn & Tài chính' },
  'payments.manage': { label: 'Đối soát thanh toán QR / Chuyển khoản', group: 'Hóa đơn & Tài chính' },
  'finance.read': { label: 'Truy cập Sổ quỹ & Dòng tiền thu chi', group: 'Hóa đơn & Tài chính' },
  'finance.write': { label: 'Ghi phiếu thu / chi sổ quỹ', group: 'Hóa đơn & Tài chính' },
  'reports.read': { label: 'Xem báo cáo doanh thu & công suất', group: 'Hệ thống & Quản trị' },
  'buildings.manage': { label: 'Thêm / sửa / xóa danh mục tòa nhà', group: 'Hệ thống & Quản trị' },
  'settings.manage': { label: 'Cấu hình cài đặt tổ chức', group: 'Hệ thống & Quản trị' },
};

export const AccountManagementView: React.FC = () => {
  const { user, hasCapability } = useAuth();
  const canManageRoles = hasCapability('canManageRoles');

  const [accounts, setAccounts] = useState<StaffAccountRow[]>([]);
  const [buildings, setBuildings] = useState<BuildingOption[]>([]);
  const [defaultManagerPerms, setDefaultManagerPerms] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal / Form state (Create or Edit)
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [editingAccount, setEditingAccount] = useState<StaffAccountRow | null>(null);
  const [formName, setFormName] = useState<string>('');
  const [formEmail, setFormEmail] = useState<string>('');
  const [formPassword, setFormPassword] = useState<string>('');
  const [formRole, setFormRole] = useState<'ADMIN' | 'MANAGER'>('MANAGER');
  const [formBuildings, setFormBuildings] = useState<string[]>([]);
  const [formPermissions, setFormPermissions] = useState<string[]>([]);
  const [formIsActive, setFormIsActive] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const loadAccounts = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/v1/console/accounts', {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setErrorMsg(data.message || 'Không thể tải danh sách tài khoản nhân sự.');
        return;
      }
      setAccounts(Array.isArray(data.accounts) ? data.accounts : []);
      setBuildings(Array.isArray(data.buildings) ? data.buildings : []);
      setDefaultManagerPerms(
        Array.isArray(data.defaultManagerPermissions)
          ? data.defaultManagerPermissions
          : Object.keys(PERMISSION_LABELS).filter(
              k =>
                k !== 'finance.read' &&
                k !== 'deposits.refund' &&
                k !== 'buildings.manage' &&
                k !== 'settings.manage'
            )
      );
    } catch {
      setErrorMsg('Không thể kết nối đến máy chủ quản lý tài khoản.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canManageRoles) {
      void loadAccounts();
    } else {
      setIsLoading(false);
    }
  }, [canManageRoles, loadAccounts]);

  const openCreateForm = () => {
    setEditingAccount(null);
    setFormName('');
    setFormEmail('');
    setFormPassword('');
    setFormRole('MANAGER');
    setFormBuildings(buildings.slice(0, 2).map(b => b.id));
    setFormPermissions([...defaultManagerPerms]);
    setFormIsActive(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsFormOpen(true);
  };

  const openEditForm = (acc: StaffAccountRow) => {
    setEditingAccount(acc);
    setFormName(acc.displayName);
    setFormEmail(acc.email);
    setFormPassword('');
    setFormRole(acc.role);
    setFormBuildings(
      acc.buildingScopes.includes('*')
        ? buildings.map(b => b.id)
        : acc.buildingScopes
    );
    setFormPermissions(acc.permissions);
    setFormIsActive(acc.isActive);
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsFormOpen(true);
  };

  const toggleBuildingScope = (bldId: string) => {
    setFormBuildings(prev =>
      prev.includes(bldId) ? prev.filter(x => x !== bldId) : [...prev, bldId]
    );
  };

  const togglePermission = (perm: string) => {
    setFormPermissions(prev =>
      prev.includes(perm) ? prev.filter(x => x !== perm) : [...prev, perm]
    );
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsSaving(true);

    try {
      if (!editingAccount) {
        // Create new account
        const res = await fetch('/api/v1/console/accounts', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': CONSOLE_CSRF_HEADER,
          },
          body: JSON.stringify({
            displayName: formName.trim(),
            email: formEmail.trim(),
            password: formPassword,
            role: formRole,
            buildingScopes: formRole === 'ADMIN' ? ['*'] : formBuildings,
            permissions: formPermissions,
            isActive: formIsActive,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          setErrorMsg(data.message || 'Không thể tạo tài khoản nhân sự.');
          return;
        }
        setSuccessMsg(`Đã tạo tài khoản ${data.account.email} (${data.account.role}) thành công.`);
      } else {
        // Patch existing account
        const payload: Record<string, unknown> = {
          displayName: formName.trim(),
          role: formRole,
          buildingScopes: formRole === 'ADMIN' ? ['*'] : formBuildings,
          permissions: formPermissions,
          isActive: formIsActive,
        };
        if (formPassword.trim()) {
          payload.password = formPassword;
        }
        const res = await fetch(`/api/v1/console/accounts/${encodeURIComponent(editingAccount.id)}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': CONSOLE_CSRF_HEADER,
          },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          setErrorMsg(data.message || 'Không thể cập nhật phân quyền tài khoản.');
          return;
        }
        setSuccessMsg(
          `Đã cập nhật tài khoản ${data.account.email} (Session v${data.account.sessionVersion}${
            data.sessionsInvalidated ? ' — phiên cũ đã tự động vô hiệu hóa' : ''
          }).`
        );
      }

      setIsFormOpen(false);
      await loadAccounts();
    } catch {
      setErrorMsg('Lỗi kết nối khi lưu thông tin tài khoản.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActiveQuick = async (acc: StaffAccountRow) => {
    if (acc.id === user?.id) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`/api/v1/console/accounts/${encodeURIComponent(acc.id)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': CONSOLE_CSRF_HEADER,
        },
        body: JSON.stringify({ isActive: !acc.isActive }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setErrorMsg(data.message || 'Không thể thay đổi trạng thái tài khoản.');
        return;
      }
      setSuccessMsg(
        `Đã ${data.account.isActive ? 'kích hoạt' : 'vô hiệu hóa'} tài khoản ${data.account.email} (Session v${data.account.sessionVersion}).`
      );
      await loadAccounts();
    } catch {
      setErrorMsg('Không thể kết nối máy chủ.');
    }
  };

  if (!canManageRoles) {
    return (
      <div
        data-testid="console-rbac-forbidden"
        className="p-10 text-center bg-surface dark:bg-surface-dark border border-rose-200 dark:border-rose-900/60 rounded-2xl shadow-soft"
      >
        <Lock className="w-10 h-10 text-rose-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
          Khu vực giới hạn cho Quản trị viên Hệ thống (Admin)
        </h2>
        <p className="text-xs text-slate-500 mt-1.5 max-w-md mx-auto">
          Tài khoản hiện tại ({user?.email}) không có quyền quản lý nhân sự hoặc cấu hình phân quyền toàn tổ chức.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="console-account-management-view">
      {/* Header Toolbar */}
      <div className="p-5 bg-surface dark:bg-surface-dark border border-appBorder-light dark:border-appBorder-dark rounded-card shadow-soft flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              Cài đặt &amp; Phân quyền Nhân sự (RBAC)
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              PostgreSQL Authoritative
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
            Tạo tài khoản nhân viên, chỉ định vai trò Admin / Manager, giới hạn tòa nhà phụ trách và thu hồi quyền truy cập tức thì qua cơ chế nâng phiên <code>sessionVersion</code>.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadAccounts()}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </button>
          <button
            type="button"
            data-testid="console-open-create-account"
            onClick={openCreateForm}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold bg-brand-primary text-white rounded-xl hover:bg-brand-hover shadow-sm transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Tạo tài khoản nhân sự</span>
          </button>
        </div>
      </div>

      {/* Status Alerts */}
      {errorMsg && (
        <div
          data-testid="account-mgmt-error"
          className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div
          data-testid="account-mgmt-success"
          className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Create / Edit Account Drawer Panel */}
      {isFormOpen && (
        <form
          onSubmit={handleSaveAccount}
          data-testid="console-account-form"
          className="p-6 bg-surface dark:bg-surface-dark border-2 border-brand-primary/40 rounded-2xl shadow-elevated space-y-5"
        >
          <div className="flex items-center justify-between pb-3 border-b border-appBorder-light dark:border-appBorder-dark">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-brand-primary" />
              {editingAccount
                ? `Chỉnh sửa phân quyền: ${editingAccount.email}`
                : 'Cấp tài khoản nhân sự mới'}
            </h3>
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Họ và tên nhân sự
              </label>
              <input
                data-testid="account-form-name"
                type="text"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                required
                placeholder="Nguyễn Văn Minh"
                className="w-full text-xs px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Email đăng nhập
              </label>
              <input
                data-testid="account-form-email"
                type="email"
                value={formEmail}
                onChange={e => setFormEmail(e.target.value)}
                disabled={Boolean(editingAccount)}
                required
                placeholder="manager.lk01@adhome.vn"
                className="w-full text-xs px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                {editingAccount ? 'Đặt lại mật khẩu (bỏ trống nếu giữ nguyên)' : 'Mật khẩu khởi tạo'}
              </label>
              <div className="relative">
                <KeyRound className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  data-testid="account-form-password"
                  type="password"
                  value={formPassword}
                  onChange={e => setFormPassword(e.target.value)}
                  required={!editingAccount}
                  placeholder={editingAccount ? '••••••••••••' : 'Tối thiểu 12 ký tự (Hoa, thường, số, ký tự đặc biệt)'}
                  className="w-full text-xs pl-8 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>
            </div>
          </div>

          {/* Role & Account Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Vai trò hệ thống
              </label>
              <select
                data-testid="account-form-role"
                value={formRole}
                onChange={e => setFormRole(e.target.value as 'ADMIN' | 'MANAGER')}
                disabled={editingAccount?.id === user?.id}
                className="w-full text-xs font-semibold px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              >
                <option value="MANAGER">MANAGER — Quản lý tòa nhà theo phạm vi phân công</option>
                <option value="ADMIN">ADMIN — Quản trị viên toàn quyền tổ chức</option>
              </select>
            </div>

            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  data-testid="account-form-active"
                  type="checkbox"
                  checked={formIsActive}
                  disabled={editingAccount?.id === user?.id}
                  onChange={e => setFormIsActive(e.target.checked)}
                  className="rounded text-brand-primary"
                />
                <span>Cho phép tài khoản đăng nhập hoạt động (Active)</span>
              </label>
            </div>
          </div>

          {/* Building Scope Assignment (for MANAGER) */}
          {formRole === 'MANAGER' && (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-brand-primary" />
                  Tòa nhà được phép quản lý (bắt buộc chọn ít nhất 1 tòa)
                </span>
                <span className="text-[11px] font-semibold text-brand-primary">
                  Đã chọn {formBuildings.length}/{buildings.length} tòa
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {buildings.map(bld => {
                  const checked = formBuildings.includes(bld.id);
                  return (
                    <label
                      key={bld.id}
                      className={`p-2.5 rounded-xl border text-xs cursor-pointer flex items-start gap-2 transition-colors ${
                        checked
                          ? 'bg-blue-50 dark:bg-blue-950/50 border-brand-primary text-slate-900 dark:text-white font-semibold'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <input
                        data-testid={`scope-checkbox-${bld.id}`}
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleBuildingScope(bld.id)}
                        className="mt-0.5 rounded text-brand-primary"
                      />
                      <div>
                        <span className="block font-bold">{bld.code}</span>
                        <span className="block text-[10.5px] opacity-80">{bld.name}</span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Granular Permissions Matrix (for MANAGER) */}
          {formRole === 'MANAGER' && (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Ma trận quyền hạn chi tiết ({formPermissions.length} quyền được cấp)
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {Object.entries(PERMISSION_LABELS).map(([permKey, meta]) => {
                  const checked = formPermissions.includes(permKey);
                  return (
                    <label
                      key={permKey}
                      className="flex items-start gap-2 p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80 text-xs cursor-pointer"
                    >
                      <input
                        data-testid={`perm-checkbox-${permKey}`}
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePermission(permKey)}
                        className="mt-0.5 rounded text-brand-primary"
                      />
                      <div>
                        <span className="block font-medium text-slate-800 dark:text-slate-200">
                          {meta.label}
                        </span>
                        <span className="block text-[10px] font-mono text-slate-400">
                          {permKey}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
            >
              Hủy
            </button>
            <button
              data-testid="account-form-submit"
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-brand-primary hover:bg-brand-hover text-white flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>{editingAccount ? 'Lưu phân quyền & Áp dụng ngay' : 'Tạo tài khoản'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Accounts Table */}
      <div className="p-5 bg-surface dark:bg-surface-dark border border-appBorder-light dark:border-appBorder-dark rounded-card shadow-soft">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Users className="w-4 h-4 text-brand-primary" />
            Danh sách tài khoản Console ({accounts.length} nhân sự)
          </h3>
        </div>

        {isLoading ? (
          <div className="py-10 flex items-center justify-center gap-2 text-xs text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin text-brand-primary" />
            <span>Đang tải danh sách nhân sự từ PostgreSQL...</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table data-testid="console-accounts-table" className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-appBorder-light dark:border-appBorder-dark text-slate-400 font-semibold">
                  <th className="pb-3">Nhân sự / Email</th>
                  <th className="pb-3">Vai trò</th>
                  <th className="pb-3">Phạm vi tòa nhà</th>
                  <th className="pb-3">Quyền hạn</th>
                  <th className="pb-3">Phiên bảo mật</th>
                  <th className="pb-3">Trạng thái</th>
                  <th className="pb-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-appBorder-light dark:divide-appBorder-dark">
                {accounts.map(acc => {
                  const isSelf = acc.id === user?.id;
                  return (
                    <tr
                      key={acc.id}
                      data-testid={`account-row-${acc.email}`}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    >
                      <td className="py-3.5 pr-3">
                        <div className="font-bold text-slate-900 dark:text-slate-100">
                          {acc.displayName}
                          {isSelf && (
                            <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-brand-primary">
                              Bạn
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">{acc.email}</div>
                      </td>

                      <td className="py-3.5 pr-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            acc.role === 'ADMIN'
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                          }`}
                        >
                          {acc.role}
                        </span>
                      </td>

                      <td className="py-3.5 pr-3">
                        {acc.role === 'ADMIN' || acc.buildingScopes.includes('*') ? (
                          <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                            Toàn bộ tổ chức ({buildings.length} tòa)
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {acc.buildingScopes.map(scopeId => {
                              const matched = buildings.find(b => b.id === scopeId);
                              return (
                                <span
                                  key={scopeId}
                                  className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[10.5px] font-bold text-slate-700 dark:text-slate-200"
                                >
                                  {matched ? matched.code : scopeId.replace(/^bld-/, '').toUpperCase()}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 pr-3">
                        <span className="text-[11px] text-slate-600 dark:text-slate-300 font-medium">
                          {acc.role === 'ADMIN'
                            ? 'Toàn quyền (18/18)'
                            : `${acc.permissions.length} quyền nghiệp vụ`}
                        </span>
                      </td>

                      <td className="py-3.5 pr-3 font-mono text-[11px] text-slate-500">
                        v{acc.sessionVersion}
                      </td>

                      <td className="py-3.5 pr-3">
                        {acc.isActive ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Đang hoạt động
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600">
                            <XCircle className="w-3.5 h-3.5" /> Đã khóa
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            data-testid={`edit-account-${acc.email}`}
                            onClick={() => openEditForm(acc)}
                            className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 inline-flex items-center gap-1"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Phân quyền</span>
                          </button>

                          {!isSelf && (
                            <button
                              type="button"
                              data-testid={`toggle-active-${acc.email}`}
                              onClick={() => void handleToggleActiveQuick(acc)}
                              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold ${
                                acc.isActive
                                  ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/50 dark:text-rose-300'
                                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300'
                              }`}
                            >
                              {acc.isActive ? 'Khóa' : 'Mở khóa'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

