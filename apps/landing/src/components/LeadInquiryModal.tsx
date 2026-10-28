import React, { useState, useEffect } from 'react';
import { X, CheckCircle2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { RoomListing } from '../types/room';
import { formatVndPrice, submitRentalInquiry } from '../services/roomService';

interface LeadInquiryModalProps {
  isOpen: boolean;
  selectedRoom?: RoomListing | null;
  onClose: () => void;
}

export const LeadInquiryModal: React.FC<LeadInquiryModalProps> = ({
  isOpen,
  selectedRoom,
  onClose,
}) => {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [preferredMoveInDate, setPreferredMoveInDate] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [referenceCode, setReferenceCode] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setReferenceCode(null);
    }
  }, [isOpen, selectedRoom]);

  const isComingSoon = selectedRoom?.status === 'COMING_SOON';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !phone.trim()) return;

    setSubmitting(true);
    try {
      const res = await submitRentalInquiry({
        fullName: fullName.trim(),
        phone: phone.trim(),
        inquiryType: isComingSoon
          ? 'NOTIFY_COMING_SOON'
          : selectedRoom
          ? 'VIEW_ROOM'
          : 'GENERAL_CONSULT',
        roomCode: selectedRoom?.roomCode,
        roomTitle: selectedRoom?.shortTitle,
        preferredMoveInDate,
        note,
      });
      if (res.ok) {
        setReferenceCode(res.referenceCode);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          role="dialog"
          aria-modal="true"
          aria-label="Đăng ký tư vấn hoặc hẹn xem phòng"
          className="fixed inset-0 z-50 bg-ink/70 flex items-center justify-center p-4 overflow-y-auto"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 12, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="bg-canvas-pure rounded-section max-w-md w-full border border-line shadow-modal overflow-hidden my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-line flex items-center justify-between gap-3 bg-canvas">
              <h3 className="text-base font-bold text-ink">
                {isComingSoon
                  ? `Nhận thông báo khi có ${selectedRoom?.roomCode}`
                  : selectedRoom
                  ? `Đăng ký xem ${selectedRoom.shortTitle}`
                  : 'Liên hệ tư vấn thuê phòng'}
              </h3>
              <button
                type="button"
                onClick={onClose}
                aria-label="Đóng biểu mẫu"
                className="p-1.5 rounded-lg text-ink-secondary hover:text-ink"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {referenceCode ? (
              <div className="p-6 text-center space-y-4">
                <div className="w-11 h-11 rounded-full bg-status-availableBg border border-status-availableBorder text-status-availableText flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-ink">
                    Đã ghi nhận thông tin của {fullName}
                  </h4>
                  <p className="mt-1.5 text-sm text-ink-secondary leading-relaxed">
                    Mã yêu cầu: <strong>{referenceCode}</strong>. Bộ phận quản
                    lý tại Khu đô thị Ân Phú sẽ liên hệ qua số điện thoại{' '}
                    <strong>{phone}</strong> để tư vấn và xác nhận lịch hẹn.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-2.5 rounded-lg text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700"
                >
                  Đóng
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="p-5 space-y-4">
                {selectedRoom && (
                  <div className="p-3 rounded-lg bg-canvas-warm border border-line flex items-center justify-between gap-2 text-xs">
                    <div>
                      <span className="font-semibold text-ink block">
                        {selectedRoom.shortTitle}
                      </span>
                      <span className="text-ink-muted">
                        {selectedRoom.area}m² · {selectedRoom.buildingName}
                      </span>
                    </div>
                    <span className="font-bold text-ink tabular-nums">
                      {formatVndPrice(selectedRoom.price)}/tháng
                    </span>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="lead-name"
                    className="block text-xs font-semibold text-ink mb-1"
                  >
                    Họ và tên <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="lead-name"
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Nguyễn Văn A"
                    className="w-full px-3 py-2.5 rounded-lg text-sm bg-canvas border border-line text-ink focus:outline-none focus:border-brand-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="lead-phone"
                    className="block text-xs font-semibold text-ink mb-1"
                  >
                    Số điện thoại / Zalo <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="lead-phone"
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="09xx xxx xxx"
                    className="w-full px-3 py-2.5 rounded-lg text-sm bg-canvas border border-line text-ink focus:outline-none focus:border-brand-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="lead-date"
                    className="block text-xs font-semibold text-ink mb-1"
                  >
                    Ngày dự kiến xem phòng / chuyển vào
                  </label>
                  <input
                    id="lead-date"
                    type="date"
                    value={preferredMoveInDate}
                    onChange={(e) => setPreferredMoveInDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg text-sm bg-canvas border border-line text-ink focus:outline-none focus:border-brand-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="lead-note"
                    className="block text-xs font-semibold text-ink mb-1"
                  >
                    Ghi chú nhu cầu thuê
                  </label>
                  <textarea
                    id="lead-note"
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Khung giờ thuận tiện xem phòng, số người ở..."
                    className="w-full px-3 py-2 rounded-lg text-sm bg-canvas border border-line text-ink focus:outline-none focus:border-brand-600"
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2.5 rounded-lg text-xs sm:text-sm font-medium text-ink-secondary"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2.5 rounded-lg text-xs sm:text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-60"
                  >
                    {submitting
                      ? 'Đang gửi...'
                      : isComingSoon
                      ? 'Đăng ký nhận thông báo'
                      : 'Gửi yêu cầu'}
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
