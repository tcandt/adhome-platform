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
  Printer,
} from "lucide-react";
import { usePortfolio } from "../../../app/providers/PortfolioContext";
import { useAuth } from "../../../app/providers/AuthContext";
import { ContractDocumentDialog, ContractDocumentLink } from "../../../shared/ui/ContractDocumentDialog";
import { ActionMenu } from "../../../shared/ui/ActionMenu";
import { IdentityQrScanner } from "../../../shared/ui/IdentityQrScanner";
import { ContractRepresentativeSwitch } from "../../../shared/ui/ContractRepresentativeSwitch";
import { MoneyInput } from "../../../shared/ui/MoneyInput";
import { RelationshipCombobox } from "../../../shared/ui/RelationshipCombobox";
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

function getTodayIsoVn(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
}

function computeContractEndDate(startDate: string, durationMonths: 6 | 12): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return '';
  const [year, month, day] = startDate.split('-').map(Number);
  const endDate = new Date(Date.UTC(year, month - 1 + durationMonths, day));
  endDate.setUTCDate(endDate.getUTCDate() - 1);
  return endDate.toISOString().slice(0, 10);
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
  const [documentPerson, setDocumentPerson] = useState<{ personIndex?: number; occupantId?: string }>({});
  const [invoiceDetailId, setInvoiceDetailId] = useState<string | null>(null);
  const [depositDetailId, setDepositDetailId] = useState<string | null>(null);

  // New occupant form state
  const [isAddingOccupant, setIsAddingOccupant] = useState<boolean>(false);
  const [occFullName, setOccFullName] = useState<string>("");
  const [occPhone, setOccPhone] = useState<string>("");
  const [occIdNumber, setOccIdNumber] = useState<string>("");
  const [occBirthDate, setOccBirthDate] = useState<string>("");
  const [occGender, setOccGender] = useState<string>("");
  const [occAddress, setOccAddress] = useState<string>("");
  const [occRelationship, setOccRelationship] = useState<string>("");
  const [occHouseholdHeadId, setOccHouseholdHeadId] = useState<string>("");
  const [occStartDate, setOccStartDate] = useState<string>(() => getTodayIsoVn());
  const [occDurationMonths, setOccDurationMonths] = useState<6 | 12>(12);
  const [occMonthlyRentVnd, setOccMonthlyRentVnd] = useState<number>(0);
  const [occDepositVnd, setOccDepositVnd] = useState<number>(0);
  const [occRelation, setOccRelation] = useState<
    "OTHER" | "FAMILY"
  >("OTHER");
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
  const roomInvoices = (pendingContract?.invoices || []).filter((item: any) => item.status !== 'VOID');
  const pendingInvoice = roomInvoices.find((item: any) => item.status !== 'PAID') || roomInvoices[0];
  const pendingInvoiceDue = pendingInvoice
    ? Math.max(0, Number(pendingInvoice.totalAmountVnd) - Number(pendingInvoice.paidAmountVnd))
    : 0;
  const detailInvoice = roomInvoices.find((item: any) => item.id === invoiceDetailId) || pendingInvoice;
  const detailInvoiceDue = detailInvoice
    ? Math.max(0, Number(detailInvoice.totalAmountVnd) - Number(detailInvoice.paidAmountVnd))
    : 0;
  const invoiceSnapshot = (detailInvoice?.policySnapshot || {}) as Record<string, any>;
  const invoiceFormula = String(invoiceSnapshot.formula || '');
  const invoiceFormulaDates = invoiceFormula.match(/\d{4}-\d{2}-\d{2}/g) || [];
  const invoicePeriodStart = invoiceSnapshot.periodStartDate || invoiceFormulaDates[0] || pendingContract?.startDate;
  const invoicePeriodEnd = invoiceSnapshot.periodEndDate || invoiceFormulaDates[1] || detailInvoice?.dueDate;
  const invoiceBreakdown = Array.isArray(invoiceSnapshot.breakdown) ? invoiceSnapshot.breakdown : [];
  const contractDaysRemaining = pendingContract?.endDate
    ? Math.ceil((new Date(`${pendingContract.endDate}T23:59:59+07:00`).getTime() - Date.now()) / 86400000)
    : null;
  const contractExpiryNotice = pendingContract && pendingContract.status !== 'DRAFT' && contractDaysRemaining !== null &&
    (pendingContract.status === 'EXPIRING' || contractDaysRemaining <= 60)
      ? contractDaysRemaining < 0
        ? `Hợp đồng đã quá hạn ${Math.abs(contractDaysRemaining)} ngày. Cần gia hạn hoặc thanh lý.`
        : contractDaysRemaining === 0
          ? 'Hợp đồng hết hạn hôm nay. Cần gia hạn hoặc thanh lý.'
          : `Hợp đồng còn ${contractDaysRemaining} ngày sẽ hết hạn. Cần kiểm tra phương án gia hạn.`
      : null;
  const depositContracts = room.rentalModel === 'SHARED_ROOM'
    ? (workflow?.contracts || [])
    : pendingContract ? [pendingContract] : [];
  const contractDepositRows = depositContracts.flatMap((contract: any) => {
    const deposit = (contract.deposits || [])
      .filter((item: any) => item.depositType === 'CONTRACT')
      .sort((left: any, right: any) => String(right.receivedAt || right.createdAt || '').localeCompare(String(left.receivedAt || left.createdAt || '')))[0];
    if (!deposit) return [];
    const paidAmountVnd = Number(deposit.paidAmountVnd || (deposit.paymentStatus === 'PAID' ? deposit.amountVnd : 0));
    if (paidAmountVnd <= 0) return [];
    return [{ ...deposit, paidAmountVnd, customerName: contract.tenant?.fullName || contract.tenantName || room.currentTenant?.fullName || 'Khách thuê', contractId: contract.id }];
  });
  const reservationDepositRows = pendingReservation && depositContracts.length === 0
    ? (pendingReservation.deposits || []).filter((item: any) => item.depositType === 'BOOKING').map((deposit: any) => ({
        ...deposit,
        paidAmountVnd: Number(deposit.paidAmountVnd || (deposit.paymentStatus === 'PAID' ? deposit.amountVnd : 0)),
        customerName: pendingReservation.customerName,
        contractId: null,
      })).filter((deposit: any) => deposit.paidAmountVnd > 0)
    : [];
  const depositRows = room.rentalModel === 'SHARED_ROOM'
    ? contractDepositRows
    : [...contractDepositRows, ...reservationDepositRows].slice(0, 1);
  const detailDeposit = depositRows.find((deposit: any) => deposit.id === depositDetailId) || null;
  const canManageContracts = hasCapability("canManageContracts");
  const printInvoice = (invoice: any) => {
    const safe = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] || character);
    const money = (value: unknown) => `${Number(value || 0).toLocaleString('vi-VN')} đ`;
    const date = (value: unknown) => {
      const raw = String(value || '');
      return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10).split('-').reverse().join('/') : raw || '—';
    };
    const snapshot = (invoice.policySnapshot || {}) as Record<string, any>;
    const formula = String(snapshot.formula || '');
    const formulaDates = formula.match(/\d{4}-\d{2}-\d{2}/g) || [];
    const periodStart = snapshot.periodStartDate || formulaDates[0] || pendingContract?.startDate;
    const periodEnd = snapshot.periodEndDate || formulaDates[1] || invoice.dueDate;
    const breakdown = Array.isArray(snapshot.breakdown) ? snapshot.breakdown : [];
    const remaining = Math.max(0, Number(invoice.totalAmountVnd) - Number(invoice.paidAmountVnd));
    const rows = breakdown.length > 0
      ? breakdown.map((item: any) => `<tr><td>${safe(item.label)}</td><td>${safe(money(item.amountVnd))}</td></tr>`).join('')
      : `<tr><td>Tiền thuê</td><td>${safe(money(invoice.roomRentVnd))}</td></tr>${Number(invoice.adjustmentVnd || 0) !== 0 ? `<tr><td>Điều chỉnh / tiền cọc</td><td>${safe(money(invoice.adjustmentVnd))}</td></tr>` : ''}`;
    const frame = document.createElement('iframe');
    frame.setAttribute('title', `In hóa đơn ${invoice.invoiceCode}`);
    frame.style.position = 'fixed';
    frame.style.width = '1px';
    frame.style.height = '1px';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.border = '0';
    document.body.appendChild(frame);
    const target = frame.contentWindow;
    if (!target) { frame.remove(); return; }
    target.document.open();
    target.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${safe(invoice.invoiceCode)}</title><style>@page{size:A4;margin:18mm}*{box-sizing:border-box}body{margin:0;color:#172338;font:13px Arial,sans-serif}h1{margin:0;font-size:21px}.head{display:flex;justify-content:space-between;gap:20px;padding-bottom:18px;border-bottom:2px solid #2563eb}.meta{text-align:right;line-height:1.6}.info{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;margin:18px 0}.info div{display:flex;justify-content:space-between;gap:12px}.muted{color:#64748b}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{padding:10px;border-bottom:1px solid #e2e8f0;text-align:left}th:last-child,td:last-child{text-align:right}.total{margin:18px 0 0 auto;width:min(100%,320px)}.total div{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #e2e8f0}.total .due{font-weight:700;color:${remaining > 0 ? '#b45309' : '#047857'}}.foot{margin-top:36px;text-align:center;color:#64748b;font-size:11px}@media print{button{display:none}}</style></head><body><header class="head"><div><h1>HÓA ĐƠN</h1><div class="muted">${safe(room.buildingName)} · Phòng ${safe(room.code)}</div></div><div class="meta"><strong>${safe(invoice.invoiceCode)}</strong><br><span class="muted">Ngày: ${safe(date(invoice.issuedAt || invoice.createdAt || invoice.dueDate))}</span></div></header><section class="info"><div><span class="muted">Khách thuê</span><strong>${safe(room.currentTenant?.fullName || '—')}</strong></div><div><span class="muted">Điện thoại</span><strong>${safe(room.currentTenant?.phone || '—')}</strong></div><div><span class="muted">Kỳ hóa đơn</span><strong>${safe(date(periodStart))} – ${safe(date(periodEnd))}</strong></div><div><span class="muted">Trạng thái</span><strong>${remaining > 0 ? 'Chờ thanh toán' : 'Đã thanh toán'}</strong></div></section><table><thead><tr><th>Nội dung</th><th>Thành tiền</th></tr></thead><tbody>${rows}</tbody></table>${formula ? `<p class="muted">${safe(formula.replaceAll(/(\d{4})-(\d{2})-(\d{2})/g, '$3/$2/$1'))}</p>` : ''}<section class="total"><div><span>Tổng hóa đơn</span><strong>${safe(money(invoice.totalAmountVnd))}</strong></div><div><span>Đã thu</span><strong>${safe(money(invoice.paidAmountVnd))}</strong></div><div class="due"><span>Còn phải thu</span><strong>${safe(money(remaining))}</strong></div></section><p class="foot">Hóa đơn được tạo từ hệ thống AdHome.</p></body></html>`);
    target.document.close();
    window.setTimeout(() => {
      target.focus();
      target.print();
      window.setTimeout(() => frame.remove(), 60000);
    }, 250);
  };
  const residentRows = pendingPeople.length > 0
    ? pendingPeople.map((person: any, index: number) => ({
        id: `pending-${index}-${person.fullName || 'guest'}`,
        fullName: person.fullName || 'Chưa nhập tên',
        phone: person.phone || '',
        contractId: pendingContract?.id || null,
        personIndex: index,
        relationToPrimary: index === 0 ? 'PRIMARY' : person.documentRole === 'CO_REPRESENTATIVE' ? 'OTHER' : 'FAMILY',
      }))
    : occupantsList.filter(occupant => occupant.isActive).map(occupant => ({
        ...occupant,
        id: occupant.id,
        fullName: occupant.fullName,
        phone: occupant.phone || '',
        contractId: occupant.contractId || room.activeContract?.id || null,
      }));
  const residentCount = residentRows.length;
  const householdHeadOptions = occupantsList.filter(occupant => occupant.isActive && occupant.relationToPrimary !== 'FAMILY');
  const canAddResident = canManageContracts && residentCount < room.maxOccupants && Boolean(onAddRental || room.activeContract);
  const addResident = () => {
    if (room.rentalModel === 'SHARED_ROOM' || !room.activeContract) onAddRental?.(room.id);
    else {
      setOccStartDate(getTodayIsoVn());
      setOccDurationMonths(12);
      setOccMonthlyRentVnd(Number(pendingContract?.monthlyRentVnd || room.listPriceVnd || 0));
      setOccDepositVnd(Number(pendingContract?.depositVnd || 0));
      setIsAddingOccupant(true);
    }
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
    const cleanPhone = occPhone.replace(/\D/g, '');
    const cleanId = occIdNumber.replace(/\D/g, '');
    if (!occFullName.trim() || !/^0\d{8,10}$/.test(cleanPhone) || !/^\d{12}$/.test(cleanId) || !occBirthDate || !occGender || !occAddress.trim() || (occRelation === 'FAMILY' && !occRelationship.trim())) {
      setActionFeedback('Nhập đủ họ tên, số điện thoại, CCCD 12 số, ngày sinh, giới tính và địa chỉ thường trú. Thành viên cùng hộ cần có mối quan hệ.'); return;
    }
    const occEndDate = computeContractEndDate(occStartDate, occDurationMonths);
    if (occRelation === 'OTHER' && (!occEndDate || occMonthlyRentVnd < 500000 || occDepositVnd < 0)) {
      setActionFeedback('Chọn thời hạn hợp đồng phụ hợp lệ và nhập tiền thuê hàng tháng tối thiểu 500.000 đ.'); return;
    }
    if (room.rentalModel === 'SHARED_ROOM') { onAddRental?.(room.id); return; }
    const householdHead = occRelation === 'FAMILY'
      ? householdHeadOptions.find(person => person.id === occHouseholdHeadId) || householdHeadOptions[0]
      : undefined;
    if (occRelation === 'FAMILY' && !householdHead) {
      setActionFeedback('Chọn người đại diện hộ gia đình trong phòng.'); return;
    }

    try {
      const res = await fetch(
        `/api/v1/console/v2/rooms/${encodeURIComponent(room.id)}/occupants`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Requested-With": "AdHome-Console" },
          body: JSON.stringify({
            fullName: occFullName.trim(),
            phone: cleanPhone,
            idNumber: cleanId || undefined,
            dateOfBirth: occBirthDate,
            gender: occGender,
            moveInDate: occStartDate,
            relationToPrimary: occRelation,
            residenceRegStatus: occRegStatus,
            notes: JSON.stringify({ secondaryContract: { role: occRelation === 'OTHER' ? 'CO_REPRESENTATIVE' : 'HOUSEHOLD_MEMBER', address: occAddress.trim(), relationship: occRelationship.trim(), householdHeadOccupantId: householdHead?.id || '', householdHeadName: householdHead?.fullName || '', documentCode: `${pendingContract?.contractCode || room.code}-P${residentCount + 1}`, ...(occRelation === 'OTHER' ? { startDate: occStartDate, endDate: occEndDate, durationMonths: occDurationMonths, monthlyRentVnd: occMonthlyRentVnd, depositVnd: occDepositVnd, legalContractId: pendingContract?.id || '', legalContractCode: pendingContract?.contractCode || '' } : {}) } }),
          }),
        },
      );
      if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.message || 'Không thể thêm người lưu trú.'); }
      if (res.ok) {
        setIsAddingOccupant(false);
        setOccFullName("");
        setOccPhone("");
        setOccIdNumber("");
        setOccBirthDate(""); setOccGender(""); setOccAddress(""); setOccRelationship(""); setOccHouseholdHeadId("");
        setOccStartDate(getTodayIsoVn()); setOccDurationMonths(12); setOccMonthlyRentVnd(0); setOccDepositVnd(0);
        setOccRelation("OTHER");
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
        setActionFeedback("Đã chuyển người lưu trú khỏi phòng và giữ lại lịch sử hồ sơ.");
      } else {
        const data = await res.json().catch(() => ({}));
        setActionFeedback(data.message || "Không thể chuyển người lưu trú khỏi phòng.");
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
                { id: "finance", label: "Hóa đơn", icon: Receipt },
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
                      className="occupant-profile-form space-y-3 rounded-xl border border-blue-200 bg-blue-50/50 p-3.5 dark:border-blue-900 dark:bg-blue-950/20"
                    >
                      <div className="flex items-start justify-between gap-2"><div><div className="font-bold text-xs text-blue-900 dark:text-blue-200">Hồ sơ khách phụ · {room.code}</div><p className="mt-1 text-[11px] leading-4 text-slate-500 dark:text-slate-400">Hợp đồng phụ dùng chung tài chính và trách nhiệm với hợp đồng chính.</p></div><IdentityQrScanner onApply={details => { setOccFullName(details.fullName); setOccIdNumber(details.idNumber); setOccBirthDate(details.birthDate); setOccGender(details.gender); setOccAddress(details.address); }} /></div>
                      <ContractRepresentativeSwitch checked={occRelation === 'OTHER'} onCheckedChange={checked => { setOccRelation(checked ? 'OTHER' : 'FAMILY'); if (!checked && !occHouseholdHeadId) setOccHouseholdHeadId(householdHeadOptions[0]?.id || ''); }} />
                      {occRelation === 'OTHER' && (
                        <fieldset className="space-y-2.5 rounded-lg border border-blue-200 bg-white/70 p-2.5 dark:border-blue-900 dark:bg-slate-900/40">
                          <legend className="px-1 text-[11px] font-semibold text-blue-900 dark:text-blue-200">Thông tin bổ sung hợp đồng phụ</legend>
                          <label className="grid grid-cols-[1fr_7rem] items-center gap-2 font-semibold text-slate-600 dark:text-slate-300"><span>Thời hạn thuê *</span><select aria-label="Thời hạn thuê" value={occDurationMonths} onChange={e => setOccDurationMonths(Number(e.target.value) as 6 | 12)} className="supplementary-contract-control border-slate-200 bg-white font-normal dark:border-slate-700 dark:bg-slate-800"><option value={6}>6 tháng</option><option value={12}>1 năm</option></select></label>
                          <div className="grid grid-cols-2 gap-2.5">
                            <label className="flex min-w-0 flex-col gap-1 font-semibold text-slate-600 dark:text-slate-300"><span>Ngày vào ở *</span><input required type="date" aria-label="Ngày vào ở" value={occStartDate} onChange={e => setOccStartDate(e.target.value)} className="supplementary-contract-control border-slate-200 bg-white font-normal dark:border-slate-700 dark:bg-slate-800" /></label>
                            <label className="flex min-w-0 flex-col gap-1 font-semibold text-slate-600 dark:text-slate-300"><span>Ngày kết thúc</span><input type="date" aria-label="Ngày kết thúc" value={computeContractEndDate(occStartDate, occDurationMonths)} readOnly className="supplementary-contract-control border-slate-200 bg-slate-100 font-normal text-slate-500 dark:border-slate-700 dark:bg-slate-800/60" /></label>
                          </div>
                          <div className="grid grid-cols-2 gap-2.5">
                            <label className="flex min-w-0 flex-col gap-1 font-semibold text-slate-600 dark:text-slate-300"><span>Tiền thuê / tháng *</span><MoneyInput aria-label="Tiền thuê hàng tháng" value={occMonthlyRentVnd} min={0} onChange={setOccMonthlyRentVnd} className="supplementary-contract-money-control" /></label>
                            <label className="flex min-w-0 flex-col gap-1 font-semibold text-slate-600 dark:text-slate-300"><span>Tiền cọc *</span><MoneyInput aria-label="Tiền cọc" value={occDepositVnd} min={0} onChange={setOccDepositVnd} className="supplementary-contract-money-control" /></label>
                          </div>
                          <p className="text-[10px] leading-4 text-slate-500 dark:text-slate-400">Thông tin này chỉ bổ sung hồ sơ cho người đại diện phụ, không tạo nghĩa vụ thu tiền riêng. Quyền, nghĩa vụ và xử lý pháp lý vẫn theo hợp đồng chính.</p>
                        </fieldset>
                      )}
                      <div className="grid grid-cols-2 gap-2.5">
                        <label className="col-span-2 flex flex-col gap-1 text-[10px] font-semibold text-slate-600 dark:text-slate-300"><span>Họ và tên *</span><input
                          type="text"
                          placeholder="Họ và tên *"
                          value={occFullName}
                          onChange={(e) => setOccFullName(e.target.value)}
                          required
                          className="p-2 text-xs font-normal rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                        /></label>
                        <label className="flex flex-col gap-1 text-[10px] font-semibold text-slate-600 dark:text-slate-300"><span>Số điện thoại *</span><input
                          type="text"
                          placeholder="Số điện thoại"
                          value={occPhone}
                          onChange={(e) => setOccPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                          inputMode="numeric"
                          className="p-2 text-xs font-normal rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                        /></label>
                        <label className="flex flex-col gap-1 text-[10px] font-semibold text-slate-600 dark:text-slate-300"><span>CCCD *</span><input
                          type="text"
                          placeholder="Số CCCD"
                          value={occIdNumber}
                          onChange={(e) => setOccIdNumber(e.target.value.replace(/\D/g, '').slice(0, 12))}
                          inputMode="numeric" maxLength={12} required
                          className="p-2 text-xs font-normal rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                        /></label>
                        <label className="flex flex-col gap-1 text-[10px] font-semibold text-slate-600 dark:text-slate-300"><span>Ngày sinh *</span><input required type="date" aria-label="Ngày sinh" value={occBirthDate} onChange={e => setOccBirthDate(e.target.value)} className="p-2 text-xs font-normal rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800" /></label>
                        <label className="flex flex-col gap-1 text-[10px] font-semibold text-slate-600 dark:text-slate-300"><span>Giới tính *</span><select required aria-label="Giới tính" value={occGender} onChange={e => setOccGender(e.target.value)} className="p-2 text-xs font-normal rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"><option value="">Chọn giới tính</option><option>Nam</option><option>Nữ</option><option>Khác</option></select></label>
                        {occRelation === 'FAMILY' && <><label className="flex flex-col gap-1 text-[10px] font-semibold text-slate-600 dark:text-slate-300"><span>Người đại diện hộ *</span><select required value={occHouseholdHeadId} onChange={e => setOccHouseholdHeadId(e.target.value)} className="p-2 text-xs font-normal rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"><option value="">Chọn người đại diện</option>{householdHeadOptions.map(person => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select></label><label className="flex flex-col gap-1 text-[10px] font-semibold text-slate-600 dark:text-slate-300"><span>Mối quan hệ *</span><RelationshipCombobox required value={occRelationship} onChange={setOccRelationship} /></label></>}
                        <label className="col-span-2 flex flex-col gap-1 text-[10px] font-semibold text-slate-600 dark:text-slate-300"><span>Địa chỉ thường trú *</span><textarea required placeholder="Số nhà, đường, phường/xã, tỉnh/thành" value={occAddress} onChange={e => setOccAddress(e.target.value)} className="min-h-16 p-2 text-xs font-normal rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800" /></label>
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
                          Thêm vào hợp đồng
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
                        <colgroup><col className="w-9" /><col /><col className="w-[31%]" /><col className="w-14" /></colgroup>
                        <thead className="bg-slate-50 text-[9.5px] font-semibold uppercase text-slate-500 dark:bg-slate-800/80 dark:text-slate-400"><tr><th className="whitespace-nowrap px-2 py-2 text-center">#</th><th className="whitespace-nowrap px-2 py-2">Name</th><th className="whitespace-nowrap px-2 py-2">Phone</th><th className="whitespace-nowrap px-1 py-2 text-center">Action</th></tr></thead>
                        <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-[#111827]">{residentRows.map((resident: any, index) => <tr key={resident.id}>
                          <td className="px-2 py-2.5 text-center tabular-nums text-slate-500">{index + 1}</td>
                          <td className="break-words px-2 py-2.5 text-slate-900 dark:text-white"><span className="block font-semibold">{resident.fullName}</span><span className="mt-0.5 block text-[9.5px] font-normal text-slate-500">{resident.relationToPrimary === 'PRIMARY' ? 'HĐ Chính' : resident.relationToPrimary === 'OTHER' ? 'Đại diện HĐ' : 'Người cùng hộ'}</span></td>
                          <td className="break-all px-2 py-2.5 tabular-nums text-slate-600 dark:text-slate-300">{resident.phone || '—'}</td>
                          <td className="px-1 py-1 text-center">{canManageContracts && <ActionMenu ariaLabel={`Hành động cho ${resident.fullName}`} contextTitle={resident.fullName} contextSubtitle={resident.phone || 'Chưa có SĐT'} items={[
                            { label: 'Xem PDF hợp đồng', icon: <FileText size={16} />, disabled: !resident.contractId || !['PRIMARY', 'OTHER'].includes(resident.relationToPrimary), onClick: () => { if (resident.contractId) { setDocumentPerson(resident.personIndex !== undefined ? { personIndex: resident.personIndex } : { occupantId: resident.id }); setDocumentContractId(resident.contractId); } } },
                            { label: 'Chỉnh sửa thông tin', icon: <Pencil size={16} />, onClick: () => onAddRental?.(room.id), disabled: !onAddRental },
                            { label: 'Xóa khỏi danh sách lưu trú', icon: <Trash2 size={16} />, variant: 'danger', hidden: resident.personIndex !== undefined || !['FAMILY', 'OTHER'].includes(resident.relationToPrimary) || room.rentalModel === 'SHARED_ROOM', onClick: () => void handleRemoveOccupant(resident.id) }
                          ]} />}</td>
                        </tr>)}</tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: ĐẶT CỌC & GIỮ CHỖ */}
              {activeTab === "deposits" && (
                <div className="space-y-4">
                  {depositRows.length > 0 ? (
                    <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                      <table className="w-full table-fixed text-left text-[10.5px]" data-testid="room-deposits-table">
                        <thead className="bg-slate-50 text-[9px] font-semibold uppercase text-slate-500 dark:bg-slate-800/70 dark:text-slate-400">
                          <tr><th className="w-[21%] whitespace-nowrap px-2 py-2.5">Date</th><th className="w-[18%] whitespace-nowrap px-2 py-2.5">ID</th><th className="w-[29%] whitespace-nowrap px-2 py-2.5">Guest</th><th className="w-[32%] whitespace-nowrap px-2 py-2.5 text-right">Deposit</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                          {depositRows.map((deposit: any) => {
                            const rawDate = String(deposit.receivedAt || deposit.createdAt || '');
                            const displayDate = /^\d{4}-\d{2}-\d{2}/.test(rawDate) ? rawDate.slice(0, 10).split('-').reverse().join('/') : rawDate || '—';
                            return <tr key={deposit.id} className="bg-white align-middle dark:bg-slate-900/30">
                              <td className="px-2 py-3 tabular-nums text-slate-600 dark:text-slate-300">{displayDate}</td>
                              <td className="px-2 py-3"><button type="button" onClick={() => setDepositDetailId(deposit.id)} title={deposit.id} className="font-mono font-semibold text-blue-700 underline decoration-blue-300 underline-offset-2 dark:text-blue-300">{String(deposit.id).slice(0, 6).toUpperCase()}</button></td>
                              <td className="break-words px-2 py-3 font-semibold leading-4 text-slate-900 dark:text-white">{deposit.customerName}</td>
                              <td className="px-2 py-3 text-right font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">{Number(deposit.paidAmountVnd).toLocaleString('vi-VN')} đ</td>
                            </tr>;
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
                      <p>
                        Phòng {room.code} chưa có khoản tiền cọc đã thu.
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
                          <ContractDocumentLink contractId={pendingContract.id}>{`${pendingContract.contractCode} · HĐ Chính`}</ContractDocumentLink>
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          {({ ACTIVE: 'Đang thuê', DRAFT: 'Chờ thanh toán', EXPIRING: 'Sắp hết hạn', EXTENDED: 'Đã gia hạn', TERMINATED: 'Đã kết thúc' } as Record<string, string>)[pendingContract.status] || pendingContract.status}
                        </span>
                      </div>

                      {residentRows.filter((person: any) => person.relationToPrimary === 'OTHER').map((person: any) => <div key={person.id} className="text-xs"><ContractDocumentLink contractId={pendingContract.id} personIndex={person.personIndex} occupantId={person.personIndex === undefined ? person.id : undefined}>{`Đại diện HĐ · ${person.fullName}`}</ContractDocumentLink></div>)}
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

                      {contractExpiryNotice && <div role="status" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs leading-5 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{contractExpiryNotice}</span></div>}
                      {pendingInvoice && pendingInvoiceDue > 0 && <p className="text-xs text-amber-700 dark:text-amber-300">Hóa đơn {pendingInvoice.invoiceCode} · Còn phải thu {pendingInvoiceDue.toLocaleString('vi-VN')} đ. Thu tiền tại mục Hóa đơn.</p>}
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

              {/* TAB 5: HÓA ĐƠN */}
              {activeTab === "finance" && (
                <div className="space-y-4">
                  {roomInvoices.length > 0 ? <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                    <table className="w-full table-fixed text-left text-[10.5px]" data-testid="room-invoices-table">
                      <thead className="bg-slate-50 text-[9px] font-semibold uppercase text-slate-500 dark:bg-slate-800/70 dark:text-slate-400">
                        <tr>
                          <th className="w-[20%] whitespace-nowrap px-2 py-2.5">Date</th>
                          <th className="w-[35%] whitespace-nowrap px-2 py-2.5">Invoice</th>
                          <th className="w-[23%] whitespace-nowrap px-2 py-2.5">Status</th>
                          <th className="w-[22%] whitespace-nowrap px-1.5 py-2.5 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {roomInvoices.map((invoice: any) => {
                          const remaining = Math.max(0, Number(invoice.totalAmountVnd) - Number(invoice.paidAmountVnd));
                          const rawDate = String(invoice.issuedAt || invoice.createdAt || invoice.dueDate || '');
                          const displayDate = /^\d{4}-\d{2}-\d{2}/.test(rawDate) ? rawDate.slice(0, 10).split('-').reverse().join('/') : rawDate || '—';
                          const status = remaining <= 0 ? 'Đã thanh toán' : Number(invoice.paidAmountVnd) > 0 ? 'Thu một phần' : invoice.status === 'OVERDUE' ? 'Quá hạn' : 'Chờ thu';
                          return <tr key={invoice.id} className="align-middle bg-white dark:bg-slate-900/30">
                            <td className="px-2 py-3 tabular-nums text-slate-600 dark:text-slate-300">{displayDate}</td>
                            <td className="px-2 py-3"><button type="button" onClick={() => setInvoiceDetailId(invoice.id)} className="break-all text-left font-semibold leading-4 text-blue-700 underline decoration-blue-300 underline-offset-2 dark:text-blue-300">{invoice.invoiceCode}</button></td>
                            <td className="px-2 py-3"><span className={`inline-block rounded-full px-1.5 py-0.5 font-semibold leading-4 ${remaining <= 0 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : invoice.status === 'OVERDUE' ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'}`}>{status}</span></td>
                            <td className="px-2 py-3 text-right"><Button type="button" hoverScale={1.03} tapScale={0.95} onClick={() => printInvoice(invoice)} aria-label={`In PDF hóa đơn ${invoice.invoiceCode}`} title="In PDF" className="ml-auto flex min-h-8 items-center justify-center gap-1 rounded-md px-1.5 text-[10px] font-semibold text-blue-700 dark:text-blue-300"><Printer className="h-3.5 w-3.5" /><span>In PDF</span></Button></td>
                          </tr>;
                        })}
                      </tbody>
                    </table>
                  </div> : <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-xs text-slate-500 dark:border-slate-800">{pendingReservation ? 'Cọc giữ phòng đang chờ chuyển thành hóa đơn.' : 'Phòng chưa có hóa đơn.'}</div>}
                  {pendingReservation && !pendingInvoice && <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-xs dark:border-amber-900 dark:bg-amber-950/20">Cọc giữ phòng {pendingReservation.reservationCode}: {Number(pendingReservation.holdAmountVnd).toLocaleString('vi-VN')} đ · {pendingReservation.status === 'CONFIRMED' ? 'Đã thu' : 'Chờ thu'}. Chưa ghi thu chi khi chưa nhận tiền.</div>}
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
                    Khách lưu trú ({residentCount})
                  </button>
                )}
              </div>
            )}

            {documentContractId && <ContractDocumentDialog contractId={documentContractId} {...documentPerson} onClose={() => setDocumentContractId(null)} />}

            {detailDeposit && <Dialog.Root open={Boolean(depositDetailId)} onOpenChange={open => { if (!open) setDepositDetailId(null); }}>
              <Dialog.Portal>
                <Dialog.Backdrop className="fixed inset-0 z-[140] bg-slate-950/60 backdrop-blur-[2px]" />
                <Dialog.Viewport className="fixed inset-0 z-[141] flex items-center justify-center p-3">
                  <Dialog.Popup from="bottom" className="w-full max-w-sm overflow-hidden rounded-xl border border-slate-200 bg-white text-xs text-slate-800 shadow-2xl outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" data-testid="room-deposit-detail-dialog">
                    <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-3.5 py-3 dark:border-slate-700">
                      <div><Dialog.Title className="flex items-center gap-2 text-sm font-bold"><Wallet className="h-4 w-4 text-emerald-600" />Chi tiết tiền cọc</Dialog.Title><Dialog.Description className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{detailDeposit.customerName}</Dialog.Description></div>
                      <Dialog.Close aria-label="Đóng chi tiết tiền cọc" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></Dialog.Close>
                    </header>
                    <div className="px-3.5 py-2">
                      <div className="border-b border-slate-200 py-2 dark:border-slate-700"><span className="mb-1 block text-slate-500 dark:text-slate-400">ID cọc</span><strong className="block break-all font-mono text-[11px] leading-5">{detailDeposit.id}</strong></div>
                      <div className="flex min-h-9 items-center justify-between gap-3 border-b border-slate-200 py-1.5 dark:border-slate-700"><span className="text-slate-500 dark:text-slate-400">Ngày thu</span><strong>{(() => { const raw = String(detailDeposit.receivedAt || detailDeposit.createdAt || ''); return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10).split('-').reverse().join('/') : raw || '—'; })()}</strong></div>
                      <div className="flex min-h-9 items-center justify-between gap-3 border-b border-slate-200 py-1.5 dark:border-slate-700"><span className="text-slate-500 dark:text-slate-400">Khách thuê</span><strong className="text-right">{detailDeposit.customerName}</strong></div>
                      <div className="flex min-h-9 items-center justify-between gap-3 border-b border-slate-200 py-1.5 dark:border-slate-700"><span className="text-slate-500 dark:text-slate-400">Cọc yêu cầu</span><strong className="tabular-nums">{Number(detailDeposit.amountVnd || detailDeposit.paidAmountVnd).toLocaleString('vi-VN')} đ</strong></div>
                      <div className="flex min-h-9 items-center justify-between gap-3 border-b border-slate-200 py-1.5 dark:border-slate-700"><span className="text-slate-500 dark:text-slate-400">Đã thực thu</span><strong className="tabular-nums text-emerald-700 dark:text-emerald-300">{Number(detailDeposit.paidAmountVnd).toLocaleString('vi-VN')} đ</strong></div>
                      <div className="flex min-h-9 items-center justify-between gap-3 py-1.5"><span className="text-slate-500 dark:text-slate-400">Trạng thái</span><strong>{({ PAID: 'Đã thanh toán', PARTIALLY_PAID: 'Thu một phần', TRANSFERRED: 'Đã chuyển cọc', REFUNDED: 'Đã hoàn', FORFEITED: 'Đã khấu trừ' } as Record<string, string>)[detailDeposit.paymentStatus] || detailDeposit.paymentStatus || 'Đã ghi nhận'}</strong></div>
                    </div>
                  </Dialog.Popup>
                </Dialog.Viewport>
              </Dialog.Portal>
            </Dialog.Root>}

            {detailInvoice && <Dialog.Root open={Boolean(invoiceDetailId)} onOpenChange={open => { if (!open) setInvoiceDetailId(null); }}>
              <Dialog.Portal>
                <Dialog.Backdrop className="fixed inset-0 z-[140] bg-slate-950/60 backdrop-blur-[2px]" />
                <Dialog.Viewport className="fixed inset-0 z-[141] flex items-center justify-center p-2.5">
                  <Dialog.Popup from="bottom" className="max-h-[calc(100dvh-20px)] w-full max-w-[390px] overflow-hidden rounded-xl border border-slate-200 bg-white text-xs text-slate-800 shadow-2xl outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" data-testid="room-invoice-detail-dialog">
                    <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-3.5 py-3 dark:border-slate-700">
                      <div className="min-w-0">
                        <Dialog.Title className="flex items-center gap-2 text-sm font-bold"><Receipt className="h-4 w-4" />Chi tiết hóa đơn</Dialog.Title>
                        <Dialog.Description className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">{detailInvoice.invoiceCode} · {detailInvoiceDue > 0 ? 'Chờ thu' : 'Đã thanh toán'}</Dialog.Description>
                      </div>
                      <Dialog.Close aria-label="Đóng chi tiết hóa đơn" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></Dialog.Close>
                    </header>
                    {(invoicePeriodStart || invoicePeriodEnd) && <div className="mx-3 mt-3 flex items-center gap-2.5 rounded-lg bg-blue-50 p-2.5 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
                      <Calendar className="h-4 w-4 shrink-0" />
                      <div><strong className="block">{invoicePeriodStart ? String(invoicePeriodStart).split('-').reverse().join('/') : '—'} → {invoicePeriodEnd ? String(invoicePeriodEnd).split('-').reverse().join('/') : '—'}</strong><span className="text-[11px] opacity-75">Kỳ thanh toán</span></div>
                    </div>}
                    <div className="px-3.5 py-2">
                      {invoiceBreakdown.length > 0 ? invoiceBreakdown.map((item: any, index: number) => <div key={`${item.label}-${index}`} className="flex min-h-8 items-center justify-between gap-3 border-b border-slate-200 py-1.5 dark:border-slate-700"><span className="text-slate-500 dark:text-slate-400">{item.label}</span><strong className="whitespace-nowrap tabular-nums">{Number(item.amountVnd || 0).toLocaleString('vi-VN')} đ</strong></div>) : <>
                        <div className="flex min-h-8 items-center justify-between gap-3 border-b border-slate-200 py-1.5 dark:border-slate-700"><span className="text-slate-500 dark:text-slate-400">Tiền thuê</span><strong className="whitespace-nowrap tabular-nums">{Number(detailInvoice.roomRentVnd || 0).toLocaleString('vi-VN')} đ</strong></div>
                        {Number(detailInvoice.adjustmentVnd || 0) !== 0 && <div className="flex min-h-8 items-center justify-between gap-3 border-b border-slate-200 py-1.5 dark:border-slate-700"><span className="text-slate-500 dark:text-slate-400">Điều chỉnh / tiền cọc</span><strong className="whitespace-nowrap tabular-nums">{Number(detailInvoice.adjustmentVnd).toLocaleString('vi-VN')} đ</strong></div>}
                      </>}
                      {invoiceFormula && <p className="my-2 rounded-lg bg-slate-100 px-2.5 py-2 text-center text-[10.5px] leading-4 text-slate-500 dark:bg-slate-800 dark:text-slate-400">{invoiceFormula.replaceAll(/(\d{4})-(\d{2})-(\d{2})/g, '$3/$2/$1')}</p>}
                      <div className="flex min-h-8 items-center justify-between gap-3 border-b border-slate-200 py-1.5 dark:border-slate-700"><span className="text-slate-500 dark:text-slate-400">Tổng hóa đơn</span><strong className="whitespace-nowrap tabular-nums">{Number(detailInvoice.totalAmountVnd).toLocaleString('vi-VN')} đ</strong></div>
                      <div className="flex min-h-8 items-center justify-between gap-3 border-b border-slate-200 py-1.5 dark:border-slate-700"><span className="text-slate-500 dark:text-slate-400">Đã thu</span><strong className="whitespace-nowrap tabular-nums">{Number(detailInvoice.paidAmountVnd).toLocaleString('vi-VN')} đ</strong></div>
                      <div className={`flex min-h-8 items-center justify-between gap-3 py-1.5 font-bold ${detailInvoiceDue > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'}`}><span>Còn phải thu</span><strong className="whitespace-nowrap tabular-nums">{detailInvoiceDue.toLocaleString('vi-VN')} đ</strong></div>
                    </div>
                  </Dialog.Popup>
                </Dialog.Viewport>
              </Dialog.Portal>
            </Dialog.Root>}

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
