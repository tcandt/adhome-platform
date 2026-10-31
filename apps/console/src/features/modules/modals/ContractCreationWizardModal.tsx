import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  ChevronRight,
  ChevronLeft,
  Building2,
  Home,
  User,
  UserCheck,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  FileSignature,
  Wallet,
  Receipt,
  Search,
  Sparkles,
} from 'lucide-react';
import { usePortfolio } from '../../../app/providers/PortfolioContext';
import { ConsoleRoomDto, ConsoleTenantDto } from '../../../shared/types/portfolio';
import { MoneyInput } from '../../../shared/ui/MoneyInput';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  preselectedRoomId?: string | null;
  preselectedReservationId?: string | null;
  onSuccess: () => Promise<void>;
}

interface CoOccupantItem {
  fullName: string;
  phone: string;
  idNumber: string;
  relationToPrimary: 'FAMILY' | 'ROOMMATE' | 'OTHER';
}

function getTodayIsoVn(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function computeEndDateIsoVn(startIso: string, durationMonths: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startIso)) return '';
  const [y, m, d] = startIso.split('-').map(Number);
  const target = new Date(y, m - 1 + durationMonths, d);
  target.setDate(target.getDate() - 1);
  const ty = target.getFullYear();
  const tm = String(target.getMonth() + 1).padStart(2, '0');
  const td = String(target.getDate()).padStart(2, '0');
  return `${ty}-${tm}-${td}`;
}

export const ContractCreationWizardModal: React.FC<Props> = ({
  isOpen,
  onClose,
  preselectedRoomId,
  preselectedReservationId,
  onSuccess,
}) => {
  const { rooms, tenants, refreshPortfolio } = usePortfolio();

  const [step, setStep] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Step 1: Room & Rental Model
  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  const [rentalModel, setRentalModel] = useState<'ENTIRE_ROOM' | 'SHARED_ROOM'>('ENTIRE_ROOM');

  // Step 2: Customer / Primary Tenant
  const [customerMode, setCustomerMode] = useState<'SELECT' | 'CREATE'>('SELECT');
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [tenantSearchQuery, setTenantSearchQuery] = useState<string>('');
  const [newCustName, setNewCustName] = useState<string>('');
  const [newCustPhone, setNewCustPhone] = useState<string>('');
  const [newCustIdNumber, setNewCustIdNumber] = useState<string>('');
  const [newCustEmail, setNewCustEmail] = useState<string>('');

  // Step 3: Reservation Hold
  const [includeReservation, setIncludeReservation] = useState<boolean>(true);
  const [holdAmountVnd, setHoldAmountVnd] = useState<number>(2000000);
  const [holdDays, setHoldDays] = useState<number>(7);
  const [isPaymentConfirmed, setIsPaymentConfirmed] = useState<boolean>(true);
  const [paymentMethod, setPaymentMethod] = useState<'BANK_TRANSFER' | 'CASH'>('BANK_TRANSFER');
  const [expectedMoveIn, setExpectedMoveIn] = useState<string>(() => getTodayIsoVn());

  // Step 4: Contract Terms & Occupants
  const [startDate, setStartDate] = useState<string>(() => getTodayIsoVn());
  const [durationMonths, setDurationMonths] = useState<number>(12);
  const [endDate, setEndDate] = useState<string>(() => computeEndDateIsoVn(getTodayIsoVn(), 12));
  const [monthlyRentVnd, setMonthlyRentVnd] = useState<number>(4500000);
  const [requiredDepositVnd, setRequiredDepositVnd] = useState<number>(4500000);
  const [firstPeriodBillingPolicy, setFirstPeriodBillingPolicy] = useState<
    'CALENDAR_PRORATE' | 'ANNIVERSARY_CYCLE' | 'FULL_FIRST_MONTH'
  >('CALENDAR_PRORATE');
  const [coOccupants, setCoOccupants] = useState<CoOccupantItem[]>([]);

  // Step 5: Surplus handling
  const [surplusAction, setSurplusAction] = useState<'RENT_CREDIT' | 'REFUND'>('RENT_CREDIT');

  // Initialize from preselected room or reservation
  useEffect(() => {
    if (!isOpen) {
      setStep(1);
      setErrorMsg(null);
      return;
    }

    if (preselectedRoomId) {
      setSelectedRoomId(preselectedRoomId);
      const rm = rooms.find((r) => r.id === preselectedRoomId);
      if (rm) {
        setMonthlyRentVnd(rm.listPriceVnd);
        setRequiredDepositVnd(rm.listPriceVnd * (rm.depositMonths || 1));
        setRentalModel((rm.rentalModel as any) || 'ENTIRE_ROOM');
        if (rm.activeReservation) {
          setHoldAmountVnd(rm.activeReservation.holdAmountVnd);
          if (rm.activeReservation.expectedMoveIn) {
            setStartDate(rm.activeReservation.expectedMoveIn);
            setEndDate(computeEndDateIsoVn(rm.activeReservation.expectedMoveIn, durationMonths));
          }
        }
      }
    } else {
      const avail = rooms.find((r) => r.occupancyStatus === 'AVAILABLE') || rooms[0];
      if (avail) {
        setSelectedRoomId(avail.id);
        setMonthlyRentVnd(avail.listPriceVnd);
        setRequiredDepositVnd(avail.listPriceVnd * (avail.depositMonths || 1));
      }
    }
    if (tenants.length > 0 && !selectedTenantId) {
      setSelectedTenantId(tenants[0].id);
    }
  }, [isOpen, preselectedRoomId, rooms, tenants, selectedTenantId]);

  const selectedRoom = useMemo(
    () => rooms.find((r) => r.id === selectedRoomId) || null,
    [rooms, selectedRoomId]
  );

  const selectedTenant = useMemo(
    () => tenants.find((t) => t.id === selectedTenantId) || null,
    [tenants, selectedTenantId]
  );

  // Filtered tenants for search
  const filteredTenants = useMemo(() => {
    if (!tenantSearchQuery.trim()) return tenants.slice(0, 8);
    const q = tenantSearchQuery.toLowerCase();
    return tenants
      .filter(
        (t) =>
          t.fullName.toLowerCase().includes(q) ||
          t.phone.includes(q) ||
          (t.idNumber && t.idNumber.toLowerCase().includes(q))
      )
      .slice(0, 10);
  }, [tenants, tenantSearchQuery]);

  // Handle start date & duration changes
  const handleStartDateChange = (val: string) => {
    setStartDate(val);
    setEndDate(computeEndDateIsoVn(val, durationMonths));
  };

  const handleDurationChange = (months: number) => {
    setDurationMonths(months);
    setEndDate(computeEndDateIsoVn(startDate, months));
  };

  // Add co-occupant row
  const addCoOccupant = () => {
    setCoOccupants((prev) => [
      ...prev,
      { fullName: '', phone: '', idNumber: '', relationToPrimary: 'ROOMMATE' },
    ]);
  };

  const removeCoOccupant = (idx: number) => {
    setCoOccupants((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateCoOccupant = (idx: number, field: keyof CoOccupantItem, val: string) => {
    setCoOccupants((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [field]: val } : item))
    );
  };

  // C4-BILL-01 Prorate Calculation Engine for First Billing Period
  const firstRentCalc = useMemo(() => {
    if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      return {
        rentVnd: monthlyRentVnd,
        formula: `${monthlyRentVnd.toLocaleString('vi-VN')} đ/tháng`,
        billedDays: 30,
        daysInMonth: 30,
      };
    }
    const [y, m, d] = startDate.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    if (firstPeriodBillingPolicy === 'FULL_FIRST_MONTH') {
      return {
        rentVnd: monthlyRentVnd,
        formula: `Trọn tháng dương lịch ${y}-${String(m).padStart(2, '0')}: ${monthlyRentVnd.toLocaleString('vi-VN')} đ`,
        billedDays: daysInMonth,
        daysInMonth,
      };
    }
    if (firstPeriodBillingPolicy === 'ANNIVERSARY_CYCLE') {
      return {
        rentVnd: monthlyRentVnd,
        formula: `Chu kỳ tròn 1 tháng từ ${startDate}: ${monthlyRentVnd.toLocaleString('vi-VN')} đ`,
        billedDays: daysInMonth,
        daysInMonth,
      };
    }
    // CALENDAR_PRORATE
    const billedDays = daysInMonth - d + 1;
    const rentVnd =
      billedDays === daysInMonth
        ? monthlyRentVnd
        : Math.round((monthlyRentVnd * billedDays) / daysInMonth);
    return {
      rentVnd,
      formula:
        billedDays === daysInMonth
          ? `Trọn tháng (${billedDays}/${daysInMonth} ngày): ${monthlyRentVnd.toLocaleString('vi-VN')} đ`
          : `${monthlyRentVnd.toLocaleString('vi-VN')} đ × (${billedDays}/${daysInMonth} ngày: ${startDate} → ${y}-${String(m).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}) = ${rentVnd.toLocaleString('vi-VN')} đ`,
      billedDays,
      daysInMonth,
    };
  }, [startDate, monthlyRentVnd, firstPeriodBillingPolicy]);

  // Financial Transfer Math
  const financialSummary = useMemo(() => {
    const B = isPaymentConfirmed ? holdAmountVnd : 0;
    const C = requiredDepositVnd;
    const R = firstRentCalc.rentVnd;

    if (B <= C) {
      const transferredB = B;
      const additionalDeposit = C - B;
      const firstMonthRent = R;
      const totalDue = additionalDeposit + firstMonthRent;
      return {
        bookingDepositReceived: B,
        contractDepositRequired: C,
        transferredDeposit: transferredB,
        additionalDepositDue: additionalDeposit,
        firstMonthRentDue: firstMonthRent,
        surplusDeposit: 0,
        totalInitialDue: totalDue,
        surplusAction,
      };
    } else {
      const transferredB = C;
      const surplus = B - C;
      let firstMonthRent = R;
      if (surplusAction === 'RENT_CREDIT') {
        firstMonthRent = Math.max(0, R - surplus);
      }
      const totalDue = firstMonthRent;
      return {
        bookingDepositReceived: B,
        contractDepositRequired: C,
        transferredDeposit: transferredB,
        additionalDepositDue: 0,
        firstMonthRentDue: firstMonthRent,
        surplusDeposit: surplus,
        totalInitialDue: totalDue,
        surplusAction,
      };
    }
  }, [isPaymentConfirmed, holdAmountVnd, requiredDepositVnd, firstRentCalc, surplusAction]);

  // Termination at Step 3: Save as Reservation Only
  const handleSaveAsReservationOnly = async () => {
    if (!selectedRoom) return;
    setIsSubmitting(true);
    setErrorMsg(null);

    const custName =
      customerMode === 'CREATE' ? newCustName.trim() : selectedTenant?.fullName || '';
    const custPhone =
      customerMode === 'CREATE' ? newCustPhone.trim() : selectedTenant?.phone || '';

    if (!custName || !custPhone) {
      setErrorMsg('Vui lòng chọn hoặc nhập đầy đủ thông tin khách hàng.');
      setIsSubmitting(false);
      return;
    }

    try {
      const res = await fetch('/api/v1/console/v2/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: selectedRoom.id,
          customerName: custName,
          customerPhone: custPhone,
          holdAmountVnd,
          expectedMoveIn,
          holdDays,
          paymentConfirmed: isPaymentConfirmed,
          paymentMethod,
          notes: `Phiếu giữ chỗ tạo qua Wizard`,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.message || 'Không thể tạo phiếu giữ chỗ.');
        setIsSubmitting(false);
        return;
      }
      await refreshPortfolio();
      await onSuccess();
      onClose();
    } catch {
      setErrorMsg('Lỗi kết nối máy chủ.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Complete & Submit Contract Execution (Step 6)
  const handleSubmitContract = async () => {
    if (!selectedRoom) return;
    setIsSubmitting(true);
    setErrorMsg(null);

    let tenantIdToUse = selectedTenantId;

    try {
      // 1. If in create mode, create tenant profile first
      if (customerMode === 'CREATE') {
        const custRes = await fetch('/api/v1/console/v2/tenants', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fullName: newCustName.trim(),
            phone: newCustPhone.trim(),
            idNumber: newCustIdNumber.trim() || undefined,
            email: newCustEmail.trim() || undefined,
            primaryBuildingId: selectedRoom.buildingId,
          }),
        });
        const custData = await custRes.json();
        if (!custRes.ok) {
          setErrorMsg(custData.message || 'Không thể tạo hồ sơ khách hàng.');
          setIsSubmitting(false);
          return;
        }
        tenantIdToUse = custData.tenant.id;
      }

      // 2. If room has active reservation, convert it
      if (selectedRoom.activeReservation?.id || preselectedReservationId) {
        const resvId = selectedRoom.activeReservation?.id || preselectedReservationId;
        const convertRes = await fetch(
          `/api/v1/console/v2/reservations/${encodeURIComponent(resvId!)}/convert-to-contract`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tenantId: tenantIdToUse,
              startDate,
              endDate,
              monthlyRentVnd,
              depositVnd: requiredDepositVnd,
              occupantsCount: coOccupants.length + 1,
              rentalModel,
              surplusAction,
              firstPeriodBillingPolicy,
              coOccupants: coOccupants.filter((co) => co.fullName.trim()),
            }),
          }
        );
        const convertData = await convertRes.json();
        if (!convertRes.ok) {
          setErrorMsg(convertData.message || 'Không thể chuyển đổi giữ chỗ sang hợp đồng.');
          setIsSubmitting(false);
          return;
        }
      } else {
        // 3. Otherwise direct contract creation
        const ctRes = await fetch('/api/v1/console/v2/contracts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomId: selectedRoom.id,
            tenantId: tenantIdToUse,
            startDate,
            endDate,
            monthlyRentVnd,
            depositVnd: requiredDepositVnd,
            occupantsCount: coOccupants.length + 1,
            rentalModel,
            firstPeriodBillingPolicy,
            coOccupants: coOccupants.filter((co) => co.fullName.trim()),
          }),
        });
        const ctData = await ctRes.json();
        if (!ctRes.ok) {
          setErrorMsg(ctData.message || 'Không thể tạo hợp đồng.');
          setIsSubmitting(false);
          return;
        }
      }

      await refreshPortfolio();
      await onSuccess();
      onClose();
    } catch {
      setErrorMsg('Lỗi kết nối máy chủ khi lập hợp đồng.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      data-testid="contract-creation-wizard-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/70 backdrop-blur-sm overflow-y-auto"
    >
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[95vh]">
        {/* MODAL HEADER */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-950 text-brand-primary">
                <FileSignature className="w-4 h-4" />
              </span>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                Quy trình Đặt phòng &amp; Lập hợp đồng thuê
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Chuẩn hóa quy trình nghiệp vụ: Chọn phòng → Hồ sơ khách → Giữ chỗ → Điều khoản → Bảng kê tài chính.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* STEP PROGRESS INDICATOR */}
        <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-100 dark:border-slate-800 shrink-0 overflow-x-auto">
          <div className="flex items-center gap-2 min-w-max text-xs">
            {[
              { num: 1, label: 'Chọn phòng' },
              { num: 2, label: 'Khách hàng' },
              { num: 3, label: 'Giữ phòng' },
              { num: 4, label: 'Hợp đồng' },
              { num: 5, label: 'Tài chính' },
              { num: 6, label: 'Xác nhận' },
            ].map((s) => (
              <React.Fragment key={s.num}>
                <button
                  type="button"
                  onClick={() => s.num < step && setStep(s.num)}
                  disabled={s.num > step}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                    step === s.num
                      ? 'bg-brand-primary text-white shadow-sm'
                      : s.num < step
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                      : 'text-slate-400'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      step === s.num
                        ? 'bg-white text-brand-primary'
                        : s.num < step
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-600'
                    }`}
                  >
                    {s.num < step ? '✓' : s.num}
                  </span>
                  <span>{s.label}</span>
                </button>
                {s.num < 6 && <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-700" />}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* ERROR NOTIFICATION */}
        {errorMsg && (
          <div className="p-3 mx-5 mt-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {errorMsg}
            </span>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              className="p-1 text-rose-500 hover:text-rose-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* MAIN BODY: 2-COLUMN ON DESKTOP */}
        <div className="p-5 flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT: STEP CONTENT (COL 12 / LG 7) */}
          <div className="lg:col-span-7 space-y-4">
            {/* STEP 1: CHỌN PHÒNG & HÌNH THỨC */}
            {step === 1 && (
              <div className="space-y-4">
                <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Home className="w-4 h-4 text-brand-primary" />
                  Bước 1: Chọn phòng và hình thức cho thuê
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Chọn căn hộ / phòng *
                  </label>
                  <select
                    data-testid="wizard-select-room"
                    value={selectedRoomId}
                    onChange={(e) => {
                      setSelectedRoomId(e.target.value);
                      const rm = rooms.find((r) => r.id === e.target.value);
                      if (rm) {
                        setMonthlyRentVnd(rm.listPriceVnd);
                        setRequiredDepositVnd(rm.listPriceVnd * (rm.depositMonths || 1));
                      }
                    }}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.buildingCode} · Phòng {r.code} ({r.roomType} · {r.area}m² ·{' '}
                        {r.listPriceVnd.toLocaleString('vi-VN')} đ/tháng) [
                        {r.occupancyStatus === 'AVAILABLE'
                          ? 'Trống'
                          : r.occupancyStatus === 'RESERVED'
                          ? 'Giữ chỗ'
                          : 'Đang thuê'}
                        ]
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Hình thức cho thuê
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      data-testid="wizard-rental-model-entire"
                      onClick={() => setRentalModel('ENTIRE_ROOM')}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        rentalModel === 'ENTIRE_ROOM'
                          ? 'border-brand-primary bg-blue-50/60 dark:bg-blue-950/40 ring-1 ring-brand-primary'
                          : 'border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <div className="font-bold text-xs text-slate-900 dark:text-white">
                        Nguyên căn (Toàn phòng)
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Một hợp đồng chính, quản lý khách đứng tên và người ở cùng.
                      </p>
                    </button>
                    <button
                      type="button"
                      data-testid="wizard-rental-model-shared"
                      onClick={() => setRentalModel('SHARED_ROOM')}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        rentalModel === 'SHARED_ROOM'
                          ? 'border-brand-primary bg-blue-50/60 dark:bg-blue-950/40 ring-1 ring-brand-primary'
                          : 'border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <div className="font-bold text-xs text-slate-900 dark:text-white">
                        Ở ghép (Theo giường / suất)
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Phòng nhiều giường, từng khách thuê có hợp đồng hoặc hồ sơ riêng.
                      </p>
                    </button>
                  </div>
                </div>

                {selectedRoom && (
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 space-y-1.5 text-xs">
                    <div className="font-bold text-slate-800 dark:text-slate-200">
                      Thông số phòng {selectedRoom.code} ({selectedRoom.buildingName})
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                      <div>Diện tích: <b>{selectedRoom.area} m²</b></div>
                      <div>Giá niêm yết: <b>{selectedRoom.listPriceVnd.toLocaleString('vi-VN')} đ</b></div>
                      <div>Ở tối đa: <b>{selectedRoom.maxOccupants} người</b></div>
                      <div>Điện: <b>{selectedRoom.effectiveElectricRateVnd.toLocaleString('vi-VN')} đ/kWh</b></div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STEP 2: KHÁCH HÀNG / CHỦ HỘP ĐỒNG */}
            {step === 2 && (
              <div className="space-y-4">
                <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                  <User className="w-4 h-4 text-brand-primary" />
                  Bước 2: Xác định khách hàng đứng tên hợp đồng
                </div>

                <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
                  <button
                    type="button"
                    onClick={() => setCustomerMode('SELECT')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                      customerMode === 'SELECT'
                        ? 'bg-brand-primary text-white'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    Tìm khách hàng đã có
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomerMode('CREATE')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                      customerMode === 'CREATE'
                        ? 'bg-brand-primary text-white'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    + Tạo hồ sơ khách mới
                  </button>
                </div>

                {customerMode === 'SELECT' ? (
                  <div className="space-y-3">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        data-testid="wizard-search-tenant"
                        type="text"
                        value={tenantSearchQuery}
                        onChange={(e) => setTenantSearchQuery(e.target.value)}
                        placeholder="Tìm theo tên, số điện thoại, CCCD..."
                        className="w-full text-xs pl-8 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary"
                      />
                    </div>

                    <div className="max-h-48 overflow-y-auto space-y-1.5 divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredTenants.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setSelectedTenantId(t.id)}
                          className={`w-full p-2.5 rounded-xl text-left flex items-center justify-between transition-colors ${
                            selectedTenantId === t.id
                              ? 'bg-blue-50 dark:bg-blue-950/40 border border-brand-primary'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                          }`}
                        >
                          <div>
                            <div className="font-bold text-xs text-slate-900 dark:text-white">
                              {t.fullName}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              SĐT: {t.phone} {t.idNumber ? `· CCCD: ${t.idNumber}` : ''}
                            </div>
                          </div>
                          {selectedTenantId === t.id && (
                            <CheckCircle2 className="w-4 h-4 text-brand-primary" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Họ và tên khách hàng *
                        </label>
                        <input
                          data-testid="wizard-new-cust-name"
                          type="text"
                          value={newCustName}
                          onChange={(e) => setNewCustName(e.target.value)}
                          placeholder="Ví dụ: Nguyễn Văn An"
                          className="w-full text-xs p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Số điện thoại (10 số VN) *
                        </label>
                        <input
                          data-testid="wizard-new-cust-phone"
                          type="text"
                          value={newCustPhone}
                          onChange={(e) => setNewCustPhone(e.target.value)}
                          placeholder="0912345678"
                          className="w-full text-xs p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Số CCCD / CMND
                        </label>
                        <input
                          type="text"
                          value={newCustIdNumber}
                          onChange={(e) => setNewCustIdNumber(e.target.value)}
                          placeholder="12 chữ số"
                          className="w-full text-xs p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Email (không bắt buộc)
                        </label>
                        <input
                          type="email"
                          value={newCustEmail}
                          onChange={(e) => setNewCustEmail(e.target.value)}
                          placeholder="khach@gmail.com"
                          className="w-full text-xs p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STEP 3: GIỮ PHÒNG & TIỀN CỌC GIỮ CHỖ */}
            {step === 3 && (
              <div className="space-y-4">
                <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Wallet className="w-4 h-4 text-brand-primary" />
                  Bước 3: Phiếu giữ phòng &amp; Tiền cọc giữ chỗ
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Số tiền giữ phòng (VND)
                    </label>
                    <MoneyInput
                      data-testid="wizard-hold-amount"
                      value={holdAmountVnd}
                      onChange={(val) => setHoldAmountVnd(Math.max(0, val))}
                      className="w-full text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Thời hạn giữ chỗ (ngày)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={holdDays}
                      onChange={(e) => setHoldDays(Number(e.target.value))}
                      className="w-full text-xs p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Ngày dự kiến nhận phòng
                    </label>
                    <input
                      type="date"
                      value={expectedMoveIn}
                      onChange={(e) => {
                        setExpectedMoveIn(e.target.value);
                        setStartDate(e.target.value);
                        setEndDate(computeEndDateIsoVn(e.target.value, durationMonths));
                      }}
                      className="w-full text-xs p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Hình thức thanh toán cọc
                    </label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as any)}
                      className="w-full text-xs p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    >
                      <option value="BANK_TRANSFER">Chuyển khoản ngân hàng</option>
                      <option value="CASH">Tiền mặt tại tòa nhà</option>
                    </select>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/60 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      data-testid="wizard-checkbox-confirm-payment"
                      type="checkbox"
                      checked={isPaymentConfirmed}
                      onChange={(e) => setIsPaymentConfirmed(e.target.checked)}
                      className="w-4 h-4 text-brand-primary rounded"
                    />
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      Đã xác nhận thực nhận tiền cọc giữ phòng
                    </span>
                  </label>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 pl-6">
                    Theo chuẩn nghiệp vụ: Tiền dự kiến ≠ Tiền thực nhận. Chỉ khi đánh dấu &quot;Đã nhận tiền&quot;, tiền cọc mới được ghi nhận vào sổ quỹ Ledger.
                  </p>
                </div>

                {/* Sub-action: Save as Reservation Only */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-xs text-slate-500">
                    Khách chỉ muốn giữ chỗ trước, chưa ký hợp đồng ngay?
                  </span>
                  <button
                    type="button"
                    data-testid="wizard-btn-reservation-only"
                    disabled={isSubmitting}
                    onClick={handleSaveAsReservationOnly}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg bg-amber-500 hover:bg-amber-600 text-white shadow-sm"
                  >
                    Lưu thành Phiếu giữ chỗ &amp; Dừng lại
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4: ĐIỀU KHOẢN HỢP ĐỒNG & NGƯỜI Ở CÙNG */}
            {step === 4 && (
              <div className="space-y-4">
                <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-brand-primary" />
                  Bước 4: Điều khoản thời hạn, giá thuê &amp; Người ở cùng
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Ngày bắt đầu hợp đồng *
                    </label>
                    <input
                      data-testid="wizard-start-date"
                      type="date"
                      value={startDate}
                      onChange={(e) => handleStartDateChange(e.target.value)}
                      className="w-full text-xs p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Thời hạn thuê
                    </label>
                    <select
                      value={durationMonths}
                      onChange={(e) => handleDurationChange(Number(e.target.value))}
                      className="w-full text-xs p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    >
                      <option value={1}>1 tháng</option>
                      <option value={3}>3 tháng</option>
                      <option value={6}>6 tháng</option>
                      <option value={12}>12 tháng (1 năm)</option>
                      <option value={24}>24 tháng (2 năm)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Ngày kết thúc (tự tính)
                    </label>
                    <input
                      type="date"
                      value={endDate}
                      disabled
                      className="w-full text-xs p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/50 text-slate-500 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Tiền thuê phòng / tháng (VND) *
                    </label>
                    <MoneyInput
                      data-testid="wizard-monthly-rent"
                      value={monthlyRentVnd}
                      onChange={(val) => setMonthlyRentVnd(Math.max(500000, val))}
                      className="w-full text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Tiền cọc hợp đồng yêu cầu (VND) *
                    </label>
                    <MoneyInput
                      data-testid="wizard-required-deposit"
                      value={requiredDepositVnd}
                      onChange={(val) => setRequiredDepositVnd(Math.max(0, val))}
                      className="w-full text-xs font-bold"
                    />
                  </div>
                </div>

                {/* C4-BILL-01 Prorate Billing Policy and Preview */}
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Chính sách tính tiền kỳ đầu (Prorate)
                    </label>
                    <select
                      data-testid="select-first-period-policy"
                      value={firstPeriodBillingPolicy}
                      onChange={(e: any) => setFirstPeriodBillingPolicy(e.target.value)}
                      className="text-xs p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-medium"
                    >
                      <option value="CALENDAR_PRORATE">Theo ngày thực tế trong tháng (Prorate lịch dương)</option>
                      <option value="ANNIVERSARY_CYCLE">Chu kỳ tròn tháng (Anniversary 30 ngày)</option>
                      <option value="FULL_FIRST_MONTH">Thu trọn tháng đầu</option>
                    </select>
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900/60 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
                    <span className="font-semibold text-brand-primary">Dự kiến tiền thuê kỳ đầu:</span>{' '}
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      {firstRentCalc.rentVnd.toLocaleString('vi-VN')} đ
                    </span>
                    <span className="block text-[10.5px] text-slate-500 mt-0.5 font-mono">
                      {firstRentCalc.formula}
                    </span>
                  </div>
                </div>

                {/* Co-occupants section */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white">
                        Danh sách người ở cùng ({coOccupants.length} người)
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Phân tách rõ người đứng tên hợp đồng và các nhân khẩu cùng lưu trú.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={addCoOccupant}
                      className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Thêm người ở cùng
                    </button>
                  </div>

                  {coOccupants.map((occ, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                          Người ở cùng #{idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeCoOccupant(idx)}
                          className="text-rose-500 hover:text-rose-700 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                        <input
                          type="text"
                          placeholder="Họ tên"
                          value={occ.fullName}
                          onChange={(e) => updateCoOccupant(idx, 'fullName', e.target.value)}
                          className="text-xs p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                        />
                        <input
                          type="text"
                          placeholder="SĐT"
                          value={occ.phone}
                          onChange={(e) => updateCoOccupant(idx, 'phone', e.target.value)}
                          className="text-xs p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                        />
                        <input
                          type="text"
                          placeholder="CCCD"
                          value={occ.idNumber}
                          onChange={(e) => updateCoOccupant(idx, 'idNumber', e.target.value)}
                          className="text-xs p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                        />
                        <select
                          value={occ.relationToPrimary}
                          onChange={(e) => updateCoOccupant(idx, 'relationToPrimary', e.target.value)}
                          className="text-xs p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                        >
                          <option value="ROOMMATE">Bạn cùng phòng</option>
                          <option value="FAMILY">Người thân / Gia đình</option>
                          <option value="OTHER">Khác</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* STEP 5: TÀI CHÍNH & CHUYỂN ĐỔI CỌC */}
            {step === 5 && (
              <div className="space-y-4">
                <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Receipt className="w-4 h-4 text-brand-primary" />
                  Bước 5: Bảng kê tài chính &amp; Phương án xử lý cọc
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-3">
                  <div className="font-bold text-xs text-slate-900 dark:text-white">
                    Phương án chuyển đổi tiền cọc
                  </div>

                  {financialSummary.bookingDepositReceived <= financialSummary.contractDepositRequired ? (
                    <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-xs text-blue-900 dark:text-blue-200 space-y-1">
                      <div className="font-semibold">Trường hợp: B ≤ C (Tiền cọc giữ chỗ nhỏ hơn hoặc bằng cọc hợp đồng)</div>
                      <div>
                        • Toàn bộ tiền cọc giữ chỗ <b>{financialSummary.bookingDepositReceived.toLocaleString('vi-VN')} đ</b> sẽ được chuyển thành cọc hợp đồng.
                      </div>
                      <div>
                        • Số tiền cọc cần thu thêm: <b>{financialSummary.additionalDepositDue.toLocaleString('vi-VN')} đ</b>.
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-xs text-emerald-900 dark:text-emerald-200 space-y-2">
                      <div className="font-semibold">
                        Trường hợp: B &gt; C (Tiền cọc giữ chỗ lớn hơn cọc hợp đồng — Dôi dư{' '}
                        {financialSummary.surplusDeposit.toLocaleString('vi-VN')} đ)
                      </div>
                      <div className="space-y-1">
                        <label className="flex items-center gap-2 cursor-pointer font-medium">
                          <input
                            type="radio"
                            name="surplusAction"
                            checked={surplusAction === 'RENT_CREDIT'}
                            onChange={() => setSurplusAction('RENT_CREDIT')}
                            className="text-brand-primary"
                          />
                          <span>Khấu trừ vào tiền thuê tháng đầu (Rent Credit) — Tiền thuê tháng đầu còn {financialSummary.firstMonthRentDue.toLocaleString('vi-VN')} đ</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer font-medium">
                          <input
                            type="radio"
                            name="surplusAction"
                            checked={surplusAction === 'REFUND'}
                            onChange={() => setSurplusAction('REFUND')}
                            className="text-brand-primary"
                          />
                          <span>Hoàn lại cho khách khoản dôi dư ({financialSummary.surplusDeposit.toLocaleString('vi-VN')} đ)</span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                {/* Combined First Invoice Preview */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2.5">
                  <div className="font-bold text-xs text-slate-900 dark:text-white flex items-center justify-between">
                    <span>Xem trước Hóa đơn kỳ đầu (First Combined Invoice)</span>
                    <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 font-semibold text-slate-600">
                      Tự động phát hành
                    </span>
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    <div className="py-2 flex items-center justify-between">
                      <span>1. Tiền thuê tháng đầu</span>
                      <span className="font-bold tabular-nums">
                        {monthlyRentVnd.toLocaleString('vi-VN')} đ
                      </span>
                    </div>
                    <div className="py-2 flex items-center justify-between">
                      <span>2. Tiền cọc hợp đồng yêu cầu</span>
                      <span className="font-bold tabular-nums">
                        {requiredDepositVnd.toLocaleString('vi-VN')} đ
                      </span>
                    </div>
                    {financialSummary.transferredDeposit > 0 && (
                      <div className="py-2 flex items-center justify-between text-emerald-600">
                        <span>3. Khấu trừ cọc giữ phòng đã chuyển</span>
                        <span className="font-bold tabular-nums">
                          -{financialSummary.transferredDeposit.toLocaleString('vi-VN')} đ
                        </span>
                      </div>
                    )}
                    {financialSummary.surplusDeposit > 0 && surplusAction === 'RENT_CREDIT' && (
                      <div className="py-2 flex items-center justify-between text-emerald-600">
                        <span>4. Khấu trừ cọc dôi dư vào tiền thuê</span>
                        <span className="font-bold tabular-nums">
                          -{financialSummary.surplusDeposit.toLocaleString('vi-VN')} đ
                        </span>
                      </div>
                    )}
                    <div className="py-2.5 flex items-center justify-between font-bold text-sm text-slate-900 dark:text-white">
                      <span>TỔNG TIỀN PHẢI NỘP KỲ ĐẦU</span>
                      <span className="text-brand-primary tabular-nums">
                        {financialSummary.totalInitialDue.toLocaleString('vi-VN')} đ
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 6: XÁC NHẬN & HOÀN TẤT */}
            {step === 6 && (
              <div className="space-y-4">
                <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Bước 6: Xem lại toàn bộ hồ sơ &amp; Xác nhận ký hợp đồng
                </div>

                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Phòng &amp; Tòa nhà:</span>
                    <b className="text-slate-900 dark:text-white">
                      {selectedRoom?.buildingCode} · Phòng {selectedRoom?.code}
                    </b>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Khách đứng tên:</span>
                    <b className="text-slate-900 dark:text-white">
                      {customerMode === 'CREATE' ? newCustName : selectedTenant?.fullName} (
                      {customerMode === 'CREATE' ? newCustPhone : selectedTenant?.phone})
                    </b>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Thời hạn hợp đồng:</span>
                    <b>
                      {startDate} → {endDate} ({durationMonths} tháng)
                    </b>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Người cùng lưu trú:</span>
                    <b>{coOccupants.length} người</b>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Hình thức:</span>
                    <b>{rentalModel === 'ENTIRE_ROOM' ? 'Nguyên căn' : 'Ở ghép'}</b>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-900 dark:text-white">
                    <span>Tổng tiền thu kỳ đầu:</span>
                    <span className="text-brand-primary">
                      {financialSummary.totalInitialDue.toLocaleString('vi-VN')} đ
                    </span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-800 dark:text-emerald-300">
                  Sau khi bấm hoàn tất, hệ thống sẽ tự động:
                  <ul className="list-disc pl-5 mt-1 space-y-0.5 text-[11.5px]">
                    <li>Khóa đồng thời phòng tránh xung đột race-condition (FOR UPDATE).</li>
                    <li>Chuyển trạng thái phòng sang <code>OCCUPIED</code> trên PostgreSQL.</li>
                    <li>Tạo Hợp đồng thuê hiệu lực và gắn danh sách người lưu trú.</li>
                    <li>Phát hành Hóa đơn kỳ đầu với đầy đủ khấu trừ cọc.</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: STICKY FINANCIAL PREVIEW SUMMARY (COL 12 / LG 5) */}
          <div className="lg:col-span-5">
            <div className="p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 sticky top-0 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  Bảng tổng hợp nhanh
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-brand-primary font-bold">
                  {selectedRoom ? selectedRoom.code : 'Chưa chọn'}
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                  <span>Tiền thuê niêm yết:</span>
                  <b className="text-slate-900 dark:text-white tabular-nums">
                    {monthlyRentVnd.toLocaleString('vi-VN')} đ
                  </b>
                </div>
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                  <span>Cọc yêu cầu:</span>
                  <b className="text-slate-900 dark:text-white tabular-nums">
                    {requiredDepositVnd.toLocaleString('vi-VN')} đ
                  </b>
                </div>
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                  <span>Cọc giữ phòng thực nhận:</span>
                  <b className="text-slate-900 dark:text-white tabular-nums">
                    {financialSummary.bookingDepositReceived.toLocaleString('vi-VN')} đ
                  </b>
                </div>
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                  <span>Cọc chuyển sang hợp đồng:</span>
                  <b className="text-emerald-600 tabular-nums">
                    {financialSummary.transferredDeposit.toLocaleString('vi-VN')} đ
                  </b>
                </div>
                {financialSummary.surplusDeposit > 0 && (
                  <div className="flex items-center justify-between text-amber-600">
                    <span>Cọc dôi dư:</span>
                    <b className="tabular-nums">
                      {financialSummary.surplusDeposit.toLocaleString('vi-VN')} đ
                    </b>
                  </div>
                )}
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between font-bold text-sm">
                  <span className="text-slate-900 dark:text-white">Tổng cần thanh toán:</span>
                  <span className="text-brand-primary tabular-nums">
                    {financialSummary.totalInitialDue.toLocaleString('vi-VN')} đ
                  </span>
                </div>
              </div>

              {selectedTenant && (
                <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] space-y-0.5">
                  <div className="font-bold text-slate-800 dark:text-slate-200">
                    Khách thuê: {selectedTenant.fullName}
                  </div>
                  <div className="text-slate-500 font-mono">SĐT: {selectedTenant.phone}</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* MODAL FOOTER */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-white dark:bg-[#111827]">
          <div>
            {step > 1 && (
              <button
                type="button"
                data-testid="wizard-btn-prev"
                onClick={() => setStep((s) => Math.max(1, s - 1))}
                className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" /> Quay lại
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
            >
              Đóng
            </button>

            {step < 6 ? (
              <button
                type="button"
                data-testid="wizard-btn-next"
                onClick={() => {
                  if (step === 1 && !selectedRoomId) {
                    setErrorMsg('Vui lòng chọn phòng.');
                    return;
                  }
                  if (step === 2) {
                    if (customerMode === 'SELECT' && !selectedTenantId) {
                      setErrorMsg('Vui lòng chọn một khách hàng.');
                      return;
                    }
                    if (customerMode === 'CREATE' && (!newCustName.trim() || !newCustPhone.trim())) {
                      setErrorMsg('Vui lòng nhập tên và số điện thoại khách hàng.');
                      return;
                    }
                  }
                  setErrorMsg(null);
                  setStep((s) => Math.min(6, s + 1));
                }}
                className="px-5 py-2 text-xs font-bold bg-brand-primary hover:bg-brand-hover text-white rounded-xl shadow-sm flex items-center gap-1"
              >
                Tiếp tục <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                data-testid="wizard-btn-submit-contract"
                disabled={isSubmitting}
                onClick={handleSubmitContract}
                className="px-6 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm flex items-center gap-1.5 disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                {isSubmitting ? 'Đang kích hoạt...' : 'Hoàn tất & Ký hợp đồng'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
