import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  DollarSign,
  Droplets,
  Loader2,
  Plus,
  Receipt,
  RefreshCw,
  Trash2,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { MoneyInput, formatVnd } from '@/shared/ui/MoneyInput';
import { DateInput } from '@/shared/ui/DateInput';
import { CONSOLE_CSRF_HEADER } from '@/app/providers/AuthContext';
import { type ContractListItem } from '../ContractsWorkspaceView';

export interface ContractLiquidationModalProps {
  isOpen: boolean;
  contract: ContractListItem;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

interface DamageOrFeeItem {
  id: string;
  name: string;
  amountVnd: number;
  note?: string;
}

const COMMON_DAMAGE_PRESETS = [
  { name: 'Vệ sinh phòng', amountVnd: 200000 },
  { name: 'Bồi thường hỏng rèm/tường', amountVnd: 500000 },
  { name: 'Mất chìa khóa / thẻ từ', amountVnd: 100000 },
  { name: 'Sơn sửa lại tường', amountVnd: 300000 },
  { name: 'Hỏng hóc thiết bị điện', amountVnd: 400000 },
];

export const ContractLiquidationModal: React.FC<ContractLiquidationModalProps> = ({
  isOpen,
  contract,
  onClose,
  onSuccess,
}) => {
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Basic liquidation info
  const [liquidationDate, setLiquidationDate] = useState<string>(todayIso);
  const [reason, setReason] = useState<string>('Hết hạn hợp đồng');
  const [roomNextStatus, setRoomNextStatus] = useState<'AVAILABLE' | 'MAINTENANCE'>('AVAILABLE');

  // Contract Deposit
  const [depositVnd, setDepositVnd] = useState<number>(() => {
    return Number(
      (contract.collectedDepositVnd && contract.collectedDepositVnd > 0
        ? contract.collectedDepositVnd
        : contract.depositVnd) || 0
    );
  });

  // 1. Room rent
  const [roomRentVnd, setRoomRentVnd] = useState<number>(0);
  const [roomRentNote, setRoomRentNote] = useState<string>('');

  // 2. Electricity
  const [electricStartKwh, setElectricStartKwh] = useState<string>(
    contract.handoverMeterKwh != null ? String(contract.handoverMeterKwh) : '0'
  );
  const [electricEndKwh, setElectricEndKwh] = useState<string>(
    contract.handoverMeterKwh != null ? String(contract.handoverMeterKwh) : '0'
  );
  const [electricRateVnd, setElectricRateVnd] = useState<number>(
    contract.electricRateVnd || 3800
  );
  const [meterInfo, setMeterInfo] = useState<{
    method: 'HUNONIC_AUTO' | 'MANUAL';
    serialNumber?: string;
    connectionStatus?: string;
  } | null>(null);
  const [isSyncingElectric, setIsSyncingElectric] = useState<boolean>(false);

  // 3. Water
  const [waterMode, setWaterMode] = useState<'PER_PERSON' | 'PER_M3' | 'FIXED'>(() => {
    if (contract.waterBillingMethod === 'PER_M3') return 'PER_M3';
    if (contract.waterBillingMethod === 'FIXED_PER_ROOM') return 'FIXED';
    return 'PER_PERSON';
  });
  const [waterRateVnd, setWaterRateVnd] = useState<number>(contract.waterRateVnd || 100000);
  const [waterOccupants, setWaterOccupants] = useState<number>(contract.occupantsCount || 1);
  const [waterStartM3, setWaterStartM3] = useState<string>(
    contract.handoverWaterM3 != null ? String(contract.handoverWaterM3) : '0'
  );
  const [waterEndM3, setWaterEndM3] = useState<string>(
    contract.handoverWaterM3 != null ? String(contract.handoverWaterM3) : '0'
  );
  const [waterManualOverride, setWaterManualOverride] = useState<boolean>(false);
  const [waterManualAmountVnd, setWaterManualAmountVnd] = useState<number>(0);

  // 4. Damages & Extra Fees
  const [damagesAndFees, setDamagesAndFees] = useState<DamageOrFeeItem[]>([]);
  const [newFeeName, setNewFeeName] = useState<string>('');
  const [newFeeAmount, setNewFeeAmount] = useState<number>(0);

  // 5. Actions
  const [createExpenseVoucher, setCreateExpenseVoucher] = useState<boolean>(true);
  const [refundPaymentMethod, setRefundPaymentMethod] = useState<'TRANSFER' | 'CASH'>('TRANSFER');
  const [refundRecipientInfo, setRefundRecipientInfo] = useState<string>(
    `${contract.tenantName} - ${contract.tenantPhone}`
  );
  const [createAdditionalInvoice, setCreateAdditionalInvoice] = useState<boolean>(true);
  const [additionalInvoiceDueDate, setAdditionalInvoiceDueDate] = useState<string>(todayIso);

  // Execution states
  const [isLoadingPreview, setIsLoadingPreview] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Load preview data from backend
  const loadPreview = useCallback(async () => {
    setIsLoadingPreview(true);
    try {
      const res = await fetch(
        `/api/v1/console/v2/contracts/${encodeURIComponent(contract.id)}/liquidation-preview`,
        {
          credentials: 'include',
          headers: { 'X-Requested-With': CONSOLE_CSRF_HEADER },
        }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        if (data.contract?.depositVnd) {
          setDepositVnd(Number(data.contract.depositVnd));
        }
        if (data.contract?.electricRateVnd) {
          setElectricRateVnd(Number(data.contract.electricRateVnd));
        }
        if (data.contract?.waterRateVnd) {
          setWaterRateVnd(Number(data.contract.waterRateVnd));
        }
        if (data.contract?.occupantsCount) {
          setWaterOccupants(Number(data.contract.occupantsCount));
        }
        if (data.electricMeter) {
          setMeterInfo({
            method: data.electricMeter.method,
            serialNumber: data.electricMeter.serialNumber,
            connectionStatus: data.electricMeter.connectionStatus,
          });
          if (data.electricMeter.suggestedStartKwh != null) {
            setElectricStartKwh(String(data.electricMeter.suggestedStartKwh));
          }
          if (data.electricMeter.suggestedEndKwh != null) {
            setElectricEndKwh(String(data.electricMeter.suggestedEndKwh));
          }
        }
      }
    } catch {
      // Non-fatal, fallback to contract defaults
    } finally {
      setIsLoadingPreview(false);
    }
  }, [contract.id]);

  useEffect(() => {
    if (isOpen) {
      void loadPreview();
    }
  }, [isOpen, loadPreview]);

  // Sync Hunonic meter in real-time
  const handleSyncHunonic = async () => {
    if (isSyncingElectric) return;
    setIsSyncingElectric(true);
    try {
      const res = await fetch(
        `/api/v1/console/v2/hunonic/sync?roomId=${encodeURIComponent(contract.roomId)}`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'X-Requested-With': CONSOLE_CSRF_HEADER },
        }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        // Re-fetch preview to get latest readings
        await loadPreview();
      }
    } catch {
      // Non-fatal
    } finally {
      setIsSyncingElectric(false);
    }
  };

  // Calculations
  const electricKwh = useMemo(() => {
    const s = parseFloat(electricStartKwh) || 0;
    const e = parseFloat(electricEndKwh) || 0;
    return Math.max(0, Number((e - s).toFixed(2)));
  }, [electricStartKwh, electricEndKwh]);

  const electricAmountVnd = useMemo(() => {
    return Math.round(electricKwh * electricRateVnd);
  }, [electricKwh, electricRateVnd]);

  const waterUsageM3 = useMemo(() => {
    if (waterMode !== 'PER_M3') return 0;
    const s = parseFloat(waterStartM3) || 0;
    const e = parseFloat(waterEndM3) || 0;
    return Math.max(0, Number((e - s).toFixed(2)));
  }, [waterMode, waterStartM3, waterEndM3]);

  const waterAmountVnd = useMemo(() => {
    if (waterManualOverride) return waterManualAmountVnd;
    if (waterMode === 'PER_PERSON') {
      return Math.round(waterOccupants * waterRateVnd);
    }
    if (waterMode === 'PER_M3') {
      return Math.round(waterUsageM3 * waterRateVnd);
    }
    return waterRateVnd; // FIXED
  }, [waterManualOverride, waterManualAmountVnd, waterMode, waterOccupants, waterRateVnd, waterUsageM3]);

  const totalDamagesVnd = useMemo(() => {
    return damagesAndFees.reduce((acc, f) => acc + (f.amountVnd || 0), 0);
  }, [damagesAndFees]);

  const totalDeductionVnd = useMemo(() => {
    return roomRentVnd + electricAmountVnd + waterAmountVnd + totalDamagesVnd;
  }, [roomRentVnd, electricAmountVnd, waterAmountVnd, totalDamagesVnd]);

  // Difference: deposit - totalDeductions
  // > 0: Refund to tenant
  // < 0: Collect more from tenant
  const settlementDifferenceVnd = useMemo(() => {
    return depositVnd - totalDeductionVnd;
  }, [depositVnd, totalDeductionVnd]);

  const handleAddFeeItem = () => {
    if (!newFeeName.trim() || newFeeAmount <= 0) return;
    const newItem: DamageOrFeeItem = {
      id: `fee-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: newFeeName.trim(),
      amountVnd: newFeeAmount,
    };
    setDamagesAndFees((prev) => [...prev, newItem]);
    setNewFeeName('');
    setNewFeeAmount(0);
  };

  const handleApplyPreset = (preset: { name: string; amountVnd: number }) => {
    const newItem: DamageOrFeeItem = {
      id: `fee-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: preset.name,
      amountVnd: preset.amountVnd,
    };
    setDamagesAndFees((prev) => [...prev, newItem]);
  };

  const handleRemoveFeeItem = (id: string) => {
    setDamagesAndFees((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMsg(null);

    try {
      const payload = {
        reason: reason.trim(),
        roomNextStatus,
        liquidationDate,
        depositVnd,
        roomRentVnd,
        roomRentNote: roomRentVnd > 0 ? roomRentNote.trim() : '',
        electric: {
          startKwh: parseFloat(electricStartKwh) || 0,
          endKwh: parseFloat(electricEndKwh) || 0,
          consumptionKwh: electricKwh,
          ratePerKwhVnd: electricRateVnd,
          amountVnd: electricAmountVnd,
        },
        water: {
          mode: waterMode,
          startM3: waterMode === 'PER_M3' ? parseFloat(waterStartM3) || 0 : null,
          endM3: waterMode === 'PER_M3' ? parseFloat(waterEndM3) || 0 : null,
          consumptionM3: waterMode === 'PER_M3' ? waterUsageM3 : null,
          occupantsCount: waterMode === 'PER_PERSON' ? waterOccupants : null,
          unitRateVnd: waterRateVnd,
          amountVnd: waterAmountVnd,
        },
        damagesAndFees,
        totalDeductionVnd,
        settlementDifferenceVnd,
        refundAction:
          settlementDifferenceVnd > 0
            ? {
                createExpenseVoucher,
                paymentMethod: refundPaymentMethod,
                recipientInfo: refundRecipientInfo.trim(),
              }
            : undefined,
        additionalCollectionAction:
          settlementDifferenceVnd < 0
            ? {
                createInvoice: createAdditionalInvoice,
                dueDate: additionalInvoiceDueDate,
              }
            : undefined,
      };

      const res = await fetch(
        `/api/v1/console/v2/contracts/${encodeURIComponent(contract.id)}/terminate`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': CONSOLE_CSRF_HEADER,
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setErrorMsg(data.message || 'Không thể thực hiện thanh lý hợp đồng.');
        return;
      }

      await onSuccess();
      onClose();
    } catch {
      setErrorMsg('Lỗi kết nối máy chủ. Vui lòng kiểm tra lại đường truyền.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl max-h-[92vh] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/60 dark:bg-slate-900/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-100 dark:bg-rose-950/70 border border-rose-200 dark:border-rose-900/60 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  Thanh lý &amp; Quyết toán hợp đồng
                </h3>
                <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  {contract.roomCode}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                HĐ: <strong className="font-mono text-slate-700 dark:text-slate-300">{contract.contractCode}</strong> · Khách: <strong>{contract.tenantName}</strong> ({contract.tenantPhone})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          {errorMsg && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* 1. THỜI GIAN & TIỀN CỌC HIỆN GIỮ */}
          <section className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-3.5 border border-slate-200/80 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                1. Ngày thanh lý &amp; Tiền cọc giữ
              </h4>
              {isLoadingPreview && (
                <span className="text-[11px] text-blue-600 dark:text-blue-400 flex items-center gap-1 animate-pulse">
                  <Loader2 className="w-3 h-3 animate-spin" /> Đang tải dữ liệu...
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-600 dark:text-slate-300 font-semibold mb-1">
                  Ngày thanh lý / Trả phòng *
                </label>
                <DateInput
                  value={liquidationDate}
                  onChange={(val) => {
                    setLiquidationDate(val);
                    setAdditionalInvoiceDueDate(val);
                  }}
                  className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold"
                  required
                />
              </div>
              <div>
                <label className="block text-slate-600 dark:text-slate-300 font-semibold mb-1">
                  Tiền cọc hợp đồng hiện giữ (₫)
                </label>
                <MoneyInput
                  value={depositVnd}
                  onChange={(val) => setDepositVnd(val)}
                  className="!h-9 !text-xs !font-mono !font-bold text-emerald-600 dark:text-emerald-400"
                />
                <span className="block mt-0.5 text-[10.5px] text-slate-400">
                  Số cọc thực tế đã thu được dùng để cấn trừ thanh lý
                </span>
              </div>
            </div>
          </section>

          {/* 2. CÁC KHOẢN CHI PHÍ PHÁT SINH TỚI NGÀY THANH LÝ */}
          <section className="border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-4">
            <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Receipt className="w-3.5 h-3.5 text-amber-600" />
              2. Các khoản chi phí khấu trừ đến ngày thanh lý
            </h4>

            {/* 2.1 Tiền phòng (Mặc định 0 đ) */}
            <div className="p-3 bg-slate-50/80 dark:bg-slate-800/50 rounded-lg border border-slate-200/60 dark:border-slate-700/60 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    Tiền phòng phát sinh
                  </span>
                  <span className="ml-1.5 text-[11px] text-slate-400">
                    (Mặc định 0 ₫ nếu đã thu đủ theo kỳ)
                  </span>
                </div>
                <div className="w-44">
                  <MoneyInput
                    value={roomRentVnd}
                    onChange={(val) => setRoomRentVnd(val)}
                    placeholder="0 ₫"
                    className="!h-8 !text-xs !font-mono !font-semibold"
                  />
                </div>
              </div>
              {roomRentVnd > 0 && (
                <div className="pt-1">
                  <input
                    type="text"
                    value={roomRentNote}
                    onChange={(e) => setRoomRentNote(e.target.value)}
                    placeholder="Lý do tính tiền phòng (VD: Khách ở lố 3 ngày, Phạt vi phạm...)"
                    className="w-full h-8 px-2.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  />
                </div>
              )}
            </div>

            {/* 2.2 Tiền điện */}
            <div className="p-3 bg-slate-50/80 dark:bg-slate-800/50 rounded-lg border border-slate-200/60 dark:border-slate-700/60 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  <span className="font-semibold text-slate-900 dark:text-white">
                    Tiền điện chốt ngày thanh lý
                  </span>
                  {meterInfo?.method === 'HUNONIC_AUTO' && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                      Hunonic tự động
                    </span>
                  )}
                </div>
                {meterInfo?.method === 'HUNONIC_AUTO' && (
                  <button
                    type="button"
                    disabled={isSyncingElectric}
                    onClick={handleSyncHunonic}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                  >
                    <RefreshCw className={`w-3 h-3 ${isSyncingElectric ? 'animate-spin' : ''}`} />
                    {isSyncingElectric ? 'Đang đồng bộ...' : 'Đồng bộ từ Hunonic'}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div>
                  <label className="block text-slate-500 text-[11px] mb-1">Chỉ số đầu (kWh)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={electricStartKwh}
                    onChange={(e) => setElectricStartKwh(e.target.value)}
                    className="w-full h-8 px-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 text-[11px] mb-1">Chỉ số chốt (kWh)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={electricEndKwh}
                    onChange={(e) => setElectricEndKwh(e.target.value)}
                    className="w-full h-8 px-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 text-[11px] mb-1">Đơn giá (₫/kWh)</label>
                  <MoneyInput
                    value={electricRateVnd}
                    onChange={(val) => setElectricRateVnd(val)}
                    className="!h-8 !text-xs !font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 text-[11px] mb-1">Thành tiền điện</label>
                  <div className="h-8 px-2 rounded border border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800/80 font-mono text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-end">
                    {formatVnd(electricAmountVnd)}
                  </div>
                </div>
              </div>
              <div className="text-[11px] text-slate-500 flex justify-between">
                <span>Tiêu thụ: <strong className="font-mono text-slate-700 dark:text-slate-300">{electricKwh} kWh</strong></span>
                <span>Công thức: {electricKwh} kWh × {formatVnd(electricRateVnd)} = <strong className="font-mono text-slate-800 dark:text-slate-200">{formatVnd(electricAmountVnd)}</strong></span>
              </div>
            </div>

            {/* 2.3 Tiền nước */}
            <div className="p-3 bg-slate-50/80 dark:bg-slate-800/50 rounded-lg border border-slate-200/60 dark:border-slate-700/60 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Droplets className="w-3.5 h-3.5 text-cyan-500" />
                  <span className="font-semibold text-slate-900 dark:text-white">
                    Tiền nước chốt thanh lý
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-slate-500 cursor-pointer flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={waterManualOverride}
                      onChange={(e) => setWaterManualOverride(e.target.checked)}
                      className="rounded"
                    />
                    Nhập tay số tiền
                  </label>
                </div>
              </div>

              {!waterManualOverride ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <div>
                    <label className="block text-slate-500 text-[11px] mb-1">Hình thức tính</label>
                    <select
                      value={waterMode}
                      onChange={(e) => setWaterMode(e.target.value as any)}
                      className="w-full h-8 px-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold"
                    >
                      <option value="PER_PERSON">Theo đầu người</option>
                      <option value="PER_M3">Theo đồng hồ (m³)</option>
                      <option value="FIXED">Khoán theo phòng</option>
                    </select>
                  </div>

                  {waterMode === 'PER_PERSON' && (
                    <>
                      <div>
                        <label className="block text-slate-500 text-[11px] mb-1">Số nhân khẩu</label>
                        <input
                          type="number"
                          min="1"
                          value={waterOccupants}
                          onChange={(e) => setWaterOccupants(Math.max(1, parseInt(e.target.value, 10) || 1))}
                          className="w-full h-8 px-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-500 text-[11px] mb-1">Đơn giá (₫/người)</label>
                        <MoneyInput
                          value={waterRateVnd}
                          onChange={(val) => setWaterRateVnd(val)}
                          className="!h-8 !text-xs !font-mono"
                        />
                      </div>
                    </>
                  )}

                  {waterMode === 'PER_M3' && (
                    <>
                      <div>
                        <label className="block text-slate-500 text-[11px] mb-1">Số khối tiêu thụ (m³)</label>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="0.1"
                            value={waterStartM3}
                            onChange={(e) => setWaterStartM3(e.target.value)}
                            placeholder="Đầu"
                            className="w-1/2 h-8 px-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs"
                          />
                          <input
                            type="number"
                            step="0.1"
                            value={waterEndM3}
                            onChange={(e) => setWaterEndM3(e.target.value)}
                            placeholder="Cuối"
                            className="w-1/2 h-8 px-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs font-semibold"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-slate-500 text-[11px] mb-1">Đơn giá (₫/m³)</label>
                        <MoneyInput
                          value={waterRateVnd}
                          onChange={(val) => setWaterRateVnd(val)}
                          className="!h-8 !text-xs !font-mono"
                        />
                      </div>
                    </>
                  )}

                  {waterMode === 'FIXED' && (
                    <div className="sm:col-span-2">
                      <label className="block text-slate-500 text-[11px] mb-1">Đơn giá khoán (₫)</label>
                      <MoneyInput
                        value={waterRateVnd}
                        onChange={(val) => setWaterRateVnd(val)}
                        className="!h-8 !text-xs !font-mono"
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <label className="block text-slate-500 text-[11px] mb-1">Số tiền nước thanh lý (₫)</label>
                  <MoneyInput
                    value={waterManualAmountVnd}
                    onChange={(val) => setWaterManualAmountVnd(val)}
                    className="!h-8 !text-xs !font-mono font-bold"
                  />
                </div>
              )}

              <div className="text-[11px] text-slate-500 flex justify-between items-center pt-1 border-t border-slate-200/50 dark:border-slate-700/50">
                <span>
                  {waterMode === 'PER_PERSON'
                    ? `${waterOccupants} người × ${formatVnd(waterRateVnd)}`
                    : waterMode === 'PER_M3'
                    ? `${waterUsageM3} m³ × ${formatVnd(waterRateVnd)}`
                    : 'Khoán phòng'}
                </span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  Thành tiền: {formatVnd(waterAmountVnd)}
                </span>
              </div>
            </div>

            {/* 2.4 Chi phí phát sinh & Bồi thường hư hao */}
            <div className="p-3 bg-slate-50/80 dark:bg-slate-800/50 rounded-lg border border-slate-200/60 dark:border-slate-700/60 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wrench className="w-3.5 h-3.5 text-rose-500" />
                  <span className="font-semibold text-slate-900 dark:text-white">
                    Chi phí phát sinh &amp; Bồi thường hư hao
                  </span>
                </div>
                <span className="font-mono text-xs font-bold text-rose-600 dark:text-rose-400">
                  Tổng: {formatVnd(totalDamagesVnd)}
                </span>
              </div>

              {/* Preset buttons */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10.5px] text-slate-400">Gợi ý nhanh:</span>
                {COMMON_DAMAGE_PRESETS.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => handleApplyPreset(p)}
                    className="px-2 py-0.5 rounded-full bg-slate-200/70 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-[10.5px] font-medium transition-colors"
                  >
                    + {p.name} ({Math.round(p.amountVnd / 1000)}k)
                  </button>
                ))}
              </div>

              {/* Items List */}
              {damagesAndFees.length > 0 && (
                <div className="divide-y divide-slate-200/60 dark:divide-slate-700/60 border border-slate-200/80 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-900">
                  {damagesAndFees.map((item) => (
                    <div key={item.id} className="p-2 flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-slate-800 dark:text-slate-200 flex-1 min-w-0 truncate">
                        {item.name}
                      </span>
                      <span className="font-mono font-semibold text-rose-600 dark:text-rose-400 shrink-0">
                        {formatVnd(item.amountVnd)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveFeeItem(item.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded"
                        title="Xóa dòng"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add custom item */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  placeholder="Tên khoản mục hư hao / phát sinh..."
                  value={newFeeName}
                  onChange={(e) => setNewFeeName(e.target.value)}
                  className="flex-1 h-8 px-2.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                />
                <div className="w-36">
                  <MoneyInput
                    placeholder="Số tiền..."
                    value={newFeeAmount}
                    onChange={(val) => setNewFeeAmount(val)}
                    className="!h-8 !text-xs !font-mono"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddFeeItem}
                  disabled={!newFeeName.trim() || newFeeAmount <= 0}
                  className="h-8 px-3 rounded bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-semibold text-xs flex items-center gap-1 disabled:opacity-40 shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Thêm</span>
                </button>
              </div>
            </div>
          </section>

          {/* 3. BẢNG TỔNG HỢP QUYẾT TOÁN & ĐỐI SOÁT CỌC */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3 bg-slate-50/50 dark:bg-slate-900/40">
            <h4 className="font-bold text-slate-900 dark:text-white flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-emerald-600" />
                3. Bảng tổng hợp đối soát cọc &amp; quyết toán
              </span>
            </h4>

            {/* Financial math breakdown */}
            <div className="bg-white dark:bg-slate-900 rounded-lg p-3 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
                <span>(+) Tiền cọc hợp đồng hiện giữ:</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">
                  {formatVnd(depositVnd)}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
                <span>(-) Tiền phòng phát sinh:</span>
                <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                  {formatVnd(roomRentVnd)}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
                <span>(-) Tiền điện chốt thanh lý ({electricKwh} kWh):</span>
                <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                  {formatVnd(electricAmountVnd)}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
                <span>(-) Tiền nước chốt thanh lý:</span>
                <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                  {formatVnd(waterAmountVnd)}
                </span>
              </div>
              {totalDamagesVnd > 0 && (
                <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
                  <span>(-) Chi phí hư hao &amp; phát sinh:</span>
                  <span className="font-mono font-medium text-rose-600 dark:text-rose-400">
                    {formatVnd(totalDamagesVnd)}
                  </span>
                </div>
              )}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center font-semibold">
                <span className="text-slate-800 dark:text-slate-200">Tổng chi phí khấu trừ:</span>
                <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                  {formatVnd(totalDeductionVnd)}
                </span>
              </div>
            </div>

            {/* RESULT CARD & ACTION SELECTION */}
            {settlementDifferenceVnd > 0 ? (
              /* TRƯỜNG HỢP DƯ TIỀN CỌC -> HOÀN CỌC */
              <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ArrowDownRight className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div>
                      <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                        Số tiền dư hoàn lại cho khách
                      </div>
                      <div className="text-lg font-mono font-extrabold text-emerald-700 dark:text-emerald-300">
                        +{formatVnd(settlementDifferenceVnd)}
                      </div>
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60">
                    Dư cọc
                  </span>
                </div>

                <div className="pt-2 border-t border-emerald-200/60 dark:border-emerald-900/40 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-800 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={createExpenseVoucher}
                      onChange={(e) => setCreateExpenseVoucher(e.target.checked)}
                      className="rounded text-emerald-600"
                    />
                    <span>Tạo hóa đơn chi / phiếu chi hoàn tiền cọc (Ghi nhận sổ quỹ)</span>
                  </label>

                  {createExpenseVoucher && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-6">
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-0.5">Hình thức hoàn tiền</label>
                        <select
                          value={refundPaymentMethod}
                          onChange={(e) => setRefundPaymentMethod(e.target.value as any)}
                          className="w-full h-8 px-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold"
                        >
                          <option value="TRANSFER">Chuyển khoản (VietQR / Banking)</option>
                          <option value="CASH">Tiền mặt</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-0.5">Thông tin nhận tiền của khách</label>
                        <input
                          type="text"
                          value={refundRecipientInfo}
                          onChange={(e) => setRefundRecipientInfo(e.target.value)}
                          placeholder="Số TK, Ngân hàng, Tên người nhận..."
                          className="w-full h-8 px-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : settlementDifferenceVnd < 0 ? (
              /* TRƯỜNG HỢP THIẾU TIỀN -> KHÁCH CẦN NỘP THÊM */
              <div className="p-3.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ArrowUpRight className="w-5 h-5 text-rose-600 shrink-0" />
                    <div>
                      <div className="text-[11px] font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wider">
                        Khách cần thanh toán thêm (Thiếu)
                      </div>
                      <div className="text-lg font-mono font-extrabold text-rose-700 dark:text-rose-300">
                        {formatVnd(Math.abs(settlementDifferenceVnd))}
                      </div>
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold text-rose-700 dark:text-rose-300 px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/60">
                    Phát sinh thu thêm
                  </span>
                </div>

                <div className="pt-2 border-t border-rose-200/60 dark:border-rose-900/40 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-800 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={createAdditionalInvoice}
                      onChange={(e) => setCreateAdditionalInvoice(e.target.checked)}
                      className="rounded text-rose-600"
                    />
                    <span>Tạo hóa đơn thu thêm cho khách (Gửi mã VietQR thanh toán)</span>
                  </label>

                  {createAdditionalInvoice && (
                    <div className="pl-6">
                      <label className="block text-[11px] text-slate-500 mb-0.5">Hạn thanh toán</label>
                      <DateInput
                        value={additionalInvoiceDueDate}
                        onChange={setAdditionalInvoiceDueDate}
                        className="h-8 px-2.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold"
                      />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* TRƯỜNG HỢP QUYẾT TOÁN CÂN BẰNG 0 Đ */
              <div className="p-3.5 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/70 dark:bg-blue-950/30 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0" />
                  <div>
                    <div className="font-bold text-blue-800 dark:text-blue-300">
                      Quyết toán cân bằng (0 ₫)
                    </div>
                    <div className="text-[11px] text-blue-600 dark:text-blue-400">
                      Tiền cọc cấn trừ vừa đủ các chi phí phát sinh — Không hoàn, không thu thêm.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* 4. LÝ DO THANH LÝ & TRẠNG THÁI PHÒNG SAU THANH LÝ */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-slate-600 dark:text-slate-300 font-semibold mb-1">
                Lý do thanh lý *
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold"
              >
                <option value="Hết hạn hợp đồng">Hết hạn hợp đồng</option>
                <option value="Khách trả phòng trước hạn (Thỏa thuận)">Khách trả phòng trước hạn (Thỏa thuận)</option>
                <option value="Khách đơn phương chấm dứt">Khách đơn phương chấm dứt</option>
                <option value="Bên cho thuê chấm dứt do vi phạm">Bên cho thuê chấm dứt do vi phạm</option>
                <option value="Chuyển sang phòng khác">Chuyển sang phòng khác</option>
                <option value="Khác">Lý do khác</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-600 dark:text-slate-300 font-semibold mb-1">
                Trạng thái phòng sau thanh lý *
              </label>
              <select
                value={roomNextStatus}
                onChange={(e) => setRoomNextStatus(e.target.value as any)}
                className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold"
              >
                <option value="AVAILABLE">Phòng trống sẵn sàng (AVAILABLE)</option>
                <option value="MAINTENANCE">Cần dọn dẹp / Bảo trì (MAINTENANCE)</option>
              </select>
            </div>
          </section>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 text-xs font-bold bg-rose-600 hover:bg-rose-700 active:scale-98 text-white rounded-xl shadow-xs flex items-center gap-2 transition-all disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Đang xử lý thanh lý...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Xác nhận thanh lý &amp; Quyết toán cọc</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
