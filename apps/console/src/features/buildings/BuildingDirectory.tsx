import React, { useState } from "react";
import { Accordion } from "@animate-ui/react/primitives/base-ui/accordion";
import {
  Building2,
  ChevronDown,
  Edit,
  Layers,
  Info,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useAuth } from "@/app/providers/AuthContext";
import { useNavigation } from "@/app/providers/NavigationContext";
import { usePortfolio } from "@/app/providers/PortfolioContext";
import { ActionMenu } from "@/shared/ui/ActionMenu";
import { BuildingInfoDialog } from "./modals/BuildingInfoDialog";
import type {
  ConsoleBuildingDto,
  ConsoleRoomDto,
} from "@/shared/types/portfolio";
import { useAppReducedMotion } from "@/motionPreference";

interface BuildingDirectoryProps {
  onEditBuilding: (building: ConsoleBuildingDto) => void;
  onDeleteBuilding: (building: ConsoleBuildingDto) => void;
  onCreateFloor: (buildingId: string) => void;
  onCreateRoom: (target: { buildingId: string; floorId?: string }) => void;
  onSelectRoom: (room: ConsoleRoomDto) => void;
  onDeleteFloor: (floorId: string) => Promise<void>;
}

const roomStatuses: Record<string, { label: string; style: string }> = {
  AVAILABLE: {
    label: "Trống",
    style:
      "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400",
  },
  OCCUPIED: {
    label: "Đang ở",
    style: "border-emerald-200/80 bg-emerald-50/60 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300",
  },
  RESERVED: {
    label: "Giữ chỗ",
    style:
      "border-amber-200/80 bg-amber-50/60 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300",
  },
  MAINTENANCE: {
    label: "Bảo trì",
    style: "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
  },
  EXPIRING: {
    label: "Sắp gia hạn",
    style: "border-rose-200/80 bg-rose-50/60 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300",
  },
  UNKNOWN: {
    label: "Chưa rõ",
    style: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
  },
  ARCHIVED: {
    label: "Lưu trữ",
    style: "border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400",
  },
};

const secondaryButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";

function Occupancy({ occupied, total }: { occupied: number; total: number }) {
  const percent = total ? Math.round((occupied / total) * 100) : 0;
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
        <span className="text-slate-500 dark:text-slate-400">Lấp đầy</span>
        <span className="font-semibold tabular-nums">{percent}%</span>
      </div>
      <div
        role="meter"
        aria-label="Tỷ lệ lấp đầy"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
      >
        <div
          className="h-full rounded-full bg-blue-600 dark:bg-blue-400"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export function BuildingDirectory(props: BuildingDirectoryProps) {
  const { scopedBuildings, rooms, syncStatus } = usePortfolio();
  const navigation = useNavigation();
  const { selectedBuildingIds, setSelectedBuildingIds } = navigation;
  const isBuildingScopeEmpty = 'isBuildingScopeEmpty' in navigation && navigation.isBuildingScopeEmpty === true;
  const { hasCapability } = useAuth();
  const reducedMotion = useAppReducedMotion();
  const canManageBuildings = hasCapability("canManageBuildings");
  const canManageRooms = hasCapability("canManageRooms");
  const [query, setQuery] = useState("");
  const [roomFilter, setRoomFilter] = useState("ALL");
  const [expandedBuildings, setExpandedBuildings] = useState<string[]>([]);
  const [expandedFloors, setExpandedFloors] = useState<string[]>([]);
  const [detailsBuildingId, setDetailsBuildingId] = useState<string | null>(
    null,
  );
  const transition = { duration: reducedMotion ? 0 : 0.2 };
  const normalizedQuery = query.trim().toLocaleLowerCase("vi");
  const matchesRoom = (room: ConsoleRoomDto) =>
    (roomFilter === "ALL" || room.occupancyStatus === roomFilter) &&
    (!normalizedQuery ||
      [
        room.code,
        room.title,
        room.buildingCode,
        room.buildingName,
        room.currentTenant?.fullName,
      ].some((value) =>
        value?.toLocaleLowerCase("vi").includes(normalizedQuery),
      ));

  const visibleBuildings = scopedBuildings.filter((building) => {
    const buildingMatches = [
      building.code,
      building.name,
      building.streetAddress || '',
    ].some((value) => value.toLocaleLowerCase("vi").includes(normalizedQuery));
    const buildingRooms = rooms.filter(
      (room) => room.buildingId === building.id,
    );
    if (
      roomFilter !== "ALL" &&
      !buildingRooms.some((room) => room.occupancyStatus === roomFilter)
    )
      return false;
    return (
      !normalizedQuery || buildingMatches || buildingRooms.some(matchesRoom)
    );
  });

  return (
    <div className="space-y-3 md:space-y-5" data-testid="building-directory">
      <div className="space-y-3">
        <div className="grid grid-cols-[minmax(0,1fr)_7.5rem] items-center rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:grid-cols-[minmax(0,1fr)_11rem]">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
            <input
              type="search"
              aria-label="Tìm tòa nhà, phòng hoặc khách thuê"
              data-testid="input-search-rooms"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm phòng, tòa nhà…"
              className="h-11 w-full min-w-0 rounded-l-xl bg-transparent pl-9 pr-2 text-sm outline-none placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
            />
          </div>
          <select
            aria-label="Lọc trạng thái phòng"
            value={roomFilter}
            onChange={(event) => {
              setRoomFilter(event.target.value);
              setExpandedFloors([]);
            }}
            className="h-11 w-full min-w-0 rounded-r-xl border-0 border-l border-slate-200 bg-transparent pl-2 pr-1 text-xs font-medium text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 dark:border-slate-700 dark:text-slate-200 dark:[color-scheme:dark]"
          >
            <option value="ALL">Tất cả phòng</option>
            <option value="AVAILABLE">Phòng trống</option>
            <option value="OCCUPIED">Đang thuê</option>
            <option value="RESERVED">Giữ chỗ</option>
            <option value="MAINTENANCE">Bảo trì</option>
          </select>
        </div>
        {selectedBuildingIds.length > 0 && (
          <button
            type="button"
            onClick={() => setSelectedBuildingIds([])}
            className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-blue-700 dark:text-blue-300"
          >
            <X className="h-3.5 w-3.5" />
            Xem tất cả tòa nhà
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#111827]">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <span>{visibleBuildings.length} tòa nhà trong phạm vi</span>
          <span>Mở tòa để xem các tầng</span>
        </div>
        {visibleBuildings.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <Building2 className="mx-auto mb-3 h-8 w-8 text-slate-400" />
            <h3 className="font-semibold">
              {syncStatus === "loading"
                ? "Đang tải tòa nhà…"
                : isBuildingScopeEmpty
                  ? "Chưa chọn tòa nhà"
                  : scopedBuildings.length
                    ? "Không tìm thấy tòa nhà phù hợp"
                    : "Chưa có tòa nhà"}
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              {isBuildingScopeEmpty
                ? "Mở danh sách tòa nhà để chọn phạm vi cần xem."
                : scopedBuildings.length
                  ? "Thử tìm kiếm khác hoặc thay đổi bộ lọc."
                  : "Thêm tòa nhà, sau đó tạo tầng và phòng để bắt đầu quản lý."}
            </p>
            {scopedBuildings.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setRoomFilter("ALL");
                }}
                className={`${secondaryButton} mt-4`}
              >
                Xóa bộ lọc
              </button>
            )}
          </div>
        ) : (
          <Accordion.Root
            value={expandedBuildings}
            onValueChange={(value) => {
              setExpandedBuildings(value);
              setExpandedFloors([]);
            }}
            multiple={false}
            className="divide-y divide-slate-100 dark:divide-slate-800"
          >
            {visibleBuildings.map((building) => {
              const buildingRooms = rooms.filter(
                (room) => room.buildingId === building.id,
              );
              const buildingMatches = [
                building.code,
                building.name,
                building.streetAddress,
              ].some((value) =>
                value.toLocaleLowerCase("vi").includes(normalizedQuery),
              );
              const matchedRooms = buildingRooms.filter(
                (room) =>
                  (roomFilter === "ALL" ||
                    room.occupancyStatus === roomFilter) &&
                  (buildingMatches || matchesRoom(room)),
              );
              const isOpen = expandedBuildings.includes(building.id);
              return (
                <Accordion.Item
                  key={building.id}
                  value={building.id}
                  data-testid={`building-board-${building.code}`}
                >
                  <div
                    className={`flex items-center gap-1 px-2 sm:px-3 ${isOpen ? "bg-slate-50/80 dark:bg-slate-900/60" : ""}`}
                  >
                    <Accordion.Header className="min-w-0 flex-1">
                      <Accordion.Trigger
                        data-testid={`building-expand-${building.code}`}
                        className="group grid w-full grid-cols-[2rem_minmax(0,1fr)_1rem] items-center gap-3 py-5 pl-1 text-left sm:grid-cols-[2.5rem_minmax(0,1fr)_11rem_1rem] sm:gap-4"
                      >
                        <span className="flex h-9 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 sm:w-10">
                          <Building2 className="h-5 w-5" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">
                            {building.name}
                          </span>
                          <span className="mt-1 block truncate text-xs font-normal text-slate-500 dark:text-slate-400">
                            {building.code} · {building.floors.length} tầng ·{" "}
                            {building.stats.totalRooms} phòng
                          </span>
                          <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-normal">
                            <span className="text-slate-500 dark:text-slate-400">
                              {building.stats.occupiedRooms} đang thuê
                            </span>
                            <span
                              className={
                                building.stats.availableRooms
                                  ? "font-medium text-emerald-700 dark:text-emerald-300"
                                  : "text-slate-500"
                              }
                            >
                              {building.stats.availableRooms} trống
                            </span>
                            <span className="text-slate-500 sm:hidden">
                              {building.stats.totalRooms
                                ? Math.round(
                                    (building.stats.occupiedRooms /
                                      building.stats.totalRooms) *
                                      100,
                                  )
                                : 0}
                              % lấp đầy
                            </span>
                          </span>
                        </span>
                        <span className="hidden sm:block">
                          <Occupancy
                            occupied={building.stats.occupiedRooms}
                            total={building.stats.totalRooms}
                          />
                        </span>
                        <ChevronDown
                          className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                        />
                      </Accordion.Trigger>
                    </Accordion.Header>
                    <ActionMenu
                      ariaLabel={`Cấu hình ${building.name}`}
                      contextTitle={building.name}
                      contextSubtitle={building.code}
                      items={[
                        {
                          label: "Thông tin thêm",
                          icon: <Info className="h-4 w-4" />,
                          onClick: () => setDetailsBuildingId(building.id),
                        },
                        {
                          label: "Thêm tầng",
                          icon: <Layers className="h-4 w-4" />,
                          onClick: () => props.onCreateFloor(building.id),
                          hidden: !canManageRooms,
                        },
                        {
                          label: "Thêm phòng",
                          icon: <Plus className="h-4 w-4" />,
                          onClick: () =>
                            props.onCreateRoom({ buildingId: building.id }),
                          hidden: !canManageRooms || !building.floors.length,
                        },
                        {
                          label: "Chỉnh sửa tòa nhà",
                          icon: <Edit className="h-4 w-4" />,
                          onClick: () => props.onEditBuilding(building),
                          hidden: !canManageBuildings,
                        },
                        {
                          label: "Xóa / lưu trữ tòa nhà",
                          icon: <Trash2 className="h-4 w-4" />,
                          onClick: () => props.onDeleteBuilding(building),
                          hidden: !canManageBuildings,
                          variant: "danger",
                          divider: true,
                        },
                      ]}
                    />
                  </div>
                  <Accordion.Panel
                    transition={transition}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-slate-100 px-4 pb-5 pt-4 dark:border-slate-800 sm:px-6">
                      {!building.floors.length ? (
                        <div className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700">
                          Chưa có tầng. Thêm tầng trước khi tạo phòng.
                        </div>
                      ) : (
                        <>
                          {(normalizedQuery || roomFilter !== "ALL") && (
                            <p className="mb-3 text-xs text-slate-500">
                              {matchedRooms.length} phòng khớp bộ lọc
                            </p>
                          )}
                          <Accordion.Root
                            value={expandedFloors}
                            onValueChange={setExpandedFloors}
                            multiple={false}
                            data-testid={`floor-staircase-${building.code}`}
                            className="building-floor-tree space-y-2 pl-3"
                          >
                            {building.floors
                              .slice()
                              .sort((a, b) => a.floorNumber - b.floorNumber)
                              .map((floor, floorIndex) => {
                                const floorRooms = buildingRooms.filter(
                                  (room) => room.floorId === floor.id,
                                );
                                const visibleRooms = matchedRooms.filter(
                                  (room) => room.floorId === floor.id,
                                );
                                const occupied = floorRooms.filter(
                                  (room) => room.occupancyStatus === "OCCUPIED",
                                ).length;
                                const available = floorRooms.filter(
                                  (room) =>
                                    room.occupancyStatus === "AVAILABLE",
                                ).length;
                                const floorOpen = expandedFloors.includes(
                                  floor.id,
                                );
                                return (
                                  <Accordion.Item
                                    key={floor.id}
                                    value={floor.id}
                                    data-testid={`floor-section-${building.code}-${floor.floorNumber}`}
                                    className="building-floor-node relative"
                                    style={
                                      {
                                        "--floor-indent": `${Math.min(floorIndex * 8, 24)}px`,
                                      } as React.CSSProperties
                                    }
                                  >
                                    <Accordion.Header
                                      style={{
                                        marginLeft: "var(--floor-indent)",
                                      }}
                                    >
                                      <Accordion.Trigger
                                        data-testid={`floor-expand-${floor.id}`}
                                        className={`flex min-h-16 w-full items-center gap-2.5 rounded-xl rounded-bl-sm border px-3 py-2.5 text-left transition-colors sm:gap-3 sm:px-4 ${floorOpen ? "border-blue-200 bg-blue-50/70 dark:border-blue-800 dark:bg-blue-950/30" : "border-slate-200 bg-slate-50/70 hover:border-blue-200 hover:bg-blue-50/40 dark:border-slate-700 dark:bg-slate-800/40 dark:hover:border-blue-800"}`}
                                      >
                                        <span
                                          aria-hidden="true"
                                          className={`flex h-9 min-w-9 shrink-0 items-center justify-center rounded-lg px-1 text-sm font-bold tabular-nums ${floorOpen ? "bg-blue-600 text-white" : "bg-white text-slate-500 ring-1 ring-slate-200/70 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700"}`}
                                        >
                                          {floor.floorNumber}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                          <span className="block truncate text-sm font-semibold">
                                            {floor.name}
                                          </span>
                                          <span className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] font-normal text-slate-500 dark:text-slate-400">
                                            <span>
                                              {floorRooms.length} phòng
                                            </span>
                                            {occupied > 0 && (
                                              <span>{occupied} thuê</span>
                                            )}
                                            {available > 0 && (
                                              <span className="text-emerald-700 dark:text-emerald-400">
                                                {available} trống
                                              </span>
                                            )}
                                          </span>
                                        </span>
                                        <span className="hidden text-right text-xs tabular-nums text-slate-500 sm:block">
                                          {floorRooms.length
                                            ? Math.round(
                                                (occupied / floorRooms.length) *
                                                  100,
                                              )
                                            : 0}
                                          %
                                          <span className="mt-1 block text-[10px]">
                                            lấp đầy
                                          </span>
                                        </span>
                                        <ChevronDown
                                          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${floorOpen ? "rotate-180" : ""}`}
                                        />
                                      </Accordion.Trigger>
                                    </Accordion.Header>
                                    <Accordion.Panel
                                      transition={transition}
                                      className="overflow-hidden"
                                    >
                                      <div
                                        className="pb-1 pt-2"
                                        style={{
                                          marginLeft: "var(--floor-indent)",
                                        }}
                                      >
                                        {canManageRooms &&
                                          floor.roomCount === 0 && (
                                            <div className="mb-2 flex flex-wrap justify-end gap-2">
                                              {floor.roomCount === 0 && (
                                                <button
                                                  type="button"
                                                  className="min-h-11 px-2 text-xs font-medium text-rose-600 dark:text-rose-400"
                                                  onClick={() => {
                                                    if (
                                                      window.confirm(
                                                        `Xóa ${floor.name}? Tầng này chưa có phòng.`,
                                                      )
                                                    )
                                                      void props.onDeleteFloor(
                                                        floor.id,
                                                      );
                                                  }}
                                                >
                                                  Xóa tầng trống
                                                </button>
                                              )}
                                            </div>
                                          )}
                                        {visibleRooms.length === 0 ? (
                                          <p className="py-5 text-center text-xs text-slate-500">
                                            {floorRooms.length
                                              ? "Không có phòng khớp bộ lọc trên tầng này."
                                              : "Tầng này chưa có phòng."}
                                          </p>
                                        ) : (
                                          <div
                                            data-testid={`room-grid-${floor.id}`}
                                            className="grid w-full min-w-0 grid-cols-3 gap-1.5 sm:gap-2"
                                          >
                                            {visibleRooms.map((room) => {
                                              const status =
                                                room.occupancyStatus === "OCCUPIED" &&
                                                room.activeContract?.status === "EXPIRING"
                                                  ? roomStatuses.EXPIRING
                                                  : roomStatuses[room.occupancyStatus] || roomStatuses.UNKNOWN;
                                              return (
                                                <button
                                                  type="button"
                                                  key={room.id}
                                                  data-testid={`room-card-${building.code}-${room.code}`}
                                                  onClick={() =>
                                                    props.onSelectRoom(room)
                                                  }
                                                  aria-label={`Phòng ${room.code} · ${status.label}`}
                                                  title={`Phòng ${room.code} · ${status.label}`}
                                                  className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2.5 text-center hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 sm:px-2.5 dark:hover:brightness-110 ${status.style}`}
                                                >
                                                  <span className="block w-full truncate text-xs font-semibold tracking-tight text-slate-800 dark:text-slate-100 sm:text-sm">
                                                    {room.code}
                                                  </span>
                                                  <span className="flex max-w-full items-center justify-center gap-1 text-[10px] font-medium sm:text-[11px]">
                                                    <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
                                                    <span className="truncate">{status.label}</span>
                                                  </span>
                                                </button>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    </Accordion.Panel>
                                  </Accordion.Item>
                                );
                              })}
                          </Accordion.Root>
                        </>
                      )}
                      <div className="mt-4 flex flex-wrap justify-between gap-x-5 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
                        <span>
                          Quản lý:{" "}
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            {building.managerName || "Chưa phân công"}
                          </span>
                        </span>
                        <span>
                          {building.stats.reservedRooms} giữ chỗ ·{" "}
                          {building.stats.maintenanceRooms} bảo trì
                        </span>
                      </div>
                    </div>
                  </Accordion.Panel>
                </Accordion.Item>
              );
            })}
          </Accordion.Root>
        )}
      </div>
      <BuildingInfoDialog
        building={scopedBuildings.find(
          (building) => building.id === detailsBuildingId,
        )}
        onClose={() => setDetailsBuildingId(null)}
      />
    </div>
  );
}
