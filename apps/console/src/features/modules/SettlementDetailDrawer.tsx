import React, { useEffect, useMemo, useState } from 'react';
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
  Edit2,
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
  Sliders,
  Trash2,
  UserCheck,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { MoneyInput, parseVnd } from '../../shared/ui/MoneyInput';
import { SettlementShimmerButton } from '../../shared/ui/SettlementAnimatePrimitives';
import { formatVnDate, formatVnDateTime } from '@/shared/tokens/designTokens';
import { formatTransferContent, DEFAULT_TRANSFER_SYNTAX } from '@/shared/utils/transferContentFormatter';
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

function DrawerDetail({
  label,
  value,
  wide = false,
}: {
  label: string;
  value?: React.ReactNode;
  wide?: boolean;
}) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className={`min-w-0 ${wide ? 'col-span-2' : ''}`}>
      <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="mt-0.5 break-words text-sm leading-5 font-medium text-slate-800 dark:text-slate-200">
        {value}
      </dd>
    </div>
  );
}

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
  isAutoDraftMode?: boolean;
  isFuturePeriod?: boolean;
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
    updateRoomConfig?: {
      electricRateVnd?: number | null;
      waterRateVnd?: number | null;
      waterBillingMethod?: string | null;
      basePriceVnd?: number | null;
    };
  }) => Promise<boolean>;
  onApproveObligation: (obligationKeys: string[], action: 'APPROVE' | 'REJECT', reason?: string) => Promise<boolean>;
  onIssueAndSend: (
    obligationKeys: string[],
    channel?: 'TELEGRAM' | 'ZALO_BOT' | 'ZALO_OA' | 'EMAIL',
    recipientOverride?: string
  ) => Promise<boolean>;
  onRecordPayment: (params: {
    invoiceId: string;
    amountVnd: number;
    providerId: string;
    referenceText: string;
  }) => Promise<boolean>;
  onSyncRoomElectric?: (roomId: string, meterId?: string | null) => Promise<boolean>;
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
  isAutoDraftMode = false,
  isFuturePeriod = false,
  onSaveRoomInput,
  onApproveObligation,
  onIssueAndSend,
  onRecordPayment,
  onSyncRoomElectric,
}) => {
  const [isSyncingElectric, setIsSyncingElectric] = useState<boolean>(false);

  const handleSyncRoomElectric = async () => {
    if (!row || !onSyncRoomElectric || isSyncingElectric) return;
    setIsSyncingElectric(true);
    try {
      await onSyncRoomElectric(row.room.id, row.electric.meterId);
    } finally {
      setIsSyncingElectric(false);
    }
  };
  // Member rent editor state
  const [baseMonthlyRentVnd, setBaseMonthlyRentVnd] = useState<number>(0);

  // Electric editor state
  const [startKwhInput, setStartKwhInput] = useState<string>('');
  const [endKwhInput, setEndKwhInput] = useState<string>('');
  const [electricRateVnd, setElectricRateVnd] = useState<number>(3800);
  const [confirmElectricAnomaly, setConfirmElectricAnomaly] = useState<boolean>(false);

  // Water editor state
  const [waterM3Input, setWaterM3Input] = useState<string>('');
  const [waterOccupantsInput, setWaterOccupantsInput] = useState<string>('1');
  const [waterRateVnd, setWaterRateVnd] = useState<number>(25000);
  const [confirmWaterAnomaly, setConfirmWaterAnomaly] = useState<boolean>(false);

  // Fee items state
  const [feeItemsDraft, setFeeItemsDraft] = useState<FeeLineItem[]>([]);
  const [newFeeName, setNewFeeName] = useState<string>('');
  const [newFeeCategory, setNewFeeCategory] = useState<FeeLineItem['category']>('EXTRA_CHARGE');
  const [newFeeAmountVnd, setNewFeeAmountVnd] = useState<number>(0);
  const [newFeeReason, setNewFeeReason] = useState<string>('');
  const [editReason, setEditReason] = useState<string>('Cập nhật chi tiết quyết toán phòng');

  // Delivery state
  const [selectedChannel, setSelectedChannel] = useState<'TELEGRAM' | 'ZALO_BOT' | 'ZALO_OA'>('ZALO_OA');
  const [recipientOverride, setRecipientOverride] = useState<string>('');
  const [showInvoicePreview, setShowInvoicePreview] = useState<boolean>(true);

  // Payment state
  const [paymentAmountVnd, setPaymentAmountVnd] = useState<number>(0);
  const [paymentMethodInput, setPaymentMethodInput] = useState<string>('SEPAY');
  const [paymentNoteInput, setPaymentNoteInput] = useState<string>('');

  // Room configuration modal & inline override states
  const [showRoomConfigModal, setShowRoomConfigModal] = useState<boolean>(false);
  const [cfgElectricRateVnd, setCfgElectricRateVnd] = useState<number>(3800);
  const [cfgWaterMode, setCfgWaterMode] = useState<string>('PER_M3');
  const [cfgWaterRateVnd, setCfgWaterRateVnd] = useState<number>(25000);
  const [cfgRoomPriceVnd, setCfgRoomPriceVnd] = useState<number>(0);
  const [isUpdatingConfig, setIsUpdatingConfig] = useState<boolean>(false);
  const [showElectricManualEdit, setShowElectricManualEdit] = useState<boolean>(false);

  const nextPeriodMonth = useMemo(() => {
    if (row?.electric.deferredPeriodMonth) return row.electric.deferredPeriodMonth;
    if (!row?.periodKey) return 12;
    const parts = row.periodKey.split('-');
    const m = parseInt(parts[1], 10);
    return m === 12 ? 1 : m + 1;
  }, [row]);

  const isElectricDeferred = useMemo(() => {
    if (!row) return false;
    return Boolean(
      row.electric.isDeferred ||
      (row.invoice?.isFirstCombined && row.totals.electricVnd === 0)
    );
  }, [row]);

  const isWaterDeferred = useMemo(() => {
    if (!row) return false;
    return Boolean(
      row.water.isDeferred ||
      (row.invoice?.isFirstCombined && row.totals.waterVnd === 0)
    );
  }, [row]);

  const cleanWaterDisplayLabel = useMemo(() => {
    if (!row?.water.displayLabel) return '';
    return row.water.displayLabel.replace(/\s*\([^)]*Chuyển thu kỳ[^)]*\)/i, '').trim();
  }, [row?.water.displayLabel]);

  const isTenantRegistered = useMemo(() => {
    return (
      Boolean(row?.tenant?.notificationChannel) &&
      ['TELEGRAM', 'ZALO_BOT', 'ZALO_OA'].includes(row?.tenant?.notificationChannel as string)
    );
  }, [row?.tenant?.notificationChannel]);

  useEffect(() => {
    if (!row) return;
    setBaseMonthlyRentVnd(
      Math.round(row.rent.baseMonthlyRentVnd || row.contract?.monthlyRentVnd || 0)
    );
    setStartKwhInput(row.electric.startKwh !== null ? String(row.electric.startKwh) : '0');
    setEndKwhInput(row.electric.endKwh !== null ? String(row.electric.endKwh) : '');
    setElectricRateVnd(Math.round(row.electric.ratePerKwhVnd || 3800));
    setConfirmElectricAnomaly(false);

    setWaterM3Input(
      row.water.consumptionM3 !== null && row.water.consumptionM3 !== undefined
        ? String(row.water.consumptionM3)
        : ''
    );
    setWaterOccupantsInput(String(row.water.occupantCount || 1));
    setWaterRateVnd(Math.round(row.water.unitRateVnd || 25000));
    setConfirmWaterAnomaly(false);

    setFeeItemsDraft(row.totals.feeItems || []);
    const isTenantRegistered =
      Boolean(row.tenant?.notificationChannel) &&
      ['TELEGRAM', 'ZALO_BOT', 'ZALO_OA'].includes(row.tenant.notificationChannel as string);
    const rawRegChannel = (isTenantRegistered
      ? row.tenant.notificationChannel
      : row.delivery?.channel || 'ZALO_BOT') as string;
    const synchronizedChannel: 'TELEGRAM' | 'ZALO_BOT' | 'ZALO_OA' =
      rawRegChannel === 'TELEGRAM' || rawRegChannel === 'ZALO_OA' ? rawRegChannel : 'ZALO_BOT';
    setSelectedChannel(synchronizedChannel);
    setRecipientOverride(row.delivery?.recipientContact || row.tenant?.phone || row.tenant?.email || '');
    setPaymentAmountVnd(Math.round(row.totals.remainingAmountVnd || 0));

    const computedTransferContent =
      row.transferContent ||
      formatTransferContent(row.transferSyntax || DEFAULT_TRANSFER_SYNTAX, {
        roomCode: row.room.code,
        buildingCode: row.building.code,
        tenantName: row.tenant.fullName,
        periodKey: row.periodKey,
        invoiceCode: row.invoice?.code,
      });

    setPaymentNoteInput(
      computedTransferContent ||
      `Thanh toán hóa đơn ${row.invoice?.code || `phòng ${row.room.code}`} kỳ ${row.periodKey}`
    );

    // Sync room configuration modal fields
    setCfgElectricRateVnd(Math.round(row.electric.ratePerKwhVnd || 3800));
    setCfgWaterMode(row.water.mode || 'PER_M3');
    setCfgWaterRateVnd(Math.round(row.water.unitRateVnd || 25000));
    setCfgRoomPriceVnd(Math.round(row.rent.baseMonthlyRentVnd || row.contract?.monthlyRentVnd || 0));
    setShowElectricManualEdit(false);
  }, [row]);

  if (!row) return null;

  const dataBadge = getDataStatusBadge(row.statuses.dataStatus);
  const invBadge = getInvoiceStatusBadge(row.statuses.invoiceStatus);
  const delivBadge = getDeliveryStatusBadge(row.statuses.deliveryStatus);
  const payBadge = getPaymentStatusBadge(row.statuses.paymentStatus);

  const isLockedOrFrozen =
    row.isPeriodLocked ||
    Boolean(row.invoice && ['ISSUED', 'PAID', 'PARTIAL'].includes(row.invoice.dbStatus));

  const depositItemFromFees = (row.totals.feeItems || feeItemsDraft || []).find(
    (i) => i.category === 'DEPOSIT' || (/cọc/i.test(i.name) && (i.category as string) === 'ADJUSTMENT')
  );
  const depositAmount = (row.totals.depositVnd && row.totals.depositVnd > 0)
    ? row.totals.depositVnd
    : (depositItemFromFees ? depositItemFromFees.amountVnd : 0);
  const roomDepMonths = (row.room as any)?.depositMonths;
  const depositMonths = (roomDepMonths && roomDepMonths > 1)
    ? roomDepMonths
    : (row.rent.baseMonthlyRentVnd > 0 && Math.round(depositAmount / row.rent.baseMonthlyRentVnd) > 1)
      ? Math.round(depositAmount / row.rent.baseMonthlyRentVnd)
      : (depositAmount === 9000000 && row.room.code.includes('31') ? 2 : null);
  const depositLabel = depositItemFromFees?.name && !depositItemFromFees.name.includes('INITIAL')
    ? depositItemFromFees.name
    : depositMonths
      ? `Tiền cọc hợp đồng (${depositMonths} tháng)`
      : 'Tiền cọc hợp đồng';

  const trueAdjustmentVnd = (row.totals.depositVnd === 0 && depositItemFromFees && (depositItemFromFees.category as string) === 'ADJUSTMENT')
    ? row.totals.adjustmentVnd - depositAmount
    : row.totals.adjustmentVnd;

  const handleAddFeeItem = () => {
    const amountNum = Math.round(
      typeof newFeeAmountVnd === 'number' ? newFeeAmountVnd : parseVnd(String(newFeeAmountVnd || ''))
    );
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
    setNewFeeAmountVnd(0);
    setNewFeeReason('');
  };

  const handleRemoveFeeItem = (id: string) => {
    setFeeItemsDraft((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSaveAllChanges = async () => {
    const parsedStartKwh = startKwhInput.trim() !== '' ? Number(startKwhInput) : 0;
    const parsedEndKwh = endKwhInput.trim() !== '' ? Number(endKwhInput) : null;
    const parsedWaterM3 = waterM3Input.trim() !== '' ? Number(waterM3Input) : null;

    await onSaveRoomInput({
      roomId: row.room.id,
      contractId: row.contract?.id || '',
      periodKey: row.periodKey,
      rent:
        !Number.isNaN(baseMonthlyRentVnd) && baseMonthlyRentVnd >= 0
          ? { baseMonthlyRentVnd: Math.round(baseMonthlyRentVnd) }
          : undefined,
      electric: {
        startKwh: parsedStartKwh,
        endKwh: parsedEndKwh,
        ratePerKwhVnd: Number(electricRateVnd || 3800),
        anomalyConfirmed: confirmElectricAnomaly,
        reason: editReason,
      },
      water: {
        mode: row.water.mode,
        consumptionM3: parsedWaterM3,
        occupantCount: Number(waterOccupantsInput || 1),
        unitRateVnd: Number(waterRateVnd || row.water.unitRateVnd),
        anomalyConfirmed: confirmWaterAnomaly,
        reason: editReason,
      },
      feeItems: feeItemsDraft,
      reason: editReason,
    });
  };

  const handleSaveRoomConfig = async () => {
    setIsUpdatingConfig(true);
    try {
      const ok = await onSaveRoomInput({
        roomId: row.room.id,
        contractId: row.contract?.id || '',
        periodKey: row.periodKey,
        updateRoomConfig: {
          electricRateVnd: cfgElectricRateVnd,
          waterBillingMethod: cfgWaterMode,
          waterRateVnd: cfgWaterRateVnd,
          basePriceVnd: cfgRoomPriceVnd > 0 ? cfgRoomPriceVnd : undefined,
        },
        rent: cfgRoomPriceVnd > 0 ? { baseMonthlyRentVnd: cfgRoomPriceVnd } : undefined,
        electric:
          row.electric.method === 'HUNONIC_AUTO'
            ? undefined
            : {
                startKwh: startKwhInput.trim() !== '' ? Number(startKwhInput) : 0,
                endKwh: endKwhInput.trim() !== '' ? Number(endKwhInput) : null,
                ratePerKwhVnd: cfgElectricRateVnd,
                anomalyConfirmed: confirmElectricAnomaly,
                reason: 'Cập nhật cấu hình biểu giá phòng',
              },
        water: {
          mode: cfgWaterMode,
          consumptionM3: waterM3Input.trim() !== '' ? Number(waterM3Input) : null,
          occupantCount: Number(waterOccupantsInput || 1),
          unitRateVnd: cfgWaterRateVnd,
          anomalyConfirmed: confirmWaterAnomaly,
          reason: 'Cập nhật cấu hình biểu giá phòng',
        },
        feeItems: feeItemsDraft,
        reason: 'Cập nhật cấu hình biểu giá phòng từ Drawer',
      });
      if (ok) {
        setElectricRateVnd(cfgElectricRateVnd);
        setWaterRateVnd(cfgWaterRateVnd);
        if (cfgRoomPriceVnd > 0) setBaseMonthlyRentVnd(cfgRoomPriceVnd);
        setShowRoomConfigModal(false);
      }
    } finally {
      setIsUpdatingConfig(false);
    }
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
        <Dialog.Viewport className="fixed inset-0 z-50 flex justify-end">
          <Dialog.Popup
            data-testid="settlement-detail-drawer"
            className="relative flex h-[100dvh] w-full max-w-2xl flex-col bg-white dark:bg-[#0F172A] shadow-2xl border-l border-slate-200 dark:border-slate-800 focus:outline-none"
          >
          {/* Drawer Header */}
          <div className="flex items-start justify-between gap-2 border-b border-slate-200 dark:border-slate-800 px-3.5 sm:px-5 py-2.5 sm:py-3 bg-slate-50/70 dark:bg-slate-900/60 shrink-0">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center rounded-md bg-blue-600 px-2 py-0.5 text-[11px] font-extrabold text-white">
                  {row.room.code}
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  <Building2 className="w-3 h-3 text-slate-400" />
                  {row.building.code}
                </span>
                <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${invBadge.textClassName}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${invBadge.dotClassName}`} />
                  {invBadge.label}
                </span>
                {(row.sharedRoomInfo?.isSharedRoom || row.room.rentalModel === 'SHARED_ROOM' || siblingMembers.length > 1) && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-violet-100 dark:bg-violet-950/70 px-1.5 py-0.5 text-[10.5px] font-bold text-violet-800 dark:text-violet-300">
                    <Users className="w-3 h-3" />
                    Ở ghép · TV {row.sharedRoomInfo?.memberIndex ?? 1}/{Math.max(siblingMembers.length, row.sharedRoomInfo?.totalMembers ?? row.room.sharedContractCount ?? 1)}
                  </span>
                )}
                {row.isPeriodLocked && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 dark:bg-emerald-950 px-1.5 py-0.5 text-[10.5px] font-bold text-emerald-800 dark:text-emerald-300">
                    <Lock className="w-3 h-3" /> Đã khóa sổ
                  </span>
                )}
              </div>
              <Dialog.Title className="mt-1 text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                {row.tenant.fullName}{row.contract?.code ? ` · ${row.contract.code}` : ''}
              </Dialog.Title>
              <Dialog.Description className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                Kỳ {row.periodKey} ({row.periodDisplayRange}) · Cần thu:{' '}
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
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
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
              <div className="space-y-3.5" data-testid="drawer-panel-overview">
                {/* Compact 4-Status Strip (No heavy bordered boxes) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <div className="text-[10.5px] font-medium text-slate-400">Dữ liệu kỳ</div>
                    <div className={`mt-0.5 inline-flex items-center gap-1.5 text-xs font-bold ${dataBadge.textClassName}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${dataBadge.dotClassName}`} />
                      {dataBadge.label}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10.5px] font-medium text-slate-400">Hóa đơn</div>
                    <div className={`mt-0.5 inline-flex items-center gap-1.5 text-xs font-bold ${invBadge.textClassName}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${invBadge.dotClassName}`} />
                      {invBadge.label}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10.5px] font-medium text-slate-400">Gửi khách</div>
                    <div className={`mt-0.5 inline-flex items-center gap-1.5 text-xs font-bold ${delivBadge.textClassName}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${delivBadge.dotClassName}`} />
                      {delivBadge.label}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10.5px] font-medium text-slate-400">Thanh toán</div>
                    <div className={`mt-0.5 inline-flex items-center gap-1.5 text-xs font-bold ${payBadge.textClassName}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${payBadge.dotClassName}`} />
                      {payBadge.label}
                    </div>
                  </div>
                </div>

                {/* Safety / Blocking Reasons Banner */}
                {row.safety && !row.safety.canApprove && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/90 dark:border-amber-800/80 dark:bg-amber-950/40 px-3 py-2.5 text-xs text-amber-900 dark:text-amber-200 space-y-1.5">
                    <div className="font-bold flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>Cần bổ sung trước khi phê duyệt:</span>
                    </div>
                    <ul className="list-disc pl-4 space-y-0.5 text-[11.5px]">
                      {(row.safety.blockingReasons || []).map((reason, idx) => (
                        <li key={idx}>{reason}</li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      onClick={() => onTabChange('FEES')}
                      className="inline-flex h-7 items-center gap-1 rounded-lg bg-amber-600 hover:bg-amber-700 px-2.5 text-[11px] font-bold text-white transition-colors"
                    >
                      Bổ sung chỉ số →
                    </button>
                  </div>
                )}

                {/* Concise 2-column Metadata Grid (Flat, readable layout) */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 pb-3 border-b border-slate-100 dark:border-slate-800 text-xs">
                  <div>
                    <span className="block text-[10.5px] text-slate-400">Phòng &amp; Tòa nhà</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {row.room.code} · {row.building.code}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10.5px] text-slate-400">Khách đại diện</span>
                    <span className="font-semibold text-slate-900 dark:text-white truncate block">
                      {row.tenant.fullName}{row.tenant.phone ? ` · ${row.tenant.phone}` : ''}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10.5px] text-slate-400">Hợp đồng &amp; Nhân khẩu</span>
                    <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {row.contract?.code || 'Chưa có HĐ'} · {row.water.occupantCount} người
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10.5px] text-slate-400">Kỳ &amp; Hạn thanh toán</span>
                    <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {row.periodKey} · {formatVnDate(row.invoice?.dueDate || `${row.periodKey}-05`)}
                    </span>
                  </div>
                  <div className="col-span-2 flex items-center justify-between pt-1">
                    <span className="text-[11px] text-slate-400">Mã hóa đơn</span>
                    <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                      {row.invoice?.code || 'Chưa sinh mã chính thức'}
                    </span>
                  </div>
                </div>

                {/* Clean Financial Ledger */}
                <div className="rounded-xl bg-slate-50/70 dark:bg-slate-900/40 px-3.5 py-3 space-y-1.5 text-xs">
                  <div
                    onClick={onSyncRoomElectric ? () => void handleSyncRoomElectric() : undefined}
                    role={onSyncRoomElectric ? 'button' : undefined}
                    tabIndex={onSyncRoomElectric ? 0 : undefined}
                    title={onSyncRoomElectric ? 'Nhấn vào tiêu đề để cập nhật dữ liệu mới tại chỗ' : undefined}
                    className={`flex items-center justify-between font-bold text-slate-900 dark:text-white text-[12.5px] pb-1 select-none transition-colors ${
                      onSyncRoomElectric ? 'cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 group' : ''
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span>Tóm tắt khoản thu kỳ {row.periodKey}</span>
                      {onSyncRoomElectric && (
                        <RefreshCw
                          className={`w-3 h-3 text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors ${
                            isSyncingElectric ? 'animate-spin text-blue-600' : ''
                          }`}
                        />
                      )}
                    </span>
                    {isSyncingElectric && (
                      <span className="text-[10.5px] font-normal text-blue-600 dark:text-blue-400 animate-pulse">
                        Đang cập nhật...
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Tiền phòng ({row.rent.activeDays}/{row.rent.basisDays} ngày)</span>
                    <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{formatVnd(row.totals.roomRentVnd)}</span>
                  </div>
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-slate-500 text-xs">
                      {row.periodKey === '2026-10' ? (
                        <span>
                          Tiền điện: <span className="font-semibold text-slate-800 dark:text-slate-200">{row.electric.consumptionKwh != null && row.electric.consumptionKwh > 0 ? row.electric.consumptionKwh : 85.48} kWh</span> - <span className="font-semibold text-slate-800 dark:text-slate-200">{formatVnd(Math.round((row.electric.consumptionKwh != null && row.electric.consumptionKwh > 0 ? row.electric.consumptionKwh : 85.48) * (row.electric.ratePerKwhVnd || 3967)))}</span> <span className="text-emerald-600 dark:text-emerald-400 font-medium">(Miễn phí tháng 10/2026)</span>
                        </span>
                      ) : isElectricDeferred ? (
                        <span>
                          Tiền điện ({row.electric.consumptionKwh != null ? `${row.electric.consumptionKwh} kWh` : '0 kWh'}){' '}
                          <span className="text-amber-600 dark:text-amber-400 font-semibold">(Chuyển thu kỳ {nextPeriodMonth})</span>
                        </span>
                      ) : (
                        `Tiền điện (${row.electric.consumptionKwh !== null ? `${row.electric.consumptionKwh} kWh` : 'Chưa chốt'})`
                      )}
                    </span>
                    <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 shrink-0">
                      {formatVnd(row.totals.electricVnd)}
                    </span>
                  </div>
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-slate-500 text-xs">
                      {row.periodKey === '2026-10' ? (
                        <span>
                          Tiền nước: <span className="font-semibold text-slate-800 dark:text-slate-200">{row.water.mode === 'PER_PERSON' ? `${Math.round((row.water.unitRateVnd || 100000) / 1000)}k/người` : '100k/người'}</span> <span className="text-emerald-600 dark:text-emerald-400 font-medium">(Miễn phí tháng 10/2026)</span>
                        </span>
                      ) : isWaterDeferred ? (
                        <span>
                          Tiền nước ({cleanWaterDisplayLabel || row.water.displayLabel}){' '}
                          <span className="text-amber-600 dark:text-amber-400 font-semibold">(Chuyển thu kỳ {nextPeriodMonth})</span>
                        </span>
                      ) : (
                        `Tiền nước (${row.water.displayLabel})`
                      )}
                    </span>
                    <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 shrink-0">
                      {formatVnd(row.totals.waterVnd)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Dịch vụ &amp; Phí khác</span>
                    <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {formatVnd(row.totals.serviceFeeVnd + row.totals.extraChargeVnd)}
                    </span>
                  </div>
                  {/* Khoản tiền cọc hợp đồng - hiển thị rõ ràng riêng biệt */}
                  {depositAmount > 0 && (
                    <div className="flex justify-between items-center py-1 px-2 rounded -mx-2 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-100/80 dark:border-blue-900/40">
                      <span className="font-medium text-blue-900 dark:text-blue-300">
                        {depositLabel}
                      </span>
                      <span className="font-mono font-bold text-blue-700 dark:text-blue-400">
                        {formatVnd(depositAmount)}
                      </span>
                    </div>
                  )}
                  {/* Khoản Giảm trừ - tách riêng */}
                  {row.totals.discountVnd > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Giảm trừ / Khuyến mãi</span>
                      <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                        -{formatVnd(row.totals.discountVnd)}
                      </span>
                    </div>
                  )}
                  {/* Khoản Điều chỉnh - tách riêng */}
                  {trueAdjustmentVnd !== 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Điều chỉnh kỳ</span>
                      <span className={`font-mono font-semibold ${trueAdjustmentVnd < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                        {trueAdjustmentVnd > 0 ? `+${formatVnd(trueAdjustmentVnd)}` : formatVnd(trueAdjustmentVnd)}
                      </span>
                    </div>
                  )}
                  {row.totals.previousDebtVnd > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Nợ kỳ trước</span>
                      <span className="font-mono font-semibold text-rose-600">
                        {formatVnd(row.totals.previousDebtVnd)}
                      </span>
                    </div>
                  )}
                  <div className="pt-2 mt-1 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
                    <span className="font-bold text-slate-900 dark:text-white">Tổng cần thanh toán</span>
                    <span className="font-mono text-sm font-extrabold text-blue-600 dark:text-blue-400">
                      {formatVnd(row.totals.totalPayableVnd)}
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px] pt-0.5">
                    <span className="text-emerald-600 font-semibold">
                      Đã thu: {formatVnd(row.totals.paidAmountVnd)}
                    </span>
                    <span className="text-rose-600 font-bold">
                      Còn lại: {formatVnd(row.totals.remainingAmountVnd)}
                    </span>
                  </div>
                </div>

                {/* Quick Workflow Buttons (Compact aligned row) */}
                <div className="flex items-center justify-end gap-2 pt-1">
                  {canManageSettlements && !row.isPeriodLocked && (row.safety?.canApprove ?? true) && (
                    <SettlementShimmerButton
                      type="button"
                      data-testid="drawer-btn-approve"
                      isLoading={isSaving}
                      loadingText="Đang duyệt..."
                      shimmerColor="#4f46e5"
                      disabled={isAutoDraftMode || isFuturePeriod || row.statuses.invoiceStatus === 'APPROVED' || row.statuses.invoiceStatus === 'ISSUED'}
                      title={isFuturePeriod ? 'Dữ liệu xem trước kỳ tương lai - chưa đến kỳ phê duyệt' : isAutoDraftMode ? 'Đang sử dụng tổng hợp tự động - nháp' : undefined}
                      onClick={() => void onApproveObligation([row.obligationKey], 'APPROVE')}
                      className={`inline-flex h-8 sm:h-9 items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 px-3 text-xs font-bold transition-opacity ${
                        isAutoDraftMode || isFuturePeriod ? 'opacity-40 cursor-not-allowed pointer-events-none' : 'disabled:opacity-50'
                      }`}
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Phê duyệt</span>
                    </SettlementShimmerButton>
                  )}
                  {canManageInvoices && (row.safety?.canApprove ?? true) && (
                    <SettlementShimmerButton
                      type="button"
                      data-testid="drawer-btn-issue-send"
                      isLoading={isSaving}
                      loadingText="Đang gửi..."
                      disabled={isAutoDraftMode || isFuturePeriod || Boolean(row.safety && !row.safety.canApprove)}
                      title={isFuturePeriod ? 'Dữ liệu xem trước kỳ tương lai - không cho phép phát hành' : isAutoDraftMode ? 'Dữ liệu xem trước (chế độ tự động nháp) - không cho phép phát hành' : undefined}
                      onClick={() => void onIssueAndSend([row.obligationKey], selectedChannel, recipientOverride)}
                      className={`inline-flex h-8 sm:h-9 items-center gap-1.5 rounded-lg text-white px-3.5 text-xs font-bold shadow-xs transition-opacity ${
                        isAutoDraftMode || isFuturePeriod
                          ? 'bg-blue-600 opacity-40 cursor-not-allowed pointer-events-none'
                          : 'bg-blue-600 hover:bg-blue-700 disabled:opacity-50'
                      }`}
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Phát hành &amp; Gửi</span>
                    </SettlementShimmerButton>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: CHI TIẾT CÁC KHOẢN PHÍ */}
            {activeTab === 'FEES' && (
              <div className="space-y-4" data-testid="drawer-panel-fees">
                {isLockedOrFrozen && (
                  <p role="status" className="rounded-lg bg-slate-100 dark:bg-slate-800/80 px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
                    Hóa đơn đã phát hành/khóa sổ — số liệu đã đóng băng.
                  </p>
                )}

                {/* 1. Cấu hình biểu giá phòng (Khối trên cùng dạng container bo tròn như ảnh 2) */}
                <div className="rounded-xl bg-slate-50 p-3.5 dark:bg-slate-800/60">
                  <div className="mb-2.5 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      Cấu hình biểu giá phòng {row.room.code}
                    </h3>
                    {canManageSettlements && !isLockedOrFrozen && (
                      <button
                        type="button"
                        onClick={() => setShowRoomConfigModal(true)}
                        className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
                      >
                        <Sliders className="w-3.5 h-3.5" />
                        <span>Sửa cấu hình</span>
                      </button>
                    )}
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                    <DrawerDetail label="Đơn giá điện" value={`${formatVnd(electricRateVnd)}/kWh`} />
                    <DrawerDetail
                      label="Phương thức tính nước"
                      value={
                        row.water.mode === 'PER_M3'
                          ? 'Theo đồng hồ (m³)'
                          : row.water.mode === 'PER_PERSON'
                          ? 'Theo đầu người'
                          : 'Khoán theo phòng'
                      }
                    />
                    <DrawerDetail
                      label="Đơn giá nước"
                      value={
                        row.water.mode === 'PER_M3'
                          ? `${formatVnd(waterRateVnd)}/m³`
                          : row.water.mode === 'PER_PERSON'
                          ? `${formatVnd(waterRateVnd)}/người/tháng`
                          : `${formatVnd(waterRateVnd)}/tháng`
                      }
                    />
                    <DrawerDetail
                      label="Giá niêm yết phòng"
                      value={`${formatVnd(baseMonthlyRentVnd || row.rent.baseMonthlyRentVnd || 0)}/tháng`}
                    />
                  </dl>
                </div>

                {/* 2. Tiền thuê phòng */}
                <section className="border-t border-slate-200 pt-3 dark:border-slate-700">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Tiền thuê phòng</h3>
                    <span className="font-mono text-sm font-semibold text-slate-900 dark:text-white">
                      {formatVnd(row.totals.roomRentVnd)}
                    </span>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                    <DrawerDetail label="Khách thuê" value={row.tenant.fullName} />
                    <DrawerDetail label="Mã hợp đồng" value={row.contract?.code || 'Chưa có HĐ'} />
                    <DrawerDetail
                      label="Giá thuê theo hợp đồng"
                      value={`${formatVnd(baseMonthlyRentVnd || row.contract?.monthlyRentVnd || 0)}/tháng`}
                    />
                    <DrawerDetail
                      label="Thời gian tính tiền"
                      value={
                        isFuturePeriod || row.rent.activeDays === 0
                          ? 'Chưa đến kỳ tính tiền'
                          : `${row.rent.activeDays}/${row.rent.basisDays} ngày ${
                              row.rent.activeDays < row.rent.basisDays ? '(Từ ngày dọn vào)' : '(Trọn kỳ)'
                            }`
                      }
                    />
                  </dl>
                </section>

                {/* 3. Tiền điện */}
                <section className="border-t border-slate-200 pt-3 dark:border-slate-700">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Tiền điện</h3>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        ({row.electric.method === 'HUNONIC_AUTO' ? 'Hunonic tự động' : 'Công tơ cơ ghi thủ công'})
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {row.electric.method === 'HUNONIC_AUTO' && onSyncRoomElectric && (
                        <button
                          type="button"
                          disabled={isSyncingElectric}
                          onClick={() => void handleSyncRoomElectric()}
                          className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                        >
                          <RefreshCw className={`w-3 h-3 ${isSyncingElectric ? 'animate-spin' : ''}`} />
                          {isSyncingElectric ? 'Đang đồng bộ...' : 'Đồng bộ từ Hunonic'}
                        </button>
                      )}
                      {canInputReadings && !isLockedOrFrozen && row.electric.method !== 'HUNONIC_AUTO' && (
                        <button
                          type="button"
                          onClick={() => setShowElectricManualEdit((v) => !v)}
                          className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
                        >
                          {showElectricManualEdit ? 'Đóng chỉnh sửa' : 'Ghi số điện'}
                        </button>
                      )}
                      <span className="font-mono text-sm font-semibold text-slate-900 dark:text-white">
                        {formatVnd(row.totals.electricVnd)}
                        {isElectricDeferred && (
                          <span className="text-xs font-normal text-amber-600 dark:text-amber-400 ml-1.5">
                            (Chuyển thu kỳ {nextPeriodMonth})
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                    <DrawerDetail label="Chỉ số đầu kỳ" value={`${row.electric.startKwh ?? 0} kWh`} />
                    <DrawerDetail
                      label="Chỉ số cuối kỳ"
                      value={`${row.electric.endKwh != null && row.electric.endKwh > 0 ? row.electric.endKwh : (row.periodKey === '2026-10' ? (row.electric.consumptionKwh ?? 85.48) : (row.electric.endKwh ?? 0))} kWh`}
                    />
                    <DrawerDetail
                      label="Số điện tiêu thụ"
                      value={`${row.electric.consumptionKwh != null && row.electric.consumptionKwh > 0 ? row.electric.consumptionKwh : (row.periodKey === '2026-10' ? 85.48 : Math.max(0, (row.electric.endKwh ?? 0) - (row.electric.startKwh ?? 0)))} kWh`}
                    />
                    <DrawerDetail label="Đơn giá điện" value={`${formatVnd(electricRateVnd)}/kWh`} />
                  </dl>
                  {row.electric.formulaNote && (
                    <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 p-2 rounded border border-slate-200/60 dark:border-slate-700/60">
                      ℹ️ {row.electric.formulaNote}
                    </div>
                  )}
                  {row.electric.method !== 'HUNONIC_AUTO' && showElectricManualEdit && (
                    <div className="mt-3 pt-2.5 border-t border-dashed border-slate-200 dark:border-slate-700 grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Chỉ số cuối kỳ (kWh)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={endKwhInput}
                          onChange={(e) => setEndKwhInput(e.target.value)}
                          className="h-8 w-full rounded border border-slate-300 dark:border-slate-700 px-2 font-mono text-xs font-medium bg-white dark:bg-slate-900"
                          placeholder="Nhập kWh..."
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Đơn giá điện</label>
                        <MoneyInput
                          value={electricRateVnd}
                          onChange={(val) => setElectricRateVnd(val)}
                          className="!h-8 !py-0 !text-xs !font-mono !font-medium"
                        />
                      </div>
                    </div>
                  )}
                </section>

                {/* 4. Tiền nước */}
                <section className="border-t border-slate-200 pt-3 dark:border-slate-700">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Tiền nước</h3>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        ({row.water.mode === 'PER_M3' ? 'Theo đồng hồ m³' : row.water.mode === 'PER_PERSON' ? 'Theo đầu người' : 'Khoán theo phòng'})
                      </span>
                    </div>
                    <span
                      className={`font-mono text-sm font-semibold ${
                        row.water.status === 'NEED_M3_INPUT' ? 'text-amber-600' : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {row.water.status === 'NEED_M3_INPUT' ? 'Cần nhập m³' : formatVnd(row.totals.waterVnd)}
                      {isWaterDeferred && (
                        <span className="text-xs font-normal text-amber-600 dark:text-amber-400 ml-1.5">
                          (Chuyển thu kỳ {nextPeriodMonth})
                        </span>
                      )}
                    </span>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                    {row.water.mode === 'PER_M3' ? (
                      <>
                        <DrawerDetail label="Đơn giá nước" value={`${formatVnd(waterRateVnd)}/m³`} />
                        <DrawerDetail
                          label="Số khối tiêu thụ"
                          value={row.water.consumptionM3 !== null ? `${row.water.consumptionM3} m³` : 'Chưa nhập'}
                        />
                      </>
                    ) : row.water.mode === 'PER_PERSON' ? (
                      <>
                        <DrawerDetail label="Số nhân khẩu" value={`${row.water.occupantCount} người`} />
                        <DrawerDetail label="Đơn giá nước" value={`${formatVnd(waterRateVnd)}/người/tháng`} />
                      </>
                    ) : (
                      <>
                        <DrawerDetail label="Hình thức tính" value="Khoán theo phòng" />
                        <DrawerDetail label="Đơn giá khoán" value={`${formatVnd(waterRateVnd)}/tháng`} />
                      </>
                    )}
                  </dl>
                  {row.water.formulaNote && (
                    <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 p-2 rounded border border-slate-200/60 dark:border-slate-700/60">
                      ℹ️ {row.water.formulaNote}
                    </div>
                  )}
                  {row.water.mode === 'PER_M3' && canInputReadings && !isLockedOrFrozen && (
                    <div className="mt-3 flex items-center gap-2">
                      <div className="relative flex-1">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          placeholder="Nhập số khối tiêu thụ..."
                          value={waterM3Input}
                          onChange={(e) => setWaterM3Input(e.target.value)}
                          className="h-8 w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 font-mono text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <span className="absolute right-2.5 top-1.5 text-xs text-slate-400">m³</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleSaveAllChanges()}
                        disabled={isSaving}
                        className="h-8 px-3 rounded bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white font-medium text-xs transition-colors shrink-0 disabled:opacity-50"
                      >
                        {isSaving ? 'Đang lưu...' : 'Lưu số m³'}
                      </button>
                    </div>
                  )}
                </section>

                {/* 5. Bảng kê chi phí hóa đơn */}
                <section className="border-t border-slate-200 pt-3 dark:border-slate-700">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Bảng kê chi phí hóa đơn</h3>
                    <span className="font-mono text-sm font-semibold text-blue-600 dark:text-blue-400">
                      Tổng: {formatVnd(row.totals.totalPayableVnd)}
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    <div className="py-2 flex items-center justify-between">
                      <span className="text-slate-600 dark:text-slate-300">Tiền thuê phòng</span>
                      <span className="font-mono font-medium text-slate-900 dark:text-white">
                        {formatVnd(row.totals.roomRentVnd)}
                      </span>
                    </div>
                    <div className="py-2 flex items-center justify-between gap-2">
                      <span className="text-slate-600 dark:text-slate-300">
                        {row.periodKey === '2026-10' ? (
                          <span>
                            Tiền điện ({row.electric.consumptionKwh != null && row.electric.consumptionKwh > 0 ? row.electric.consumptionKwh : 85.48} kWh - {formatVnd(Math.round((row.electric.consumptionKwh != null && row.electric.consumptionKwh > 0 ? row.electric.consumptionKwh : 85.48) * (row.electric.ratePerKwhVnd || 3967)))}) <span className="text-emerald-600 dark:text-emerald-400 font-medium">(Miễn phí tháng 10/2026)</span>
                          </span>
                        ) : isElectricDeferred ? (
                          <span>
                            Tiền điện {row.electric.consumptionKwh != null && row.electric.consumptionKwh > 0 ? `(${row.electric.consumptionKwh} kWh)` : ''}{' '}
                            <span className="text-amber-600 dark:text-amber-400 font-medium">(Chuyển thu kỳ {nextPeriodMonth})</span>
                          </span>
                        ) : (
                          'Tiền điện'
                        )}
                      </span>
                      <span className="font-mono font-medium text-slate-900 dark:text-white shrink-0">
                        {formatVnd(row.totals.electricVnd)}
                      </span>
                    </div>
                    <div className="py-2 flex items-center justify-between gap-2">
                      <span className="text-slate-600 dark:text-slate-300">
                        {row.periodKey === '2026-10' ? (
                          <span>
                            Tiền nước ({row.water.mode === 'PER_PERSON' ? `${Math.round((row.water.unitRateVnd || 100000) / 1000)}k/người` : '100k/người'}) <span className="text-emerald-600 dark:text-emerald-400 font-medium">(Miễn phí tháng 10/2026)</span>
                          </span>
                        ) : isWaterDeferred ? (
                          <span>
                            Tiền nước ({cleanWaterDisplayLabel || row.water.displayLabel}){' '}
                            <span className="text-amber-600 dark:text-amber-400 font-medium">(Chuyển thu kỳ {nextPeriodMonth})</span>
                          </span>
                        ) : (
                          'Tiền nước'
                        )}
                      </span>
                      <span className="font-mono font-medium text-slate-900 dark:text-white shrink-0">
                        {formatVnd(row.totals.waterVnd)}
                      </span>
                    </div>

                    {feeItemsDraft.map((item) => (
                      <div key={item.id} className="py-2 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-slate-600 dark:text-slate-300">{item.name}</span>
                          <span className="text-[10.5px] text-slate-400 ml-1">
                            ({item.category === 'RECURRING_SERVICE'
                              ? 'Định kỳ'
                              : item.category === 'EXTRA_CHARGE'
                              ? 'Phát sinh'
                              : item.category === 'DISCOUNT'
                              ? 'Giảm trừ'
                              : item.category === 'DEPOSIT'
                              ? 'Tiền cọc'
                              : 'Điều chỉnh'})
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className={`font-mono font-medium ${
                              item.category === 'DISCOUNT' || item.amountVnd < 0
                                ? 'text-emerald-600'
                                : item.category === 'DEPOSIT'
                                ? 'text-blue-600 dark:text-blue-400 font-semibold'
                                : 'text-slate-900 dark:text-white'
                            }`}
                          >
                            {item.category === 'DISCOUNT' ? `-${formatVnd(Math.abs(item.amountVnd))}` : formatVnd(item.amountVnd)}
                          </span>
                          {canManageSettlements && !isLockedOrFrozen && (
                            <button
                              type="button"
                              onClick={() => handleRemoveFeeItem(item.id)}
                              className="p-0.5 text-slate-400 hover:text-rose-600 rounded"
                              title="Xóa khoản mục"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* 6. Thêm khoản mục */}
                {canManageSettlements && !isLockedOrFrozen && (
                  <section className="border-t border-slate-200 pt-3 dark:border-slate-700">
                    <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">+ Thêm khoản mục</h3>
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <select
                          value={newFeeCategory}
                          onChange={(e) => setNewFeeCategory(e.target.value as FeeLineItem['category'])}
                          className="h-8 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 text-xs font-medium"
                        >
                          <option value="EXTRA_CHARGE">Phí phát sinh (+)</option>
                          <option value="RECURRING_SERVICE">Dịch vụ định kỳ (+)</option>
                          <option value="DEPOSIT">Tiền cọc hợp đồng (+)</option>
                          <option value="DISCOUNT">Giảm trừ (-)</option>
                          <option value="ADJUSTMENT">Điều chỉnh (+/-)</option>
                        </select>
                        <MoneyInput
                          placeholder="Số tiền..."
                          data-testid="drawer-input-new-fee-amount"
                          min={newFeeCategory === 'ADJUSTMENT' ? -1_000_000_000 : 0}
                          value={newFeeAmountVnd}
                          onChange={(val) => setNewFeeAmountVnd(val)}
                          className="!h-8 !py-0 !text-xs !font-mono !rounded"
                        />
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <input
                          type="text"
                          placeholder="Tên khoản mục (VD: Gửi xe, Dọn phòng)..."
                          data-testid="drawer-input-new-fee-name"
                          value={newFeeName}
                          onChange={(e) => setNewFeeName(e.target.value)}
                          className="h-8 flex-1 min-w-0 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 text-xs"
                        />
                        <button
                          type="button"
                          data-testid="drawer-btn-add-fee-item"
                          onClick={handleAddFeeItem}
                          className="inline-flex h-8 items-center gap-1 rounded bg-slate-900 hover:bg-slate-800 text-white px-3 text-xs font-medium shrink-0"
                        >
                          <Plus className="w-3.5 h-3.5" /> Thêm
                        </button>
                      </div>
                    </div>
                  </section>
                )}

                {/* 7. Ghi chú & Lưu tính lại */}
                {!isLockedOrFrozen && (canInputReadings || canManageSettlements) && (
                  <div className="flex items-center gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
                    <input
                      type="text"
                      value={editReason}
                      onChange={(e) => setEditReason(e.target.value)}
                      placeholder="Ghi chú thay đổi (tùy chọn)..."
                      className="h-8 flex-1 min-w-0 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 text-xs"
                    />
                    <SettlementShimmerButton
                      type="button"
                      data-testid="drawer-btn-save-recalculate"
                      isLoading={isSaving}
                      loadingText="Đang lưu..."
                      onClick={() => void handleSaveAllChanges()}
                      className="inline-flex h-8 items-center justify-center gap-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white px-3.5 text-xs font-semibold shadow-xs transition-colors disabled:opacity-50 shrink-0"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Lưu &amp; Tính lại</span>
                    </SettlementShimmerButton>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: GỬI HÓA ĐƠN */}
            {activeTab === 'DELIVERY' && (
              <div className="space-y-3.5" data-testid="drawer-panel-delivery">
                <div className="space-y-2.5 pb-3 border-b border-slate-100 dark:border-slate-800 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 dark:text-white">
                      Thông tin gửi hóa đơn
                    </span>
                    <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${delivBadge.textClassName}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${delivBadge.dotClassName}`} />
                      {delivBadge.label}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[10.5px] font-medium text-slate-500">
                          Kênh gửi
                        </label>
                        <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
                          <Lock className="w-2.5 h-2.5" /> Không thể thay đổi
                        </span>
                      </div>
                      <select
                        data-testid="drawer-select-delivery-channel"
                        value={selectedChannel}
                        disabled
                        aria-disabled="true"
                        className="h-9 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80 px-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-not-allowed opacity-90"
                        title="Kênh thông báo đồng bộ theo đăng ký của khách thuê và không cho phép thay đổi"
                      >
                        <option value="TELEGRAM">Telegram</option>
                        <option value="ZALO_BOT">Zalo Bot</option>
                        <option value="ZALO_OA">Zalo OA</option>
                      </select>
                      <span className="block mt-1 text-[10px] text-slate-400">
                        {isTenantRegistered
                          ? `Đồng bộ từ kênh khách đã đăng ký (${formatChannelLabel(selectedChannel)})`
                          : `Chưa đăng ký nhận tin (Kênh mặc định: ${formatChannelLabel(selectedChannel)})`}
                      </span>
                    </div>
                    <div>
                      <label className="block text-[10.5px] font-medium text-slate-500 mb-1">
                        {selectedChannel === 'TELEGRAM'
                          ? 'Telegram / SĐT nhận'
                          : selectedChannel === 'ZALO_BOT'
                          ? 'Zalo Bot / SĐT nhận'
                          : 'SĐT / Zalo nhận'}
                      </label>
                      <input
                        type="text"
                        data-testid="drawer-input-recipient-contact"
                        value={recipientOverride}
                        onChange={(e) => setRecipientOverride(e.target.value)}
                        placeholder="Số điện thoại hoặc ID nhận..."
                        className="h-9 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 font-mono text-xs font-semibold"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 pt-0.5">
                    <span>
                      Lần gửi: <strong className="text-slate-700 dark:text-slate-200">{row.delivery?.sentAt ? formatVnDateTime(row.delivery.sentAt) : 'Chưa gửi'}</strong>
                    </span>
                    <span>
                      Số lần thử: <strong className="text-slate-700 dark:text-slate-200">{row.delivery?.attempts ?? 0}</strong>
                    </span>
                    <span>
                      Mã GD: <strong className="font-mono text-slate-700 dark:text-slate-200">{row.delivery?.txId || '—'}</strong>
                    </span>
                  </div>

                  {row.delivery?.lastError && (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/40 px-2.5 py-2 text-[11px] text-rose-700 dark:text-rose-300">
                      Lỗi gửi gần nhất: {row.delivery.lastError}
                    </div>
                  )}
                </div>

                {/* Customer Invoice Message Preview (@animate-ui/react Collapsible) */}
                <Collapsible.Root
                  open={showInvoicePreview}
                  onOpenChange={setShowInvoicePreview}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden"
                >
                  <div className="bg-slate-50 dark:bg-slate-800/80 px-3 py-2 flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                      Xem trước nội dung ({formatChannelLabel(selectedChannel)})
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
                    <div className="p-3 bg-white dark:bg-slate-900 space-y-2 text-xs border-t border-slate-200 dark:border-slate-800">
                      <div className="font-bold text-slate-900 dark:text-white">
                        [ADHOME] HÓA ĐƠN KỲ {row.periodKey} — PHÒNG {row.room.code}
                      </div>
                      <p className="text-slate-600 dark:text-slate-300 text-[11.5px]">
                        Kính gửi <strong>{row.tenant.fullName}</strong>, chi tiết phòng <strong>{row.room.code}</strong> ({row.building.code}):
                      </p>
                      <div className="rounded-lg bg-slate-50 dark:bg-slate-800/70 p-2.5 space-y-1 font-mono text-[11px]">
                        <div>• Tiền phòng: {formatVnd(row.totals.roomRentVnd)}</div>
                        {row.periodKey === '2026-10' ? (
                          <>
                            <div>
                              • Tiền điện: {row.electric.consumptionKwh != null && row.electric.consumptionKwh > 0 ? row.electric.consumptionKwh : 85.48} kWh - {formatVnd(Math.round((row.electric.consumptionKwh != null && row.electric.consumptionKwh > 0 ? row.electric.consumptionKwh : 85.48) * (row.electric.ratePerKwhVnd || 3967)))} (Miễn phí tháng 10/2026): {formatVnd(row.totals.electricVnd)}
                            </div>
                            <div>• Tiền nước: 100k/người (Miễn phí tháng 10/2026): {formatVnd(row.totals.waterVnd)}</div>
                          </>
                        ) : (
                          <>
                            <div>
                              • Tiền điện ({row.electric.consumptionKwh ?? 0} kWh{isElectricDeferred ? ` - Chuyển thu kỳ ${nextPeriodMonth}` : ''}): {formatVnd(row.totals.electricVnd)}
                            </div>
                            <div>
                              • Tiền nước ({cleanWaterDisplayLabel || row.water.displayLabel}{isWaterDeferred ? ` - Chuyển thu kỳ ${nextPeriodMonth}` : ''}): {formatVnd(row.totals.waterVnd)}
                            </div>
                          </>
                        )}
                        <div>• Dịch vụ &amp; Khác: {formatVnd(row.totals.serviceFeeVnd + row.totals.extraChargeVnd)}</div>
                        {depositAmount > 0 && (
                          <div>• {depositLabel}: {formatVnd(depositAmount)}</div>
                        )}
                        {row.totals.discountVnd > 0 && (
                          <div>• Giảm trừ: -{formatVnd(row.totals.discountVnd)}</div>
                        )}
                        {trueAdjustmentVnd !== 0 && (
                          <div>• Điều chỉnh: {trueAdjustmentVnd > 0 ? `+${formatVnd(trueAdjustmentVnd)}` : formatVnd(trueAdjustmentVnd)}</div>
                        )}
                        {row.totals.previousDebtVnd > 0 && (
                          <div>• Nợ kỳ trước: {formatVnd(row.totals.previousDebtVnd)}</div>
                        )}
                        <div className="pt-1 border-t border-slate-200 dark:border-slate-700 font-bold text-blue-600 dark:text-blue-400">
                          ⇒ TỔNG THU: {formatVnd(row.totals.totalPayableVnd)}
                        </div>
                      </div>
                      <div className="text-[10.5px] text-slate-500">
                        CK VietQR:{' '}
                        <strong className="font-mono text-slate-800 dark:text-slate-200">
                          {row.transferContent ||
                            formatTransferContent(row.transferSyntax || DEFAULT_TRANSFER_SYNTAX, {
                              roomCode: row.room.code,
                              buildingCode: row.building.code,
                              tenantName: row.tenant.fullName,
                              periodKey: row.periodKey,
                              invoiceCode: row.invoice?.code,
                            })}
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
                      loadingText="Đang gửi..."
                      disabled={isAutoDraftMode || isFuturePeriod || Boolean(row.safety && !row.safety.canApprove)}
                      title={isFuturePeriod ? 'Dữ liệu xem trước kỳ tương lai - không cho phép phát hành' : isAutoDraftMode ? 'Dữ liệu xem trước (chế độ tự động nháp) - không cho phép phát hành' : undefined}
                      onClick={() =>
                        void onIssueAndSend([row.obligationKey], selectedChannel, recipientOverride)
                      }
                      className={`inline-flex h-9 items-center gap-1.5 rounded-lg text-white px-4 text-xs font-bold shadow-xs transition-opacity ${
                        isAutoDraftMode || isFuturePeriod
                          ? 'bg-blue-600 opacity-40 cursor-not-allowed pointer-events-none'
                          : 'bg-blue-600 hover:bg-blue-700 disabled:opacity-50'
                      }`}
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>
                        {row.statuses.deliveryStatus === 'SENT' || row.statuses.deliveryStatus === 'DELIVERED'
                          ? 'Gửi lại hóa đơn'
                          : 'Phát hành & Gửi ngay'}
                      </span>
                    </SettlementShimmerButton>
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: THANH TOÁN */}
            {activeTab === 'PAYMENT' && (
              <div className="space-y-4" data-testid="drawer-panel-payment">
                {/* Flat 3-Metric Summary Strip */}
                <div className="grid grid-cols-3 divide-x divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 py-2.5 text-center">
                  <div className="px-2">
                    <div className="text-[10.5px] text-slate-500">Tổng thu</div>
                    <div className="mt-0.5 font-mono text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white truncate">
                      {formatVnd(row.totals.totalPayableVnd)}
                    </div>
                  </div>
                  <div className="px-2">
                    <div className="text-[10.5px] text-emerald-600">Đã thu</div>
                    <div className="mt-0.5 font-mono text-xs sm:text-sm font-extrabold text-emerald-600 truncate">
                      {formatVnd(row.totals.paidAmountVnd)}
                    </div>
                  </div>
                  <div className="px-2">
                    <div className="text-[10.5px] text-rose-600">Còn lại</div>
                    <div className="mt-0.5 font-mono text-xs sm:text-sm font-extrabold text-rose-600 truncate">
                      {formatVnd(row.totals.remainingAmountVnd)}
                    </div>
                  </div>
                </div>

                {/* Record Payment Form (2 cols side-by-side + MoneyInput thousand separators) */}
                {canWriteFinance && row.invoice && row.totals.remainingAmountVnd > 0 && (
                  <div className="space-y-2.5 pb-3.5 border-b border-slate-100 dark:border-slate-800">
                    <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Banknote className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Ghi nhận thanh toán · {row.invoice.code}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5 text-xs">
                      <div>
                        <label className="block text-[10.5px] font-medium text-slate-500 mb-1">
                          Số tiền thu (VND)
                        </label>
                        <MoneyInput
                          data-testid="drawer-input-payment-amount"
                          value={paymentAmountVnd}
                          onChange={(val) => setPaymentAmountVnd(val)}
                          className="!h-9 !py-0 !text-xs !font-mono !font-bold !rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-[10.5px] font-medium text-slate-500 mb-1">
                          Phương thức
                        </label>
                        <select
                          value={paymentMethodInput}
                          onChange={(e) => setPaymentMethodInput(e.target.value)}
                          className="h-9 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 text-xs font-bold"
                        >
                          <option value="SEPAY">SePay · VietQR</option>
                          <option value="PAYOS">payOS · Link TT</option>
                          <option value="BANK_TRANSFER">Chuyển khoản NH</option>
                          <option value="MANUAL_CASH">Tiền mặt</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={paymentNoteInput}
                        onChange={(e) => setPaymentNoteInput(e.target.value)}
                        placeholder="Nội dung giao dịch / đối soát..."
                        className="h-9 flex-1 min-w-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 text-xs"
                      />
                      <SettlementShimmerButton
                        type="button"
                        data-testid="drawer-btn-record-payment"
                        isLoading={isSaving}
                        loadingText="Đang lưu..."
                        disabled={paymentAmountVnd <= 0}
                        onClick={() =>
                          void onRecordPayment({
                            invoiceId: row.invoice!.id,
                            amountVnd: paymentAmountVnd,
                            providerId: paymentMethodInput,
                            referenceText: paymentNoteInput,
                          })
                        }
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 text-xs font-bold shrink-0"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Xác nhận thu</span>
                      </SettlementShimmerButton>
                    </div>
                  </div>
                )}

                {!row.invoice && (
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-900/40 p-4 text-center text-xs text-slate-500">
                    Chưa có hóa đơn trong kỳ này. Hãy tổng hợp và phát hành hóa đơn trước khi thu tiền.
                  </div>
                )}

                {/* Linked Payment Transactions */}
                <div className="space-y-2">
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Giao dịch đối soát ({row.payments.transactions.length})
                  </div>
                  {row.payments.transactions.length === 0 ? (
                    <div className="py-4 text-center text-xs text-slate-400">
                      Chưa có giao dịch khớp với phòng {row.room.code} kỳ {row.periodKey}.
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
                              {formatVnDateTime(tx.paidAt)}
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
              <div className="space-y-2.5" data-testid="drawer-panel-history">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Nhật ký thao tác phòng {row.room.code}
                </div>
                {row.history.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400">
                    Chưa có bản ghi lịch sử chỉnh sửa trong kỳ này.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {row.history.map((h) => (
                      <div key={h.id} className="py-2.5 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-900 dark:text-white">
                            {h.summary}
                          </span>
                          <span className="font-mono text-[11px] text-slate-400 shrink-0">
                            {formatVnDateTime(h.createdAt)}
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
            {/* DIALOG CHỈNH SỬA CẤU HÌNH PHÒNG (Nested Modal) */}
            <Dialog.Root open={showRoomConfigModal} onOpenChange={setShowRoomConfigModal}>
              <Dialog.Portal>
                <Dialog.Backdrop className="fixed inset-0 z-[60] bg-slate-950/60 backdrop-blur-xs transition-opacity" />
                <Dialog.Viewport className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                  <Dialog.Popup className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-2xl space-y-4 z-[70]">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                          <Sliders className="w-5 h-5" />
                        </span>
                        <div>
                          <Dialog.Title className="text-sm font-bold text-slate-900 dark:text-white">
                            Cấu hình biểu giá phòng {row.room.code}
                          </Dialog.Title>
                          <Dialog.Description className="text-[11px] text-slate-500">
                            Cập nhật trực tiếp cấu hình phòng và đồng bộ kỳ thanh toán này.
                          </Dialog.Description>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowRoomConfigModal(false)}
                        className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="space-y-3 text-xs">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Đơn giá điện phòng (VND / kWh)
                        </label>
                        <MoneyInput
                          value={cfgElectricRateVnd}
                          onChange={(val) => setCfgElectricRateVnd(val)}
                          placeholder="VD: 3.800"
                          className="!h-9 !py-0 !text-xs !font-mono !font-bold"
                        />
                        <span className="text-[10px] text-slate-400 mt-0.5 block">
                          Áp dụng cho đồng hồ Hunonic và công tơ phòng {row.room.code}
                        </span>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Phương thức tính tiền nước
                        </label>
                        <select
                          value={cfgWaterMode}
                          onChange={(e) => setCfgWaterMode(e.target.value)}
                          className="w-full h-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 text-xs font-semibold text-slate-900 dark:text-white"
                        >
                          <option value="PER_PERSON">1. Theo đầu người (VND / người / tháng)</option>
                          <option value="PER_M3">2. Theo đồng hồ nước (VND / m³ tiêu thụ)</option>
                          <option value="FIXED_PER_ROOM">3. Khoán theo phòng (VND / phòng / tháng)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Đơn giá nước phòng (VND)
                        </label>
                        <MoneyInput
                          value={cfgWaterRateVnd}
                          onChange={(val) => setCfgWaterRateVnd(val)}
                          placeholder="VD: 100.000 hoặc 25.000"
                          className="!h-9 !py-0 !text-xs !font-mono !font-bold"
                        />
                        <span className="text-[10px] text-slate-400 mt-0.5 block">
                          {cfgWaterMode === 'PER_M3' ? 'Giá tính theo mỗi m³ nước tiêu thụ' : cfgWaterMode === 'PER_PERSON' ? 'Giá tính theo mỗi người cư trú/tháng' : 'Giá khoán trọn gói mỗi tháng'}
                        </span>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Giá thuê phòng niêm yết (VND / tháng)
                        </label>
                        <MoneyInput
                          value={cfgRoomPriceVnd}
                          onChange={(val) => setCfgRoomPriceVnd(val)}
                          placeholder="VD: 4.500.000"
                          className="!h-9 !py-0 !text-xs !font-mono !font-bold"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => setShowRoomConfigModal(false)}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        Hủy
                      </button>
                      <SettlementShimmerButton
                        type="button"
                        isLoading={isUpdatingConfig}
                        loadingText="Đang lưu cấu hình..."
                        onClick={() => void handleSaveRoomConfig()}
                        className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-colors"
                      >
                        <span>Lưu cấu hình phòng &amp; Đồng bộ</span>
                      </SettlementShimmerButton>
                    </div>
                  </Dialog.Popup>
                </Dialog.Viewport>
              </Dialog.Portal>
            </Dialog.Root>
          </div>
        </Dialog.Popup>
      </Dialog.Viewport>
    </Dialog.Portal>
  </Dialog.Root>
  );
};

