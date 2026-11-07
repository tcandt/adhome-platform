import { Button } from '@animate-ui/react/primitives/buttons/button';
import { ShimmeringText } from '@animate-ui/react/primitives/texts/shimmering';
import React, { useState, useEffect, useRef } from "react";
import { Dialog } from "@animate-ui/react/primitives/base-ui/dialog";
import { Collapsible } from "@animate-ui/react/primitives/base-ui/collapsible";
import {
  X,
  Home,
  Users,
  Wallet,
  FileSignature,
  Receipt,
  Globe,
  EyeOff,
  Zap,
  Droplets,
  AlertTriangle,
  Plus,
  Trash2,
  CheckCircle2,
  Calendar,
  ArrowRight,
  Settings2,
  BookOpen,
  ImagePlus,
  ChevronDown,
  FileText,
  Pencil,
} from "lucide-react";
import { usePortfolio } from "../../../app/providers/PortfolioContext";
import { useAuth } from "../../../app/providers/AuthContext";
import { ContractDocumentDialog, ContractDocumentLink } from "../../../shared/ui/ContractDocumentDialog";
import { ActionMenu } from "../../../shared/ui/ActionMenu";
import {
  ConsoleRoomDto,
  RoomOccupantDto,
} from "../../../shared/types/portfolio";

interface Props {
  rentalContent?: React.ReactNode;
  initialTab?: "overview" | "occupants";
  onAddRental?: (roomId: string) => void;
  isOpen: boolean;
  room: ConsoleRoomDto | null;
  onClose: () => void;
  onOpenContractWizard: (roomId: string, reservationId?: string) => void;
  onOpenReservationModal: (roomId: string) => void;
  onOpenExtendModal?: (contract: any) => void;
  onOpenTerminateModal?: (contract: any) => void;
  onEditRoom?: (room: ConsoleRoomDto) => void;
  onOpenLegacyImport?: (roomId: string) => void;
}

export const RoomProfileModal: React.FC<Props> = ({
  rentalContent,
  isOpen,
  initialTab = "overview",
  onAddRental,
  room,
  onClose,
  onOpenContractWizard,
  onOpenReservationModal,
  onOpenExtendModal,
  onOpenTerminateModal,
  onEditRoom,
  onOpenLegacyImport,
}) => {
  const { refreshPortfolio, updateRoom } = usePortfolio();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const { user, hasCapability } = useAuth();

  const [activeTab, setActiveTab] = useState<
    "overview" | "occupants" | "deposits" | "contracts" | "finance"
  >("overview");
  const [occupantsList, setOccupantsList] = useState<RoomOccupantDto[]>([]);
  const [workflow, setWorkflow] = useState<any>(null);
  const [workflowLoading, setWorkflowLoading] = useState(false);
  const [isLoadingOccupants, setIsLoadingOccupants] = useState<boolean>(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [savingRentalModel, setSavingRentalModel] = useState(false);
  const [album, setAlbum] = useState<NonNullable<ConsoleRoomDto['images']>>([]);
  const [albumBusy, setAlbumBusy] = useState(false);
  const [albumProgress, setAlbumProgress] = useState('');
  const [albumError, setAlbumError] = useState('');
  const [albumExpanded, setAlbumExpanded] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
  );
  const albumInput = useRef<HTMLInputElement>(null);
  const [documentContractId, setDocumentContractId] = useState<string | null>(null);

  // New occupant form state
  const [isAddingOccupant, setIsAddingOccupant] = useState<boolean>(false);
  const [occFullName, setOccFullName] = useState<string>("");
  const [occPhone, setOccPhone] = useState<string>("");
  const [occIdNumber, setOccIdNumber] = useState<string>("");
  const [occRelation, setOccRelation] = useState<
    "FAMILY" | "ROOMMATE" | "OTHER"
  >("FAMILY");
  const occRegStatus = "PENDING";

  // Handover baseline modal
  const [isHandoverOpen, setIsHandoverOpen] = useState<boolean>(false);
  const [handoverKwh, setHandoverKwh] = useState<number>(0);
  const [handoverM3, setHandoverM3] = useState<number>(0);

  // Cancel reservation modal
  const [isCancelResvOpen, setIsCancelResvOpen] = useState<boolean>(false);
  const [cancelRefundVnd, setCancelRefundVnd] = useState<number>(0);
  const [cancelReason, setCancelReason] = useState<string>(
    "Khách hủy không thuê",
  );

  useEffect(() => {
    contentRef.current?.scrollTo(0, 0);
  }, [activeTab]);
  useEffect(() => {
    setAlbum(room?.images || []);
    setAlbumError('');
    setAlbumExpanded(window.matchMedia('(min-width: 768px)').matches);
  }, [room?.id, room?.images]);

  const prepareImage = async (file: File): Promise<Blob> => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return file;
    if (!['image/heic', 'image/heif'].includes(file.type)) throw new Error('Chỉ hỗ trợ ảnh JPEG, PNG, WebP hoặc HEIC.');
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Không xử lý được ảnh HEIC trên thiết bị này.');
      context.drawImage(image, 0, 0);
      const toJpeg = (quality: number) => new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Không chuyển được ảnh HEIC.')), 'image/jpeg', quality));
      let result = await toJpeg(0.94);
      if (result.size > 8 * 1024 * 1024) result = await toJpeg(0.85);
      return result;
    } finally { URL.revokeObjectURL(url); }
  };
  const addAlbumImages = async (files: FileList | null) => {
    if (!room || !files?.length || albumBusy) return;
    const selected = Array.from(files);
    if (album.length + selected.length > 12) { setAlbumError('Album tối đa 12 ảnh.'); return; }
    setAlbumBusy(true); setAlbumError('');
    try {
      for (const [index, file] of selected.entries()) {
        setAlbumProgress(`Đang tải ảnh ${index + 1}/${selected.length}…`);
        const image = await prepareImage(file);
        if (image.size > 8 * 1024 * 1024) throw new Error('Ảnh vượt quá 8 MB. Hãy chọn ảnh nhỏ hơn.');
        const response = await fetch(`/api/v1/console/v2/rooms/${encodeURIComponent(room.id)}/images`, { method: 'POST', headers: { 'Content-Type': image.type, 'X-Requested-With': 'AdHome-Console' }, body: image });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.ok) throw new Error(result.message || 'Không lưu được ảnh.');
        setAlbum(result.images);
      }
      await refreshPortfolio();
      setActionFeedback('Đã cập nhật album ảnh phòng.');
    } catch (error) { setAlbumError(error instanceof Error ? error.message : 'Không tải được ảnh.'); }
    finally { setAlbumBusy(false); setAlbumProgress(''); }
  };
  const deleteAlbumImage = async (imageId: string) => {
    if (!room || albumBusy) return;
    setAlbumBusy(true); setAlbumError(''); setAlbumProgress('Đang xóa ảnh…');
    try {
      const response = await fetch(`/api/v1/console/v2/rooms/${encodeURIComponent(room.id)}/images/${imageId}`, { method: 'DELETE', headers: { 'X-Requested-With': 'AdHome-Console' } });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.message || 'Không xóa được ảnh.');
      setAlbum(result.images);
      await refreshPortfolio();
      setActionFeedback('Đã xóa ảnh khỏi album.');
    } catch (error) { setAlbumError(error instanceof Error ? error.message : 'Không xóa được ảnh.'); }
    finally { setAlbumBusy(false); setAlbumProgress(''); }
  };

  // Load occupants when room changes or modal opens
  const loadOccupants = async () => {
    if (!room) return;
    setIsLoadingOccupants(true);
    try {
      const res = await fetch(
        `/api/v1/console/v2/rooms/${encodeURIComponent(room.id)}/occupants`,
      );
      const data = await res.json();
      if (res.ok && Array.isArray(data.occupants)) {
        setOccupantsList(data.occupants);
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingOccupants(false);
    }
  };
  const loadWorkflow = async (roomId: string) => {
    setWorkflowLoading(true);
    try {
      const response = await fetch(`/api/v1/console/v2/rental-workflow/${encodeURIComponent(roomId)}`);
      const data = await response.json();
      setWorkflow(response.ok && data.ok ? data : null);
    } catch { setWorkflow(null); }
    finally { setWorkflowLoading(false); }
  };

  useEffect(() => {
    if (isOpen && room && !rentalContent) {
      setActiveTab(initialTab);
      setOccupantsList([]);
      setWorkflow(null);
      setIsAddingOccupant(false);
      setIsHandoverOpen(false);
      setIsCancelResvOpen(false);
      setActionFeedback(null);
      void loadOccupants();
      void loadWorkflow(room.id);
    }
  }, [isOpen, room?.id, initialTab, Boolean(rentalContent)]);

  if (!isOpen || !room) return null;

  const canManageRooms = hasCapability("canManageRooms");
  const pendingReservation = workflow?.reservation && ['PENDING', 'CONFIRMED'].includes(workflow.reservation.status) ? workflow.reservation : room.activeReservation;
  const pendingContract = workflow?.contract && ['DRAFT', 'ACTIVE', 'EXPIRING', 'EXTENDED'].includes(workflow.contract.status) ? workflow.contract : room.activeContract;
  const pendingPeople = pendingContract?.status === 'DRAFT' && workflow?.profile ? [workflow.profile.tenant, ...(workflow.profile.members || [])] : pendingReservation && !pendingContract ? [workflow?.profile?.tenant || { fullName: pendingReservation.customerName, phone: pendingReservation.customerPhone }, ...(workflow?.profile?.members || [])] : [];
  const pendingInvoice = pendingContract?.invoices?.find((item: any) => item.status !== 'VOID');
  const canManageContracts = hasCapability("canManageContracts");
  const residentRows = pendingPeople.length > 0
    ? pendingPeople.map((person: any, index: number) => ({
        id: `pending-${index}-${person.fullName || 'guest'}`,
        fullName: person.fullName || 'Chưa nhập tên',
        phone: person.phone || '',
        contractId: pendingContract?.id || null,
      }))
    : occupantsList.filter(occupant => occupant.isActive).map(occupant => ({
        id: occupant.id,
        fullName: occupant.fullName,
        phone: occupant.phone || '',
        contractId: occupant.contractId || room.activeContract?.id || null,
      }));
  const residentCount = pendingPeople.length || occupantsList.filter(occupant => occupant.isActive).length;
  const canAddResident = canManageContracts && residentCount < room.maxOccupants && Boolean(onAddRental || room.activeContract);
  const addResident = () => {
    if (room.rentalModel === 'SHARED_ROOM' || pendingContract || pendingReservation || !room.activeContract) onAddRental?.(room.id);
    else setIsAddingOccupant(true);
  };
  const canPublishRooms =
    user?.backendRole === "ADMIN" ||
    Boolean(user?.permissions.includes("rooms.publish.write"));
  const roomStatus =
    (
      {
        AVAILABLE: "Còn trống",
        OCCUPIED: "Đang thuê",
        RESERVED: "Giữ chỗ",
        MAINTENANCE: "Bảo trì",
        ARCHIVED: "Lưu trữ",
      } as Record<string, string>
    )[room.occupancyStatus] || "Chưa xác định";
  const statusStyle =
    room.occupancyStatus === "AVAILABLE"
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
      : room.occupancyStatus === "OCCUPIED"
        ? "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300"
        : room.occupancyStatus === "RESERVED"
          ? "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";

  // Toggle Landing publication
  const handleToggleRoomPublish = async () => {
    try {
      const nextStatus = !room.isPublishedToLanding;
      const res = await updateRoom(room.id, {
        isPublishedToLanding: nextStatus,
      });
      if (res.ok) {
        setActionFeedback(
          nextStatus
            ? "Đã xuất bản phòng thành công lên Landing Page."
            : "Đã gỡ phòng khỏi Landing Page (chỉ lưu hành nội bộ).",
        );
      } else {
        setActionFeedback(
          res.message || "Không thể cập nhật hiển thị trên website.",
        );
      }
    } catch {
      setActionFeedback("Lỗi kết nối khi cập nhật trạng thái xuất bản.");
    }
  };

  // Add new occupant
  const handleAddOccupantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!occFullName.trim()) return;
    if (room.rentalModel === 'SHARED_ROOM') { onAddRental?.(room.id); return; }

    try {
      const res = await fetch(
        `/api/v1/console/v2/rooms/${encodeURIComponent(room.id)}/occupants`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Requested-With": "AdHome-Console" },
          body: JSON.stringify({
            fullName: occFullName.trim(),
            phone: occPhone.trim() || undefined,
            idNumber: occIdNumber.trim() || undefined,
            relationToPrimary: occRelation,
            residenceRegStatus: occRegStatus,
          }),
        },
      );
      if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.message || 'Không thể thêm người lưu trú.'); }
      if (res.ok) {
        setIsAddingOccupant(false);
        setOccFullName("");
        setOccPhone("");
        setOccIdNumber("");
        await loadOccupants();
        await refreshPortfolio();
        setActionFeedback("Đã thêm người lưu trú thành công.");
      }
    } catch (error) {
      setActionFeedback(error instanceof Error ? error.message : "Lỗi kết nối khi thêm người lưu trú.");
    }
  };

  // Remove occupant
  const handleRemoveOccupant = async (occId: string) => {
    if (!window.confirm("Bạn có chắc muốn xóa người lưu trú này?")) return;
    try {
      const res = await fetch(
        `/api/v1/console/v2/occupants/${encodeURIComponent(occId)}`,
        {
          method: "DELETE",
          headers: { "X-Requested-With": "AdHome-Console" },
        },
      );
      if (res.ok) {
        await loadOccupants();
        await refreshPortfolio();
        setActionFeedback("Đã xóa người lưu trú.");
      }
    } catch {
      setActionFeedback("Lỗi kết nối khi xóa người lưu trú.");
    }
  };

  // Confirm Reservation Payment
  const handleConfirmReservationPayment = async (resvId: string) => {
    try {
      const res = await fetch(
        `/api/v1/console/v2/reservations/${encodeURIComponent(resvId)}/confirm-payment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Requested-With": "AdHome-Console" },
          body: JSON.stringify({ paymentMethod: "BANK_TRANSFER" }),
        },
      );
      if (res.ok) {
        await refreshPortfolio();
        setActionFeedback(
          "Đã xác nhận thu tiền cọc giữ phòng và ghi nhận sổ quỹ.",
        );
      }
    } catch {
      setActionFeedback("Lỗi xác nhận thanh toán.");
    }
  };

  // Submit Cancel Reservation
  const handleCancelReservationSubmit = async (resvId: string) => {
    try {
      const res = await fetch(
        `/api/v1/console/v2/reservations/${encodeURIComponent(resvId)}/cancel`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Requested-With": "AdHome-Console" },
          body: JSON.stringify({
            reason: cancelReason,
            refundAmountVnd: cancelRefundVnd,
          }),
        },
      );
      if (res.ok) {
        setIsCancelResvOpen(false);
        await refreshPortfolio();
        setActionFeedback("Đã hủy phiếu giữ chỗ và hoàn trả trạng thái phòng.");
      }
    } catch {
      setActionFeedback("Lỗi kết nối khi hủy giữ chỗ.");
    }
  };

  // Submit Handover baseline
  const handleHandoverSubmit = async (contractId: string) => {
    try {
      const res = await fetch(
        `/api/v1/console/v2/contracts/${encodeURIComponent(contractId)}/handover`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Requested-With": "AdHome-Console" },
          body: JSON.stringify({
            handoverMeterKwh: handoverKwh,
            handoverWaterM3: handoverM3,
          }),
        },
      );
      if (res.ok) {
        setIsHandoverOpen(false);
        await refreshPortfolio();
        setActionFeedback(
          "Đã ghi nhận bàn giao phòng và chỉ số công tơ cơ sở.",
        );
      }
    } catch {
      setActionFeedback("Lỗi kết nối khi bàn giao phòng.");
    }
  };

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) {
          if (isHandoverOpen) setIsHandoverOpen(false);
          else if (isCancelResvOpen) setIsCancelResvOpen(false);
          else onClose();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[100] bg-slate-950/50 backdrop-blur-[2px]" />
        <Dialog.Viewport
          data-testid="room-profile-modal"
          className="fixed inset-0 z-[101] flex items-center justify-center p-2 sm:p-6"
        >
          <Dialog.Popup
            from="bottom"
            data-testid="room-detail-drawer"
            className="room-detail-popup relative flex h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-2xl outline-none dark:border-slate-800 dark:bg-[#111827] dark:text-slate-100 sm:h-[min(94dvh,54rem)] sm:max-h-[min(94dvh,54rem)]"
          >
            <div className="room-detail-header shrink-0 border-b border-slate-100 px-4 py-2 dark:border-slate-800">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 pt-1">
                  <Dialog.Title className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                    Phòng {room.code}
                  </Dialog.Title>
                  <Dialog.Description className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                    <span>{room.buildingName} · {room.floorName}</span>
                    {!rentalContent && <><span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${statusStyle}`}>{roomStatus}</span><span className="text-[11px]">{room.roomType} · {room.area} m² · {room.rentalModel === 'SHARED_ROOM' ? 'Ở ghép' : 'Nguyên căn'}</span></>}
                  </Dialog.Description>
                </div>
                <div className="-mr-2 flex shrink-0 items-center gap-0.5">
                  {!rentalContent && onEditRoom && canManageRooms && (
                    <button
                      type="button"
                      data-testid="btn-open-edit-room"
                      aria-label="Cấu hình phòng"
                      title="Cấu hình phòng"
                      onClick={() => onEditRoom(room)}
                      className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                      <Settings2 className="h-[18px] w-[18px]" />
                    </button>
                  )}
                  <Dialog.Close
                    data-testid="room-modal-close"
                    aria-label="Đóng chi tiết phòng"
                    className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    <X className="h-5 w-5" />
                  </Dialog.Close>
                </div>
              </div>
            </div>
            {rentalContent ? <div className="flex flex-1 min-h-0 flex-col overflow-hidden px-3 pt-2 sm:px-5" data-testid="room-rental-content">{rentalContent}</div> : <>
            <div
              role="tablist"
              aria-label="Thông tin phòng"
              className="grid shrink-0 grid-cols-5 border-b border-slate-200 bg-slate-50/70 px-2 dark:border-slate-800 dark:bg-slate-900/50 sm:px-4"
              onKeyDown={(event) => {
                if (
                  !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                    event.key,
                  )
                )
                  return;
                event.preventDefault();
                const buttons = Array.from(
                  event.currentTarget.querySelectorAll<HTMLButtonElement>(
                    '[role="tab"]',
                  ),
                );
                const index = buttons.indexOf(
                  document.activeElement as HTMLButtonElement,
                );
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? buttons.length - 1
                      : (index +
                          (event.key === "ArrowRight" ? 1 : -1) +
                          buttons.length) %
                        buttons.length;
                buttons[next]?.click();
                buttons[next]?.focus();
              }}
            >
              {[
                { id: "overview", label: "Tổng quan", icon: Home },
                { id: "occupants", label: "Khách ở", icon: Users },
                { id: "deposits", label: "Đặt cọc", icon: Wallet },
                { id: "contracts", label: "Hợp đồng", icon: FileSignature },
                { id: "finance", label: "Thu chi", icon: Receipt },
              ].map((tab) => {
                const Icon = tab.icon;
                const selected = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    id={`room-tab-${tab.id}`}
                    aria-selected={selected}
                    aria-controls={`room-panel-${tab.id}`}
                    tabIndex={selected ? 0 : -1}
                    data-testid={`room-modal-tab-${tab.id}`}
                    onClick={() => setActiveTab(tab.id as typeof activeTab)}
                    className={`room-detail-tab flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 border-b-2 px-0.5 text-xs font-medium transition-colors sm:flex-row sm:gap-2 ${selected ? "border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-300" : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"}`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="whitespace-nowrap">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* FEEDBACK ALERT */}
            {actionFeedback && (
              <div className="p-3 mx-5 mt-4 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-xs text-blue-700 dark:text-blue-300 flex items-center justify-between">
                <span>{actionFeedback}</span>
                <button
                  type="button"
                  onClick={() => setActionFeedback(null)}
                  className="p-1 text-blue-500 hover:text-blue-700"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* TAB CONTENTS */}
            <div
              ref={contentRef}
              role="tabpanel"
              id={`room-panel-${activeTab}`}
              aria-labelledby={`room-tab-${activeTab}`}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 text-xs sm:p-6"
            >
              {/* TAB 1: TỔNG QUAN */}
              {activeTab === "overview" && (
                <div className="space-y-5">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Dạng phòng
                    <select className="mt-2 w-full rounded-lg border border-slate-200 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-800" value={room.rentalModel === 'SHARED_ROOM' ? 'SHARED_ROOM' : 'ENTIRE_ROOM'} disabled={!canManageRooms || savingRentalModel} onChange={async event => {
                      const rentalModel = event.target.value as 'ENTIRE_ROOM' | 'SHARED_ROOM';
                      setSavingRentalModel(true);
                      try {
                        const result = await updateRoom(room.id, { rentalModel });
                        if (!result.ok) throw new Error(result.message || 'Không lưu được dạng phòng.');
                        await refreshPortfolio();
                        setActionFeedback('Đã cập nhật dạng phòng.');
                      } catch (error) { setActionFeedback(error instanceof Error ? error.message : 'Không lưu được dạng phòng.'); }
                      finally { setSavingRentalModel(false); }
                    }}><option value="ENTIRE_ROOM">Nguyên căn</option><option value="SHARED_ROOM">Ở ghép</option></select>
                  </label>
                  <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Giá thuê niêm yết
                    </p>
                    <p className="mt-1 text-xl font-semibold tracking-tight tabular-nums text-slate-900 dark:text-white">
                      {room.listPriceVnd.toLocaleString("vi-VN")} đ
                      <span className="ml-1 text-xs font-normal text-slate-400">
                        /tháng
                      </span>
                    </p>
                    <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-200/70 pt-3 dark:border-slate-700">
                      <div>
                        <dt className="text-[11px] text-slate-500">Tiền cọc</dt>
                        <dd className="mt-1 font-semibold">
                          {room.depositMonths} tháng tiền thuê
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-slate-500">
                          Số người tối đa
                        </dt>
                        <dd className="mt-1 font-semibold">
                          {room.maxOccupants} người
                        </dd>
                      </div>
                    </dl>
                    <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-200/70 pt-3 dark:border-slate-700" aria-label="Điện và nước">
                      <div className="min-w-0"><dt className="flex items-center gap-1.5 text-[11px] text-slate-500"><Zap className="h-3.5 w-3.5" />Điện</dt><dd className="mt-1 font-semibold tabular-nums">{room.effectiveElectricRateVnd.toLocaleString('vi-VN')} đ/kWh</dd></div>
                      <div className="min-w-0"><dt className="flex items-center gap-1.5 text-[11px] text-slate-500"><Droplets className="h-3.5 w-3.5" />Nước</dt><dd className="mt-1 font-semibold tabular-nums">{room.effectiveWaterRateVnd.toLocaleString('vi-VN')} đ/{room.effectiveWaterMethod === 'PER_PERSON' ? 'người' : room.effectiveWaterMethod === 'FIXED_PER_ROOM' ? 'phòng' : 'm³'}</dd></div>
                    </dl>
                  </div>
                  <Collapsible.Root open={albumExpanded} onOpenChange={setAlbumExpanded}>
                  <section aria-label="Album ảnh phòng" className="space-y-3">
                    <Collapsible.Trigger className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 text-left dark:border-slate-700 dark:bg-slate-800/50 md:border-0 md:bg-transparent md:p-0 dark:md:bg-transparent">
                      {album[0] && <img src={`/api/v1/console/v2/rooms/${encodeURIComponent(room.id)}/images/${album[0].id}`} alt="Ảnh bìa phòng" loading="lazy" className="h-11 w-11 shrink-0 rounded-lg object-cover md:hidden" />}
                      <span className="min-w-0 flex-1"><span className="block font-semibold text-slate-900 dark:text-white">Album ảnh</span><span className="mt-0.5 block text-[11px] text-slate-500">{album.length}/12 ảnh · <span className="md:hidden">{albumExpanded ? 'Thu gọn album' : 'Mở album khi cần'}</span><span className="hidden md:inline">Ảnh đầu tiên là ảnh bìa trên landing</span></span></span>
                      <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${albumExpanded ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </Collapsible.Trigger>
                    <input ref={albumInput} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple className="sr-only" aria-label="Chọn ảnh phòng" onChange={event => { void addAlbumImages(event.target.files); event.target.value = ''; }} />
                    <Collapsible.Panel className="space-y-3">
                    {canManageRooms && <Button type="button" disabled={albumBusy || album.length >= 12} onClick={() => albumInput.current?.click()} className="flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-blue-700 dark:border-slate-700 dark:text-blue-300 md:ml-auto"><ImagePlus size={15} />Thêm ảnh</Button>}
                    {album.length ? <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{album.map((image, index) => <div key={image.id} className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"><a href={`/api/v1/console/v2/rooms/${encodeURIComponent(room.id)}/images/${image.id}`} target="_blank" rel="noreferrer" aria-label={`Xem ảnh phòng ${index + 1}`}><img src={`/api/v1/console/v2/rooms/${encodeURIComponent(room.id)}/images/${image.id}`} alt={image.alt} loading="lazy" className="aspect-square w-full object-cover" /></a>{index === 0 && <span className="absolute bottom-1 left-1 rounded bg-slate-900/75 px-1.5 py-0.5 text-[10px] text-white">Ảnh bìa</span>}{canManageRooms && <Button type="button" disabled={albumBusy} aria-label={`Xóa ảnh ${index + 1}`} onClick={() => void deleteAlbumImage(image.id)} className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded bg-white/95 text-rose-600 shadow"><Trash2 size={13} /></Button>}</div>)}</div> : <p className="rounded-lg border border-dashed border-slate-200 px-3 py-5 text-center text-[11px] text-slate-500 dark:border-slate-700">Chưa có ảnh phòng. Thêm ảnh để hiển thị trên landing khi phòng được xuất bản.</p>}
                    {albumBusy && <p role="status" className="text-xs text-blue-700 dark:text-blue-300"><span className="sr-only">{albumProgress}</span><span aria-hidden="true"><ShimmeringText text={albumProgress} /></span></p>}
                    {albumError && <p role="alert" className="text-xs text-rose-600">{albumError}</p>}
                    </Collapsible.Panel>
                  </section>
                  </Collapsible.Root>
                  <section
                    className="border-t border-slate-100 pt-4 dark:border-slate-800"
                    aria-label="Hiển thị trên website"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="flex items-center gap-2 font-semibold">
                        <Globe className="h-4 w-4 text-slate-400" />
                        Website cho thuê
                      </h3>
                      <span className="shrink-0 text-[11px] text-slate-500">
                        {room.isPublishedToLanding
                          ? "Đang hiển thị"
                          : "Chưa hiển thị"}
                      </span>
                    </div>
                    {canPublishRooms && (
                      <button
                        type="button"
                        onClick={handleToggleRoomPublish}
                        className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        {room.isPublishedToLanding ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Globe className="h-3.5 w-3.5" />
                        )}
                        {room.isPublishedToLanding
                          ? "Ẩn khỏi website"
                          : "Hiển thị trên website"}
                      </button>
                    )}
                  </section>
                  {room.occupancyStatus === "AVAILABLE" &&
                    canManageContracts &&
                    onOpenLegacyImport && !onAddRental && (
                      <button
                        type="button"
                        data-testid="btn-room-intent-legacy-import"
                        onClick={() => onOpenLegacyImport(room.id)}
                        className="flex min-h-11 items-center gap-2 text-[11px] font-medium text-slate-500 hover:text-blue-700 dark:text-slate-400"
                      >
                        <BookOpen className="h-3.5 w-3.5" />
                        Nhập hợp đồng từ sổ giấy
                      </button>
                    )}
                </div>
              )}

              {/* TAB 2: KHÁCH LƯU TRÚ & NGƯỜI Ở CÙNG */}
              {activeTab === "occupants" && (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div><h4 className="text-sm font-semibold text-slate-900 dark:text-white">Khách lưu trú <span className="ml-1 font-normal text-slate-400">{residentCount}/{room.maxOccupants}</span></h4><p className="mt-1 text-xs leading-relaxed text-slate-500">Khách thuê và người cùng ở trong phòng.</p></div>
                    {canAddResident && !isAddingOccupant && <Button type="button" onClick={addResident} aria-label="Thêm khách thuê" title="Thêm khách thuê" data-testid="btn-add-room-tenant" hoverScale={1.04} tapScale={0.92} className="flex h-8 w-8 shrink-0 items-center justify-center border-0 bg-transparent p-0 text-blue-700 shadow-none hover:bg-transparent dark:bg-transparent dark:text-blue-300 dark:hover:bg-transparent"><Plus size={18} /></Button>}
                  </div>
                  {/* Add Occupant Form Drawer/Card */}
                  {isAddingOccupant && (
                    <form
                      onSubmit={handleAddOccupantSubmit}
                      className="p-3.5 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20 space-y-3"
                    >
                      <div className="font-bold text-xs text-blue-900 dark:text-blue-200">
                        Thêm người cùng lưu trú vào phòng {room.code}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <input
                          type="text"
                          placeholder="Họ và tên *"
                          value={occFullName}
                          onChange={(e) => setOccFullName(e.target.value)}
                          required
                          className="p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                        />
                        <input
                          type="text"
                          placeholder="Số điện thoại"
                          value={occPhone}
                          onChange={(e) => setOccPhone(e.target.value)}
                          className="p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                        />
                        <input
                          type="text"
                          placeholder="Số CCCD"
                          value={occIdNumber}
                          onChange={(e) => setOccIdNumber(e.target.value)}
                          className="p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                        />
                        <select
                          value={occRelation}
                          onChange={(e) =>
                            setOccRelation(e.target.value as any)
                          }
                          className="p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                        >
                          <option value="ROOMMATE" disabled>Bạn cùng phòng cần hợp đồng riêng</option>
                          <option value="FAMILY">Người thân / Gia đình</option>
                          <option value="OTHER">Khác</option>
                        </select>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setIsAddingOccupant(false)}
                          className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400"
                        >
                          Hủy
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-1.5 text-xs font-bold bg-brand-primary text-white rounded-lg"
                        >
                          Lưu người lưu trú
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Occupants List */}
                  {isLoadingOccupants || workflowLoading ? (
                    <p className="py-8 text-center text-slate-500">
                      Đang tải khách lưu trú…
                    </p>
                  ) : residentRows.length === 0 ? (
                    <div className="flex flex-col items-center px-4 py-7 text-center">
                      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800"><Users size={23} strokeWidth={1.5} /></div>
                      <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{room.activeContract ? 'Chưa có người cùng ở' : room.activeReservation ? 'Phòng đang được giữ chỗ' : 'Sẵn sàng đón khách mới'}</h4>
                      <p className="mt-1 max-w-64 text-xs leading-5 text-slate-500">{room.activeContract ? 'Thêm thông tin người lưu trú để hoàn thiện hồ sơ cư trú.' : room.activeReservation ? 'Mở hồ sơ thuê để tiếp tục lập hợp đồng khi khách nhận phòng.' : 'Thêm khách thuê, lập hợp đồng và tự điền tờ khai cư trú từ cùng một bộ thông tin.'}</p>
                      {canManageContracts && onAddRental && !room.activeContract && !room.activeReservation && <Button type="button" onClick={() => onAddRental(room.id)} className="rental-button rental-button-primary mt-3"><Plus size={14} />Thêm khách thuê</Button>}
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700" data-testid="room-occupants-table">
                      <table className="w-full table-fixed border-collapse text-left text-xs">
                        <colgroup><col className="w-10" /><col /><col className="w-[31%]" /><col className="w-14" /></colgroup>
                        <thead className="bg-slate-50 text-[10px] font-semibold uppercase text-slate-500 dark:bg-slate-800/80 dark:text-slate-400"><tr><th className="px-2 py-2 text-center">STT</th><th className="px-2 py-2">Tên khách hàng</th><th className="px-2 py-2">SĐT</th><th className="px-2 py-2 text-center">Hành động</th></tr></thead>
                        <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-[#111827]">{residentRows.map((resident, index) => <tr key={resident.id}><td className="px-2 py-2.5 text-center tabular-nums text-slate-500">{index + 1}</td><td className="break-words px-2 py-2.5 font-semibold text-slate-900 dark:text-white">{resident.fullName}</td><td className="break-all px-2 py-2.5 tabular-nums text-slate-600 dark:text-slate-300">{resident.phone || '—'}</td><td className="px-1 py-1 text-center">{canManageContracts && <ActionMenu ariaLabel={`Hành động cho ${resident.fullName}`} contextTitle={resident.fullName} contextSubtitle={resident.phone || 'Chưa có SĐT'} items={[{ label: 'Xem PDF hợp đồng', icon: <FileText size={16} />, disabled: !resident.contractId, onClick: () => resident.contractId && setDocumentContractId(resident.contractId) }, { label: 'Chỉnh sửa thông tin', icon: <Pencil size={16} />, onClick: () => onAddRental?.(room.id), disabled: !onAddRental }]} />}</td></tr>)}</tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: ĐẶT CỌC & GIỮ CHỖ */}
              {activeTab === "deposits" && (
                <div className="space-y-4">
                  {pendingReservation ? (
                    <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                          <Wallet className="w-4 h-4 text-amber-600" />
                          Phiếu giữ chỗ hiện tại (
                          {pendingReservation.reservationCode})
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                          {pendingReservation.status === "CONFIRMED"
                            ? "Đã thu cọc"
                            : "Chờ thu cọc"}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          Khách giữ chỗ:{" "}
                          <b>{pendingReservation.customerName}</b>
                        </div>
                        <div>
                          Số điện thoại:{" "}
                          <b>{pendingReservation.customerPhone}</b>
                        </div>
                        <div>
                          Tiền giữ phòng:{" "}
                          <b>
                            {Number(pendingReservation.holdAmountVnd).toLocaleString(
                              "vi-VN",
                            )}{" "}
                            đ
                          </b>
                        </div>
                        <div>
                          Hạn giữ chỗ:{" "}
                          <b>
                            {pendingReservation.holdUntil
                              ? pendingReservation.holdUntil.slice(0, 10)
                              : "Chưa đặt"}
                          </b>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-amber-200/80 dark:border-amber-900 flex flex-wrap items-center justify-end gap-2">
                        {pendingReservation.status === "PENDING" && (
                          <button
                            type="button"
                            onClick={() => onAddRental?.(room.id)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                          >
                            Xem hồ sơ & xác nhận thu cọc
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onAddRental ? onAddRental(room.id) : setIsCancelResvOpen(true)}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-100 hover:bg-rose-200 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                        >
                          Xem / sửa hồ sơ
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onOpenContractWizard(
                              room.id,
                              pendingReservation!.id,
                            )
                          }
                          className="px-4 py-1.5 rounded-lg text-xs font-bold bg-brand-primary hover:bg-brand-hover text-white shadow-sm flex items-center gap-1"
                        >
                          Chuyển thành Hợp đồng thuê{" "}
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
                      <p>
                        Phòng {room.code} hiện không có phiếu giữ chỗ nào đang
                        hoạt động.
                      </p>
                      {room.occupancyStatus === "AVAILABLE" && (
                        <button
                          type="button"
                          onClick={() => onOpenReservationModal(room.id)}
                          className="px-4 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-xl shadow-sm inline-flex items-center gap-1.5"
                        >
                          <Plus className="w-3.5 h-3.5" /> Tạo phiếu giữ chỗ mới
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: HỢP ĐỒNG THUÊ */}
              {activeTab === "contracts" && (
                <div className="space-y-4">
                  {pendingContract ? (
                    <div className="room-contract-card p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/40 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="min-w-0 font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <FileSignature className="w-4 h-4 text-brand-primary" />
                          <ContractDocumentLink contractId={pendingContract.id}>{pendingContract.contractCode}</ContractDocumentLink>
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          {({ ACTIVE: 'Đang thuê', DRAFT: 'Chờ thanh toán', EXPIRING: 'Sắp hết hạn', EXTENDED: 'Đã gia hạn', TERMINATED: 'Đã kết thúc' } as Record<string, string>)[pendingContract.status] || pendingContract.status}
                        </span>
                      </div>

                      <div className="room-contract-details grid grid-cols-1 gap-3 text-xs">
                        <div>
                          <span>Thời hạn</span>{" "}
                          <b>
                            {pendingContract.startDate.split('-').reverse().join('/')} –{" "}
                            {pendingContract.endDate.split('-').reverse().join('/')}
                          </b>
                        </div>
                        <div>
                          <span>Giá thuê / tháng</span>{" "}
                          <b>
                            {Number(pendingContract.monthlyRentVnd).toLocaleString(
                              "vi-VN",
                            )}{" "}
                            đ/tháng
                          </b>
                        </div>
                        {room.currentTenant && (
                          <div>
                            <span>Chủ hợp đồng</span>{" "}
                            <b>
                              {room.currentTenant.fullName}
                              <span className="block font-normal text-slate-500">{room.currentTenant.phone}</span>
                            </b>
                          </div>
                        )}
                      </div>

                      {pendingInvoice && <p className="text-xs text-amber-700 dark:text-amber-300">Hóa đơn {pendingInvoice.invoiceCode} · Còn phải thu {Math.max(0, Number(pendingInvoice.totalAmountVnd) - Number(pendingInvoice.paidAmountVnd)).toLocaleString('vi-VN')} đ. Thu tiền tại mục Hóa đơn.</p>}
                      <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end gap-2 flex-wrap">
                        {pendingContract.status === 'DRAFT' && onAddRental && <Button type="button" onClick={() => onAddRental(room.id)} className="min-h-11 text-xs text-blue-700 dark:text-blue-300">Xem hồ sơ nháp</Button>}
                        {pendingContract.status !== 'DRAFT' && onOpenExtendModal && (
                          <button
                            type="button"
                            onClick={() =>
                              onOpenExtendModal(room.activeContract)
                            }
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200"
                          >
                            Gia hạn
                          </button>
                        )}
                        {pendingContract.status !== 'DRAFT' && onOpenTerminateModal && (
                          <button
                            type="button"
                            onClick={() =>
                              onOpenTerminateModal(room.activeContract)
                            }
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"
                          >
                            Thanh lý hợp đồng
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
                      <p>{pendingReservation ? 'Phiếu giữ chỗ đang chờ chuyển thành hợp đồng thuê.' : `Phòng ${room.code} chưa có hợp đồng thuê.`}</p>
                      <button
                        type="button"
                        onClick={() => onOpenContractWizard(room.id)}
                        className="px-4 py-2 text-xs font-bold bg-brand-primary hover:bg-brand-hover text-white rounded-xl shadow-sm inline-flex items-center gap-1.5"
                      >
                        <FileSignature className="w-3.5 h-3.5" /> Lập hợp đồng
                        mới ngay
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 5: TÀI CHÍNH & CÔNG TƠ */}
              {activeTab === "finance" && (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="font-bold text-slate-900 dark:text-white flex items-center justify-between">
                      <span>Hóa đơn &amp; Công nợ</span>
                      {pendingInvoice ? (
                        <span className="text-amber-700 dark:text-amber-300 text-xs">{pendingInvoice.invoiceCode} · Chờ thu {Math.max(0, Number(pendingInvoice.totalAmountVnd) - Number(pendingInvoice.paidAmountVnd)).toLocaleString('vi-VN')} đ</span>
                      ) : room.unpaidInvoicesCount > 0 ? (
                        <span className="text-rose-600 font-bold flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" /> Còn{" "}
                          {room.unpaidInvoicesCount} hóa đơn chưa thu (
                          {room.unpaidAmountVnd.toLocaleString("vi-VN")} đ)
                        </span>
                      ) : (
                        <span className="text-slate-500 text-xs">{pendingReservation ? 'Cọc giữ phòng đang chờ thu' : 'Chưa có khoản phải thu'}</span>
                      )}
                    </div>
                  </div>
                  {pendingReservation && !pendingInvoice && <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-xs dark:border-amber-900 dark:bg-amber-950/20">Cọc giữ phòng {pendingReservation.reservationCode}: {Number(pendingReservation.holdAmountVnd).toLocaleString('vi-VN')} đ · {pendingReservation.status === 'CONFIRMED' ? 'Đã thu' : 'Chờ thu'}. Chưa ghi thu chi khi chưa nhận tiền.</div>}

                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-amber-500" />
                      Công tơ điện thông minh
                    </div>
                    <div className="text-slate-600 dark:text-slate-400">
                      Trạng thái kết nối Hunonic: <b>{room.meterStatus}</b>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {activeTab !== "occupants" && ((room.occupancyStatus === "AVAILABLE" && canManageContracts) ||
              (room.occupancyStatus === "RESERVED" && canManageContracts) ||
              room.occupancyStatus === "OCCUPIED") && (
              <div className="shrink-0 border-t border-slate-100 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-slate-800 dark:bg-[#111827] sm:px-6">
                {room.occupancyStatus === "AVAILABLE" && (
                  <Button type="button" data-testid="btn-room-intent-direct-contract" onClick={() => onAddRental ? onAddRental(room.id) : onOpenContractWizard(room.id)} className="rental-button rental-button-primary ml-auto"><Plus size={14} />Thêm khách thuê</Button>
                )}
                {room.occupancyStatus === "RESERVED" && (
                  <button
                    type="button"
                    data-testid="room-modal-primary-btn"
                    onClick={() => onAddRental ? onAddRental(room.id) : onOpenContractWizard(room.id, pendingReservation?.id)}
                    className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-primary text-xs font-semibold text-white hover:bg-brand-hover"
                  >
                    <FileSignature className="h-4 w-4" />
                    {pendingContract ? 'Xem hợp đồng chờ thanh toán' : 'Tiếp tục hồ sơ giữ phòng'}
                  </button>
                )}
                {room.occupancyStatus === "OCCUPIED" && (
                  <button
                    type="button"
                    data-testid="room-modal-primary-btn"
                    onClick={() => setActiveTab("occupants")}
                    className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-primary text-xs font-semibold text-white hover:bg-brand-hover"
                  >
                    <Users className="h-4 w-4" />
                    Khách lưu trú ({occupantsList.length})
                  </button>
                )}
              </div>
            )}

            {documentContractId && <ContractDocumentDialog contractId={documentContractId} onClose={() => setDocumentContractId(null)} />}

            {/* SUB-MODAL: HANDOVER BASELINE */}
            {isHandoverOpen && room.activeContract && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70">
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 w-full max-w-md border border-slate-200 dark:border-slate-800 space-y-4">
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    Bàn giao nhận phòng {room.code} — Ghi nhận chỉ số ban đầu
                  </h3>
                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="block font-semibold mb-1">
                        Chỉ số công tơ điện cơ sở (kWh)
                      </label>
                      <input
                        type="number"
                        step={0.1}
                        value={handoverKwh}
                        onChange={(e) => setHandoverKwh(Number(e.target.value))}
                        className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold mb-1">
                        Chỉ số đồng hồ nước cơ sở (m³)
                      </label>
                      <input
                        type="number"
                        step={0.1}
                        value={handoverM3}
                        onChange={(e) => setHandoverM3(Number(e.target.value))}
                        className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsHandoverOpen(false)}
                      className="px-3 py-1.5 text-xs text-slate-500"
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleHandoverSubmit(room.activeContract!.id)
                      }
                      className="px-4 py-1.5 text-xs font-bold bg-brand-primary text-white rounded-lg"
                    >
                      Lưu biên bản bàn giao
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* SUB-MODAL: CANCEL RESERVATION */}
            {isCancelResvOpen && room.activeReservation && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70">
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 w-full max-w-md border border-slate-200 dark:border-slate-800 space-y-4">
                  <h3 className="font-bold text-sm text-rose-700 dark:text-rose-300">
                    Hủy phiếu giữ chỗ {room.activeReservation.reservationCode}
                  </h3>
                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="block font-semibold mb-1">
                        Lý do hủy
                      </label>
                      <input
                        type="text"
                        value={cancelReason}
                        onChange={(e) => setCancelReason(e.target.value)}
                        className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold mb-1">
                        Số tiền hoàn lại cho khách (VND)
                      </label>
                      <input
                        type="number"
                        value={cancelRefundVnd}
                        onChange={(e) =>
                          setCancelRefundVnd(Number(e.target.value))
                        }
                        className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                      />
                      <p className="text-[11px] text-slate-400 mt-1">
                        Tiền cọc giữ chỗ:{" "}
                        {room.activeReservation.holdAmountVnd.toLocaleString(
                          "vi-VN",
                        )}{" "}
                        đ. Phần không hoàn lại sẽ tự động xử lý khấu trừ / tịch
                        thu.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsCancelResvOpen(false)}
                      className="px-3 py-1.5 text-xs text-slate-500"
                    >
                      Đóng
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleCancelReservationSubmit(
                          room.activeReservation!.id,
                        )
                      }
                      className="px-4 py-1.5 text-xs font-bold bg-rose-600 text-white rounded-lg"
                    >
                      Xác nhận hủy giữ chỗ
                    </button>
                  </div>
                </div>
              </div>
            )}
            </>}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
