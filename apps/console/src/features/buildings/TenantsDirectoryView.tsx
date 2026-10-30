import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Edit3,
  FileSignature,
  Home,
  Loader2,
  Phone,
  Search,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '@/app/providers/AuthContext';
import { useNavigation } from '@/app/providers/NavigationContext';
import { usePortfolio } from '@/app/providers/PortfolioContext';
import type { ConsoleTenantDto } from '@/shared/types/portfolio';

export const TenantsDirectoryView: React.FC = () => {
  const { hasCapability } = useAuth();
  const canManageTenants = hasCapability('canManageTenants');
  const { focusedTenantId, setFocusedTenantId, setActiveModule } =
    useNavigation();
  const {
    tenants,
    rooms,
    activeBuildings,
    createTenant,
    updateTenant,
    deleteTenant,
  } = usePortfolio();

  const [searchQuery, setSearchQuery] = useState('');
  const [regFilter, setRegFilter] = useState<string>('ALL');

  // Create / Edit modal state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<ConsoleTenantDto | null>(
    null
  );
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [residenceRegStatus, setResidenceRegStatus] = useState<
    'PENDING' | 'REGISTERED' | 'EXPIRED'
  >('PENDING');
  const [primaryBuildingId, setPrimaryBuildingId] = useState<string>('');
  const [currentRoomId, setCurrentRoomId] = useState<string>('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete confirmation modal state (zero window.confirm / alert)
  const [deletingTenant, setDeletingTenant] = useState<ConsoleTenantDto | null>(
    null
  );
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFormOpen(false);
        setDeletingTenant(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const filteredTenants = useMemo(() => {
    return tenants.filter((t) => {
      if (regFilter !== 'ALL' && t.residenceRegStatus !== regFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = t.fullName.toLowerCase().includes(q);
        const matchPhone = t.phone.toLowerCase().includes(q);
        const matchId = (t.idNumber || '').toLowerCase().includes(q);
        const matchRoom = (t.currentRoomCode || '').toLowerCase().includes(q);
        const matchBuilding = (t.buildingCode || '').toLowerCase().includes(q);
        if (
          !matchName &&
          !matchPhone &&
          !matchId &&
          !matchRoom &&
          !matchBuilding
        ) {
          return false;
        }
      }
      return true;
    });
  }, [tenants, regFilter, searchQuery]);

  const openCreateModal = () => {
    setEditingTenant(null);
    setFullName('');
    setPhone('');
    setEmail('');
    setIdNumber('');
    setResidenceRegStatus('PENDING');
    setPrimaryBuildingId(activeBuildings[0]?.id || '');
    setCurrentRoomId('');
    setEmergencyContact('');
    setNotes('');
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditModal = (tenant: ConsoleTenantDto) => {
    setEditingTenant(tenant);
    setFullName(tenant.fullName);
    setPhone(tenant.phone);
    setEmail(tenant.email || '');
    setIdNumber(tenant.idNumber || '');
    setResidenceRegStatus(
      (tenant.residenceRegStatus || 'PENDING') as
        | 'PENDING'
        | 'REGISTERED'
        | 'EXPIRED'
    );
    setPrimaryBuildingId(
      tenant.primaryBuildingId || activeBuildings[0]?.id || ''
    );
    setCurrentRoomId(tenant.currentRoomId || '');
    setEmergencyContact(tenant.emergencyContact || '');
    setNotes(tenant.notes || '');
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleSaveTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setFormError(null);

    const payload = {
      fullName: fullName.trim(),
      phone: phone.trim(),
      email: email.trim() || undefined,
      idNumber: idNumber.trim() || undefined,
      residenceRegStatus,
      primaryBuildingId: primaryBuildingId || null,
      currentRoomId: currentRoomId || null,
      emergencyContact: emergencyContact.trim() || undefined,
      notes: notes.trim() || undefined,
    };

    const res = editingTenant
      ? await updateTenant(editingTenant.id, payload)
      : await createTenant(payload);
    setIsSaving(false);

    if (!res.ok) {
      setFormError(res.message || 'Không thể lưu hồ sơ khách thuê.');
      return;
    }

    setIsFormOpen(false);
  };

  const handleConfirmDelete = async () => {
    if (!deletingTenant) return;
    setIsDeleting(true);
    setDeleteError(null);
    const res = await deleteTenant(deletingTenant.id);
    setIsDeleting(false);

    if (!res.ok) {
      setDeleteError(res.message || 'Không thể xóa hồ sơ khách thuê.');
      return;
    }

    if (focusedTenantId === deletingTenant.id) {
      setFocusedTenantId(null);
    }
    setDeletingTenant(null);
  };

  const renderRegBadge = (status: string) => {
    if (status === 'REGISTERED') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="h-3 w-3" /> Đã khai báo tạm trú
        </span>
      );
    }
    if (status === 'EXPIRED') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 dark:bg-rose-950/60 px-2 py-0.5 text-[10.5px] font-semibold text-rose-700 dark:text-rose-300">
          <AlertCircle className="h-3 w-3" /> Tạm trú hết hạn
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 text-[10.5px] font-semibold text-amber-700 dark:text-amber-300">
        <UserCheck className="h-3 w-3" /> Chờ khai báo
      </span>
    );
  };

  const selectableRooms = useMemo(() => {
    if (!primaryBuildingId) return rooms;
    return rooms.filter((r) => r.buildingId === primaryBuildingId);
  }, [rooms, primaryBuildingId]);

  return (
    <div className="space-y-4" data-testid="console-tenants-directory">
      {/* Toolbar */}
      <div className="p-3.5 bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              data-testid="input-search-tenants"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm tên khách, SĐT, CCCD, mã phòng..."
              className="w-full text-xs pl-8 pr-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </div>

          <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs">
            {[
              { id: 'ALL', label: `Tất cả (${tenants.length})` },
              {
                id: 'REGISTERED',
                label: `Đã tạm trú (${
                  tenants.filter((t) => t.residenceRegStatus === 'REGISTERED')
                    .length
                })`,
              },
              {
                id: 'PENDING',
                label: `Chờ khai báo (${
                  tenants.filter((t) => t.residenceRegStatus === 'PENDING')
                    .length
                })`,
              },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setRegFilter(tab.id)}
                className={`px-2.5 py-1.5 rounded-md font-semibold transition-colors ${
                  regFilter === tab.id
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {canManageTenants && (
          <button
            type="button"
            data-testid="btn-open-create-tenant"
            onClick={openCreateModal}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-bold bg-brand-primary hover:bg-brand-hover text-white rounded-xl shadow-sm transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Thêm khách thuê</span>
          </button>
        )}
      </div>

      {/* Empty State */}
      {filteredTenants.length === 0 ? (
        <div className="p-10 text-center bg-white dark:bg-[#111827] border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl">
          <Users className="w-9 h-9 text-slate-400 mx-auto mb-2.5" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Chưa có hồ sơ khách thuê phù hợp trong phạm vi đang chọn
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
            Tạo hồ sơ khách thuê và gán trực tiếp vào phòng lưu trú để quản lý
            tạm trú, hợp đồng và hóa đơn tập trung trên PostgreSQL.
          </p>
          {canManageTenants && (
            <button
              type="button"
              onClick={openCreateModal}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-brand-primary text-white rounded-xl hover:bg-brand-hover"
            >
              <UserPlus className="w-3.5 h-3.5" /> Thêm hồ sơ khách thuê đầu tiên
            </button>
          )}
        </div>
      ) : (
        <>
          {/* MOBILE TOUCH CARDS (< 1024px) */}
          <div
            data-testid="tenants-mobile-cards"
            className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:hidden"
          >
            {filteredTenants.map((t) => {
              const isFocused = focusedTenantId === t.id;
              return (
                <div
                  key={t.id}
                  data-testid={`tenant-card-${t.phone}`}
                  className={`p-4 rounded-xl border bg-white dark:bg-[#111827] space-y-3 ${
                    isFocused
                      ? 'border-brand-primary ring-2 ring-brand-primary/30'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white">
                        {t.fullName}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 font-mono">
                        <Phone className="w-3 h-3" /> {t.phone}
                      </div>
                    </div>
                    {renderRegBadge(t.residenceRegStatus)}
                  </div>

                  <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 text-xs">
                    <div>
                      <span className="text-[10.5px] text-slate-400 block">
                        Phòng đang ở
                      </span>
                      <span className="font-bold text-slate-800 dark:text-slate-100">
                        {t.currentRoomCode
                          ? `${t.buildingCode} · ${t.currentRoomCode}`
                          : t.buildingCode || 'Chưa xếp phòng'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10.5px] text-slate-400 block">
                        Hợp đồng
                      </span>
                      <span className="font-semibold text-slate-700 dark:text-slate-200">
                        {t.activeContractCode || 'Chưa lập HĐ'}
                      </span>
                    </div>
                  </div>

                  {canManageTenants && (
                    <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => openEditModal(t)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 inline-flex items-center gap-1"
                      >
                        <Edit3 className="w-3 h-3" /> Sửa hồ sơ
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteError(null);
                          setDeletingTenant(t);
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-300 inline-flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" /> Xóa
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* DESKTOP TABLE (>= 1024px) */}
          <div
            data-testid="tenants-desktop-table-container"
            className="hidden lg:block bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-xl overflow-hidden"
          >
            <div className="overflow-x-auto">
              <table
                data-testid="tenants-desktop-table"
                className="w-full text-left text-xs"
              >
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 text-slate-500 font-semibold">
                    <th className="px-4 py-3">Khách thuê &amp; Liên hệ</th>
                    <th className="px-4 py-3">CCCD / Định danh</th>
                    <th className="px-4 py-3">Tòa nhà &amp; Phòng</th>
                    <th className="px-4 py-3">Hợp đồng hiện tại</th>
                    <th className="px-4 py-3">Tạm trú</th>
                    <th className="px-4 py-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredTenants.map((t) => {
                    const isFocused = focusedTenantId === t.id;
                    return (
                      <tr
                        key={t.id}
                        data-testid={`tenant-row-${t.phone}`}
                        className={`transition-colors ${
                          isFocused
                            ? 'bg-blue-50/70 dark:bg-blue-950/30'
                            : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="px-4 py-3.5">
                          <div className="font-bold text-slate-900 dark:text-white">
                            {t.fullName}
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-500 font-mono">
                            {t.phone}
                            {t.email ? ` · ${t.email}` : ''}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 font-mono text-slate-600 dark:text-slate-300">
                          {t.idNumber || '—'}
                        </td>
                        <td className="px-4 py-3.5">
                          {t.currentRoomCode ? (
                            <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 px-2.5 py-1 font-semibold text-brand-primary dark:text-blue-300">
                              <Home className="w-3.5 h-3.5" />
                              {t.buildingCode} · {t.currentRoomCode}
                            </span>
                          ) : t.buildingCode ? (
                            <span className="inline-flex items-center gap-1 text-slate-500">
                              <Building2 className="w-3.5 h-3.5" />{' '}
                              {t.buildingCode} (chưa xếp phòng)
                            </span>
                          ) : (
                            <span className="text-slate-400">
                              Chưa gán phòng
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          {t.activeContractCode ? (
                            <div>
                              <button
                                type="button"
                                onClick={() => setActiveModule('contracts')}
                                className="inline-flex items-center gap-1 font-mono font-bold text-slate-800 dark:text-slate-100 hover:text-brand-primary"
                              >
                                <FileSignature className="w-3.5 h-3.5 text-brand-primary" />
                                {t.activeContractCode}
                              </button>
                              {t.monthlyRentVnd !== null && (
                                <div className="text-[11px] text-slate-500">
                                  {t.monthlyRentVnd.toLocaleString('vi-VN')}{' '}
                                  đ/tháng
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">
                              Chưa có HĐ hiệu lực
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          {renderRegBadge(t.residenceRegStatus)}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          {canManageTenants && (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                data-testid={`btn-edit-tenant-${t.phone}`}
                                onClick={() => openEditModal(t)}
                                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 inline-flex items-center gap-1"
                              >
                                <Edit3 className="w-3 h-3" /> Sửa
                              </button>
                              <button
                                type="button"
                                data-testid={`btn-delete-tenant-${t.phone}`}
                                onClick={() => {
                                  setDeleteError(null);
                                  setDeletingTenant(t);
                                }}
                                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-300 inline-flex items-center gap-1"
                              >
                                <Trash2 className="w-3 h-3" /> Xóa
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* CREATE / EDIT TENANT MODAL */}
      {isFormOpen && (
        <div
          data-testid="modal-tenant-form"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm"
        >
          <div className="relative w-full max-w-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-900/60 shrink-0">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {editingTenant
                  ? `Cập nhật hồ sơ: ${editingTenant.fullName}`
                  : 'Thêm hồ sơ khách thuê mới'}
              </h3>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={handleSaveTenant}
              className="p-5 space-y-4 overflow-y-auto flex-1"
            >
              {formError && (
                <div
                  data-testid="tenant-form-error"
                  className="p-3 text-xs bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl"
                >
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Họ và tên khách thuê *
                  </label>
                  <input
                    data-testid="input-tenant-name"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Nguyễn Minh Anh"
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Số điện thoại di động VN (10 số) *
                  </label>
                  <input
                    data-testid="input-tenant-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0905123456"
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl font-mono"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Số CCCD / Hộ chiếu
                  </label>
                  <input
                    data-testid="input-tenant-idnumber"
                    type="text"
                    value={idNumber}
                    onChange={(e) => setIdNumber(e.target.value)}
                    placeholder="066099xxxxxx"
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Trạng thái khai báo tạm trú
                  </label>
                  <select
                    data-testid="select-tenant-reg-status"
                    value={residenceRegStatus}
                    onChange={(e) =>
                      setResidenceRegStatus(
                        e.target.value as 'PENDING' | 'REGISTERED' | 'EXPIRED'
                      )
                    }
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl"
                  >
                    <option value="PENDING">Chờ khai báo (PENDING)</option>
                    <option value="REGISTERED">
                      Đã khai báo tạm trú (REGISTERED)
                    </option>
                    <option value="EXPIRED">Đã hết hạn (EXPIRED)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Tòa nhà quản lý
                  </label>
                  <select
                    data-testid="select-tenant-building"
                    value={primaryBuildingId}
                    onChange={(e) => {
                      setPrimaryBuildingId(e.target.value);
                      setCurrentRoomId('');
                    }}
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold"
                  >
                    {activeBuildings.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.code} — {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Xếp vào phòng (tuỳ chọn)
                  </label>
                  <select
                    data-testid="select-tenant-room"
                    value={currentRoomId}
                    onChange={(e) => setCurrentRoomId(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl"
                  >
                    <option value="">— Chưa gán phòng —</option>
                    {selectableRooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.code} ({r.floorName} ·{' '}
                        {r.listPriceVnd.toLocaleString('vi-VN')}đ)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Email liên hệ
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="khachthue@example.com"
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Liên hệ khẩn cấp
                  </label>
                  <input
                    type="text"
                    value={emergencyContact}
                    onChange={(e) => setEmergencyContact(e.target.value)}
                    placeholder="Người thân & SĐT"
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Ghi chú hồ sơ nội bộ
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                >
                  Hủy
                </button>
                <button
                  data-testid="submit-tenant-form"
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 text-xs font-bold bg-brand-primary hover:bg-brand-hover text-white rounded-xl shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>
                    {editingTenant ? 'Lưu thay đổi' : 'Tạo hồ sơ khách thuê'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE TENANT CONFIRMATION MODAL */}
      {deletingTenant && (
        <div
          data-testid="modal-delete-tenant"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm"
        >
          <div className="w-full max-w-md bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Xóa hồ sơ khách thuê: {deletingTenant.fullName}?
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Hệ thống sẽ kiểm tra hợp đồng hiệu lực trên PostgreSQL trước khi
              xóa. Nếu khách đang đứng tên hợp đồng hiệu lực, thao tác xóa sẽ bị
              chặn để bảo toàn dữ liệu pháp lý.
            </p>
            {deleteError && (
              <div className="p-3 text-xs bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl">
                {deleteError}
              </div>
            )}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingTenant(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
              >
                Hủy
              </button>
              <button
                data-testid="confirm-delete-tenant"
                type="button"
                disabled={isDeleting}
                onClick={() => void handleConfirmDelete()}
                className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl flex items-center gap-1.5 disabled:opacity-50"
              >
                {isDeleting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>Xác nhận xóa</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

