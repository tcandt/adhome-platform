import React, { useState, useEffect } from "react";
import { Dialog } from "@animate-ui/react/primitives/base-ui/dialog";
import { Button } from "@animate-ui/react/primitives/buttons/button";
import { ShimmeringText } from "@animate-ui/react/primitives/texts/shimmering";
import {
  X,
  FileSignature,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Receipt,
  Sparkles,
  Info,
} from "lucide-react";
import { MoneyInput } from "../../../shared/ui/MoneyInput";
import { DateInput } from "../../../shared/ui/DateInput";

export interface EditContractModalProps {
  isOpen: boolean;
  contract: any | null;
  roomCode: string;
  onClose: () => void;
  onSuccess: () => void;
}

function computeContractEndDate(startDate: string, durationMonths: 6 | 12): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return "";
  const [year, month, day] = startDate.split("-").map(Number);
  const endDate = new Date(Date.UTC(year, month - 1 + durationMonths, day));
  endDate.setUTCDate(endDate.getUTCDate() - 1);
  return endDate.toISOString().slice(0, 10);
}

export const EditContractModal: React.FC<EditContractModalProps> = ({
  isOpen,
  contract,
  roomCode,
  onClose,
  onSuccess,
}) => {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [moveInDate, setMoveInDate] = useState("");
  const [monthlyRentVnd, setMonthlyRentVnd] = useState(0);
  const [depositVnd, setDepositVnd] = useState(0);
  const [billingCycle, setBillingCycle] = useState<string>("MONTHLY");
  const [notes, setNotes] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!contract) return;
    setStartDate(contract.startDate || "");
    setEndDate(contract.endDate || "");
    setMoveInDate(contract.moveInDate || contract.startDate || "");
    setMonthlyRentVnd(Number(contract.monthlyRentVnd || 0));
    setDepositVnd(Number(contract.depositVnd || 0));
    setBillingCycle(contract.billingCycle || "MONTHLY");
    setNotes(contract.notes || "");
    setErrorMessage(null);
  }, [contract]);

  if (!isOpen || !contract) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      setErrorMessage("Vui lòng nhập ngày bắt đầu thuê hợp lệ (YYYY-MM-DD).");
      return;
    }

    if (!endDate || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      setErrorMessage("Vui lòng nhập ngày kết thúc thuê hợp lệ (YYYY-MM-DD).");
      return;
    }

    if (startDate > endDate) {
      setErrorMessage("Ngày bắt đầu không thể diễn ra sau ngày kết thúc.");
      return;
    }

    if (monthlyRentVnd < 0) {
      setErrorMessage("Giá thuê hàng tháng không thể nhỏ hơn 0.");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch(
        `/api/v1/console/v2/contracts/${encodeURIComponent(contract.id)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "X-Requested-With": "AdHome-Console",
          },
          body: JSON.stringify({
            startDate,
            endDate,
            moveInDate: moveInDate || startDate,
            monthlyRentVnd,
            depositVnd,
            billingCycle,
            notes: notes.trim() || undefined,
          }),
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Không thể cập nhật hợp đồng.");
      }

      onSuccess();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Đã có lỗi xảy ra khi lưu hợp đồng."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const applyQuickDuration = (months: 6 | 12) => {
    if (!startDate) return;
    const computed = computeContractEndDate(startDate, months);
    if (computed) setEndDate(computed);
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && !isSaving && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[120] bg-slate-950/50 backdrop-blur-[2px]" />
        <Dialog.Viewport className="fixed inset-0 z-[121] flex items-center justify-center p-3 sm:p-4">
          <Dialog.Popup
            from="bottom"
            className="relative flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-2xl outline-none dark:border-slate-800 dark:bg-[#111827] dark:text-slate-100"
          >
            {/* Header */}
            <div className="flex shrink-0 items-start justify-between border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
              <div>
                <Dialog.Title className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <FileSignature className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  Chỉnh sửa hợp đồng & thời hạn thuê
                </Dialog.Title>
                <Dialog.Description className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Phòng {roomCode} · HĐ: {contract.contractCode}
                </Dialog.Description>
              </div>
              <Dialog.Close
                disabled={isSaving}
                aria-label="Đóng"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>

            {/* Error banner */}
            {errorMessage && (
              <div
                role="alert"
                className="mx-5 mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="flex-1">{errorMessage}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
              <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain p-5 text-xs">
                {/* Ngày bắt đầu & Ngày kết thúc */}
                <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-800/40">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                      Thời hạn thuê
                    </span>
                    <div className="flex items-center gap-1.5 text-[10.5px]">
                      <span className="text-slate-400">Gợi ý:</span>
                      <button
                        type="button"
                        onClick={() => applyQuickDuration(6)}
                        className="rounded border border-slate-200 bg-white px-2 py-0.5 font-medium hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
                      >
                        6 tháng
                      </button>
                      <button
                        type="button"
                        onClick={() => applyQuickDuration(12)}
                        className="rounded border border-slate-200 bg-white px-2 py-0.5 font-medium hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
                      >
                        1 năm
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <label className="flex flex-col gap-1 font-semibold text-slate-700 dark:text-slate-200">
                      <span>Ngày bắt đầu *</span>
                      <DateInput
                        required
                        value={startDate}
                        onChange={(val) => {
                          setStartDate(val);
                          if (!moveInDate) setMoveInDate(val);
                        }}
                        className="rounded-lg border border-slate-200 bg-white p-2 text-xs font-normal text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      />
                    </label>

                    <label className="flex flex-col gap-1 font-semibold text-slate-700 dark:text-slate-200">
                      <span>Ngày kết thúc *</span>
                      <DateInput
                        required
                        value={endDate}
                        onChange={setEndDate}
                        className="rounded-lg border border-slate-200 bg-white p-2 text-xs font-normal text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      />
                    </label>
                  </div>

                  <label className="flex flex-col gap-1 font-semibold text-slate-700 dark:text-slate-200 pt-1">
                    <span>Ngày vào ở thực tế</span>
                    <DateInput
                      value={moveInDate}
                      onChange={setMoveInDate}
                      className="rounded-lg border border-slate-200 bg-white p-2 text-xs font-normal text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </label>
                </div>

                {/* Tài chính hợp đồng */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-[10.5px] font-semibold text-slate-700 dark:text-slate-200 mb-1">
                      Giá thuê / tháng *
                    </label>
                    <MoneyInput
                      value={monthlyRentVnd}
                      onChange={setMonthlyRentVnd}
                      min={0}
                      placeholder="0"
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-[10.5px] font-semibold text-slate-700 dark:text-slate-200 mb-1">
                      Tiền cọc hợp đồng *
                    </label>
                    <MoneyInput
                      value={depositVnd}
                      onChange={setDepositVnd}
                      min={0}
                      placeholder="0"
                      className="w-full"
                    />
                  </div>
                </div>

                {/* Chu kỳ đóng tiền */}
                <div>
                  <label className="block text-[10.5px] font-semibold text-slate-700 dark:text-slate-200 mb-1">
                    Chu kỳ đóng tiền
                  </label>
                  <select
                    value={billingCycle}
                    onChange={(e) => setBillingCycle(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs font-medium text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="MONTHLY">1 tháng / lần (Mặc định)</option>
                    <option value="BI_MONTHLY">2 tháng / lần</option>
                    <option value="QUARTERLY">3 tháng / lần (Theo quý)</option>
                    <option value="BIANNUAL">6 tháng / lần (Nửa năm)</option>
                    <option value="ANNUAL">12 tháng / lần (1 năm)</option>
                  </select>
                </div>

                {/* Ghi chú */}
                <label className="flex flex-col gap-1 font-semibold text-slate-700 dark:text-slate-200">
                  <span>Ghi chú điều chỉnh</span>
                  <textarea
                    rows={2}
                    placeholder="Lý do điều chỉnh ngày tháng hoặc điều khoản hợp đồng"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-white p-2 text-xs font-normal text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </label>

                <div className="rounded-lg bg-blue-50/80 p-2.5 text-[11px] leading-relaxed text-blue-900 dark:bg-blue-950/30 dark:text-blue-300 border border-blue-200/80 dark:border-blue-900/60 space-y-1">
                  <div className="font-semibold flex items-center gap-1.5 text-blue-800 dark:text-blue-200">
                    <Info className="h-3.5 w-3.5 shrink-0" />
                    <span>Cơ chế cập nhật hóa đơn tiền phòng:</span>
                  </div>
                  <ul className="list-disc pl-4 space-y-1 text-[10.5px]">
                    <li>
                      <strong>Hóa đơn kỳ đầu (chưa thanh toán):</strong> Tự động tính lại số tiền phòng theo số ngày thực tế từ ngày bắt đầu mới.
                    </li>
                    <li>
                      <strong>Hóa đơn đã thanh toán:</strong> Giữ nguyên để bảo toàn đối soát sổ quỹ (<strong>Ngoại lệ:</strong> Với tài khoản <code>admin@adhome.vn</code>, hệ thống tự động đồng bộ lại cả số ngày tính tiền và số tiền hóa đơn để khắc phục trường hợp nhập nhầm ngày khi đồng bộ sổ sách).
                    </li>
                  </ul>
                </div>
              </div>

              {/* Actions */}
              <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 px-5 py-3 dark:border-slate-800">
                <Button
                  type="button"
                  disabled={isSaving}
                  onClick={onClose}
                  className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-750"
                >
                  Hủy
                </Button>
                <Button
                  type="submit"
                  disabled={isSaving}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSaving ? (
                    <ShimmeringText text="Đang lưu thay đổi…" />
                  ) : (
                    <>
                      <CheckCircle2 size={15} />
                      <span>Lưu thay đổi</span>
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
