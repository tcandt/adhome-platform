import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  Calendar,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { LeadInquiryResult, RoomListing } from '../types/room';
import {
  formatIsoDateDdMmYyyy,
  formatVndPrice,
  getTodayIsoVn,
  isDateInPast,
  parseDdMmYyyyToIso,
  submitRentalInquiry,
  validateVnPhone,
} from '../services/roomService';

interface LeadInquiryModalProps {
  isOpen: boolean;
  selectedRoom?: RoomListing | null;
  onClose: () => void;
}

function addDaysToIsoDate(baseIso: string, days: number): string {
  const [y, m, d] = baseIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export const LeadInquiryModal: React.FC<LeadInquiryModalProps> = ({
  isOpen,
  selectedRoom,
  onClose,
}) => {
  const todayIso = getTodayIsoVn();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [preferredMoveInDate, setPreferredMoveInDate] = useState(todayIso);
  const [dateInputText, setDateInputText] = useState(() =>
    formatIsoDateDdMmYyyy(todayIso)
  );
  const [note, setNote] = useState('');
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [honeypot, setHoneypot] = useState('');

  const [fieldErrors, setFieldErrors] = useState<{
    fullName?: string;
    phone?: string;
    date?: string;
    privacy?: string;
  }>({});

  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<LeadInquiryResult | null>(
    null
  );
  const [copiedFallback, setCopiedFallback] = useState(false);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const nativeDatePickerRef = useRef<HTMLInputElement | null>(null);

  // Reset form state when modal opens or selectedRoom changes
  useEffect(() => {
    if (isOpen) {
      setSubmitResult(null);
      setFieldErrors({});
      setCopiedFallback(false);
      setPrivacyConsent(false);
      const defaultDate =
        selectedRoom?.availableFrom && selectedRoom.availableFrom > todayIso
          ? selectedRoom.availableFrom
          : todayIso;
      setPreferredMoveInDate(defaultDate);
      setDateInputText(formatIsoDateDdMmYyyy(defaultDate));
    }
  }, [isOpen, selectedRoom, todayIso]);

  // Body scroll lock, initial focus & keyboard focus trap (Tab / Shift+Tab / Escape)
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => {
      nameInputRef.current?.focus();
    }, 40);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]):not([tabindex="-1"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => el.offsetParent !== null);

        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (
            document.activeElement === first ||
            !dialogRef.current.contains(document.activeElement)
          ) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (
            document.activeElement === last ||
            !dialogRef.current.contains(document.activeElement)
          ) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [isOpen, onClose]);

  const isComingSoon = selectedRoom?.status === 'COMING_SOON';

  const applyIsoDateSelection = (isoDate: string) => {
    setPreferredMoveInDate(isoDate);
    setDateInputText(formatIsoDateDdMmYyyy(isoDate));
    if (fieldErrors.date) {
      setFieldErrors((prev) => ({ ...prev, date: undefined }));
    }
  };

  const handleDateTextChange = (rawVal: string) => {
    // Allow user to type DD/MM/YYYY or YYYY-MM-DD
    setDateInputText(rawVal);
    if (fieldErrors.date) {
      setFieldErrors((prev) => ({ ...prev, date: undefined }));
    }

    const trimmed = rawVal.trim();
    if (!trimmed) {
      setPreferredMoveInDate('');
      return;
    }

    // Check DD/MM/YYYY
    const parsedFromVn = parseDdMmYyyyToIso(trimmed);
    if (parsedFromVn) {
      setPreferredMoveInDate(parsedFromVn);
      return;
    }

    // Also support ISO YYYY-MM-DD if pasted or typed programmatically
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      setPreferredMoveInDate(trimmed);
      setDateInputText(formatIsoDateDdMmYyyy(trimmed));
      return;
    }

    // Mark as invalid ISO so validation catches malformed dates
    setPreferredMoveInDate('INVALID_DATE');
  };

  const validateFields = (): boolean => {
    const nextErrors: {
      fullName?: string;
      phone?: string;
      date?: string;
      privacy?: string;
    } = {};

    if (fullName.trim().length < 2) {
      nextErrors.fullName = 'Vui lòng nhập họ và tên (tối thiểu 2 ký tự).';
    }
    if (!validateVnPhone(phone)) {
      nextErrors.phone =
        'Số điện thoại chưa hợp lệ. Vui lòng nhập số di động 10 số tại Việt Nam (ví dụ: 0905 889 123).';
    }
    if (preferredMoveInDate === 'INVALID_DATE') {
      nextErrors.date =
        'Ngày chưa đúng định dạng DD/MM/YYYY (ví dụ: ' +
        formatIsoDateDdMmYyyy(todayIso) +
        ').';
    } else if (preferredMoveInDate && isDateInPast(preferredMoveInDate)) {
      nextErrors.date =
        'Ngày dự kiến xem phòng / chuyển vào không được chọn trong quá khứ.';
    }
    if (!privacyConsent) {
      nextErrors.privacy =
        'Vui lòng xác nhận đồng ý để AdHome sử dụng thông tin liên hệ tư vấn.';
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitResult(null);

    if (!validateFields()) {
      return;
    }

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
        roomId: selectedRoom?.id,
        roomSlug: selectedRoom?.slug,
        roomCode: selectedRoom?.roomCode,
        roomTitle: selectedRoom?.shortTitle,
        preferredMoveInDate,
        preferredMoveInDateDisplay:
          formatIsoDateDdMmYyyy(preferredMoveInDate),
        note: note.trim(),
        privacyConsent,
        honeypot,
      });
      setSubmitResult(res);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyInquirySummary = async () => {
    const summaryText = [
      `[Yêu cầu thuê phòng AdHome — KĐT Ân Phú]`,
      `Họ tên: ${fullName.trim()}`,
      `SĐT/Zalo: ${phone.trim()}`,
      selectedRoom
        ? `Phòng quan tâm: ${selectedRoom.shortTitle} (Mã ID: ${selectedRoom.id} / ${selectedRoom.roomCode})`
        : `Nhu cầu: Tư vấn chọn phòng`,
      preferredMoveInDate && preferredMoveInDate !== 'INVALID_DATE'
        ? `Ngày dự kiến: ${formatIsoDateDdMmYyyy(preferredMoveInDate)}`
        : '',
      note.trim() ? `Ghi chú: ${note.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(summaryText);
      }
      setCopiedFallback(true);
      setTimeout(() => setCopiedFallback(false), 2500);
    } catch {
      setCopiedFallback(true);
      setTimeout(() => setCopiedFallback(false), 2500);
    }
  };

  const handleInputFocus = (
    e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const target = e.currentTarget;
    setTimeout(() => {
      target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 120);
  };

  const formattedSelectedDate =
    preferredMoveInDate && preferredMoveInDate !== 'INVALID_DATE'
      ? formatIsoDateDdMmYyyy(preferredMoveInDate)
      : '';

  const tomorrowIso = addDaysToIsoDate(todayIso, 1);
  const plus3DaysIso = addDaysToIsoDate(todayIso, 3);

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
          aria-labelledby="lead-inquiry-modal-title"
          className="fixed inset-0 z-50 bg-ink/70 flex items-end sm:items-center justify-center sm:p-4"
          onClick={onClose}
        >
          <motion.div
            ref={dialogRef}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="bg-canvas-pure w-full max-h-[100dvh] sm:max-h-[92vh] sm:max-w-md sm:rounded-section rounded-t-2xl border-t sm:border border-line shadow-modal overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sticky Header */}
            <div className="px-5 py-4 border-b border-line flex items-center justify-between gap-3 bg-canvas shrink-0">
              <div>
                <h3
                  id="lead-inquiry-modal-title"
                  className="text-base font-bold text-ink"
                >
                  {isComingSoon
                    ? `Nhận thông báo khi có ${selectedRoom?.roomCode}`
                    : selectedRoom
                    ? `Đăng ký xem ${selectedRoom.shortTitle}`
                    : 'Liên hệ tư vấn thuê phòng'}
                </h3>
                {selectedRoom && (
                  <p className="text-xs text-ink-secondary mt-0.5 tabular-nums">
                    Mã phòng: <strong>{selectedRoom.roomCode}</strong> (ID:{' '}
                    {selectedRoom.id})
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Đóng biểu mẫu"
                className="p-2 rounded-lg text-ink-secondary hover:text-ink hover:bg-canvas-warm"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Verified Persisted Success State */}
            {submitResult?.ok && submitResult.referenceCode ? (
              <div className="p-6 text-center space-y-4 overflow-y-auto">
                <div className="w-11 h-11 rounded-full bg-status-availableBg border border-status-availableBorder text-status-availableText flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div className="space-y-1.5">
                  <h4 className="text-base font-bold text-ink">
                    Đã lưu yêu cầu của {fullName} vào hệ thống
                  </h4>
                  <p className="text-sm text-ink-secondary leading-relaxed">
                    Mã xác nhận lưu trữ:{' '}
                    <strong className="text-ink tabular-nums">
                      {submitResult.referenceCode}
                    </strong>
                    .
                  </p>
                  {selectedRoom && (
                    <p className="text-xs text-ink-secondary">
                      Phòng đăng ký:{' '}
                      <strong className="text-ink">
                        {selectedRoom.shortTitle} ({selectedRoom.roomCode})
                      </strong>
                    </p>
                  )}
                  {formattedSelectedDate && (
                    <p className="text-xs text-ink-secondary tabular-nums">
                      Ngày dự kiến:{' '}
                      <strong className="text-ink">
                        {formattedSelectedDate}
                      </strong>
                    </p>
                  )}
                  <p className="text-xs text-ink-secondary pt-1 leading-relaxed">
                    Bộ phận quản lý tại Khu đô thị Ân Phú sẽ liên hệ qua số điện
                    thoại <strong>{phone}</strong> để xác nhận lịch hẹn.
                  </p>
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
              /* Scrollable Form Body + Sticky Footer (Virtual Keyboard Safe) */
              <form
                onSubmit={handleSubmit}
                noValidate
                className="flex flex-col flex-1 min-h-0"
              >
                <div className="p-5 space-y-4 overflow-y-auto flex-1">
                  {/* Selected Room Context Box */}
                  {selectedRoom && (
                    <div
                      data-testid="inquiry-room-context"
                      className="p-3 rounded-lg bg-canvas-warm border border-line flex items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <span className="font-semibold text-ink block">
                          {selectedRoom.shortTitle}
                        </span>
                        <span className="text-ink-secondary">
                          Mã {selectedRoom.roomCode} · {selectedRoom.area}m² ·{' '}
                          {selectedRoom.buildingName}
                        </span>
                      </div>
                      <span className="font-bold text-ink tabular-nums shrink-0">
                        {formatVndPrice(selectedRoom.price)}/tháng
                      </span>
                    </div>
                  )}

                  {/* Server / Unsaved Error State Banner (NEVER fakes success!) */}
                  {submitResult && !submitResult.ok && (
                    <div
                      role="alert"
                      data-testid="inquiry-error-banner"
                      className="p-3.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-950 text-xs space-y-2"
                    >
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-800 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="font-semibold">
                            {submitResult.errorCode === 'DUPLICATE_SUBMISSION'
                              ? 'Yêu cầu đã được gửi trước đó'
                              : 'Chưa lưu được yêu cầu trực tuyến'}
                          </p>
                          <p className="leading-relaxed text-amber-900">
                            {submitResult.message}
                          </p>
                        </div>
                      </div>

                      {submitResult.errorCode !== 'DUPLICATE_SUBMISSION' &&
                        submitResult.errorCode !== 'VALIDATION_ERROR' && (
                          <div className="pt-1 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={handleCopyInquirySummary}
                              className="px-2.5 py-1.5 rounded bg-canvas-pure border border-amber-300 text-ink font-medium inline-flex items-center gap-1.5"
                            >
                              {copiedFallback ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-status-availableText" />
                                  <span>Đã sao chép nội dung đăng ký</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>Sao chép thông tin để gửi Zalo</span>
                                </>
                              )}
                            </button>
                          </div>
                        )}
                    </div>
                  )}

                  {/* Honeypot anti-spam hidden field */}
                  <div className="hidden" aria-hidden="true">
                    <label htmlFor="lead-website">Website</label>
                    <input
                      id="lead-website"
                      name="website"
                      type="text"
                      tabIndex={-1}
                      autoComplete="off"
                      value={honeypot}
                      onChange={(e) => setHoneypot(e.target.value)}
                    />
                  </div>

                  {/* Full Name */}
                  <div>
                    <label
                      htmlFor="lead-name"
                      className="block text-xs font-semibold text-ink mb-1"
                    >
                      Họ và tên <span className="text-red-700">*</span>
                    </label>
                    <input
                      ref={nameInputRef}
                      id="lead-name"
                      type="text"
                      required
                      value={fullName}
                      onFocus={handleInputFocus}
                      onChange={(e) => {
                        setFullName(e.target.value);
                        if (fieldErrors.fullName) {
                          setFieldErrors((prev) => ({
                            ...prev,
                            fullName: undefined,
                          }));
                        }
                      }}
                      placeholder="Nguyễn Văn A"
                      aria-invalid={Boolean(fieldErrors.fullName)}
                      aria-describedby={
                        fieldErrors.fullName ? 'lead-name-error' : undefined
                      }
                      className="w-full px-3 py-2.5 rounded-lg text-sm bg-canvas border border-line text-ink focus:outline-none focus:border-brand-600"
                    />
                    {fieldErrors.fullName && (
                      <p
                        id="lead-name-error"
                        role="alert"
                        className="mt-1 text-xs font-medium text-red-700"
                      >
                        {fieldErrors.fullName}
                      </p>
                    )}
                  </div>

                  {/* Phone */}
                  <div>
                    <label
                      htmlFor="lead-phone"
                      className="block text-xs font-semibold text-ink mb-1"
                    >
                      Số điện thoại / Zalo <span className="text-red-700">*</span>
                    </label>
                    <input
                      id="lead-phone"
                      type="tel"
                      inputMode="tel"
                      required
                      value={phone}
                      onFocus={handleInputFocus}
                      onChange={(e) => {
                        setPhone(e.target.value);
                        if (fieldErrors.phone) {
                          setFieldErrors((prev) => ({
                            ...prev,
                            phone: undefined,
                          }));
                        }
                      }}
                      placeholder="0905 889 123"
                      aria-invalid={Boolean(fieldErrors.phone)}
                      aria-describedby={
                        fieldErrors.phone ? 'lead-phone-error' : undefined
                      }
                      className="w-full px-3 py-2.5 rounded-lg text-sm bg-canvas border border-line text-ink focus:outline-none focus:border-brand-600 tabular-nums"
                    />
                    {fieldErrors.phone && (
                      <p
                        id="lead-phone-error"
                        role="alert"
                        className="mt-1 text-xs font-medium text-red-700"
                      >
                        {fieldErrors.phone}
                      </p>
                    )}
                  </div>

                  {/* Preferred Date — Unified Vietnamese DD/MM/YYYY Input (Eliminates US MM/DD/YYYY locale mismatch) */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label
                        htmlFor="lead-date"
                        className="block text-xs font-semibold text-ink"
                      >
                        Ngày dự kiến xem phòng / chuyển vào
                      </label>
                      {formattedSelectedDate && (
                        <span
                          data-testid="lead-date-ddmmyyyy"
                          className="text-xs font-semibold text-brand-700 tabular-nums"
                        >
                          {formattedSelectedDate}
                        </span>
                      )}
                    </div>

                    <div className="relative flex items-center">
                      <input
                        id="lead-date"
                        type="text"
                        inputMode="numeric"
                        placeholder="DD/MM/YYYY"
                        value={dateInputText}
                        onFocus={handleInputFocus}
                        onChange={(e) => handleDateTextChange(e.target.value)}
                        aria-invalid={Boolean(fieldErrors.date)}
                        aria-describedby={
                          fieldErrors.date ? 'lead-date-error' : undefined
                        }
                        className="w-full pl-3 pr-10 py-2.5 rounded-lg text-sm bg-canvas border border-line text-ink focus:outline-none focus:border-brand-600 tabular-nums font-medium"
                      />

                      {/* Calendar Picker Trigger with Native Picker Sync */}
                      <div className="absolute right-2 inset-y-0 flex items-center">
                        <button
                          type="button"
                          onClick={() => {
                            const picker = nativeDatePickerRef.current as
                              | (HTMLInputElement & { showPicker?: () => void })
                              | null;
                            if (picker && typeof picker.showPicker === 'function') {
                              try {
                                picker.showPicker();
                              } catch {
                                picker.focus();
                              }
                            }
                          }}
                          aria-label="Mở lịch chọn ngày"
                          className="p-1.5 rounded text-ink-secondary hover:text-brand-600 hover:bg-canvas-warm"
                        >
                          <Calendar className="w-4 h-4" />
                        </button>
                        <input
                          ref={nativeDatePickerRef}
                          type="date"
                          tabIndex={-1}
                          aria-hidden="true"
                          min={todayIso}
                          value={
                            preferredMoveInDate &&
                            preferredMoveInDate !== 'INVALID_DATE'
                              ? preferredMoveInDate
                              : todayIso
                          }
                          onChange={(e) => {
                            if (e.target.value) {
                              applyIsoDateSelection(e.target.value);
                            }
                          }}
                          className="sr-only"
                        />
                      </div>
                    </div>

                    {/* Quick Vietnamese Date Presets */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {[
                        {
                          label: `Hôm nay (${formatIsoDateDdMmYyyy(todayIso).slice(0, 5)})`,
                          iso: todayIso,
                        },
                        {
                          label: `Ngày mai (${formatIsoDateDdMmYyyy(tomorrowIso).slice(0, 5)})`,
                          iso: tomorrowIso,
                        },
                        {
                          label: `+3 ngày (${formatIsoDateDdMmYyyy(plus3DaysIso).slice(0, 5)})`,
                          iso: plus3DaysIso,
                        },
                      ].map((preset) => {
                        const isSelected = preferredMoveInDate === preset.iso;
                        return (
                          <button
                            key={preset.iso}
                            type="button"
                            onClick={() => applyIsoDateSelection(preset.iso)}
                            className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors tabular-nums ${
                              isSelected
                                ? 'bg-brand-50 text-brand-700 border-brand-200 font-semibold'
                                : 'bg-canvas text-ink-secondary border-line hover:bg-canvas-warm'
                            }`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>

                    {fieldErrors.date && (
                      <p
                        id="lead-date-error"
                        role="alert"
                        className="mt-1 text-xs font-medium text-red-700"
                      >
                        {fieldErrors.date}
                      </p>
                    )}
                  </div>

                  {/* Note */}
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
                      onFocus={handleInputFocus}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Khung giờ thuận tiện xem phòng, số người ở..."
                      className="w-full px-3 py-2 rounded-lg text-sm bg-canvas border border-line text-ink focus:outline-none focus:border-brand-600"
                    />
                  </div>

                  {/* Privacy Notice & Active Opt-In Consent (Unchecked by Default) */}
                  <div className="pt-1">
                    <label className="flex items-start gap-2.5 cursor-pointer text-xs text-ink-secondary leading-relaxed">
                      <input
                        id="lead-privacy"
                        data-testid="lead-privacy-checkbox"
                        type="checkbox"
                        checked={privacyConsent}
                        onChange={(e) => {
                          setPrivacyConsent(e.target.checked);
                          if (fieldErrors.privacy) {
                            setFieldErrors((prev) => ({
                              ...prev,
                              privacy: undefined,
                            }));
                          }
                        }}
                        aria-invalid={Boolean(fieldErrors.privacy)}
                        aria-describedby={
                          fieldErrors.privacy ? 'lead-privacy-error' : undefined
                        }
                        className="mt-0.5 w-4 h-4 rounded border-line text-brand-600 focus:ring-brand-600 shrink-0"
                      />
                      <span>
                        Tôi đồng ý để <strong>AdHome</strong> lưu trữ và sử dụng
                        họ tên, số điện thoại đã cung cấp nhằm liên hệ tư vấn và
                        xác nhận lịch xem phòng tại Khu đô thị Ân Phú.
                      </span>
                    </label>
                    {fieldErrors.privacy && (
                      <p
                        id="lead-privacy-error"
                        role="alert"
                        className="mt-1 text-xs font-medium text-red-700"
                      >
                        {fieldErrors.privacy}
                      </p>
                    )}
                  </div>
                </div>

                {/* Sticky Footer Actions */}
                <div className="px-5 py-3.5 border-t border-line bg-canvas flex items-center justify-end gap-2.5 shrink-0 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2.5 rounded-lg text-xs sm:text-sm font-medium text-ink-secondary hover:text-ink min-h-[42px]"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2.5 rounded-lg text-xs sm:text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-60 min-h-[42px]"
                  >
                    {submitting
                      ? 'Đang lưu yêu cầu...'
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
