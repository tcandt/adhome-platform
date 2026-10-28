import React, { useEffect, useMemo, useState } from 'react';
import { Phone, CalendarCheck, Home } from 'lucide-react';
import { Header } from './components/Header';
import { HeroSection } from './components/HeroSection';
import { AvailableRoomsSection } from './components/AvailableRoomsSection';
import { ComingSoonSection } from './components/ComingSoonSection';
import { WhyChooseAndAmenitiesSection } from './components/WhyChooseAndAmenitiesSection';
import { PhotoGallerySection } from './components/PhotoGallerySection';
import { RentalProcessSection } from './components/RentalProcessSection';
import { PlatformIntroSection } from './components/PlatformIntroSection';
import { LocationAndFaqSection } from './components/LocationAndFaqSection';
import { Footer } from './components/Footer';
import { RoomDetailModal } from './components/RoomDetailModal';
import { LeadInquiryModal } from './components/LeadInquiryModal';
import {
  computePortfolioSummary,
  fetchPublicRoomListings,
  getAvailableRoomsSync,
  getComingSoonRoomsSync,
  getGalleryPhotos,
  getPublicBuildingsSummary,
} from './services/roomService';
import { RoomListing } from './types/room';

export function App() {
  const [rooms, setRooms] = useState<RoomListing[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [detailRoom, setDetailRoom] = useState<RoomListing | null>(null);
  const [inquiryModalOpen, setInquiryModalOpen] = useState<boolean>(false);
  const [inquiryRoom, setInquiryRoom] = useState<RoomListing | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchPublicRoomListings().then((data) => {
      if (mounted) {
        setRooms(data);
        setIsLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const availableRooms = useMemo(() => getAvailableRoomsSync(rooms), [rooms]);
  const comingSoonRooms = useMemo(() => getComingSoonRoomsSync(rooms), [rooms]);
  const summary = useMemo(() => computePortfolioSummary(rooms), [rooms]);
  const buildings = useMemo(() => getPublicBuildingsSummary(), []);
  const galleryPhotos = useMemo(() => getGalleryPhotos(), []);

  const featuredRoom = useMemo(
    () => availableRooms.find((r) => r.featured) || availableRooms[0],
    [availableRooms]
  );

  const handleOpenInquiry = (room?: RoomListing) => {
    setInquiryRoom(room || null);
    setInquiryModalOpen(true);
  };

  return (
    <div className="min-h-screen flex flex-col bg-canvas text-ink">
      {/* 5.1 Sticky Header */}
      <Header
        availableCount={availableRooms.length}
        comingSoonCount={comingSoonRooms.length}
        onOpenInquiry={() => handleOpenInquiry()}
      />

      {/* Main Content */}
      <main className="flex-1">
        {/* 5.2 Hero Section + Quick Availability Summary */}
        <HeroSection
          summary={summary}
          featuredRoom={featuredRoom}
          onSelectRoom={(room) => setDetailRoom(room)}
          onOpenInquiry={handleOpenInquiry}
        />

        {/* 5.3 Section: Phòng đang trống */}
        <AvailableRoomsSection
          rooms={availableRooms}
          isLoading={isLoading}
          onSelectRoom={(room) => setDetailRoom(room)}
          onInquireRoom={(room) => handleOpenInquiry(room)}
        />

        {/* 5.4 Section: Phòng sắp có / sắp trống */}
        <ComingSoonSection
          rooms={comingSoonRooms}
          onSelectRoom={(room) => setDetailRoom(room)}
          onHoldRoom={(room) => handleOpenInquiry(room)}
        />

        {/* 5.5 & 5.6 Section: Vì sao nên chọn AdHome + Tiện ích & Nội thất */}
        <WhyChooseAndAmenitiesSection />

        {/* 5.7 Section: Bộ sưu tập hình ảnh căn hộ */}
        <PhotoGallerySection photos={galleryPhotos} />

        {/* 5.8 Section: Quy trình thuê phòng */}
        <RentalProcessSection onOpenInquiry={() => handleOpenInquiry()} />

        {/* 5.9 Section: Giới thiệu nền tảng AdHome */}
        <PlatformIntroSection />

        {/* 5.10 & 5.11 Section: Khu vực / Vị trí + FAQ */}
        <LocationAndFaqSection
          buildings={buildings}
          onOpenInquiry={() => handleOpenInquiry()}
        />
      </main>

      {/* 5.12 Footer */}
      <Footer
        availableCount={availableRooms.length}
        comingSoonCount={comingSoonRooms.length}
        onOpenInquiry={() => handleOpenInquiry()}
      />

      {/* Dedicated Mobile Bottom Action Bar */}
      <div className="sm:hidden fixed bottom-0 inset-x-0 z-30 bg-canvas-pure/95 backdrop-blur-sm border-t border-line px-3 py-2.5 shadow-cardHover">
        <div className="grid grid-cols-3 gap-2">
          <a
            href="#phong-dang-trong"
            className="py-2.5 px-2 rounded-lg text-xs font-semibold text-ink bg-canvas-warm border border-line flex items-center justify-center gap-1"
          >
            <Home className="w-3.5 h-3.5 text-green-700" />
            <span>Trống ({availableRooms.length})</span>
          </a>
          <a
            href="tel:0905889123"
            className="py-2.5 px-2 rounded-lg text-xs font-semibold text-ink bg-canvas-warm border border-line flex items-center justify-center gap-1"
          >
            <Phone className="w-3.5 h-3.5 text-brand-600" />
            <span>Gọi / Zalo</span>
          </a>
          <button
            type="button"
            onClick={() => handleOpenInquiry()}
            className="py-2.5 px-2 rounded-lg text-xs font-semibold text-white bg-brand-600 flex items-center justify-center gap-1"
          >
            <CalendarCheck className="w-3.5 h-3.5" />
            <span>Hẹn xem</span>
          </button>
        </div>
      </div>

      {/* Interactive Modals */}
      <RoomDetailModal
        room={detailRoom}
        onClose={() => setDetailRoom(null)}
        onInquire={(room) => handleOpenInquiry(room)}
      />

      <LeadInquiryModal
        isOpen={inquiryModalOpen}
        selectedRoom={inquiryRoom}
        onClose={() => setInquiryModalOpen(false)}
      />
    </div>
  );
}

export default App;
