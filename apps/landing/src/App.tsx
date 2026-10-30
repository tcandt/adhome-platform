import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Header } from './components/Header';
import { HeroSection } from './components/HeroSection';
import { AvailableRoomsSection } from './components/AvailableRoomsSection';
import { AllRoomsPage } from './components/AllRoomsPage';
import { RoomDetailPage } from './components/RoomDetailPage';
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
import {
  applyPageSeo,
  getCatalogSeoConfig,
  getHomeSeoConfig,
  getRoomDetailSeoConfig,
} from './services/seoService';
import { DataMode, RoomListing } from './types/room';

function normalizePathname(rawPathname: string): string {
  const trimmed = rawPathname.replace(/\/+$/, '');
  return trimmed || '/';
}

export function App() {
  const [currentPath, setCurrentPath] = useState<string>(() =>
    normalizePathname(window.location.pathname)
  );
  const [rooms, setRooms] = useState<RoomListing[]>([]);
  const [dataMode, setDataMode] = useState<DataMode>('LIVE');
  const [sourceVerified, setSourceVerified] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [quickViewRoom, setQuickViewRoom] = useState<RoomListing | null>(null);
  const [inquiryModalOpen, setInquiryModalOpen] = useState<boolean>(false);
  const [inquiryRoom, setInquiryRoom] = useState<RoomListing | null>(null);

  const loadCatalog = useCallback(() => {
    setIsLoading(true);
    fetchPublicRoomCatalog().then((res) => {
      setRooms(res.rooms);
      setDataMode(res.dataMode);
      setSourceVerified(res.sourceVerified);
      setCatalogError(res.error);
      setIsLoading(false);
    });
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(normalizePathname(window.location.pathname));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = useCallback((path: string, hash?: string) => {
    const normalized = normalizePathname(path);
    const search = window.location.search;
    const targetUrl = `${normalized}${search}${hash || ''}`;

    if (normalizePathname(window.location.pathname) !== normalized) {
      window.history.pushState({}, '', targetUrl);
      setCurrentPath(normalized);
    } else if (hash) {
      window.history.replaceState({}, '', targetUrl);
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
  }, []);

  const activeRoomSlug = useMemo(() => {
    if (currentPath.startsWith('/phong/')) {
      return decodeURIComponent(currentPath.slice('/phong/'.length));
    }
    return null;
  }, [currentPath]);

  const activeDetailRoom = useMemo(() => {
    if (!activeRoomSlug) return null;
    return (
      rooms.find(
        (r) => r.slug === activeRoomSlug || r.id === activeRoomSlug
      ) || null
    );
  }, [rooms, activeRoomSlug]);

  // Dynamic SEO Metadata & Canonical updates per route
  useEffect(() => {
    if (activeRoomSlug) {
      if (activeDetailRoom) {
        applyPageSeo(getRoomDetailSeoConfig(activeDetailRoom));
      } else if (!isLoading) {
        applyPageSeo({
          title: 'Không tìm thấy phòng | AdHome Khu đô thị Ân Phú',
          description:
            'Phòng bạn đang tìm không tồn tại hoặc đã ngừng mở thuê công khai.',
          canonicalPath: `/phong/${activeRoomSlug}`,
        });
      }
    } else if (currentPath === '/phong-trong') {
      applyPageSeo(getCatalogSeoConfig());
    } else {
      applyPageSeo(getHomeSeoConfig());
    }
  }, [currentPath, activeRoomSlug, activeDetailRoom, isLoading]);

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
        {activeRoomSlug ? (
          <RoomDetailPage
            room={activeDetailRoom}
            allRooms={rooms}
            isLoading={isLoading}
            error={catalogError}
            dataMode={dataMode}
            sourceVerified={sourceVerified}
            onBackCatalog={() => navigateTo('/phong-trong')}
            onBackHome={() => navigateTo('/')}
            onInquireRoom={(room) => handleOpenInquiry(room)}
            onNavigateRoom={(room) => navigateTo(`/phong/${room.slug}`)}
          />
        ) : currentPath === '/phong-trong' ? (
          <AllRoomsPage
            rooms={rooms}
            isLoading={isLoading}
            error={catalogError}
            dataMode={dataMode}
            sourceVerified={sourceVerified}
            onRetry={loadCatalog}
            onSelectRoom={(room) => setQuickViewRoom(room)}
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
              dataMode={dataMode}
              sourceVerified={sourceVerified}
              onRetry={loadCatalog}
              onOpenInquiry={() => handleOpenInquiry()}
              onSelectRoom={(room) => setQuickViewRoom(room)}
              onNavigateAllRooms={() => navigateTo('/phong-trong')}
            />

            {/* 3. Coming Soon Rooms (Compact 2-Column Horizontal Layout) */}
            <ComingSoonSection
              rooms={comingSoonRooms}
              isLoading={isLoading}
              sourceVerified={sourceVerified && dataMode === 'LIVE'}
              onSelectRoom={(room) => setQuickViewRoom(room)}
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

      {/* Interactive Modals: Quick View + Lead Inquiry */}
      <RoomDetailModal
        room={quickViewRoom}
        sourceVerified={sourceVerified && dataMode === 'LIVE'}
        onClose={() => setQuickViewRoom(null)}
        onInquire={(room) => handleOpenInquiry(room)}
        onOpenFullPage={(room) => navigateTo(`/phong/${room.slug}`)}
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
