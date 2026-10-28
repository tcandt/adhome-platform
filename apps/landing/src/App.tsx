import React, { useEffect, useMemo, useState } from 'react';
import { Header } from './components/Header';
import { HeroSection } from './components/HeroSection';
import { AvailableRoomsSection } from './components/AvailableRoomsSection';
import { AllRoomsPage } from './components/AllRoomsPage';
import { ComingSoonSection } from './components/ComingSoonSection';
import { LivingSpaceSection } from './components/LivingSpaceSection';
import { LocationAndFaqSection } from './components/LocationAndFaqSection';
import { PlatformIntroSection } from './components/PlatformIntroSection';
import { Footer } from './components/Footer';
import { RoomDetailModal } from './components/RoomDetailModal';
import { LeadInquiryModal } from './components/LeadInquiryModal';
import {
  fetchPublicRoomCatalog,
  getAvailableRoomsSync,
  getComingSoonRoomsSync,
  getGalleryPhotos,
} from './services/roomService';
import { RoomListing } from './types/room';

export function App() {
  const [currentPath, setCurrentPath] = useState<'/' | '/phong-trong'>(() =>
    window.location.pathname.startsWith('/phong-trong') ? '/phong-trong' : '/'
  );
  const [rooms, setRooms] = useState<RoomListing[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [detailRoom, setDetailRoom] = useState<RoomListing | null>(null);
  const [inquiryModalOpen, setInquiryModalOpen] = useState<boolean>(false);
  const [inquiryRoom, setInquiryRoom] = useState<RoomListing | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchPublicRoomCatalog().then((res) => {
      if (mounted) {
        setRooms(res.rooms);
        setCatalogError(res.error);
        setIsLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(
        window.location.pathname.startsWith('/phong-trong')
          ? '/phong-trong'
          : '/'
      );
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (path: '/' | '/phong-trong', hash?: string) => {
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path + (hash || ''));
      setCurrentPath(path);
    } else if (hash) {
      window.history.replaceState({}, '', path + hash);
    }

    if (hash) {
      requestAnimationFrame(() => {
        const el = document.querySelector(hash);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const availableRooms = useMemo(() => getAvailableRoomsSync(rooms), [rooms]);
  const comingSoonRooms = useMemo(() => getComingSoonRoomsSync(rooms), [rooms]);
  const galleryPhotos = useMemo(() => getGalleryPhotos(), []);

  const handleOpenInquiry = (room?: RoomListing) => {
    setInquiryRoom(room || null);
    setInquiryModalOpen(true);
  };

  return (
    <div className="min-h-screen flex flex-col bg-canvas text-ink">
      {/* Sticky Header */}
      <Header currentPath={currentPath} onNavigate={navigateTo} />

      <main className="flex-1">
        {currentPath === '/phong-trong' ? (
          <AllRoomsPage
            rooms={rooms}
            isLoading={isLoading}
            error={catalogError}
            onSelectRoom={(room) => setDetailRoom(room)}
            onBackHome={() => navigateTo('/')}
          />
        ) : (
          <>
            {/* 1. Hero Section */}
            <HeroSection onOpenInquiry={() => handleOpenInquiry()} />

            {/* 2. Featured Available Rooms (3–6 rooms) + Link to /phong-trong */}
            <AvailableRoomsSection
              rooms={availableRooms}
              isLoading={isLoading}
              error={catalogError}
              onSelectRoom={(room) => setDetailRoom(room)}
              onNavigateAllRooms={() => navigateTo('/phong-trong')}
            />

            {/* 3. Coming Soon Rooms (Compact 2-Column Horizontal Layout) */}
            <ComingSoonSection
              rooms={comingSoonRooms}
              onSelectRoom={(room) => setDetailRoom(room)}
              onNotifyRoom={(room) => handleOpenInquiry(room)}
            />

            {/* 4. Merged Living Space, Curated Interior Photos & 3-Step Rental Process */}
            <LivingSpaceSection photos={galleryPhotos} />

            {/* 5. Location (Khu đô thị Ân Phú, Tân An, Đắk Lắk) & FAQ */}
            <LocationAndFaqSection onOpenInquiry={() => handleOpenInquiry()} />

            {/* 6. Subtle Tenant-First Platform Intro at the bottom */}
            <PlatformIntroSection />
          </>
        )}
      </main>

      {/* 7. Footer */}
      <Footer
        onNavigate={navigateTo}
        onOpenInquiry={() => handleOpenInquiry()}
      />

      {/* Compact Mobile Sticky Contact Bar (Requirement 10: compact & non-intrusive) */}
      <div className="sm:hidden fixed bottom-0 inset-x-0 z-30 bg-canvas-pure/95 backdrop-blur-sm border-t border-line px-4 py-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="text-xs font-semibold text-ink block truncate">
            Căn hộ dịch vụ KĐT Ân Phú
          </span>
          <span className="text-[11px] text-ink-muted block truncate">
            Từ 4,5 triệu/tháng · Full nội thất
          </span>
        </div>
        <button
          type="button"
          onClick={() => handleOpenInquiry()}
          className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-brand-600 shrink-0"
        >
          Liên hệ tư vấn
        </button>
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
