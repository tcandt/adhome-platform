import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  ChevronRight,
  ChevronLeft,
  Building2,
  Home,
  User,
  Calendar,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Wallet,
  Sparkles,
  ShieldCheck,
  ArrowRight,
  Users,
  RefreshCw,
} from 'lucide-react';
import { usePortfolio } from '../../../app/providers/PortfolioContext';
import { MoneyInput } from '../../../shared/ui/MoneyInput';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  preselectedRoomId?: string | null;
  onSuccess: () => Promise<void>;
}

interface ImportRow {
  roomId: string;
  roomCode: string;
  buildingId: string;
  tenantName: string;
  tenantPhone: string;
  tenantIdNumber: string;
  contractCode: string;
  startDate: string;
  endDate: string;
  paidThrough: string;
  monthlyRentVnd: number;
  depositVnd: number;
  depositPaid: boolean;
  rentalModel: 'ENTIRE_ROOM' | 'SHARED_ROOM';
  occupantsCount: number;
  secondaryOccupantName?: string;
}

export const LegacyImportWizardModal: React.FC<Props> = ({
  isOpen,
  onClose,
  preselectedRoomId,
  onSuccess,
}) => {
  const { rooms, activeBuildings } = usePortfolio();
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Batch key for idempotency
  const [batchKey, setBatchKey] = useState<string>(() => `IMP-BATCH-${Date.now()}`);

  // Step 1: Input items
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Step 2: Preview data
  const [previewData, setPreviewData] = useState<{
    totalRows: number;
    validRows: number;
    warningRows: number;
    invalidRows: number;
    totalOpeningDepositVnd: number;
    totalOpeningDebtVnd: number;
    totalOpeningCreditVnd: number;
    roomsToOccupyCount: number;
    reconciliationNotes: string;
    rows: any[];
  } | null>(null);

  // Step 3: Committed report
  const [committedResult, setCommittedResult] = useState<{
    batchKey: string;
    importedCount: number;
    summary: {
      totalOpeningDepositVnd: number;
      totalRoomsOccupied: number;
      tenantsCreated: number;
      contractsCreated: number;
      reconciliationNotes: string;
    };
    results: any[];
  } | null>(null);

  // Handle modal full reset on close
  const handleClose = () => {
    setCurrentStep(1);
    setRows([]);
    setPreviewData(null);
    setCommittedResult(null);
    setBatchKey(`IMP-BATCH-${Date.now()}`);
    setErrorMessage(null);
    onClose();
  };

  // Initialize sample data
  const loadSampleData = () => {
    const availableRooms = rooms.filter((r) => r.occupancyStatus === 'AVAILABLE' || r.id === preselectedRoomId);
    const targetRoom1 = preselectedRoomId ? rooms.find((r) => r.id === preselectedRoomId) : (availableRooms[0] || rooms[0]);
    const targetRoom2 = availableRooms.find((r) => r.id !== targetRoom1?.id) || rooms.find((r) => r.id !== targetRoom1?.id);

    const sampleRows: ImportRow[] = [
      {
        roomId: targetRoom1?.id || 'room-1',
        roomCode: targetRoom1?.code || '301',
        buildingId: targetRoom1?.buildingId || activeBuildings[0]?.id || '',
        tenantName: 'Nguyễn Văn An',
        tenantPhone: '0912345678',
        tenantIdNumber: '001090123456',
        contractCode: `HD-IMP-${targetRoom1?.code || '301'}-${Date.now().toString().slice(-4)}`,
        startDate: '2026-05-01',
        endDate: '2027-05-01',
        paidThrough: '2026-10-31',
        monthlyRentVnd: targetRoom1 ? Number(targetRoom1.listPriceVnd) : 5000000,
        depositVnd: targetRoom1 ? Number(targetRoom1.listPriceVnd) : 5000000,
        depositPaid: true,
        rentalModel: 'ENTIRE_ROOM',
        occupantsCount: 1,
      },
    ];

    if (targetRoom2 && targetRoom2.id !== targetRoom1?.id) {
      sampleRows.push({
        roomId: targetRoom2.id,
        roomCode: targetRoom2.code,
        buildingId: targetRoom2.buildingId,
        tenantName: 'Lê Hoàng Long',
        tenantPhone: '0987654321',
        tenantIdNumber: '079092001122',
        contractCode: `HD-IMP-${targetRoom2.code}-${Date.now().toString().slice(-4)}`,
        startDate: '2026-06-01',
        endDate: '2027-06-01',
        paidThrough: '2026-10-31',
        monthlyRentVnd: Number(targetRoom2.listPriceVnd) || 4500000,
        depositVnd: Number(targetRoom2.listPriceVnd) || 4500000,
        depositPaid: true,
        rentalModel: 'ENTIRE_ROOM',
        occupantsCount: 2,
        secondaryOccupantName: 'Phạm Thu Trang',
      });
    }

    setRows(sampleRows);
    setErrorMessage(null);
  };

  useEffect(() => {
    if (isOpen) {
      if (rows.length === 0 || rows[0]?.roomId === 'room-1') {
        if (rooms.length > 0) {
          loadSampleData();
        }
      }
    }
  }, [isOpen, preselectedRoomId, rooms]);

  if (!isOpen) return null;

  // Handle dry-run preview call
  const handleProceedToPreview = async () => {
    if (rows.length === 0) {
      setErrorMessage('Vui lòng thêm ít nhất 1 dòng dữ liệu nhập.');
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const payload = {
        batchKey,
        items: rows.map((r) => ({
          roomId: r.roomId,
          roomCode: r.roomCode,
          buildingId: r.buildingId,
          tenantName: r.tenantName,
          tenantPhone: r.tenantPhone,
          tenantIdNumber: r.tenantIdNumber,
          contractCode: r.contractCode,
          startDate: r.startDate,
          endDate: r.endDate,
          paidThrough: r.paidThrough,
          monthlyRentVnd: r.monthlyRentVnd,
          depositVnd: r.depositVnd,
          depositPaid: r.depositPaid,
          rentalModel: r.rentalModel,
          occupants: r.secondaryOccupantName
            ? [{ fullName: r.secondaryOccupantName, relationToPrimary: 'ROOMMATE' }]
            : [],
        })),
      };

      const res = await fetch('/api/v1/console/v2/import/tenants/preview', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'AdHome-Console',
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.message || 'Lỗi kiểm tra đối soát dữ liệu.');
      }

      setPreviewData(json.preview);
      setCurrentStep(2);
    } catch (err: any) {
      setErrorMessage(err.message || 'Không thể tạo bản xem trước đối soát.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Commit to DB
  const handleCommitImport = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const payload = {
        batchKey,
        items: rows.map((r) => ({
          roomId: r.roomId,
          roomCode: r.roomCode,
          buildingId: r.buildingId,
          tenantName: r.tenantName,
          tenantPhone: r.tenantPhone,
          tenantIdNumber: r.tenantIdNumber,
          contractCode: r.contractCode,
          startDate: r.startDate,
          endDate: r.endDate,
          paidThrough: r.paidThrough,
          monthlyRentVnd: r.monthlyRentVnd,
          depositVnd: r.depositVnd,
          depositPaid: r.depositPaid,
          rentalModel: r.rentalModel,
          occupants: r.secondaryOccupantName
            ? [{ fullName: r.secondaryOccupantName, relationToPrimary: 'ROOMMATE' }]
            : [],
        })),
      };

      const res = await fetch('/api/v1/console/v2/import/tenants', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'AdHome-Console',
          'Idempotency-Key': batchKey,
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.message || 'Lỗi chuyển đổi dữ liệu vào hệ thống.');
      }

      setCommittedResult(json);
      setCurrentStep(3);
      await onSuccess();
    } catch (err: any) {
      console.error('[LegacyImportWizardModal] Commit failed:', err);
      if (typeof window !== 'undefined') {
        (window as any).__adhome_lastImportError = err.message || String(err);
      }
      setErrorMessage(err.message || 'Không thể nhập dữ liệu vào hệ thống.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      data-testid="legacy-import-wizard-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm overflow-y-auto"
    >
      <div className="relative w-full max-w-4xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden my-auto max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Nhập dữ liệu khách đang thuê từ sổ cũ
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Chuyển giao danh sách khách thuê, cọc đầu kỳ và ngày chốt chu kỳ paidThrough
              </p>
            </div>
          </div>
          <button
            type="button"
            data-testid="btn-close-import-wizard"
            onClick={handleClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 3-Step Indicator */}
        <div className="px-6 py-3 bg-slate-100/60 dark:bg-slate-800/20 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs font-semibold">
          <div className={`flex items-center gap-2 ${currentStep === 1 ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-slate-500'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${currentStep === 1 ? 'bg-blue-600 text-white' : 'bg-slate-200 dark:bg-slate-700'}`}>
              1
            </span>
            <span>Bước 1: Nhập liệu sổ cũ</span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400" />
          <div className={`flex items-center gap-2 ${currentStep === 2 ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-slate-500'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${currentStep === 2 ? 'bg-blue-600 text-white' : 'bg-slate-200 dark:bg-slate-700'}`}>
              2
            </span>
            <span>Bước 2: Đối soát & Xem trước</span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400" />
          <div className={`flex items-center gap-2 ${currentStep === 3 ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-slate-500'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${currentStep === 3 ? 'bg-blue-600 text-white' : 'bg-slate-200 dark:bg-slate-700'}`}>
              3
            </span>
            <span>Bước 3: Báo cáo hoàn tất</span>
          </div>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 flex items-center gap-2 text-rose-700 dark:text-rose-300 text-xs font-medium">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Body Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {/* STEP 1: INPUT DATA */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Danh sách khách thuê hiện hữu ({rows.length} phòng)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Mã lô chuyển đổi: <code className="font-mono text-blue-600 dark:text-blue-400">{batchKey}</code>
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="btn-load-sample-import"
                  onClick={loadSampleData}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>Tải lại dữ liệu mẫu</span>
                </button>
              </div>

              {/* Rows List */}
              <div className="space-y-3">
                {rows.map((row, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3 shadow-sm"
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 flex items-center justify-center text-xs font-bold">
                          {idx + 1}
                        </span>
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          Phòng: {row.roomCode}
                        </span>
                      </div>
                      <span className="text-xs font-mono text-slate-500">
                        {row.contractCode}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 mb-1">
                          Họ tên khách thuê
                        </label>
                        <input
                          type="text"
                          value={row.tenantName}
                          onChange={(e) => {
                            const newRows = [...rows];
                            newRows[idx].tenantName = e.target.value;
                            setRows(newRows);
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 mb-1">
                          Số điện thoại (10 số)
                        </label>
                        <input
                          type="text"
                          value={row.tenantPhone}
                          onChange={(e) => {
                            const newRows = [...rows];
                            newRows[idx].tenantPhone = e.target.value;
                            setRows(newRows);
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 mb-1">
                          CCCD / CMND
                        </label>
                        <input
                          type="text"
                          value={row.tenantIdNumber}
                          onChange={(e) => {
                            const newRows = [...rows];
                            newRows[idx].tenantIdNumber = e.target.value;
                            setRows(newRows);
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 mb-1">
                          Tiền phòng/tháng
                        </label>
                        <MoneyInput
                          value={row.monthlyRentVnd}
                          onChange={(val) => {
                            const newRows = [...rows];
                            newRows[idx].monthlyRentVnd = val;
                            setRows(newRows);
                          }}
                          data-testid={`input-rent-${idx}`}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 mb-1">
                          Cọc lịch sử (HELD)
                        </label>
                        <MoneyInput
                          value={row.depositVnd}
                          onChange={(val) => {
                            const newRows = [...rows];
                            newRows[idx].depositVnd = val;
                            setRows(newRows);
                          }}
                          data-testid={`input-deposit-${idx}`}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 mb-1">
                          Ngày bắt đầu
                        </label>
                        <input
                          type="date"
                          value={row.startDate}
                          onChange={(e) => {
                            const newRows = [...rows];
                            newRows[idx].startDate = e.target.value;
                            setRows(newRows);
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-blue-600 dark:text-blue-400 font-bold mb-1">
                          Đã đóng đến (paidThrough)
                        </label>
                        <input
                          type="date"
                          value={row.paidThrough}
                          onChange={(e) => {
                            const newRows = [...rows];
                            newRows[idx].paidThrough = e.target.value;
                            setRows(newRows);
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-950/20 text-blue-900 dark:text-blue-200 font-semibold"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 2: DRY-RUN PREVIEW & RECONCILIATION */}
          {currentStep === 2 && previewData && (
            <div className="space-y-5" data-testid="import-step2-preview">
              {/* Financial Reconciliation Summary Card */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-200 dark:border-blue-900/50 space-y-3">
                <div className="flex items-center gap-2 text-blue-800 dark:text-blue-300 font-bold text-sm">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  <span>Đối soát kế toán & Số dư đầu kỳ (Opening Balances)</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-blue-100 dark:border-blue-900/40">
                    <span className="block text-[11px] text-slate-500">Tổng cọc đầu kỳ</span>
                    <span className="text-base font-extrabold text-blue-700 dark:text-blue-400" data-testid="preview-total-deposit">
                      {previewData.totalOpeningDepositVnd.toLocaleString('vi-VN')} đ
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-blue-100 dark:border-blue-900/40">
                    <span className="block text-[11px] text-slate-500">Phòng chuyển OCCUPIED</span>
                    <span className="text-base font-extrabold text-emerald-600 dark:text-emerald-400" data-testid="preview-rooms-occupied">
                      {previewData.roomsToOccupyCount} phòng
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-blue-100 dark:border-blue-900/40">
                    <span className="block text-[11px] text-slate-500">Hợp đồng hợp lệ</span>
                    <span className="text-base font-extrabold text-slate-800 dark:text-slate-200">
                      {previewData.validRows} / {previewData.totalRows}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-blue-100 dark:border-blue-900/40">
                    <span className="block text-[11px] text-slate-500">Dòng tiền thu mới (CASH_IN)</span>
                    <span className="text-base font-extrabold text-amber-600 dark:text-amber-400" data-testid="preview-zero-cashin">
                      0 đ (Bảo toàn)
                    </span>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-blue-100/60 dark:bg-blue-900/30 text-blue-900 dark:text-blue-200 text-xs">
                  <p className="font-semibold">{previewData.reconciliationNotes}</p>
                </div>
              </div>

              {/* Rows Validation Table */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Chi tiết từng hợp đồng kiểm tra
                </h4>
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 font-semibold text-slate-600 dark:text-slate-400">
                      <tr>
                        <th className="px-3 py-2">STT</th>
                        <th className="px-3 py-2">Phòng</th>
                        <th className="px-3 py-2">Khách thuê</th>
                        <th className="px-3 py-2">SĐT</th>
                        <th className="px-3 py-2">Giá phòng</th>
                        <th className="px-3 py-2">Cọc (HELD)</th>
                        <th className="px-3 py-2">Đã đóng đến</th>
                        <th className="px-3 py-2 text-center">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {previewData.rows.map((r, i) => (
                        <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                          <td className="px-3 py-2.5 font-bold text-slate-500">{r.rowIndex}</td>
                          <td className="px-3 py-2.5 font-bold text-blue-600 dark:text-blue-400">
                            {r.room?.code || 'N/A'}
                          </td>
                          <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-white">
                            {r.tenant.fullName}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-slate-600 dark:text-slate-400">
                            {r.tenant.phone}
                          </td>
                          <td className="px-3 py-2.5">
                            {r.contract.monthlyRentVnd.toLocaleString('vi-VN')} đ
                          </td>
                          <td className="px-3 py-2.5 font-semibold text-blue-700 dark:text-blue-300">
                            {r.contract.depositVnd.toLocaleString('vi-VN')} đ
                          </td>
                          <td className="px-3 py-2.5 font-semibold text-emerald-600 dark:text-emerald-400">
                            {r.contract.paidThrough}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {r.status === 'VALID' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                                Hợp lệ
                              </span>
                            ) : r.status === 'WARNING' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                                Cảnh báo
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
                                Lỗi
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: COMMITTED SUMMARY REPORT */}
          {currentStep === 3 && committedResult && (
            <div className="space-y-5 text-center py-4" data-testid="import-step3-summary">
              <div className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto shadow-md">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div>
                <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                  Chuyển đổi dữ liệu thành công!
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Mã tham chiếu lô:{' '}
                  <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                    {committedResult.batchKey}
                  </span>
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto text-left">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                  <span className="block text-[11px] text-slate-500">Hợp đồng đã tạo</span>
                  <span className="text-base font-extrabold text-slate-900 dark:text-white">
                    {committedResult.summary.contractsCreated} hợp đồng
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                  <span className="block text-[11px] text-slate-500">Phòng OCCUPIED</span>
                  <span className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">
                    {committedResult.summary.totalRoomsOccupied} phòng
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                  <span className="block text-[11px] text-slate-500">Cọc ghi nhận HELD</span>
                  <span className="text-base font-extrabold text-blue-600 dark:text-blue-400">
                    {committedResult.summary.totalOpeningDepositVnd.toLocaleString('vi-VN')} đ
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                  <span className="block text-[11px] text-slate-500">Khách thuê mới</span>
                  <span className="text-base font-extrabold text-slate-900 dark:text-white">
                    {committedResult.summary.tenantsCreated} hồ sơ
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 max-w-2xl mx-auto text-xs text-emerald-800 dark:text-emerald-300 font-medium">
                {committedResult.summary.reconciliationNotes}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
          {currentStep === 1 && (
            <>
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                data-testid="btn-import-step1-next"
                onClick={handleProceedToPreview}
                disabled={isSubmitting || rows.length === 0}
                className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-md disabled:opacity-50 transition-colors"
              >
                <span>Tiếp tục: Đối soát xem trước</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}

          {currentStep === 2 && (
            <>
              <button
                type="button"
                data-testid="btn-import-back"
                onClick={() => setCurrentStep(1)}
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Quay lại sửa dữ liệu</span>
              </button>
              <button
                type="button"
                data-testid="btn-import-commit"
                onClick={handleCommitImport}
                disabled={isSubmitting || (previewData?.invalidRows || 0) > 0}
                className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-md disabled:opacity-50 transition-colors"
              >
                {isSubmitting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                <span>Xác nhận chuyển đổi vào hệ thống</span>
              </button>
            </>
          )}

          {currentStep === 3 && (
            <div className="w-full flex justify-end">
              <button
                type="button"
                data-testid="btn-import-finish"
                onClick={handleClose}
                className="px-6 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-colors"
              >
                Hoàn tất & Xem danh sách hợp đồng
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

