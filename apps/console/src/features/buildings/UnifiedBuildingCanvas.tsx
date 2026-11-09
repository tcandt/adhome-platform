import { RentalOnboardingPage } from './RentalOnboardingPage';
import React, { useMemo, useRef, useState } from "react";
import { Building2, Users, X } from "lucide-react";
import { useNavigation } from "@/app/providers/NavigationContext";
import { usePortfolio } from "@/app/providers/PortfolioContext";
import type {
  ConsoleBuildingDto,
  ConsoleRoomDto,
} from "@/shared/types/portfolio";
import { BuildingDirectory } from "./BuildingDirectory";
import { TenantsDirectoryView } from "./TenantsDirectoryView";
import { BuildingScopeSelector } from "@/shared/ui/BuildingScopeSelector";
import { CreateFloorModal } from "./modals/CreateFloorModal";
import { CreateRoomModal } from "./modals/CreateRoomModal";
import { EditBuildingModal } from "./modals/EditBuildingModal";
import { EditRoomModal } from "./modals/EditRoomModal";
import { SafeDeleteModal } from "./modals/SafeDeleteModal";
import { RoomProfileModal } from "./modals/RoomProfileModal";
import { ContractCreationWizardModal } from "../modules/modals/ContractCreationWizardModal";
import { LegacyImportWizardModal } from "../modules/modals/LegacyImportWizardModal";

export const UnifiedBuildingCanvas: React.FC = () => {
  const { buildingsSubTab, setBuildingsSubTab } = useNavigation();
  const { rooms, deleteFloor } = usePortfolio();

  const [rentalTarget, setRentalTarget] = useState<{ roomId: string; intent?: 'HOLD' | 'DIRECT' | 'IMPORT' } | null>(() => {
    const id = new URLSearchParams(window.location.search).get('rentalRoom');
    return id ? { roomId: id } : null;
  });
  const [returnToOccupants, setReturnToOccupants] = useState(false);
  const rentalCloseRef = useRef<(() => void) | null>(null);
  const openRental = (roomId: string, intent?: 'HOLD' | 'DIRECT' | 'IMPORT') => {
    setSelectedRoomId(roomId);
    setRentalTarget({ roomId, intent });
  };
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Modal states
  const [editingBuilding, setEditingBuilding] =
    useState<ConsoleBuildingDto | null>(null);
  const [createFloorBuildingId, setCreateFloorBuildingId] = useState<
    string | null
  >(null);
  const [createRoomTarget, setCreateRoomTarget] = useState<{
    buildingId?: string;
    floorId?: string;
  } | null>(null);
  const [editingRoom, setEditingRoom] = useState<ConsoleRoomDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "building" | "room";
    id: string;
    code: string;
    name?: string;
  } | null>(null);
  const [wizardTarget, setWizardTarget] = useState<{
    roomId: string;
    reservationId?: string;
  } | null>(null);
  const [legacyImportTargetRoomId, setLegacyImportTargetRoomId] = useState<
    string | null
  >(null);

  const selectedRoom = useMemo(
    () => rooms.find((r) => r.id === (rentalTarget?.roomId || selectedRoomId)) || null,
    [rooms, selectedRoomId, rentalTarget],
  );

  const handleRemoveEmptyFloor = async (floorId: string) => {
    setActionFeedback(null);
    const res = await deleteFloor(floorId);
    if (!res.ok) {
      setActionFeedback(res.message || "Không thể xóa tầng.");
    }
  };

  const returnToRoom = () => {
    const url = new URL(window.location.href); url.searchParams.delete('rentalRoom'); window.history.replaceState(null, '', url);
    setSelectedRoomId(rentalTarget?.roomId || selectedRoomId);
    setRentalTarget(null); setReturnToOccupants(true);
  };

  return (
    <div
      className="flex flex-col gap-2 md:gap-3"
      data-testid="console-buildings-workspace"
    >
      <div className="hidden justify-end md:flex">
        <BuildingScopeSelector />
      </div>
      {/* Building operations and tenant directory */}
      <div className="relative flex items-center justify-center">
        <div
          role="tablist"
          aria-label="Không gian làm việc Tòa nhà, Phòng và Khách thuê"
          className="grid w-full grid-cols-2 border-b border-slate-200 dark:border-slate-700 md:max-w-sm"
        >
          <button
            type="button"
            role="tab"
            aria-selected={buildingsSubTab === "rooms"}
            data-testid="subtab-buildings-rooms"
            onClick={() => setBuildingsSubTab("rooms")}
            className={`inline-flex min-h-11 items-center justify-center gap-2 border-b-2 px-3 py-1.5 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
              buildingsSubTab === "rooms"
                ? "border-brand-primary bg-blue-50/60 text-brand-primary dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Tòa nhà</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={buildingsSubTab === "tenants"}
            data-testid="subtab-buildings-tenants"
            onClick={() => setBuildingsSubTab("tenants")}
            className={`inline-flex min-h-11 items-center justify-center gap-2 border-b-2 px-3 py-1.5 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
              buildingsSubTab === "tenants"
                ? "border-brand-primary bg-blue-50/60 text-brand-primary dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Khách thuê</span>
          </button>
        </div>
      </div>

      {actionFeedback && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between">
          <span>{actionFeedback}</span>
          <button
            type="button"
            aria-label="Đóng thông báo lỗi"
            onClick={() => setActionFeedback(null)}
            className="p-1 text-rose-500 hover:text-rose-700"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* TAB 2: TENANTS DIRECTORY */}
      {buildingsSubTab === "tenants" ? (
        <TenantsDirectoryView onOpenRoom={id => { setSelectedRoomId(id); setReturnToOccupants(true); }} />
      ) : (
        <BuildingDirectory
          onEditBuilding={setEditingBuilding}
          onDeleteBuilding={(building) =>
            setDeleteTarget({
              type: "building",
              id: building.id,
              code: building.code,
              name: building.name,
            })
          }
          onCreateFloor={setCreateFloorBuildingId}
          onCreateRoom={setCreateRoomTarget}
          onSelectRoom={(room) => { setReturnToOccupants(false); setSelectedRoomId(room.id); }}
          onDeleteFloor={handleRemoveEmptyFloor}
        />
      )}

      {/* 5-TAB ROOM PROFILE MODAL */}
      <RoomProfileModal
        isOpen={Boolean(selectedRoom)}
        room={selectedRoom}
        initialTab={returnToOccupants ? "occupants" : "overview"}
        rentalContent={rentalTarget ? <RentalOnboardingPage key={rentalTarget.roomId} roomId={rentalTarget.roomId} initialIntent={rentalTarget.intent} embedded closeRequestRef={rentalCloseRef} onClose={returnToRoom} /> : undefined}
        onAddRental={(roomId) => openRental(roomId)}
        onClose={() => rentalTarget ? rentalCloseRef.current?.() : setSelectedRoomId(null)}
        onOpenContractWizard={(roomId, reservationId) => {
          setSelectedRoomId(null);
          openRental(roomId, "DIRECT");
        }}
        onOpenReservationModal={(roomId) => {
          setSelectedRoomId(null);
          openRental(roomId, "HOLD");
        }}
        onEditRoom={(rm) => {
          setSelectedRoomId(null);
          setEditingRoom(rm);
        }}
        onOpenLegacyImport={(roomId) => {
          setSelectedRoomId(null);
          openRental(roomId, "IMPORT");
        }}
      />

      {/* 6-STEP BOOKING & CONTRACT CREATION WIZARD */}
      {wizardTarget && (
        <ContractCreationWizardModal
          isOpen={Boolean(wizardTarget)}
          preselectedRoomId={wizardTarget.roomId}
          preselectedReservationId={wizardTarget.reservationId}
          onClose={() => setWizardTarget(null)}
          onSuccess={async () => {
            setWizardTarget(null);
          }}
        />
      )}

      {/* LEGACY DATA IMPORT WIZARD (C4-IMPORT-01/02) */}
      {legacyImportTargetRoomId && (
        <LegacyImportWizardModal
          isOpen={Boolean(legacyImportTargetRoomId)}
          preselectedRoomId={legacyImportTargetRoomId}
          onClose={() => setLegacyImportTargetRoomId(null)}
          onSuccess={async () => {
            setLegacyImportTargetRoomId(null);
          }}
        />
      )}

      {/* MODALS */}
      <EditBuildingModal
        isOpen={Boolean(editingBuilding)}
        building={editingBuilding}
        onClose={() => setEditingBuilding(null)}
        onRequestDelete={(bld) =>
          setDeleteTarget({
            type: "building",
            id: bld.id,
            code: bld.code,
            name: bld.name,
          })
        }
      />

      <CreateFloorModal
        isOpen={Boolean(createFloorBuildingId)}
        buildingId={createFloorBuildingId || undefined}
        onClose={() => setCreateFloorBuildingId(null)}
      />

      <CreateRoomModal
        isOpen={Boolean(createRoomTarget)}
        buildingId={createRoomTarget?.buildingId}
        floorId={createRoomTarget?.floorId}
        onClose={() => setCreateRoomTarget(null)}
      />

      <EditRoomModal
        isOpen={Boolean(editingRoom)}
        room={editingRoom}
        onClose={() => setEditingRoom(null)}
        onRequestDelete={(rm) => {
          setSelectedRoomId(null);
          setDeleteTarget({
            type: "room",
            id: rm.id,
            code: rm.code,
            name: rm.title,
          });
        }}
      />

      <SafeDeleteModal
        isOpen={Boolean(deleteTarget)}
        targetType={deleteTarget?.type || "room"}
        targetId={deleteTarget?.id || ""}
        targetCode={deleteTarget?.code || ""}
        targetName={deleteTarget?.name}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
};
