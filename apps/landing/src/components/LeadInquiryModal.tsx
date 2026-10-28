import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  Phone,
  Calendar,
  User,
  MessageSquare,
  MapPin,
} from 'lucide-react';
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
  const [occupantCount, setOccupantCount] = useState('1 người');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    referenceCode: string;
    timestamp: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setConfirmation(null);
    }
  }, [isOpen, selectedRoom]);

  if (!isOpen) return null;

  const isComingSoon = selectedRoom?.status === 'COMING_SOON';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !phone.trim()) return;

    setSubmitting(true);
    const res = await submitRentalInquiry({
      fullName: fullName.trim(),
      phone: phone.trim(),
      inquiryType: isComingSoon
        ? 'HOLD_COMING_SOON'
        : selectedRoom
        ? 'VIEW_ROOM'
        : 'GENERAL_CONSULT',
      roomCode: selectedRoom?.roomCode,
      roomTitle: selectedRoom?.title,
      preferredMoveInDate,
      occupantCount,
      note,
    });
    setSubmitting(false);

    if (res.ok) {
      setConfirmation({
        referenceCode: res.referenceCode,
        timestamp: res.timestamp,
      });
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Đăng ký hẹn xem phòng hoặc giữ chỗ"
      className="fixed inset-0 z-50 bg-ink/75 flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-canvas-pure rounded-section max-w-lg w-full border border-line shadow-modal overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 bg-brand-navy text-white flex items-center justify-between gap-3">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-200 block">
              Hệ thống căn hộ dịch vụ AdHome — KĐT Ân Phú
            </span>
            <h3 className="text-base sm:text-lg font-bold text-white mt-0.5">
              {isComingSoon
                ? `Đăng ký giữ chỗ / Nhận tin ${selectedRoom?.roomCode}`
                : selectedRoom
                ? `Quan tâm & Hẹn xem ${selectedRoom.roomCode}`
                : 'Đăng ký tư vấn & Hẹn xem phòng trực tiếp'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng biểu mẫu"
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {confirmation ? (
          <div className="p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-status-availableBg border border-status-availableBorder text-status-availableText flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <span className="px-2.5 py-1 rounded text-xs font-bold bg-canvas-warm border border-line text-ink tabular-nums">
                Mã phiếu: {confirmation.referenceCode}
              </span>
              <h4 className="mt-3 text-lg font-bold text-ink">
                Đã tiếp nhận yêu cầu của {fullName}!
              </h4>
              <p className="mt-1.5 text-xs sm:text-sm text-ink-secondary leading-relaxed">
                Bộ phận quản lý AdHome tại Khu đô thị Ân Phú, Phường Tân An sẽ liên hệ
                qua số điện thoại / Zalo <strong>{phone}</strong> trong vòng 15 phút để
                xác nhận lịch xem phòng.
              </p>
            </div>

            <div className="p-3.5 rounded-lg bg-canvas-warm border border-line text-xs text-ink-secondary flex items-center justify-between">
              <span>Hotline trực tại KĐT Ân Phú:</span>
              <a
                href="tel:0905889123"
                className="font-bold text-brand-700 hover:underline"
              >
                0905 889 123
              </a>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 rounded-lg text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700"
            >
              Hoàn tất
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4">
            {/* Selected Room Summary Banner */}
            {selectedRoom && (
              <div className="p-3.5 rounded-lg bg-canvas-warm border border-line flex items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-bold text-brand-800">
                    {selectedRoom.roomCode} · {selectedRoom.buildingName} (
                    {selectedRoom.floorName})
                  </span>
                  <p className="text-xs text-ink font-medium mt-0.5">
                    {selectedRoom.roomType} · {selectedRoom.area}m² ·{' '}
                    {selectedRoom.availableFromLabel}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-sm font-bold text-ink tabular-nums block">
                    {formatVndPrice(selectedRoom.price)}
                  </span>
                  <span className="text-[11px] text-ink-muted">/ tháng</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label
                  htmlFor="lead-name"
                  className="block text-xs font-semibold text-ink mb-1"
                >
                  Họ và tên của bạn <span className="text-red-600">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="lead-name"
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Nguyễn Minh Tuấn"
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg text-sm bg-canvas border border-line text-ink focus:outline-none focus:border-brand-600"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="lead-phone"
                  className="block text-xs font-semibold text-ink mb-1"
                >
                  Số điện thoại / Zalo <span className="text-red-600">*</span>
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="lead-phone"
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0905 xxx xxx"
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg text-sm bg-canvas border border-line text-ink focus:outline-none focus:border-brand-600"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label
                  htmlFor="lead-date"
                  className="block text-xs font-semibold text-ink mb-1"
                >
                  Dự kiến ngày xem / chuyển vào
                </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="lead-date"
                    type="date"
                    value={preferredMoveInDate}
                    onChange={(e) => setPreferredMoveInDate(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg text-sm bg-canvas border border-line text-ink focus:outline-none focus:border-brand-600"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="lead-occupants"
                  className="block text-xs font-semibold text-ink mb-1"
                >
                  Số người dự kiến ở
                </label>
                <select
                  id="lead-occupants"
                  value={occupantCount}
                  onChange={(e) => setOccupantCount(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg text-sm bg-canvas border border-line text-ink focus:outline-none focus:border-brand-600"
                >
                  <option value="1 người">1 người</option>
                  <option value="2 người">2 người</option>
                  <option value="Gia đình nhỏ (2-3 người)">
                    Gia đình nhỏ (2–3 người)
                  </option>
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor="lead-note"
                className="block text-xs font-semibold text-ink mb-1"
              >
                Ghi chú thêm (khung giờ rảnh xem phòng, nhu cầu nội thất...)
              </label>
              <div className="relative">
                <MessageSquare className="w-4 h-4 text-ink-muted absolute left-3 top-3" />
                <textarea
                  id="lead-note"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ví dụ: Mình muốn xem phòng sau 17h30 chiều nay, thuê hợp đồng 6 tháng..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg text-sm bg-canvas border border-line text-ink focus:outline-none focus:border-brand-600"
                />
              </div>
            </div>

            <div className="text-[11px] text-ink-muted flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-brand-600 shrink-0" />
              <span>
                Địa điểm xem phòng: Khu đô thị Ân Phú, Phường Tân An, Đắk Lắk.
              </span>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-lg text-xs sm:text-sm font-medium text-ink-secondary hover:text-ink"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2.5 rounded-lg text-xs sm:text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-60 transition-colors"
              >
                {submitting
                  ? 'Đang gửi yêu cầu...'
                  : isComingSoon
                  ? 'Xác nhận đăng ký giữ chỗ'
                  : 'Gửi yêu cầu hẹn xem phòng'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
