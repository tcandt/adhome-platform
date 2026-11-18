import React, { useState, useEffect } from "react";
import { Dialog } from "@animate-ui/react/primitives/base-ui/dialog";
import { Button } from "@animate-ui/react/primitives/buttons/button";
import { ShimmeringText } from "@animate-ui/react/primitives/texts/shimmering";
import {
  X,
  User,
  Phone,
  CreditCard,
  Calendar,
  MapPin,
  AlertCircle,
  FileText,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";
import { IdentityQrScanner } from "../../../shared/ui/IdentityQrScanner";
import { RelationshipCombobox } from "../../../shared/ui/RelationshipCombobox";
import { DateInput } from "../../../shared/ui/DateInput";

export interface EditResidentModalProps {
  isOpen: boolean;
  resident: any | null;
  contract?: any | null;
  roomCode: string;
  roomId: string;
  householdHeadOptions?: Array<{ id: string; fullName: string }>;
  onClose: () => void;
  onSuccess: (updatedResident?: any) => void;
  pendingContractId?: string | null;
  workflowProfile?: any;
}

function computeContractEndDate(startDate: string, durationMonths: 6 | 12): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return "";
  const [year, month, day] = startDate.split("-").map(Number);
  const endDate = new Date(Date.UTC(year, month - 1 + durationMonths, day));
  endDate.setUTCDate(endDate.getUTCDate() - 1);
  return endDate.toISOString().slice(0, 10);
}

export const EditResidentModal: React.FC<EditResidentModalProps> = ({
  isOpen,
  resident,
  contract,
  roomCode,
  roomId,
  householdHeadOptions = [],
  onClose,
  onSuccess,
  pendingContractId,
  workflowProfile,
}) => {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState("");
  const [address, setAddress] = useState("");
  const [relationship, setRelationship] = useState("");
  const [householdHeadId, setHouseholdHeadId] = useState("");
  const [residenceRegStatus, setResidenceRegStatus] = useState("PENDING");
  const [relationToPrimary, setRelationToPrimary] = useState("PRIMARY");
  const [moveInDate, setMoveInDate] = useState("");
  const [contractStartDate, setContractStartDate] = useState("");
  const [contractEndDate, setContractEndDate] = useState("");
  const [suppDurationMonths, setSuppDurationMonths] = useState<6 | 12>(12);
  const [extraNotes, setExtraNotes] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Initialize form state when resident changes
  useEffect(() => {
    if (!resident) return;

    let initAddress = resident.address || "";
    let initRelationship = resident.relationship || "";
    let initHouseholdHeadId = resident.householdHeadOccupantId || "";
    let initMoveInDate = resident.moveInDate || "";
    let initSuppDuration: 6 | 12 = 12;
    let initExtraNotes = "";

    if (resident.notes) {
      try {
        const parsed = JSON.parse(resident.notes);
        if (parsed.secondaryContract) {
          initAddress = parsed.secondaryContract.address || initAddress;
          initRelationship = parsed.secondaryContract.relationship || initRelationship;
          initHouseholdHeadId = parsed.secondaryContract.householdHeadOccupantId || initHouseholdHeadId;
          if (parsed.secondaryContract.startDate && !initMoveInDate) {
            initMoveInDate = parsed.secondaryContract.startDate;
          }
          if (parsed.secondaryContract.durationMonths) {
            initSuppDuration = Number(parsed.secondaryContract.durationMonths) === 6 ? 6 : 12;
          }
        }
        if (parsed.address) initAddress = parsed.address;
        if (parsed.customNotes) initExtraNotes = parsed.customNotes;
        else if (typeof parsed === "string") initExtraNotes = parsed;
      } catch {
        initExtraNotes = resident.notes;
      }
    }

    // Fallback address from workflow profile if available
    if (!initAddress && workflowProfile) {
      if (resident.relationToPrimary === "PRIMARY" && workflowProfile.tenant?.address) {
        initAddress = workflowProfile.tenant.address;
      } else if (Array.isArray(workflowProfile.members)) {
        const match = workflowProfile.members.find(
          (m: any) =>
            m.occupantId === resident.id ||
            (m.fullName && m.fullName === resident.fullName)
        );
        if (match?.address) initAddress = match.address;
        if (match?.relationship && !initRelationship) initRelationship = match.relationship;
      }
    }

    setFullName(resident.fullName || "");
    setPhone(resident.phone || "");
    setIdNumber(resident.idNumber || "");
    setBirthDate(resident.dateOfBirth || resident.birthDate || "");
    setGender(resident.gender || "");
    setAddress(initAddress);
    setRelationship(initRelationship);
    setHouseholdHeadId(initHouseholdHeadId || (householdHeadOptions[0]?.id || ""));
    setResidenceRegStatus(resident.residenceRegStatus || "PENDING");
    setRelationToPrimary(resident.relationToPrimary || "PRIMARY");
    setMoveInDate(initMoveInDate || contract?.startDate || "");
    setContractStartDate(contract?.startDate || "");
    setContractEndDate(contract?.endDate || "");
    setSuppDurationMonths(initSuppDuration);
    setExtraNotes(initExtraNotes);
    setErrorMessage(null);
  }, [resident, contract, workflowProfile, householdHeadOptions]);

  if (!isOpen || !resident) return null;

  const isPendingPerson = resident.personIndex !== undefined;
  const isPrimary = relationToPrimary === "PRIMARY";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanName = fullName.trim();
    const cleanPhone = phone.replace(/\D/g, "");
    const cleanId = idNumber.replace(/\D/g, "");

    if (!cleanName) {
      setErrorMessage("Vui lòng nhập họ và tên khách hàng.");
      return;
    }

    if (cleanPhone && !/^0\d{8,10}$/.test(cleanPhone)) {
      setErrorMessage("Số điện thoại không hợp lệ (cần là số di động Việt Nam bắt đầu bằng số 0, 10 chữ số).");
      return;
    }

    if (cleanId && !/^\d{9,12}$/.test(cleanId)) {
      setErrorMessage("Số CCCD/CMND không hợp lệ (yêu cầu 9 hoặc 12 số).");
      return;
    }

    if (isPrimary && contractStartDate && contractEndDate && contractStartDate > contractEndDate) {
      setErrorMessage("Ngày bắt đầu hợp đồng không thể sau ngày kết thúc.");
      return;
    }

    setIsSaving(true);
    try {
      if (isPendingPerson) {
        // Person in draft workflow / pending contract
        const nextProfile = JSON.parse(
          JSON.stringify(
            workflowProfile || { tenant: {}, members: [] }
          )
        );

        if (resident.personIndex === 0) {
          nextProfile.tenant = {
            ...nextProfile.tenant,
            fullName: cleanName,
            phone: cleanPhone || nextProfile.tenant?.phone,
            idNumber: cleanId || nextProfile.tenant?.idNumber,
            birthDate: birthDate || nextProfile.tenant?.birthDate,
            gender: gender || nextProfile.tenant?.gender,
            address: address.trim() || nextProfile.tenant?.address,
          };
        } else {
          const memberIndex = resident.personIndex - 1;
          if (!nextProfile.members) nextProfile.members = [];
          while (nextProfile.members.length <= memberIndex) {
            nextProfile.members.push({});
          }
          nextProfile.members[memberIndex] = {
            ...nextProfile.members[memberIndex],
            fullName: cleanName,
            phone: cleanPhone || nextProfile.members[memberIndex]?.phone,
            idNumber: cleanId || nextProfile.members[memberIndex]?.idNumber,
            birthDate: birthDate || nextProfile.members[memberIndex]?.birthDate,
            gender: gender || nextProfile.members[memberIndex]?.gender,
            address: address.trim() || nextProfile.members[memberIndex]?.address,
            relationship: relationship.trim() || nextProfile.members[memberIndex]?.relationship,
            documentRole:
              relationToPrimary === "OTHER"
                ? "CO_REPRESENTATIVE"
                : "HOUSEHOLD_MEMBER",
          };
        }

        const res = await fetch(
          `/api/v1/console/v2/rental-workflow/${encodeURIComponent(roomId)}/profile`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Requested-With": "AdHome-Console",
            },
            body: JSON.stringify({
              entityId: pendingContractId || resident.contractId,
              profile: nextProfile,
            }),
          }
        );

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.message || "Không thể cập nhật hồ sơ khách.");
        }

        // If primary and contract exists, update contract dates too
        const targetContractId = pendingContractId || resident.contractId || contract?.id;
        if (isPrimary && targetContractId && (contractStartDate || contractEndDate)) {
          await fetch(`/api/v1/console/v2/contracts/${encodeURIComponent(targetContractId)}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              "X-Requested-With": "AdHome-Console",
            },
            body: JSON.stringify({
              startDate: contractStartDate || undefined,
              endDate: contractEndDate || undefined,
              moveInDate: moveInDate || contractStartDate || undefined,
            }),
          }).catch(() => {});
        }

        onSuccess();
      } else {
        // Real room occupant
        const occId = String(resident.id).replace(/^occupant:/, "");
        const headPerson = householdHeadOptions.find((h) => h.id === householdHeadId);

        const res = await fetch(
          `/api/v1/console/v2/occupants/${encodeURIComponent(occId)}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              "X-Requested-With": "AdHome-Console",
            },
            body: JSON.stringify({
              fullName: cleanName,
              phone: cleanPhone || null,
              idNumber: cleanId || null,
              dateOfBirth: birthDate || null,
              gender: gender || null,
              residenceRegStatus,
              relationToPrimary,
              moveInDate: moveInDate || null,
              address: address.trim(),
              relationship: relationship.trim(),
              householdHeadOccupantId: householdHeadId || null,
              householdHeadName: headPerson?.fullName || null,
              contractStartDate: isPrimary ? (contractStartDate || moveInDate || undefined) : undefined,
              contractEndDate: isPrimary ? contractEndDate || undefined : undefined,
              startDate: isPrimary ? (contractStartDate || moveInDate || undefined) : (relationToPrimary === "OTHER" ? moveInDate || undefined : undefined),
              durationMonths: relationToPrimary === "OTHER" ? suppDurationMonths : undefined,
              endDate: relationToPrimary === "OTHER" && moveInDate ? computeContractEndDate(moveInDate, suppDurationMonths) : undefined,
              notes: extraNotes.trim() || undefined,
            }),
          }
        );

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.message || "Không thể cập nhật thông tin người lưu trú.");
        }

        // Also update contract if primary and dates were modified
        if (isPrimary && (resident.contractId || contract?.id)) {
          const targetContractId = resident.contractId || contract?.id;
          const effStartDate = contractStartDate || moveInDate;
          if (effStartDate || contractEndDate || moveInDate) {
            await fetch(`/api/v1/console/v2/contracts/${encodeURIComponent(targetContractId)}`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                "X-Requested-With": "AdHome-Console",
              },
              body: JSON.stringify({
                startDate: effStartDate || undefined,
                endDate: contractEndDate || undefined,
                moveInDate: moveInDate || effStartDate || undefined,
              }),
            }).catch(() => {});
          }
        }

        onSuccess(data.occupant);
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Đã có lỗi xảy ra khi lưu thông tin."
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && !isSaving && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[110] bg-slate-950/50 backdrop-blur-[2px]" />
        <Dialog.Viewport className="fixed inset-0 z-[111] flex items-center justify-center p-3 sm:p-4">
          <Dialog.Popup
            from="bottom"
            className="relative flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-2xl outline-none dark:border-slate-800 dark:bg-[#111827] dark:text-slate-100"
          >
            {/* Header */}
            <div className="flex shrink-0 items-start justify-between border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
              <div>
                <Dialog.Title className="text-sm font-semibold text-slate-900 dark:text-white">
                  Chỉnh sửa thông tin khách hàng
                </Dialog.Title>
                <Dialog.Description className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Phòng {roomCode} · {resident.fullName}
                </Dialog.Description>
              </div>
              <div className="flex items-center gap-2">
                <IdentityQrScanner
                  onApply={(details) => {
                    if (details.fullName) setFullName(details.fullName);
                    if (details.idNumber) setIdNumber(details.idNumber);
                    if (details.birthDate) setBirthDate(details.birthDate);
                    if (details.gender) setGender(details.gender);
                    if (details.address) setAddress(details.address);
                  }}
                />
                <Dialog.Close
                  disabled={isSaving}
                  aria-label="Đóng"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="h-4 w-4" />
                </Dialog.Close>
              </div>
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
                {/* Họ và tên & Số điện thoại */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 font-semibold text-slate-700 dark:text-slate-200">
                    <span>Họ và tên *</span>
                    <input
                      type="text"
                      required
                      placeholder="Nguyễn Văn A"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="rounded-lg border border-slate-200 bg-white p-2 text-xs font-normal text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </label>
                  <label className="flex flex-col gap-1 font-semibold text-slate-700 dark:text-slate-200">
                    <span>Số điện thoại *</span>
                    <input
                      type="tel"
                      required
                      inputMode="numeric"
                      placeholder="0912345678"
                      value={phone}
                      onChange={(e) =>
                        setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                      }
                      className="rounded-lg border border-slate-200 bg-white p-2 text-xs font-normal text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </label>
                </div>

                {/* CCCD, Ngày sinh, Giới tính */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label className="flex flex-col gap-1 font-semibold text-slate-700 dark:text-slate-200">
                    <span>Số CCCD / Định danh</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={12}
                      placeholder="12 chữ số"
                      value={idNumber}
                      onChange={(e) =>
                        setIdNumber(e.target.value.replace(/\D/g, "").slice(0, 12))
                      }
                      className="rounded-lg border border-slate-200 bg-white p-2 text-xs font-normal text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </label>
                  <label className="flex flex-col gap-1 font-semibold text-slate-700 dark:text-slate-200">
                    <span>Ngày sinh</span>
                    <DateInput
                      value={birthDate}
                      onChange={setBirthDate}
                      className="rounded-lg border border-slate-200 bg-white p-2 text-xs font-normal text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </label>
                  <label className="flex flex-col gap-1 font-semibold text-slate-700 dark:text-slate-200">
                    <span>Giới tính</span>
                    <select
                      value={gender}
                      onChange={(e) => setGender(e.target.value)}
                      className="rounded-lg border border-slate-200 bg-white p-2 text-xs font-normal text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    >
                      <option value="">Chọn giới tính</option>
                      <option value="Nam">Nam</option>
                      <option value="Nữ">Nữ</option>
                      <option value="Khác">Khác</option>
                    </select>
                  </label>
                </div>

                {/* Ngày vào ở thực tế */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 font-semibold text-slate-700 dark:text-slate-200">
                    <span>Ngày vào ở thực tế</span>
                    <DateInput
                      value={moveInDate}
                      onChange={(val) => {
                        setMoveInDate(val);
                        if (isPrimary) {
                          setContractStartDate(val);
                        }
                      }}
                      className="rounded-lg border border-slate-200 bg-white p-2 text-xs font-normal text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </label>

                  <div>
                    <label className="block text-[10.5px] font-semibold text-slate-700 dark:text-slate-200 mb-1">
                      Đăng ký tạm trú
                    </label>
                    <select
                      value={residenceRegStatus}
                      onChange={(e) => setResidenceRegStatus(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs font-normal text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    >
                      <option value="PENDING">Chưa khai báo (PENDING)</option>
                      <option value="REGISTERED">Đã khai báo (REGISTERED)</option>
                      <option value="EXPIRED">Hết hạn (EXPIRED)</option>
                    </select>
                  </div>
                </div>

                {/* Nếu là HĐ Chính: Cho phép chỉnh sửa thời hạn hợp đồng nếu nhập nhầm */}
                {isPrimary && (contract || contractStartDate) && (
                  <div className="space-y-2 rounded-lg border border-blue-200/90 bg-blue-50/50 p-3 dark:border-blue-900/60 dark:bg-blue-950/20">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        Thời hạn hợp đồng thuê (HĐ Chính)
                      </span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">
                        Chỉnh sửa nếu nhập nhầm ngày
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      <label className="flex flex-col gap-1 font-semibold text-slate-700 dark:text-slate-200">
                        <span>Ngày bắt đầu HĐ *</span>
                        <DateInput
                          value={contractStartDate}
                          onChange={setContractStartDate}
                          className="rounded-lg border border-slate-200 bg-white p-2 text-xs font-normal text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        />
                      </label>
                      <label className="flex flex-col gap-1 font-semibold text-slate-700 dark:text-slate-200">
                        <span>Ngày kết thúc HĐ *</span>
                        <DateInput
                          value={contractEndDate}
                          onChange={setContractEndDate}
                          className="rounded-lg border border-slate-200 bg-white p-2 text-xs font-normal text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        />
                      </label>
                    </div>
                    <p className="text-[10px] text-blue-600 dark:text-blue-400">
                      💡 Nếu hóa đơn kỳ đầu chưa thanh toán, hệ thống sẽ tự động tính lại tiền phòng theo ngày bắt đầu mới.
                    </p>
                  </div>
                )}

                {/* Nếu là Người đại diện phụ (OTHER): Cho phép chỉnh sửa thời hạn hợp đồng phụ */}
                {!isPrimary && relationToPrimary === "OTHER" && (
                  <div className="space-y-2 rounded-lg border border-blue-200/90 bg-blue-50/50 p-3 dark:border-blue-900/60 dark:bg-blue-950/20">
                    <span className="text-[11px] font-semibold text-blue-900 dark:text-blue-200 block">
                      Thời hạn hợp đồng phụ
                    </span>
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      <label className="flex flex-col gap-1 font-semibold text-slate-700 dark:text-slate-200">
                        <span>Thời hạn</span>
                        <select
                          value={suppDurationMonths}
                          onChange={(e) => setSuppDurationMonths(Number(e.target.value) as 6 | 12)}
                          className="rounded-lg border border-slate-200 bg-white p-2 text-xs font-normal text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        >
                          <option value={6}>6 tháng</option>
                          <option value={12}>1 năm</option>
                        </select>
                      </label>
                      <label className="flex flex-col gap-1 font-semibold text-slate-700 dark:text-slate-200">
                        <span>Ngày kết thúc tính toán</span>
                        <DateInput
                          readOnly
                          value={moveInDate ? computeContractEndDate(moveInDate, suppDurationMonths) : ""}
                          onChange={() => {}}
                          className="rounded-lg border border-slate-200 bg-slate-100 p-2 text-xs font-normal text-slate-500 dark:border-slate-700 dark:bg-slate-800/60"
                        />
                      </label>
                    </div>
                  </div>
                )}

                {/* Địa chỉ thường trú */}
                <label className="flex flex-col gap-1 font-semibold text-slate-700 dark:text-slate-200">
                  <span>Địa chỉ thường trú (theo CCCD)</span>
                  <textarea
                    rows={2}
                    placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-white p-2 text-xs font-normal text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </label>

                {/* Vai trò lưu trú */}
                <div>
                  <label className="block text-[10.5px] font-semibold text-slate-700 dark:text-slate-200 mb-1">
                    Vai trò lưu trú
                  </label>
                  {isPrimary ? (
                    <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/60 p-2 text-xs font-medium text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
                      <ShieldCheck className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                      <span>Chủ hợp đồng (HĐ Chính)</span>
                    </div>
                  ) : (
                    <select
                      value={relationToPrimary}
                      onChange={(e) => setRelationToPrimary(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs font-normal text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    >
                      <option value="FAMILY">Người cùng hộ</option>
                      <option value="OTHER">Đại diện HĐ (Hợp đồng phụ)</option>
                      <option value="ROOMMATE">Bạn cùng phòng</option>
                    </select>
                  )}
                </div>

                {/* Quan hệ với chủ hộ nếu là người cùng hộ */}
                {!isPrimary && relationToPrimary === "FAMILY" && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 rounded-lg border border-slate-100 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-800/40">
                    <label className="flex flex-col gap-1 font-semibold text-slate-700 dark:text-slate-200">
                      <span>Người đại diện hộ</span>
                      <select
                        value={householdHeadId}
                        onChange={(e) => setHouseholdHeadId(e.target.value)}
                        className="rounded-lg border border-slate-200 bg-white p-2 text-xs font-normal text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      >
                        <option value="">Chọn người đại diện</option>
                        {householdHeadOptions.map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.fullName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 font-semibold text-slate-700 dark:text-slate-200">
                      <span>Mối quan hệ</span>
                      <RelationshipCombobox
                        value={relationship}
                        onChange={setRelationship}
                      />
                    </label>
                  </div>
                )}

                {/* Ghi chú */}
                <label className="flex flex-col gap-1 font-semibold text-slate-700 dark:text-slate-200">
                  <span>Ghi chú thêm</span>
                  <textarea
                    rows={2}
                    placeholder="Thông tin lưu ý về khách lưu trú (nếu có)"
                    value={extraNotes}
                    onChange={(e) => setExtraNotes(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-white p-2 text-xs font-normal text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </label>
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
