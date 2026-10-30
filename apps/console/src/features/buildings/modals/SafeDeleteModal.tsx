import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Loader2,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import { usePortfolio } from '@/app/providers/PortfolioContext';
import type { DeleteCheckResult } from '@/shared/types/portfolio';

interface SafeDeleteModalProps {
  isOpen: boolean;
  targetType: 'building' | 'room';
  targetId: string;
  targetCode: string;
  targetName?: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export const SafeDeleteModal: React.FC<SafeDeleteModalProps> = ({
  isOpen,
  targetType,
  targetId,
  targetCode,
  targetName,
  onClose,
  onSuccess,
}) => {
  const {
    checkDeleteBuilding,
    checkDeleteRoom,
    deleteBuilding,
    deleteRoom,
    archiveBuilding,
  } = usePortfolio();

  const [checkState, setCheckState] = useState<DeleteCheckResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [confirmCode, setConfirmCode] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !targetId) return;
    let cancelled = false;
    setIsChecking(true);
    setConfirmCode('');
    setErrorMsg(null);

    const run = async () => {
      const result =
        targetType === 'building'
          ? await checkDeleteBuilding(targetId)
          : await checkDeleteRoom(targetId);
      if (!cancelled) {
        setCheckState(result);
        setIsChecking(false);
      }
    };
    void run();

    return () => {
      cancelled = true;
    };
  }, [isOpen, targetId, targetType, checkDeleteBuilding, checkDeleteRoom]);

  if (!isOpen || !targetId) return null;

  const handlePermanentDelete = async () => {
    if (!checkState?.canHardDelete) {
      setErrorMsg(
        'Không thể xóa vĩnh viễn do còn dữ liệu nghiệp vụ phụ thuộc trên PostgreSQL.'
      );
      return;
    }
    if (confirmCode.trim().toUpperCase() !== targetCode.trim().toUpperCase()) {
      setErrorMsg(`Vui lòng nhập chính xác mã "${targetCode}" để xác nhận.`);
      return;
    }

    setIsMutating(true);
    setErrorMsg(null);
    const res =
      targetType === 'building'
        ? await deleteBuilding(targetId)
        : await deleteRoom(targetId);
    setIsMutating(false);

    if (!res.ok) {
      setErrorMsg(res.message || 'Không thể xóa tài sản.');
      return;
    }

    onClose();
    if (onSuccess) onSuccess();
  };

  const handleArchive = async () => {
    if (targetType !== 'building') return;
    setIsMutating(true);
    setErrorMsg(null);
    const res = await archiveBuilding(targetId);
    setIsMutating(false);

    if (!res.ok) {
      setErrorMsg(res.message || 'Không thể lưu trữ tòa nhà.');
      return;
    }

    onClose();
    if (onSuccess) onSuccess();
  };

  return (
    <div
      data-testid="modal-safe-delete"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-rose-100 dark:bg-rose-950 text-rose-600">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Kiểm tra an toàn dữ liệu: {targetCode}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {targetType === 'building' ? 'Tòa nhà' : 'Phòng'}:{' '}
                {targetName || targetCode}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200/50 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {errorMsg && (
            <div className="p-3 text-xs bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl">
              {errorMsg}
            </div>
          )}

          {isChecking ? (
            <div className="py-8 flex items-center justify-center gap-2 text-xs text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin text-brand-primary" />
              <span>
                Đang đối chiếu ràng buộc hợp đồng &amp; hóa đơn trên
                PostgreSQL...
              </span>
            </div>
          ) : checkState && !checkState.canHardDelete ? (
            <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-rose-700 dark:text-rose-300">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                CHẶN XÓA CỨNG ĐỂ BẢO VỆ DỮ LIỆU TÀI CHÍNH &amp; LƯU TRÚ
              </div>
              <div className="p-2.5 bg-white dark:bg-slate-900 rounded-lg text-xs space-y-1 border border-rose-100 dark:border-rose-900/60">
                {checkState.blockingReasons.map((reason, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-1.5 text-slate-700 dark:text-slate-200"
                  >
                    <span className="text-rose-500 font-bold">•</span>
                    <span>{reason}</span>
                  </div>
                ))}
              </div>
              {targetType === 'building' && checkState.canArchive && (
                <p className="text-[11px] text-amber-800 dark:text-amber-300 bg-amber-100/60 dark:bg-amber-950/40 p-2 rounded-lg">
                  Bạn có thể chuyển tòa nhà sang chế độ{' '}
                  <b>Lưu trữ (Archive)</b> để ngừng hiển thị trên Landing Page
                  nhưng bảo toàn toàn bộ lịch sử hợp đồng và sổ quỹ.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-xl space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ĐỦ ĐIỀU KIỆN XÓA VĨNH VIỄN
                </div>
                <p className="text-xs text-emerald-800/90 dark:text-emerald-200/90">
                  Không phát hiện khách đang ở, hợp đồng hiệu lực, đặt cọc giữ
                  chỗ hay hóa đơn chưa thanh toán.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nhập chính xác mã <b>{targetCode}</b> để xác nhận xóa:
                </label>
                <input
                  data-testid="input-confirm-delete-code"
                  type="text"
                  value={confirmCode}
                  onChange={(e) => setConfirmCode(e.target.value)}
                  placeholder={targetCode}
                  className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl font-mono font-bold uppercase"
                />
              </div>
            </div>
          )}

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2 flex-wrap">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
            >
              Hủy
            </button>

            {targetType === 'building' && checkState?.canArchive && (
              <button
                data-testid="btn-archive-building"
                type="button"
                disabled={isMutating}
                onClick={() => void handleArchive()}
                className="px-4 py-2 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow-sm flex items-center gap-1.5 disabled:opacity-50"
              >
                {isMutating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Archive className="w-3.5 h-3.5" />
                )}
                <span>Lưu trữ (Archive)</span>
              </button>
            )}

            {checkState?.canHardDelete && (
              <button
                data-testid="btn-confirm-hard-delete"
                type="button"
                disabled={
                  isMutating ||
                  confirmCode.trim().toUpperCase() !==
                    targetCode.trim().toUpperCase()
                }
                onClick={() => void handlePermanentDelete()}
                className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl shadow-sm flex items-center gap-1.5"
              >
                {isMutating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>Xóa vĩnh viễn</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
