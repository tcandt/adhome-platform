import React, { useState } from 'react';
import { X, AlertTriangle, ShieldAlert, Archive, Trash2, CheckCircle2 } from 'lucide-react';
import { usePortfolio } from '@/app/providers/PortfolioContext';

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
    checkBuildingDeleteSafety,
    checkRoomDeleteSafety,
    deleteBuilding,
    deleteRoom,
    archiveBuilding,
  } = usePortfolio();

  const [confirmName, setConfirmName] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !targetId) return null;

  // Run safety check
  const safetyReport =
    targetType === 'building'
      ? checkBuildingDeleteSafety(targetId)
      : checkRoomDeleteSafety(targetId);

  const handlePermanentDelete = () => {
    if (!safetyReport.canDeletePermanently) {
      setErrorMsg('Không thể xóa vĩnh viễn do còn dữ liệu phụ thuộc hoặc hợp đồng đang chạy.');
      return;
    }

    if (confirmName.trim().toUpperCase() !== targetCode.trim().toUpperCase()) {
      setErrorMsg(`Vui lòng nhập chính xác mã "${targetCode}" để xác nhận xóa vĩnh viễn.`);
      return;
    }

    const res = targetType === 'building' ? deleteBuilding(targetId) : deleteRoom(targetId);
    if (res.success) {
      onClose();
      if (onSuccess) onSuccess();
    } else {
      setErrorMsg(res.message);
    }
  };

  const handleArchive = () => {
    if (targetType === 'building') {
      archiveBuilding(targetId);
      onClose();
      if (onSuccess) onSuccess();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-surface dark:bg-surface-dark border border-appBorder-light dark:border-appBorder-dark rounded-2xl shadow-elevated overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-appBorder-light dark:border-appBorder-dark flex items-center justify-between bg-slate-50 dark:bg-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2 rounded-xl ${
                safetyReport.canDeletePermanently
                  ? 'bg-amber-100 dark:bg-amber-950 text-amber-600'
                  : 'bg-rose-100 dark:bg-rose-950 text-rose-600'
              }`}
            >
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Xác Nhận Xử Lý Tài Sản: {targetCode}
              </h3>
              <p className="text-xs text-slate-400">
                {targetType === 'building' ? 'Tòa nhà' : 'Căn hộ'}: {targetName || targetCode}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200/50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {errorMsg && (
            <div className="p-3 text-xs bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl">
              {errorMsg}
            </div>
          )}

          {/* Safety Policy Status Banner */}
          {!safetyReport.canDeletePermanently ? (
            <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-rose-700 dark:text-rose-300">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                CHẶN XÓA VĨNH VIỄN ĐỂ BẢO VỆ DỮ LIỆU TÀI CHÍNH
              </div>
              <p className="text-xs text-rose-800/90 dark:text-rose-200/90 leading-relaxed">
                Tài sản này hiện đang có dữ liệu ràng buộc không thể xóa cứng (hard delete). Việc xóa bỏ trực tiếp sẽ làm mất lịch sử đối soát ngân hàng và sai lệch báo cáo FSM.
              </p>

              {/* Blocking reasons list */}
              <div className="p-2.5 bg-white dark:bg-slate-800 rounded-lg text-xs space-y-1.5 border border-rose-100 dark:border-rose-900/60">
                {(safetyReport.blockingReasons || (safetyReport.blockReason ? [safetyReport.blockReason] : ['Tài sản đang phát sinh hợp đồng hoặc công nợ tài chính.'])).map((reason: string, idx: number) => (
                  <div key={idx} className="flex items-start gap-1.5 text-slate-700 dark:text-slate-200">
                    <span className="text-rose-500 font-bold">•</span>
                    <span>{reason}</span>
                  </div>
                ))}
              </div>

              <div className="p-2 bg-amber-100/60 dark:bg-amber-950/60 rounded-lg text-[11px] text-amber-800 dark:text-amber-300">
                💡 <b>Giải pháp tối ưu theo kiến trúc SaaS:</b> Chuyển sang chế độ <b>"Lưu trữ (Archive)"</b>. Tài sản sẽ ẩn khỏi danh mục vận hành thường ngày nhưng vẫn bảo toàn trọn vẹn lịch sử giao dịch và dữ liệu đối soát.
              </div>
            </div>
          ) : (
            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                ĐỦ ĐIỀU KIỆN XÓA VĨNH VIỄN
              </div>
              <p className="text-xs text-emerald-800/90 dark:text-emerald-200/90">
                Tài sản rỗng, không có phòng đang ở, không có tiền cọc giữ, và không có công nợ hay hóa đơn chưa tất toán.
              </p>
            </div>
          )}

          {/* Confirm Input if Deletion Allowed */}
          {safetyReport.canDeletePermanently && (
            <div className="space-y-1.5 pt-1">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Nhập chính xác mã <b>{targetCode}</b> để xác nhận xóa vĩnh viễn:
              </label>
              <input
                type="text"
                value={confirmName}
                onChange={e => setConfirmName(e.target.value)}
                placeholder={`Nhập ${targetCode}`}
                className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-rose-500 font-mono font-bold"
              />
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-3 border-t border-appBorder-light dark:border-appBorder-dark flex items-center justify-end gap-2 flex-wrap">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              Hủy bỏ
            </button>

            {targetType === 'building' && (
              <button
                type="button"
                onClick={handleArchive}
                className="px-4 py-2 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow-sm transition-colors flex items-center gap-1.5"
              >
                <Archive className="w-4 h-4" /> Chuyển sang Lưu trữ (Archive)
              </button>
            )}

            {safetyReport.canDeletePermanently && (
              <button
                type="button"
                onClick={handlePermanentDelete}
                disabled={confirmName.trim().toUpperCase() !== targetCode.trim().toUpperCase()}
                className="px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl shadow-sm transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" /> Xóa vĩnh viễn
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
