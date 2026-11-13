import React, { useEffect, useMemo, useState } from 'react';
import { Dialog } from '@animate-ui/react/primitives/base-ui/dialog';
import {
  AlertCircle,
  Building2,
  Calendar,
  CheckCircle2,
  Edit3,
  FileSignature,
  Home,
  LayoutGrid,
  Loader2,
  Mail,
  Phone,
  Search,
  Table2,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '@/app/providers/AuthContext';
import { useNavigation } from '@/app/providers/NavigationContext';
import { usePortfolio } from '@/app/providers/PortfolioContext';
import type { ConsoleTenantDto } from '@/shared/types/portfolio';
import { tenantDirectory } from '@/shared/data/tenantDirectory';
import { Button } from '@animate-ui/react/primitives/buttons/button';

export const TenantsDirectoryView: React.FC<{ onOpenRoom?: (id: string) => void }> = ({ onOpenRoom }) => {
  const { hasCapability } = useAuth();
  const canManageTenants = hasCapability('canManageTenants');
  const { focusedTenantId, setFocusedTenantId, setActiveModule } =
    useNavigation();
  const {
    tenants: tenantProfiles,
    rooms,
    activeBuildings,
    updateTenant,
    deleteTenant,
  } = usePortfolio();
  const tenants = useMemo(() => tenantDirectory(tenantProfiles, rooms), [tenantProfiles, rooms]);
  const isOccupantOnly = (tenant: ConsoleTenantDto) => tenant.id.startsWith('occupant:');

  const [searchQuery, setSearchQuery] = useState('');
  const [regFilter, setRegFilter] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'card' | 'table'>(() =>
    typeof window !== 'undefined' && window.innerWidth < 1024 ? 'card' : 'table'
  );

  // Profile detail modal state
  const [detailTenant, setDetailTenant] = useState<ConsoleTenantDto | null>(null);

  // Edit modal state
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
        setDetailTenant(null);
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
        const q = searchQuery.toLowerCase().trim();
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

  const openDetailModal = (tenant: ConsoleTenantDto) => {
    setDetailTenant(tenant);
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
    if (!editingTenant) return;
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

    const res = await updateTenant(editingTenant.id, payload);
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
    if (detailTenant?.id === deletingTenant.id) {
      setDetailTenant(null);
    }
    setDeletingTenant(null);
  };

  const renderRegBadge = (status: string) => {
    if (status === 'REGISTERED') {
      return (
        <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-0.5 text-[10.5px] font-semibold text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="h-3 w-3 shrink-0" /> Đã khai báo tạm trú
        </span>
      );
    }
    if (status === 'EXPIRED') {
      return (
        <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-rose-50 dark:bg-rose-950/60 px-2.5 py-0.5 text-[10.5px] font-semibold text-rose-700 dark:text-rose-300">
          <AlertCircle className="h-3 w-3 shrink-0" /> Tạm trú hết hạn
        </span>
      );
    }
    return (
      <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-amber-50 dark:bg-amber-950/60 px-2.5 py-0.5 text-[10.5px] font-semibold text-amber-700 dark:text-amber-300">
        <UserCheck className="h-3 w-3 shrink-0" /> Chờ khai báo
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
      <div className="p-3 sm:p-3.5 bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-xl flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 w-full lg:flex-1 lg:max-w-md">
          <div className="relative flex-1 min-w-0">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              data-testid="input-search-tenants"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm tên khách, SĐT, CCCD, mã phòng..."
              className="h-9 w-full text-xs pl-8 pr-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </div>

          <div
            role="group"
            aria-label="Chế độ hiển thị danh sách khách thuê"
            data-testid="tenants-view-mode-toggle"
            className="inline-flex h-9 shrink-0 items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-0.5 gap-0.5"
          >
            <button
              type="button"
              data-testid="btn-tenants-view-card"
              aria-label="Hiển thị dạng thẻ (Card)"
              aria-pressed={viewMode === 'card'}
              title="Hiển thị dạng thẻ (Card)"
              onClick={() => setViewMode('card')}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                viewMode === 'card'
                  ? 'bg-white dark:bg-slate-700 text-brand-primary dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              type="button"
              data-testid="btn-tenants-view-table"
              aria-label="Hiển thị dạng bảng (Table)"
              aria-pressed={viewMode === 'table'}
              title="Hiển thị dạng bảng (Table)"
              onClick={() => setViewMode('table')}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                viewMode === 'table'
                  ? 'bg-white dark:bg-slate-700 text-brand-primary dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Table2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs overflow-x-auto no-scrollbar shrink-0">
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
              className={`whitespace-nowrap px-2.5 py-1.5 rounded-md font-semibold transition-colors ${
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

      {/* Empty State */}
      {filteredTenants.length === 0 ? (
        <div className="p-10 text-center bg-white dark:bg-[#111827] border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl">
          <Users className="w-9 h-9 text-slate-400 mx-auto mb-2.5" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Chưa có hồ sơ khách thuê phù hợp trong phạm vi đang chọn
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
            Hồ sơ khách thuê được tự động đồng bộ từ phòng lưu trú và hợp đồng thuê đang quản lý.
          </p>
        </div>
      ) : viewMode === 'card' ? (
        <div
          data-testid="tenants-mobile-cards"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
        >
          {filteredTenants.map((t) => {
            const isFocused = focusedTenantId === t.id;
            return (
              <div
                key={t.id}
                data-testid={`tenant-card-${t.phone}`}
                className={`p-3.5 rounded-xl border bg-white dark:bg-[#111827] space-y-2.5 ${
                  isFocused
                    ? 'border-brand-primary ring-2 ring-brand-primary/30'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        data-testid={`btn-tenant-name-${t.phone}`}
                        onClick={() => openDetailModal(t)}
                        className="text-left text-sm font-bold text-slate-900 dark:text-white hover:text-brand-primary dark:hover:text-blue-300 hover:underline underline-offset-2 transition-colors truncate max-w-full"
                      >
                        {t.fullName}
                      </button>
                      {t.relationToPrimary && (
                        <span className="whitespace-nowrap rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                          {t.relationToPrimary === 'PRIMARY'
                            ? 'HĐ Chính'
                            : t.relationToPrimary === 'OTHER'
                            ? 'Đại diện HĐ'
                            : 'Người cùng hộ'}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 font-mono">
                      <Phone className="w-3 h-3 shrink-0" /> {t.phone || '—'}
                    </div>
                  </div>
                  <div className="shrink-0">{renderRegBadge(t.residenceRegStatus)}</div>
                </div>

                <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 text-xs">
                  <div className="min-w-0">
                    <span className="text-[10.5px] text-slate-400 block">
                      Phòng đang ở
                    </span>
                    <span className="font-bold text-slate-800 dark:text-slate-100 truncate block">
                      {t.currentRoomCode
                        ? `${t.buildingCode} · ${t.currentRoomCode}`
                        : t.buildingCode || 'Chưa xếp phòng'}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10.5px] text-slate-400 block">
                      Hợp đồng
                    </span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200 truncate block">
                      {t.activeContractCode || 'Chưa lập HĐ'}
                    </span>
                  </div>
                </div>

                {canManageTenants && (isOccupantOnly(t) ? (
                  <div className="flex justify-end border-t border-slate-100 dark:border-slate-800 pt-2">
                    <Button
                      type="button"
                      className="inline-flex h-8 items-center gap-1 whitespace-nowrap text-xs font-semibold text-blue-600"
                      onClick={() => t.currentRoomId && onOpenRoom?.(t.currentRoomId)}
                    >
                      <Home size={13} /> Hồ sơ lưu trú
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => openEditModal(t)}
                      className="h-8 px-2.5 rounded-lg text-[11.5px] font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 whitespace-nowrap transition-colors"
                    >
                      <Edit3 className="w-3 h-3" /> Sửa hồ sơ
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError(null);
                        setDeletingTenant(t);
                      }}
                      className="h-8 px-2.5 rounded-lg text-[11.5px] font-semibold bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-300 inline-flex items-center gap-1 whitespace-nowrap transition-colors"
                    >
                      <Trash2 className="w-3 h-3" /> Xóa
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      ) : (
        <div
          data-testid="tenants-desktop-table-container"
          className="bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-xl overflow-hidden"
        >
          <div className="overflow-x-auto">
            <table
              data-testid="tenants-desktop-table"
              className="w-full text-left text-xs min-w-[920px]"
            >
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 text-slate-500 font-semibold whitespace-nowrap">
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
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            data-testid={`btn-table-tenant-name-${t.phone}`}
                            onClick={() => openDetailModal(t)}
                            className="text-left font-bold text-slate-900 dark:text-white hover:text-brand-primary dark:hover:text-blue-300 hover:underline underline-offset-2 transition-colors"
                          >
                            {t.fullName}
                          </button>
                          {t.relationToPrimary && (
                            <span className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                              {t.relationToPrimary === 'PRIMARY'
                                ? 'HĐ Chính'
                                : t.relationToPrimary === 'OTHER'
                                ? 'Đại diện HĐ'
                                : 'Người cùng hộ'}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500 font-mono">
                          {t.phone || '—'}
                          {t.email ? (
                            <span className="text-slate-400"> · {t.email}</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {t.idNumber || '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {t.currentRoomCode ? (
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 px-2.5 py-1 font-semibold text-brand-primary dark:text-blue-300 whitespace-nowrap">
                            <Home className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              {t.buildingCode} · {t.currentRoomCode}
                            </span>
                          </span>
                        ) : t.buildingCode ? (
                          <span className="inline-flex items-center gap-1 text-slate-500 whitespace-nowrap">
                            <Building2 className="w-3.5 h-3.5 shrink-0" />{' '}
                            {t.buildingCode} (chưa xếp phòng)
                          </span>
                        ) : (
                          <span className="text-slate-400 whitespace-nowrap">
                            Chưa gán phòng
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {t.activeContractCode ? (
                          <div>
                            <button
                              type="button"
                              onClick={() => setActiveModule('contracts')}
                              className="inline-flex items-center gap-1 font-mono font-bold text-slate-800 dark:text-slate-100 hover:text-brand-primary whitespace-nowrap"
                            >
                              <FileSignature className="w-3.5 h-3.5 text-brand-primary shrink-0" />
                              <span>{t.activeContractCode}</span>
                            </button>
                            {t.monthlyRentVnd !== null && (
                              <div className="text-[11px] text-slate-500 whitespace-nowrap">
                                {t.monthlyRentVnd.toLocaleString('vi-VN')} đ/tháng
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 whitespace-nowrap">
                            Chưa có HĐ hiệu lực
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {renderRegBadge(t.residenceRegStatus)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {canManageTenants && (isOccupantOnly(t) ? (
                          <Button
                            type="button"
                            className="inline-flex h-8 items-center gap-1 whitespace-nowrap text-xs font-semibold text-blue-600"
                            onClick={() => t.currentRoomId && onOpenRoom?.(t.currentRoomId)}
                          >
                            <Home size={13} /> Hồ sơ lưu trú
                          </Button>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                            <button
                              type="button"
                              data-testid={`btn-edit-tenant-${t.phone}`}
                              onClick={() => openEditModal(t)}
                              className="h-8 px-2.5 rounded-lg text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 whitespace-nowrap"
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
                              className="h-8 px-2.5 rounded-lg text-[11px] font-semibold bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-300 inline-flex items-center gap-1 whitespace-nowrap"
                            >
                              <Trash2 className="w-3 h-3" /> Xóa
                            </button>
                          </div>
                        ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
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

      {/* TENANT PROFILE DETAIL DIALOG (Animate UI) */}
      <Dialog.Root
        open={Boolean(detailTenant)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setDetailTenant(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-[2px]" />
          <Dialog.Viewport className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
            <Dialog.Popup
              from="bottom"
              data-testid="modal-tenant-detail"
              className="relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] shadow-2xl outline-none"
            >
              {detailTenant && (
                <>
                  <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 px-4 py-3.5 bg-slate-50/70 dark:bg-slate-900/50 shrink-0">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {renderRegBadge(detailTenant.residenceRegStatus)}
                        {detailTenant.relationToPrimary && (
                          <span className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10.5px] font-medium text-slate-600 dark:text-slate-300">
                            {detailTenant.relationToPrimary === 'PRIMARY'
                              ? 'HĐ Chính'
                              : detailTenant.relationToPrimary === 'OTHER'
                              ? 'Đại diện HĐ'
                              : 'Người cùng hộ'}
                          </span>
                        )}
                      </div>
                      <Dialog.Title className="text-base font-bold text-slate-900 dark:text-white truncate">
                        {detailTenant.fullName}
                      </Dialog.Title>
                    </div>
                    <Dialog.Close
                      aria-label="Đóng chi tiết khách thuê"
                      data-testid="btn-close-tenant-detail"
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </Dialog.Close>
                  </div>

                  <div className="flex-1 overflow-y-auto px-4 py-3 divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {/* Contact & Identity */}
                    <div className="pb-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
                      <div>
                        <span className="text-[11px] text-slate-400 block">Số điện thoại</span>
                        <span className="font-mono font-semibold text-slate-800 dark:text-slate-100 inline-flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 text-slate-400" />
                          {detailTenant.phone || 'Chưa cập nhật'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-400 block">CCCD / Định danh</span>
                        <span className="font-mono font-semibold text-slate-800 dark:text-slate-100 block mt-0.5">
                          {detailTenant.idNumber || 'Chưa cập nhật'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-400 block">Email</span>
                        <span className="text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 mt-0.5 break-all">
                          <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                          {detailTenant.email || 'Chưa cập nhật'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-400 block">Liên hệ khẩn cấp</span>
                        <span className="text-slate-700 dark:text-slate-200 block mt-0.5">
                          {detailTenant.emergencyContact || 'Chưa cập nhật'}
                        </span>
                      </div>
                    </div>

                    {/* Room & Contract */}
                    <div className="py-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
                      <div>
                        <span className="text-[11px] text-slate-400 block">Tòa nhà &amp; Phòng hiện tại</span>
                        {detailTenant.currentRoomCode ? (
                          <span className="font-bold text-brand-primary dark:text-blue-300 inline-flex items-center gap-1 mt-0.5">
                            <Home className="w-3.5 h-3.5" />
                            {detailTenant.buildingCode} · {detailTenant.currentRoomCode}
                          </span>
                        ) : (
                          <span className="text-slate-500 block mt-0.5">
                            {detailTenant.buildingCode ? `${detailTenant.buildingCode} (chưa xếp phòng)` : 'Chưa gán phòng'}
                          </span>
                        )}
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-400 block">Hợp đồng hiện tại</span>
                        <span className="font-mono font-semibold text-slate-800 dark:text-slate-100 block mt-0.5">
                          {detailTenant.activeContractCode || 'Chưa lập HĐ'}
                        </span>
                        {detailTenant.monthlyRentVnd !== null && (
                          <span className="text-[11px] text-slate-500 block">
                            {detailTenant.monthlyRentVnd.toLocaleString('vi-VN')} đ/tháng
                          </span>
                        )}
                      </div>
                      {detailTenant.activeContractEndDate && (
                        <div>
                          <span className="text-[11px] text-slate-400 block">Ngày hết hạn HĐ</span>
                          <span className="text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 mt-0.5">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            {new Date(detailTenant.activeContractEndDate).toLocaleDateString('vi-VN')}
                          </span>
                        </div>
                      )}
                      <div>
                        <span className="text-[11px] text-slate-400 block">ID hệ thống</span>
                        <span className="font-mono text-[10.5px] text-slate-500 break-all block mt-0.5">
                          {detailTenant.id}
                        </span>
                      </div>
                    </div>

                    {/* Occupancy History if available */}
                    {detailTenant.occupancyHistory && detailTenant.occupancyHistory.length > 0 && (
                      <div className="py-3 space-y-1.5">
                        <span className="text-[11px] font-semibold text-slate-500 block">
                          Lịch sử lưu trú ({detailTenant.occupancyHistory.length})
                        </span>
                        <div className="space-y-1.5">
                          {detailTenant.occupancyHistory.map((h) => (
                            <div
                              key={h.id}
                              className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 px-2.5 py-1.5 text-[11px]"
                            >
                              <div className="font-semibold text-slate-700 dark:text-slate-200">
                                {h.buildingCode} · {h.roomCode}
                                {h.contractCode ? ` (${h.contractCode})` : ''}
                              </div>
                              <div className="text-slate-500 font-mono">
                                {new Date(h.moveInDate).toLocaleDateString('vi-VN')}
                                {h.moveOutDate ? ` → ${new Date(h.moveOutDate).toLocaleDateString('vi-VN')}` : ' → Hiện tại'}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Notes & Timestamps */}
                    {(detailTenant.notes || detailTenant.updatedAt) && (
                      <div className="pt-3 space-y-1.5">
                        {detailTenant.notes && (
                          <div>
                            <span className="text-[11px] text-slate-400 block">Ghi chú nội bộ</span>
                            <p className="text-slate-700 dark:text-slate-200 mt-0.5 whitespace-pre-line">
                              {detailTenant.notes}
                            </p>
                          </div>
                        )}
                        <div className="text-[10.5px] text-slate-400 flex items-center justify-between pt-1">
                          <span>Tạo: {new Date(detailTenant.createdAt).toLocaleDateString('vi-VN')}</span>
                          <span>Cập nhật: {new Date(detailTenant.updatedAt).toLocaleDateString('vi-VN')}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800 px-4 py-3 bg-slate-50/50 dark:bg-slate-900/40 shrink-0">
                    {detailTenant.currentRoomId && onOpenRoom && (
                      <button
                        type="button"
                        onClick={() => {
                          const roomId = detailTenant.currentRoomId!;
                          setDetailTenant(null);
                          onOpenRoom(roomId);
                        }}
                        className="h-8 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50 px-3 text-xs font-semibold text-brand-primary dark:text-blue-300 inline-flex items-center gap-1.5 hover:bg-blue-100 transition-colors"
                      >
                        <Home className="w-3.5 h-3.5" />
                        <span>Xem phòng</span>
                      </button>
                    )}
                    {canManageTenants && !isOccupantOnly(detailTenant) && (
                      <button
                        type="button"
                        data-testid="btn-detail-edit-tenant"
                        onClick={() => {
                          const target = detailTenant;
                          setDetailTenant(null);
                          openEditModal(target);
                        }}
                        className="h-8 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 px-3 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 transition-colors"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Sửa hồ sơ</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setDetailTenant(null)}
                      className="h-8 rounded-lg bg-brand-primary hover:bg-brand-hover px-3.5 text-xs font-bold text-white transition-colors"
                    >
                      Đóng
                    </button>
                  </div>
                </>
              )}
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
};

