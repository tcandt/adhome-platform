import React, { useEffect, useState } from 'react';
import { Dialog } from '@animate-ui/react/primitives/base-ui/dialog';
import { Collapsible } from '@animate-ui/react/primitives/base-ui/collapsible';
import {
  Tabs,
  TabsHighlight,
  TabsHighlightItem,
  TabsList,
  TabsTrigger,
} from '@animate-ui/react/primitives/tabs';
import {
  AlertCircle,
  Banknote,
  Building2,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  CreditCard,
  Droplets,
  History,
  Home,
  Lock,
  Mail,
  MessageSquare,
  Plus,
  Receipt,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { SettlementShimmerButton } from '../../shared/ui/SettlementAnimatePrimitives';
import {
  type DrawerTabId,
  type FeeLineItem,
  type SettlementRow,
  formatChannelLabel,
  formatVnd,
  getDataStatusBadge,
  getDeliveryStatusBadge,
  getInvoiceStatusBadge,
  getPaymentStatusBadge,
} from './settlementTypes';

interface SettlementDetailDrawerProps {
  open: boolean;
  row: SettlementRow | null;
  siblingMembers?: SettlementRow[];
  activeTab: DrawerTabId;
  onTabChange: (tab: DrawerTabId) => void;
  onSelectObligation?: (obligationKey: string) => void;
  onClose: () => void;
  canManageSettlements: boolean;
  canManageInvoices: boolean;
  canWriteFinance: boolean;
  canInputReadings: boolean;
  isSaving: boolean;
  onSaveRoomInput: (payload: {
    roomId: string;
    contractId: string;
    periodKey: string;
    rent?: {
      baseMonthlyRentVnd?: number;
    };
    electric?: {
      startKwh: number | null;
      endKwh: number | null;
      ratePerKwhVnd: number;
      anomalyConfirmed?: boolean;
      reason?: string;
    };
    water?: {
      mode: string;
      consumptionM3: number | null;
      occupantCount: number;
      unitRateVnd: number;
      anomalyConfirmed?: boolean;
      reason?: string;
    };
    feeItems?: FeeLineItem[];
    reason?: string;
  }) => Promise<boolean>;
  onApproveObligation: (obligationKeys: string[], action: 'APPROVE' | 'REJECT', reason?: string) => Promise<boolean>;
  onIssueAndSend: (
    obligationKeys: string[],
    channel?: 'ZALO_OA' | 'ZALO_BOT' | 'EMAIL',
    recipientOverride?: string
  ) => Promise<boolean>;
  onRecordPayment: (params: {
    invoiceId: string;
    amountVnd: number;
    providerId: string;
    referenceText: string;
  }) => Promise<boolean>;
}

export const SettlementDetailDrawer: React.FC<SettlementDetailDrawerProps> = ({
  open,
  row,
  siblingMembers = [],
  activeTab,
  onTabChange,
  onSelectObligation,
  onClose,
  canManageSettlements,
  canManageInvoices,
  canWriteFinance,
  canInputReadings,
  isSaving,
  onSaveRoomInput,
  onApproveObligation,
  onIssueAndSend,
  onRecordPayment,
}) => {
  // Member rent editor state
  const [baseMonthlyRentInput, setBaseMonthlyRentInput] = useState<string>('');

  // Electric editor state
  const [startKwhInput, setStartKwhInput] = useState<string>('');
  const [endKwhInput, setEndKwhInput] = useState<string>('');
  const [electricRateInput, setElectricRateInput] = useState<string>('3800');
  const [confirmElectricAnomaly, setConfirmElectricAnomaly] = useState<boolean>(false);

  // Water editor state
  const [waterM3Input, setWaterM3Input] = useState<string>('');
  const [waterOccupantsInput, setWaterOccupantsInput] = useState<string>('1');
  const [waterRateInput, setWaterRateInput] = useState<string>('25000');
  const [confirmWaterAnomaly, setConfirmWaterAnomaly] = useState<boolean>(false);

  // Fee items state
  const [feeItemsDraft, setFeeItemsDraft] = useState<FeeLineItem[]>([]);
  const [newFeeName, setNewFeeName] = useState<string>('');
  const [newFeeCategory, setNewFeeCategory] = useState<FeeLineItem['category']>('EXTRA_CHARGE');
  const [newFeeAmount, setNewFeeAmount] = useState<string>('');
  const [newFeeReason, setNewFeeReason] = useState<string>('');
  const [editReason, setEditReason] = useState<string>('Cập nhật chi tiết quyết toán phòng');

  // Delivery state
  const [selectedChannel, setSelectedChannel] = useState<'ZALO_OA' | 'ZALO_BOT' | 'EMAIL'>('ZALO_OA');
  const [recipientOverride, setRecipientOverride] = useState<string>('');
  const [showInvoicePreview, setShowInvoicePreview] = useState<boolean>(true);

  // Payment state
  const [paymentAmountInput, setPaymentAmountInput] = useState<string>('');
  const [paymentMethodInput, setPaymentMethodInput] = useState<string>('SEPAY');
  const [paymentNoteInput, setPaymentNoteInput] = useState<string>('');

  useEffect(() => {
    if (!row) return;
    setBaseMonthlyRentInput(
      String(row.rent.baseMonthlyRentVnd || row.contract.monthlyRentVnd || 0)
    );
    setStartKwhInput(row.electric.startKwh !== null ? String(row.electric.startKwh) : '0');
    setEndKwhInput(row.electric.endKwh !== null ? String(row.electric.endKwh) : '');
    setElectricRateInput(String(row.electric.ratePerKwhVnd || 3800));
    setConfirmElectricAnomaly(false);

    setWaterM3Input(
      row.water.consumptionM3 !== null && row.water.consumptionM3 !== undefined
        ? String(row.water.consumptionM3)
        : ''
    );
    setWaterOccupantsInput(String(row.water.occupantCount || 1));
    setWaterRateInput(String(row.water.unitRateVnd || 25000));
    setConfirmWaterAnomaly(false);

    setFeeItemsDraft(row.totals.feeItems || []);
    setSelectedChannel(row.delivery.channel || 'ZALO_OA');
    setRecipientOverride(row.delivery.recipientContact || row.tenant.phone || row.tenant.email || '');
    setPaymentAmountInput(String(row.totals.remainingAmountVnd || 0));
    setPaymentNoteInput(
      `Thanh toán hóa đơn ${row.invoice?.code || `phòng ${row.room.code}`} kỳ ${row.periodKey}`
    );
  }, [row]);

  if (!row) return null;

  const dataBadge = getDataStatusBadge(row.statuses.dataStatus);
  const invBadge = getInvoiceStatusBadge(row.statuses.invoiceStatus);
  const delivBadge = getDeliveryStatusBadge(row.statuses.deliveryStatus);
  const payBadge = getPaymentStatusBadge(row.statuses.paymentStatus);

  const isLockedOrFrozen =
    row.isPeriodLocked ||
    (row.invoice !== null && ['ISSUED', 'PAID', 'PARTIAL'].includes(row.invoice.dbStatus));

  const handleAddFeeItem = () => {
    const amountNum = Math.round(Number(newFeeAmount || 0));
    if (!newFeeName.trim() || Number.isNaN(amountNum) || amountNum === 0) return;
    const item: FeeLineItem = {
      id: `fee-${Date.now()}`,
      code: `CUSTOM_${feeItemsDraft.length + 1}`,
      name: newFeeName.trim(),
      category: newFeeCategory,
      quantity: 1,
      unitPriceVnd: Math.abs(amountNum),
      amountVnd: newFeeCategory === 'ADJUSTMENT' ? amountNum : Math.abs(amountNum),
      reason: newFeeReason.trim() || 'Bổ sung tại Drawer quyết toán',
    };
    setFeeItemsDraft((prev) => [...prev, item]);
    setNewFeeName('');
    setNewFeeAmount('');
    setNewFeeReason('');
  };

  const handleRemoveFeeItem = (id: string) => {
    setFeeItemsDraft((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSaveAllChanges = async () => {
    const parsedStartKwh = startKwhInput.trim() !== '' ? Number(startKwhInput) : 0;
    const parsedEndKwh = endKwhInput.trim() !== '' ? Number(endKwhInput) : null;
    const parsedWaterM3 = waterM3Input.trim() !== '' ? Number(waterM3Input) : null;
    const parsedRent = Number(baseMonthlyRentInput);

    await onSaveRoomInput({
      roomId: row.room.id,
      contractId: row.contract.id,
      periodKey: row.periodKey,
      rent:
        baseMonthlyRentInput.trim() !== '' && !Number.isNaN(parsedRent) && parsedRent >= 0
          ? { baseMonthlyRentVnd: Math.round(parsedRent) }
          : undefined,
      electric: {
        startKwh: parsedStartKwh,
        endKwh: parsedEndKwh,
        ratePerKwhVnd: Number(electricRateInput || 3800),
        anomalyConfirmed: confirmElectricAnomaly,
        reason: editReason,
      },
      water: {
        mode: row.water.mode,
        consumptionM3: parsedWaterM3,
        occupantCount: Number(waterOccupantsInput || 1),
        unitRateVnd: Number(waterRateInput || row.water.unitRateVnd),
        anomalyConfirmed: confirmWaterAnomaly,
        reason: editReason,
      },
      feeItems: feeItemsDraft,
      reason: editReason,
    });
  };

  const tabs: Array<{ id: DrawerTabId; label: string; icon: React.ReactNode }> = [
    { id: 'OVERVIEW', label: '1. Tổng quan', icon: <ClipboardCheck className="w-3.5 h-3.5" /> },
    { id: 'FEES', label: '2. Chi tiết phí', icon: <Receipt className="w-3.5 h-3.5" /> },
    { id: 'DELIVERY', label: '3. Gửi HĐ', icon: <Send className="w-3.5 h-3.5" /> },
    { id: 'PAYMENT', label: '4. Thanh toán', icon: <CreditCard className="w-3.5 h-3.5" /> },
    { id: 'HISTORY', label: '5. Lịch sử', icon: <History className="w-3.5 h-3.5" /> },
  ];

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-[2px] transition-opacity" />
        <Dialog.Popup
          data-testid="settlement-detail-drawer"
          className="fixed inset-y-0 right-0 z-50 flex h-[100dvh] w-full max-w-2xl flex-col bg-white dark:bg-[#0F172A] shadow-2xl border-l border-slate-200 dark:border-slate-800 focus:outline-none"
        >
          {/* Drawer Header */}
          <div className="flex items-start justify-between gap-2.5 border-b border-slate-200 dark:border-slate-800 px-3.5 sm:px-6 py-3 sm:py-4 bg-slate-50/70 dark:bg-slate-900/60 shrink-0">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-0.5 text-xs font-extrabold text-white">
                  {row.room.code}
                </span>
                <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <Building2 className="w-3 h-3 text-slate-400" />
                  {row.building.code}
                </span>
                <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${invBadge.className}`}>
                  {invBadge.label}
                </span>
                {(row.sharedRoomInfo?.isSharedRoom || row.room.rentalModel === 'SHARED_ROOM' || siblingMembers.length > 1) && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-violet-100 dark:bg-violet-950/70 border border-violet-200 dark:border-violet-800 px-2 py-0.5 text-[11px] font-bold text-violet-800 dark:text-violet-300">
                    <Users className="w-3 h-3" />
                    Ở ghép · TV {row.sharedRoomInfo?.memberIndex ?? 1}/{Math.max(siblingMembers.length, row.sharedRoomInfo?.totalMembers ?? row.room.sharedContractCount ?? 1)}
                  </span>
                )}
                {row.isPeriodLocked && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
                    <Lock className="w-3 h-3" /> Đã khóa sổ
                  </span>
                )}
              </div>
              <Dialog.Title className="mt-1.5 text-base font-bold text-slate-900 dark:text-white truncate">
                {row.tenant.fullName} · Hợp đồng {row.contract.code}
              </Dialog.Title>
              <Dialog.Description className="text-xs text-slate-500 dark:text-slate-400">
                Kỳ {row.periodKey} ({row.periodDisplayRange}) · Tổng cần thu:{' '}
                <strong className="font-mono text-slate-900 dark:text-white">
                  {formatVnd(row.totals.totalPayableVnd)}
                </strong>
              </Dialog.Description>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng ngăn chi tiết"
              data-testid="btn-close-settlement-drawer"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Shared Room Member Switcher (when room has multiple contracts) */}
          {siblingMembers.length > 1 && (
            <div
              data-testid="drawer-shared-member-switcher"
              className="border-b border-violet-200/80 dark:border-violet-900/60 bg-violet-50/70 dark:bg-violet-950/20 px-4 sm:px-6 py-2.5 space-y-1.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <span className="font-bold text-violet-900 dark:text-violet-200 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                  Hóa đơn riêng theo thành viên phòng {row.room.code} ({siblingMembers.length} HĐ)
                </span>
                <span className="text-violet-700/90 dark:text-violet-300/80 font-medium">
                  Tiền phòng gán riêng • Điện &amp; nước chia đều
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {siblingMembers.map((member, mIdx) => {
                  const isCurrentMember = member.obligationKey === row.obligationKey;
                  return (
                    <button
                      key={member.obligationKey}
                      type="button"
                      data-testid={`drawer-member-pill-${mIdx + 1}`}
                      onClick={() => onSelectObligation?.(member.obligationKey)}
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                        isCurrentMember
                          ? 'border-violet-500 bg-violet-600 text-white shadow-xs'
                          : 'border-violet-200 dark:border-violet-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-violet-400'
                      }`}
                    >
                      <span>{member.tenant.fullName}</span>
                      <span
                        className={`font-mono text-[10px] ${
                          isCurrentMember ? 'text-violet-100' : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {formatVnd(member.totals.totalPayableVnd)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 5-Tab Navigation Bar (@animate-ui/react Tabs) */}
          <Tabs
            value={activeTab}
            onValueChange={(val) => onTabChange(val as DrawerTabId)}
            className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] px-3.5 sm:px-6 py-1.5 sm:py-2 shrink-0"
          >
            <TabsHighlight className="rounded-xl bg-blue-600/20 shadow-xs">
              <TabsList className="flex items-center gap-1 overflow-x-auto flex-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {tabs.map((t) => {
                  const isActive = activeTab === t.id;
                  return (
                    <TabsHighlightItem key={t.id} value={t.id} className="shrink-0">
                      <TabsTrigger
                        type="button"
                        value={t.id}
                        data-testid={`drawer-tab-${t.id.toLowerCase()}`}
                        className={`relative z-10 inline-flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-bold whitespace-nowrap transition-colors min-h-9 ${
                          isActive
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {t.icon}
                        <span>{t.label}</span>
                      </TabsTrigger>
                    </TabsHighlightItem>
                  );
                })}
              </TabsList>
            </TabsHighlight>
          </Tabs>

          {/* Tab Body */}
          <div className="flex-1 overflow-y-auto px-3.5 py-4 sm:p-6 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] space-y-4 sm:space-y-5">
            {/* TAB 1: TỔNG QUAN HÓA ĐƠN */}
            {activeTab === 'OVERVIEW' && (
              <div className="space-y-4" data-testid="drawer-panel-overview">
                {/* 4 Independent Statuses Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 p-3 bg-slate-50/50 dark:bg-slate-900/40">
                    <div className="text-[11px] font-medium text-slate-500">1. Dữ liệu kỳ</div>
                    <span className={`mt-1 inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-bold ${dataBadge.className}`}>
                      {dataBadge.label}
                    </span>
                  </div>
                  <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 p-3 bg-slate-50/50 dark:bg-slate-900/40">
                    <div className="text-[11px] font-medium text-slate-500">2. Hóa đơn</div>
                    <span className={`mt-1 inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-bold ${invBadge.className}`}>
                      {invBadge.label}
                    </span>
                  </div>
                  <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 p-3 bg-slate-50/50 dark:bg-slate-900/40">
                    <div className="text-[11px] font-medium text-slate-500">3. Gửi khách</div>
                    <span className={`mt-1 inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-bold ${delivBadge.className}`}>
                      {delivBadge.label}
                    </span>
                  </div>
                  <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 p-3 bg-slate-50/50 dark:bg-slate-900/40">
                    <div className="text-[11px] font-medium text-slate-500">4. Thanh toán</div>
                    <span className={`mt-1 inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-bold ${payBadge.className}`}>
                      {payBadge.label}
                    </span>
                  </div>
                </div>

                {/* Safety / Blocking Reasons Banner */}
                {!row.safety.canApprove && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/90 dark:border-amber-800/80 dark:bg-amber-950/40 p-3.5 text-xs text-amber-900 dark:text-amber-200 space-y-1.5">
                    <div className="font-bold flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Cần bổ sung dữ liệu trước khi phê duyệt / phát hành:</span>
                    </div>
                    <ul className="list-disc pl-5 space-y-0.5">
                      {row.safety.blockingReasons.map((reason, idx) => (
                        <li key={idx}>{reason}</li>
                      ))}
                    </ul>
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => onTabChange('FEES')}
                        className="inline-flex items-center gap-1 rounded-lg bg-amber-600 hover:bg-amber-700 px-3 py-1.5 text-xs font-bold text-white transition-colors"
                      >
                        Mở Tab 2 để nhập chỉ số / bổ sung ngay →
                      </button>
                    </div>
                  </div>
                )}

                {/* Core Information Table */}
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  <div className="p-3.5 flex justify-between items-center">
                    <span className="text-slate-500">Phòng &amp; Tòa nhà</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {row.room.code} — {row.building.code} ({row.building.name})
                    </span>
                  </div>
                  <div className="p-3.5 flex justify-between items-center">
                    <span className="text-slate-500">Khách đại diện</span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {row.tenant.fullName} {row.tenant.phone ? `(${row.tenant.phone})` : ''}
                    </span>
                  </div>
                  <div className="p-3.5 flex justify-between items-center">
                    <span className="text-slate-500">Mã hợp đồng &amp; Số người ở</span>
                    <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {row.contract.code} · {row.water.occupantCount} người
                    </span>
                  </div>
                  <div className="p-3.5 flex justify-between items-center">
                    <span className="text-slate-500">Kỳ thanh toán</span>
                    <span className="font-mono text-slate-800 dark:text-slate-200">
                      {row.periodKey} ({row.periodDisplayRange})
                    </span>
                  </div>
                  <div className="p-3.5 flex justify-between items-center">
                    <span className="text-slate-500">Mã hóa đơn &amp; Hạn thanh toán</span>
                    <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                      {row.invoice?.code || 'Chưa sinh mã chính thức'} · Hạn: {row.invoice?.dueDate || `${row.periodKey}-05`}
                    </span>
                  </div>
                </div>

                {/* Financial Summary Card */}
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/50 p-4 space-y-2.5 text-xs">
                  <div className="font-bold text-slate-900 dark:text-white text-sm">
                    Tóm tắt nghĩa vụ tài chính kỳ {row.periodKey}
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Tiền phòng ({row.rent.activeDays}/{row.rent.basisDays} ngày):</span>
                    <span className="font-mono font-semibold">{formatVnd(row.totals.roomRentVnd)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">
                      Tiền điện ({row.electric.consumptionKwh !== null ? `${row.electric.consumptionKwh} kWh` : 'Chưa có chỉ số'}):
                    </span>
                    <span className="font-mono font-semibold">{formatVnd(row.totals.electricVnd)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Tiền nước ({row.water.displayLabel}):</span>
                    <span className="font-mono font-semibold">{formatVnd(row.totals.waterVnd)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Phí dịch vụ &amp; Phí phát sinh:</span>
                    <span className="font-mono font-semibold">
                      {formatVnd(row.totals.serviceFeeVnd + row.totals.extraChargeVnd)}
                    </span>
                  </div>
                  {(row.totals.discountVnd > 0 || row.totals.adjustmentVnd !== 0) && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Giảm trừ / Điều chỉnh:</span>
                      <span className="font-mono font-semibold text-amber-600">
                        {formatVnd(row.totals.adjustmentVnd - row.totals.discountVnd)}
                      </span>
                    </div>
                  )}
                  {row.totals.previousDebtVnd > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Công nợ kỳ trước chuyển sang:</span>
                      <span className="font-mono font-semibold text-rose-600">
                        {formatVnd(row.totals.previousDebtVnd)}
                      </span>
                    </div>
                  )}
                  <div className="pt-2.5 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center text-sm">
                    <span className="font-bold text-slate-900 dark:text-white">Tổng cần thanh toán:</span>
                    <span className="font-mono text-base font-extrabold text-blue-600 dark:text-blue-400">
                      {formatVnd(row.totals.totalPayableVnd)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs pt-1">
                    <span className="text-emerald-600 font-semibold">
                      Đã thu: {formatVnd(row.totals.paidAmountVnd)}
                    </span>
                    <span className="text-rose-600 font-bold">
                      Còn phải thu: {formatVnd(row.totals.remainingAmountVnd)}
                    </span>
                  </div>
                </div>

                {/* Quick Workflow Buttons */}
                <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                  {canManageSettlements && !row.isPeriodLocked && row.safety.canApprove && (
                    <SettlementShimmerButton
                      type="button"
                      data-testid="drawer-btn-approve"
                      isLoading={isSaving}
                      loadingText="Đang duyệt..."
                      shimmerColor="#4f46e5"
                      disabled={row.statuses.invoiceStatus === 'APPROVED' || row.statuses.invoiceStatus === 'ISSUED'}
                      onClick={() => void onApproveObligation([row.obligationKey], 'APPROVE')}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 px-3.5 py-2 text-xs font-bold transition-colors disabled:opacity-50"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>Phê duyệt hóa đơn</span>
                    </SettlementShimmerButton>
                  )}
                  {canManageInvoices && row.safety.canApprove && (
                    <SettlementShimmerButton
                      type="button"
                      data-testid="drawer-btn-issue-send"
                      isLoading={isSaving}
                      loadingText="Đang gửi..."
                      onClick={() => void onIssueAndSend([row.obligationKey], selectedChannel, recipientOverride)}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-xs font-bold shadow-xs transition-colors disabled:opacity-50"
                    >
                      <Send className="w-4 h-4" />
                      <span>Phát hành &amp; Gửi khách</span>
                    </SettlementShimmerButton>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: CHI TIẾT CÁC KHOẢN PHÍ */}
            {activeTab === 'FEES' && (
              <div className="space-y-5" data-testid="drawer-panel-fees">
                {isLockedOrFrozen && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50/80 dark:border-blue-900 dark:bg-blue-950/40 p-3 text-xs text-blue-800 dark:text-blue-200 flex items-center gap-2">
                    <Lock className="w-4 h-4 shrink-0 text-blue-600" />
                    <span>
                      Hóa đơn này đã phát hành hoặc thuộc kỳ đã khóa sổ. Số liệu gốc đã được đóng băng (Snapshot).
                    </span>
                  </div>
                )}

                {/* 0. Member Room Rent Section (explicit assignment for shared rooms) */}
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3 bg-white dark:bg-slate-900/40">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Home className="w-4 h-4 text-blue-600" />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                        Tiền phòng theo hợp đồng ({row.tenant.fullName})
                      </h4>
                    </div>
                    <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                      {formatVnd(row.totals.roomRentVnd)}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                        Đơn giá tiền phòng gán riêng (₫/tháng)
                      </label>
                      <input
                        type="number"
                        step="50000"
                        min="0"
                        data-testid="drawer-input-member-rent"
                        disabled={!canManageSettlements || isLockedOrFrozen}
                        value={baseMonthlyRentInput}
                        onChange={(e) => setBaseMonthlyRentInput(e.target.value)}
                        className="min-h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 font-mono text-xs font-bold text-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="flex flex-col justify-center rounded-xl bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-[11px] text-slate-600 dark:text-slate-300">
                      <div className="font-semibold text-slate-700 dark:text-slate-200">
                        Hợp đồng {row.contract.code}
                      </div>
                      <div className="mt-0.5 text-slate-500 dark:text-slate-400">
                        {(row.sharedRoomInfo?.isSharedRoom || row.room.rentalModel === 'SHARED_ROOM')
                          ? 'Phòng ở ghép: tiền phòng giữ riêng theo từng người, không chia đều.'
                          : row.rent.formulaNote}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 1. Electric Input Section */}
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3 bg-white dark:bg-slate-900/40">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-500" />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                        Tiền điện ({row.electric.method === 'HUNONIC_AUTO' ? 'Đồng bộ Hunonic / Nhập tay' : 'Chỉ số công tơ'})
                      </h4>
                    </div>
                    <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                      {formatVnd(row.totals.electricVnd)}
                    </span>
                  </div>
                  {(row.sharedRoomInfo?.isSharedRoom || row.room.rentalModel === 'SHARED_ROOM') && (
                    <div className="rounded-xl border border-violet-200/80 dark:border-violet-800/60 bg-violet-50/70 dark:bg-violet-950/30 px-3 py-2 text-[11px] text-violet-800 dark:text-violet-200">
                      Phòng ở ghép: Điện và nước dùng chung được chia đều cho{' '}
                      <strong>{Math.max(siblingMembers.length, row.sharedRoomInfo?.totalMembers ?? 1)} thành viên</strong>. Khi lưu chỉ số mới sẽ tự đồng bộ cho cả phòng.
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                        Chỉ số đầu kỳ (kWh)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        data-testid="drawer-input-electric-start"
                        disabled={!canInputReadings || isLockedOrFrozen}
                        value={startKwhInput}
                        onChange={(e) => setStartKwhInput(e.target.value)}
                        className="min-h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 font-mono text-xs font-bold text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                        Chỉ số cuối kỳ (kWh)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        placeholder="Nhập kWh cuối kỳ..."
                        data-testid="drawer-input-electric-end"
                        disabled={!canInputReadings || isLockedOrFrozen}
                        value={endKwhInput}
                        onChange={(e) => setEndKwhInput(e.target.value)}
                        className="min-h-10 w-full rounded-xl border border-blue-300 dark:border-blue-700 bg-white dark:bg-slate-900 px-3 font-mono text-xs font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                        Đơn giá (₫/kWh)
                      </label>
                      <input
                        type="number"
                        disabled={!canManageSettlements || isLockedOrFrozen}
                        value={electricRateInput}
                        onChange={(e) => setElectricRateInput(e.target.value)}
                        className="min-h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 font-mono text-xs font-bold text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    Công thức: {row.electric.formulaNote}
                  </div>
                  {row.electric.status === 'ANOMALY' && (
                    <label className="flex items-center gap-2 text-xs text-rose-600 dark:text-rose-400 font-semibold pt-1">
                      <input
                        type="checkbox"
                        checked={confirmElectricAnomaly}
                        onChange={(e) => setConfirmElectricAnomaly(e.target.checked)}
                        className="rounded border-rose-300"
                      />
                      <span>Xác nhận chỉ số điện đột biến là đúng thực tế</span>
                    </label>
                  )}
                </div>

                {/* 2. Water Input Section */}
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3 bg-white dark:bg-slate-900/40">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Droplets className="w-4 h-4 text-cyan-500" />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                        Tiền nước (
                        {row.water.mode === 'PER_M3'
                          ? 'Theo khối m³'
                          : row.water.mode === 'PER_PERSON'
                          ? 'Theo đầu người'
                          : 'Khoán theo phòng'}
                        )
                      </h4>
                    </div>
                    <span className="font-mono text-xs font-bold text-cyan-600 dark:text-cyan-400">
                      {row.water.status === 'NEED_M3_INPUT' ? 'Chưa tính (Cần nhập m³)' : formatVnd(row.totals.waterVnd)}
                    </span>
                  </div>

                  {row.water.mode === 'PER_M3' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                          Số khối nước tiêu thụ (m³) — Nhập 0 nếu không dùng
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          placeholder="Ví dụ: 12"
                          data-testid="drawer-input-water-m3"
                          disabled={!canInputReadings || isLockedOrFrozen}
                          value={waterM3Input}
                          onChange={(e) => setWaterM3Input(e.target.value)}
                          className="min-h-10 w-full rounded-xl border border-cyan-400 dark:border-cyan-700 bg-white dark:bg-slate-900 px-3 font-mono text-xs font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-cyan-500/20"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                          Đơn giá nước (₫/m³)
                        </label>
                        <input
                          type="number"
                          disabled={!canManageSettlements || isLockedOrFrozen}
                          value={waterRateInput}
                          onChange={(e) => setWaterRateInput(e.target.value)}
                          className="min-h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 font-mono text-xs font-bold text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                          Số người cư trú thực tế
                        </label>
                        <input
                          type="number"
                          min="1"
                          disabled={!canManageSettlements || isLockedOrFrozen}
                          value={waterOccupantsInput}
                          onChange={(e) => setWaterOccupantsInput(e.target.value)}
                          className="min-h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 font-mono text-xs font-bold text-slate-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                          Đơn giá ({row.water.mode === 'PER_PERSON' ? '₫/người' : '₫/phòng'})
                        </label>
                        <input
                          type="number"
                          disabled={!canManageSettlements || isLockedOrFrozen}
                          value={waterRateInput}
                          onChange={(e) => setWaterRateInput(e.target.value)}
                          className="min-h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 font-mono text-xs font-bold text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>
                  )}
                  <div className="text-[11px] text-slate-500 font-mono">
                    Công thức: {row.water.formulaNote}
                  </div>
                </div>

                {/* 3. Line-item Breakdown Table */}
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <div className="bg-slate-50 dark:bg-slate-900/60 px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Bảng kê các khoản mục cấu thành hóa đơn
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Mọi thay đổi đều lưu lý do &amp; lịch sử
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    <div className="px-4 py-2.5 flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white">Tiền thuê phòng</div>
                        <div className="text-[11px] text-slate-500">{row.rent.formulaNote}</div>
                      </div>
                      <span className="font-mono font-bold text-slate-900 dark:text-white">
                        {formatVnd(row.totals.roomRentVnd)}
                      </span>
                    </div>
                    <div className="px-4 py-2.5 flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white">Tiền điện</div>
                        <div className="text-[11px] text-slate-500">{row.electric.formulaNote}</div>
                      </div>
                      <span className="font-mono font-bold text-slate-900 dark:text-white">
                        {formatVnd(row.totals.electricVnd)}
                      </span>
                    </div>
                    <div className="px-4 py-2.5 flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white">Tiền nước</div>
                        <div className="text-[11px] text-slate-500">{row.water.formulaNote}</div>
                      </div>
                      <span className="font-mono font-bold text-slate-900 dark:text-white">
                        {formatVnd(row.totals.waterVnd)}
                      </span>
                    </div>

                    {feeItemsDraft.map((item) => (
                      <div key={item.id} className="px-4 py-2.5 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <span>{item.name}</span>
                            <span className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                              {item.category === 'RECURRING_SERVICE'
                                ? 'Dịch vụ định kỳ'
                                : item.category === 'EXTRA_CHARGE'
                                ? 'Phí phát sinh'
                                : item.category === 'DISCOUNT'
                                ? 'Giảm trừ'
                                : 'Điều chỉnh'}
                            </span>
                          </div>
                          {item.reason && (
                            <div className="text-[11px] text-slate-500 truncate">Lý do: {item.reason}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`font-mono font-bold ${
                              item.category === 'DISCOUNT' || item.amountVnd < 0
                                ? 'text-emerald-600'
                                : 'text-slate-900 dark:text-white'
                            }`}
                          >
                            {item.category === 'DISCOUNT' ? `-${formatVnd(Math.abs(item.amountVnd))}` : formatVnd(item.amountVnd)}
                          </span>
                          {canManageSettlements && !isLockedOrFrozen && (
                            <button
                              type="button"
                              onClick={() => handleRemoveFeeItem(item.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded"
                              title="Xóa khoản mục"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Add Fee / Discount / Adjustment Item */}
                {canManageSettlements && !isLockedOrFrozen && (
                  <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-4 space-y-3 bg-slate-50/40 dark:bg-slate-900/20">
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      + Thêm khoản phí phát sinh / giảm trừ / điều chỉnh (Có lưu lý do kiểm toán)
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                      <select
                        value={newFeeCategory}
                        onChange={(e) => setNewFeeCategory(e.target.value as FeeLineItem['category'])}
                        className="min-h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 text-xs font-semibold"
                      >
                        <option value="EXTRA_CHARGE">Phí phát sinh (+)</option>
                        <option value="RECURRING_SERVICE">Dịch vụ định kỳ (+)</option>
                        <option value="DISCOUNT">Giảm trừ / Khuyến mãi (-)</option>
                        <option value="ADJUSTMENT">Bút toán điều chỉnh (+/-)</option>
                      </select>
                      <input
                        type="text"
                        placeholder="Tên khoản mục (VD: Phí gửi xe thêm)"
                        data-testid="drawer-input-new-fee-name"
                        value={newFeeName}
                        onChange={(e) => setNewFeeName(e.target.value)}
                        className="min-h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-xs"
                      />
                      <input
                        type="number"
                        placeholder="Số tiền (VND)"
                        data-testid="drawer-input-new-fee-amount"
                        value={newFeeAmount}
                        onChange={(e) => setNewFeeAmount(e.target.value)}
                        className="min-h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 font-mono text-xs font-bold"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Lý do điều chỉnh / ghi chú..."
                        value={newFeeReason}
                        onChange={(e) => setNewFeeReason(e.target.value)}
                        className="min-h-10 flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-xs"
                      />
                      <button
                        type="button"
                        data-testid="drawer-btn-add-fee-item"
                        onClick={handleAddFeeItem}
                        className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white px-3.5 py-2 text-xs font-bold shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" /> Thêm dòng
                      </button>
                    </div>
                  </div>
                )}

                {/* Save & Recalculate CTA */}
                {!isLockedOrFrozen && (canInputReadings || canManageSettlements) && (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                    <input
                      type="text"
                      value={editReason}
                      onChange={(e) => setEditReason(e.target.value)}
                      placeholder="Ghi chú nhật ký thay đổi..."
                      className="min-h-10 flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-xs"
                    />
                    <SettlementShimmerButton
                      type="button"
                      data-testid="drawer-btn-save-recalculate"
                      isLoading={isSaving}
                      loadingText="Đang lưu & tính lại..."
                      onClick={() => void handleSaveAllChanges()}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 text-xs font-bold shadow-sm transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className="w-4 h-4" />
                      <span>Lưu &amp; Tính lại hóa đơn</span>
                    </SettlementShimmerButton>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: GỬI HÓA ĐƠN */}
            {activeTab === 'DELIVERY' && (
              <div className="space-y-4" data-testid="drawer-panel-delivery">
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3 bg-slate-50/50 dark:bg-slate-900/40 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 dark:text-white">
                      Trạng thái gửi thông báo hóa đơn
                    </span>
                    <span className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-bold ${delivBadge.className}`}>
                      {delivBadge.label}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                        Kênh gửi hóa đơn
                      </label>
                      <select
                        data-testid="drawer-select-delivery-channel"
                        value={selectedChannel}
                        onChange={(e) =>
                          setSelectedChannel(e.target.value as 'ZALO_OA' | 'ZALO_BOT' | 'EMAIL')
                        }
                        className="min-h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-xs font-bold"
                      >
                        <option value="ZALO_OA">Zalo OA (Official Account)</option>
                        <option value="ZALO_BOT">Zalo Bot vận hành</option>
                        <option value="EMAIL">Email thông báo</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                        Người nhận ({selectedChannel === 'EMAIL' ? 'Email' : 'Số điện thoại / Zalo'})
                      </label>
                      <input
                        type="text"
                        data-testid="drawer-input-recipient-contact"
                        value={recipientOverride}
                        onChange={(e) => setRecipientOverride(e.target.value)}
                        placeholder="Nhập SĐT hoặc Email khách nhận..."
                        className="min-h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 font-mono text-xs font-semibold"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 text-[11px] text-slate-500">
                    <div>
                      Lần gửi gần nhất:{' '}
                      <strong className="text-slate-800 dark:text-slate-200">
                        {row.delivery.sentAt
                          ? new Date(row.delivery.sentAt).toLocaleString('vi-VN')
                          : 'Chưa gửi'}
                      </strong>
                    </div>
                    <div>
                      Số lần thử gửi:{' '}
                      <strong className="text-slate-800 dark:text-slate-200">
                        {row.delivery.attempts} lần
                      </strong>
                    </div>
                    <div>
                      Mã giao dịch gửi:{' '}
                      <strong className="font-mono text-slate-800 dark:text-slate-200">
                        {row.delivery.txId || '—'}
                      </strong>
                    </div>
                  </div>

                  {row.delivery.lastError && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/40 p-2.5 text-xs text-rose-700 dark:text-rose-300">
                      Lỗi gửi gần nhất: {row.delivery.lastError}
                    </div>
                  )}
                </div>

                {/* Customer Invoice Message Preview (@animate-ui/react Collapsible) */}
                <Collapsible.Root
                  open={showInvoicePreview}
                  onOpenChange={setShowInvoicePreview}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
                >
                  <div className="bg-slate-100/80 dark:bg-slate-800/80 px-4 py-2.5 flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      {selectedChannel === 'EMAIL' ? (
                        <Mail className="w-3.5 h-3.5 text-blue-600" />
                      ) : (
                        <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                      )}
                      Bản xem trước thông báo gửi khách ({formatChannelLabel(selectedChannel)})
                    </span>
                    <Collapsible.Trigger
                      type="button"
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:underline"
                    >
                      <span>{showInvoicePreview ? 'Thu gọn' : 'Mở rộng'}</span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform duration-200 ${
                          showInvoicePreview ? 'rotate-180' : ''
                        }`}
                      />
                    </Collapsible.Trigger>
                  </div>
                  <Collapsible.Panel className="overflow-hidden">
                    <div className="p-4 bg-white dark:bg-slate-900 space-y-2.5 text-xs border-t border-slate-200 dark:border-slate-800">
                      <div className="font-bold text-slate-900 dark:text-white">
                        [ADHOME] THÔNG BÁO HÓA ĐƠN KỲ {row.periodKey} — PHÒNG {row.room.code}
                      </div>
                      <p className="text-slate-600 dark:text-slate-300">
                        Kính gửi <strong>{row.tenant.fullName}</strong>, AdHome gửi thông tin quyết toán chi phí phòng{' '}
                        <strong>{row.room.code}</strong> ({row.building.code}) kỳ <strong>{row.periodKey}</strong>:
                      </p>
                      <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 p-3 space-y-1 font-mono text-[11px]">
                        <div>• Tiền phòng: {formatVnd(row.totals.roomRentVnd)}</div>
                        <div>
                          • Tiền điện ({row.electric.consumptionKwh ?? 0} kWh): {formatVnd(row.totals.electricVnd)}
                        </div>
                        <div>
                          • Tiền nước ({row.water.displayLabel}): {formatVnd(row.totals.waterVnd)}
                        </div>
                        <div>
                          • Dịch vụ &amp; Phí khác: {formatVnd(row.totals.serviceFeeVnd + row.totals.extraChargeVnd)}
                        </div>
                        {row.totals.previousDebtVnd > 0 && (
                          <div>• Công nợ kỳ trước: {formatVnd(row.totals.previousDebtVnd)}</div>
                        )}
                        <div className="pt-1 border-t border-slate-200 dark:border-slate-700 font-bold text-blue-600 dark:text-blue-400">
                          ⇒ TỔNG THANH TOÁN: {formatVnd(row.totals.totalPayableVnd)}
                        </div>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Nội dung chuyển khoản VietQR:{' '}
                        <strong className="font-mono text-slate-800 dark:text-slate-200">
                          {(row.invoice?.code || `INV${row.periodKey.replace('-', '')}${row.room.code}`).replace(/[^A-Za-z0-9]/g, '')}
                        </strong>
                      </div>
                    </div>
                  </Collapsible.Panel>
                </Collapsible.Root>

                {canManageInvoices && (
                  <div className="flex justify-end">
                    <SettlementShimmerButton
                      type="button"
                      data-testid="drawer-btn-send-invoice-now"
                      isLoading={isSaving}
                      loadingText="Đang phát hành & gửi..."
                      disabled={!row.safety.canApprove}
                      onClick={() =>
                        void onIssueAndSend([row.obligationKey], selectedChannel, recipientOverride)
                      }
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 text-xs font-bold shadow-sm transition-colors disabled:opacity-50"
                    >
                      <Send className="w-4 h-4" />
                      <span>
                        {row.statuses.deliveryStatus === 'SENT' || row.statuses.deliveryStatus === 'DELIVERED'
                          ? 'Gửi lại thông báo hóa đơn'
                          : 'Phát hành & Gửi hóa đơn ngay'}
                      </span>
                    </SettlementShimmerButton>
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: THANH TOÁN */}
            {activeTab === 'PAYMENT' && (
              <div className="space-y-4" data-testid="drawer-panel-payment">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 bg-slate-50/60 dark:bg-slate-900/40">
                    <div className="text-[11px] text-slate-500">Tổng phải thu</div>
                    <div className="mt-1 font-mono text-sm font-extrabold text-slate-900 dark:text-white">
                      {formatVnd(row.totals.totalPayableVnd)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 p-3.5 bg-emerald-50/50 dark:bg-emerald-950/30">
                    <div className="text-[11px] text-emerald-700 dark:text-emerald-300">Đã thanh toán</div>
                    <div className="mt-1 font-mono text-sm font-extrabold text-emerald-700 dark:text-emerald-300">
                      {formatVnd(row.totals.paidAmountVnd)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-rose-200 dark:border-rose-900/60 p-3.5 bg-rose-50/50 dark:bg-rose-950/30">
                    <div className="text-[11px] text-rose-700 dark:text-rose-300">Còn phải thu</div>
                    <div className="mt-1 font-mono text-sm font-extrabold text-rose-700 dark:text-rose-300">
                      {formatVnd(row.totals.remainingAmountVnd)}
                    </div>
                  </div>
                </div>

                {/* Record Payment Form */}
                {canWriteFinance && row.invoice && row.totals.remainingAmountVnd > 0 && (
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3 bg-white dark:bg-slate-900/50">
                    <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Banknote className="w-4 h-4 text-emerald-600" />
                      <span>Ghi nhận thanh toán trực tiếp cho hóa đơn {row.invoice.code}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                          Số tiền thu (VND)
                        </label>
                        <input
                          type="number"
                          min="1"
                          data-testid="drawer-input-payment-amount"
                          value={paymentAmountInput}
                          onChange={(e) => setPaymentAmountInput(e.target.value)}
                          className="min-h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 font-mono text-xs font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                          Phương thức / Kênh thanh toán
                        </label>
                        <select
                          value={paymentMethodInput}
                          onChange={(e) => setPaymentMethodInput(e.target.value)}
                          className="min-h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-xs font-bold"
                        >
                          <option value="SEPAY">SePay · VietQR</option>
                          <option value="PAYOS">payOS · Link thanh toán</option>
                          <option value="BANK_TRANSFER">Chuyển khoản ngân hàng</option>
                          <option value="MANUAL_CASH">Tiền mặt tại quầy</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={paymentNoteInput}
                        onChange={(e) => setPaymentNoteInput(e.target.value)}
                        placeholder="Nội dung giao dịch / đối soát..."
                        className="min-h-10 flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-xs"
                      />
                      <SettlementShimmerButton
                        type="button"
                        data-testid="drawer-btn-record-payment"
                        isLoading={isSaving}
                        loadingText="Đang ghi nhận..."
                        disabled={Number(paymentAmountInput) <= 0}
                        onClick={() =>
                          void onRecordPayment({
                            invoiceId: row.invoice!.id,
                            amountVnd: Number(paymentAmountInput),
                            providerId: paymentMethodInput,
                            referenceText: paymentNoteInput,
                          })
                        }
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-xs font-bold shrink-0"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Xác nhận thu tiền</span>
                      </SettlementShimmerButton>
                    </div>
                  </div>
                )}

                {!row.invoice && (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 text-center text-xs text-slate-500">
                    Phòng chưa phát hành hóa đơn trong kỳ này. Hãy tổng hợp và phát hành hóa đơn trước khi ghi nhận thanh toán.
                  </div>
                )}

                {/* Linked Payment Transactions */}
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <div className="bg-slate-50 dark:bg-slate-900/60 px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-800 dark:text-slate-200">
                    Giao dịch thanh toán &amp; Đối soát ({row.payments.transactions.length})
                  </div>
                  {row.payments.transactions.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500">
                      Chưa có giao dịch thanh toán nào khớp với hóa đơn phòng {row.room.code} trong kỳ {row.periodKey}.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {row.payments.transactions.map((tx) => (
                        <div key={tx.id} className="p-3.5 flex items-center justify-between gap-2">
                          <div>
                            <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                              <span className="font-mono">{tx.transactionCode}</span>
                              <span className="rounded bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 dark:text-blue-300">
                                {tx.provider}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {tx.note || 'Thanh toán hóa đơn'} ·{' '}
                              {new Date(tx.paidAt).toLocaleString('vi-VN')}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-mono font-bold text-emerald-600">
                              +{formatVnd(tx.amountVnd)}
                            </div>
                            <div className="text-[10px] font-semibold text-slate-500">
                              {tx.reconcileStatus}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 5: LỊCH SỬ AUDIT TRAIL */}
            {activeTab === 'HISTORY' && (
              <div className="space-y-3" data-testid="drawer-panel-history">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Nhật ký thao tác &amp; Kiểm toán phòng {row.room.code}
                </div>
                {row.history.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-6 text-center text-xs text-slate-500">
                    Chưa có bản ghi lịch sử chỉnh sửa trong kỳ này.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900/40 text-xs">
                    {row.history.map((h) => (
                      <div key={h.id} className="p-3.5 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-900 dark:text-white">
                            {h.summary}
                          </span>
                          <span className="font-mono text-[11px] text-slate-400 shrink-0">
                            {new Date(h.createdAt).toLocaleString('vi-VN')}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500">
                          <UserCheck className="w-3 h-3 text-blue-500" />
                          <span>
                            Thực hiện bởi: <strong>{h.actorEmail}</strong> ({h.actorRole})
                          </span>
                          <span>· Mã hành động: {h.action}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

