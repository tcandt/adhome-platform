import React from 'react';
import {
  CalendarClock,
  Maximize2,
  Users,
  BellRing,
  Eye,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { RoomListing } from '../types/room';
import { formatVndPrice } from '../services/roomService';

interface ComingSoonSectionProps {
  rooms: RoomListing[];
  onSelectRoom: (room: RoomListing) => void;
  onHoldRoom: (room: RoomListing) => void;
}

export const ComingSoonSection: React.FC<ComingSoonSectionProps> = ({
  rooms,
  onSelectRoom,
  onHoldRoom,
}) => {
  return (
    <section
      id="phong-sap-co"
      className="py-14 sm:py-20 bg-canvas-warm border-b border-line scroll-mt-20"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-8 border-b border-line">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-status-comingText bg-status-comingBg border border-status-comingBorder px-2.5 py-1 rounded mb-3">
              <CalendarClock className="w-3.5 h-3.5" />
              Lịch phòng sắp hết hợp đồng &amp; bảo dưỡng
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-ink tracking-tight">
              Phòng sắp trống — Đăng ký nhận thông tin &amp; giữ chỗ trước
            </h2>
            <p className="mt-2 text-sm sm:text-base text-ink-secondary max-w-2xl">
              Nhờ quản lý thời hạn hợp đồng trên hệ thống AdHome, chúng tôi công bố sớm
              các căn hộ sắp kết thúc hợp đồng trong 1–4 tuần tới. Bạn có thể đăng ký
              quan tâm trước để được ưu tiên xem phòng ngay khi khách hiện tại bàn giao.
            </p>
          </div>

          <div className="bg-canvas-pure px-4 py-3 rounded-lg border border-line text-xs text-ink-secondary max-w-sm">
            <div className="flex items-center gap-2 font-semibold text-ink">
              <CheckCircle2 className="w-4 h-4 text-brand-600 shrink-0" />
              <span>Quy trình bàn giao tiêu chuẩn 24h</span>
            </div>
            <p className="mt-1 text-ink-muted">
              Mọi căn hộ sau khi khách cũ trả phòng đều được vệ sinh công nghiệp và
              bảo dưỡng máy lạnh, nóng lạnh trước khi đón khách mới.
            </p>
          </div>
        </div>

        {/* Coming Soon Cards Grid */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          {rooms.map((room) => {
            const primaryImage = room.images[0]?.url || '/images/rooms/studio-standard-01.png';
            return (
              <article
                key={room.id}
                className="bg-canvas-pure rounded-card border border-line overflow-hidden shadow-card hover:shadow-cardHover transition-shadow duration-200 flex flex-col sm:flex-row"
              >
                {/* Left Photo Column */}
                <div
                  onClick={() => onSelectRoom(room)}
                  className="sm:w-2/5 relative aspect-[16/10] sm:aspect-auto bg-canvas-muted cursor-pointer overflow-hidden shrink-0"
                >
                  <img
                    src={primaryImage}
                    alt={room.images[0]?.alt || room.title}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-3 left-3">
                    <span className="px-2.5 py-1 rounded text-xs font-semibold bg-status-comingBg text-status-comingText border border-status-comingBorder shadow-subtle inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Sắp có phòng
                    </span>
                  </div>
                  <div className="absolute bottom-2.5 left-3 right-3">
                    <span className="px-2.5 py-1 rounded text-xs font-semibold bg-ink/85 text-white block truncate">
                      {room.availableFromLabel}
                    </span>
                  </div>
                </div>

                {/* Right Content Column */}
                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
                      <span className="font-semibold text-ink">
                        {room.roomCode} · {room.buildingName}
                      </span>
                      <span>{room.floorName}</span>
                    </div>

                    <h3 className="mt-1.5 text-base font-bold text-ink leading-snug">
                      <button
                        type="button"
                        onClick={() => onSelectRoom(room)}
                        className="text-left hover:text-brand-700 transition-colors"
                      >
                        {room.title}
                      </button>
                    </h3>

                    {room.highlightNote && (
                      <p className="mt-1 text-xs font-medium text-amber-800">
                        {room.highlightNote}
                      </p>
                    )}

                    <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs text-ink-secondary">
                      <span className="px-2 py-0.5 rounded bg-canvas-warm border border-line font-medium">
                        {room.roomType}
                      </span>
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Maximize2 className="w-3.5 h-3.5 text-ink-muted" />
                        {room.area}m²
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-ink-muted" />
                        {room.maxOccupants}
                      </span>
                    </div>

                    <p className="mt-2.5 text-xs sm:text-sm text-ink-secondary line-clamp-2">
                      {room.shortDescription}
                    </p>
                  </div>

                  {/* Price & Pre-register CTA */}
                  <div className="mt-4 pt-3.5 border-t border-line flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <span className="text-[11px] text-ink-muted block">
                        Giá dự kiến
                      </span>
                      <span className="text-base sm:text-lg font-bold text-ink tabular-nums">
                        {formatVndPrice(room.price)}
                      </span>
                      <span className="text-xs text-ink-muted"> / tháng</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectRoom(room)}
                        className="px-3 py-2 rounded-lg text-xs font-semibold text-ink bg-canvas-warm hover:bg-canvas-muted border border-line transition-colors inline-flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Chi tiết</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onHoldRoom(room)}
                        className="px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-brand-800 hover:bg-brand-900 transition-colors inline-flex items-center gap-1.5"
                      >
                        <BellRing className="w-3.5 h-3.5" />
                        <span>Giữ chỗ / Nhận tin</span>
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
};
