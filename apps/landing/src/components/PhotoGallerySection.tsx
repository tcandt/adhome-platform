import React, { useState } from 'react';
import { Maximize2, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { GalleryPhotoItem } from '../types/room';

interface PhotoGallerySectionProps {
  photos: GalleryPhotoItem[];
}

const GALLERY_CATEGORIES: Array<{
  id: 'ALL' | GalleryPhotoItem['category'];
  label: string;
}> = [
  { id: 'ALL', label: 'Tất cả không gian (8)' },
  { id: 'STUDIO_1PN', label: 'Phòng Studio & 1PN' },
  { id: 'KITCHEN_WORK', label: 'Góc Bếp & Bàn Làm Việc' },
  { id: 'BATH_AMENITY', label: 'Phòng Tắm & Nhà Xe' },
  { id: 'EXTERIOR_AREA', label: 'Kiến Trúc KĐT Ân Phú' },
];

export const PhotoGallerySection: React.FC<PhotoGallerySectionProps> = ({
  photos,
}) => {
  const [activeCategory, setActiveCategory] = useState<
    'ALL' | GalleryPhotoItem['category']
  >('ALL');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const filteredPhotos =
    activeCategory === 'ALL'
      ? photos
      : photos.filter((p) => p.category === activeCategory);

  const currentPhoto =
    lightboxIndex !== null ? filteredPhotos[lightboxIndex] : null;

  const handlePrev = () => {
    if (lightboxIndex === null) return;
    setLightboxIndex(
      (lightboxIndex - 1 + filteredPhotos.length) % filteredPhotos.length
    );
  };

  const handleNext = () => {
    if (lightboxIndex === null) return;
    setLightboxIndex((lightboxIndex + 1) % filteredPhotos.length);
  };

  return (
    <section
      id="bo-suu-tap"
      className="py-14 sm:py-20 bg-canvas-warm border-b border-line scroll-mt-20"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header & Category Tabs */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-8 border-b border-line">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-brand-700">
              Hình ảnh không gian sống thực tế
            </span>
            <h2 className="mt-2 text-2xl sm:text-3xl font-bold text-ink tracking-tight">
              Bộ sưu tập hình ảnh căn hộ &amp; tiện ích tại Ân Phú
            </h2>
            <p className="mt-2 text-sm sm:text-base text-ink-secondary max-w-2xl">
              Ánh sáng tự nhiên, bố cục nội thất thực tế và tiêu chuẩn vệ sinh tại hệ
              thống căn hộ dịch vụ AdHome — Phường Tân An, Đắk Lắk.
            </p>
          </div>

          {/* Category Filter Pills */}
          <div className="flex flex-wrap gap-1.5">
            {GALLERY_CATEGORIES.map((cat) => {
              const active = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setActiveCategory(cat.id);
                    setLightboxIndex(null);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    active
                      ? 'bg-ink text-white border-ink'
                      : 'bg-canvas-pure text-ink-secondary border-line hover:bg-canvas'
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Editorial Photo Grid */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {filteredPhotos.map((item, idx) => (
            <figure
              key={item.id}
              onClick={() => setLightboxIndex(idx)}
              className={`group bg-canvas-pure rounded-card border border-line overflow-hidden shadow-subtle hover:shadow-cardHover transition-shadow cursor-pointer flex flex-col ${
                item.aspect === 'wide' && activeCategory === 'ALL'
                  ? 'sm:col-span-2'
                  : 'col-span-1'
              }`}
            >
              <div className="relative aspect-[16/10] bg-canvas-muted overflow-hidden">
                <img
                  src={item.imageUrl}
                  alt={item.title}
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                />
                <div className="absolute top-3 left-3">
                  <span className="px-2.5 py-1 rounded text-[11px] font-medium bg-canvas-pure/95 text-ink border border-line">
                    {item.categoryLabel}
                  </span>
                </div>
                <div className="absolute bottom-3 right-3 w-8 h-8 rounded-lg bg-ink/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Maximize2 className="w-4 h-4" />
                </div>
              </div>
              <figcaption className="p-4 flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-bold text-ink leading-snug">
                    {item.title}
                  </h3>
                  <p className="mt-1 text-xs text-ink-secondary leading-relaxed">
                    {item.subtitle}
                  </p>
                </div>
                {item.roomRef && (
                  <p className="mt-3 pt-2.5 border-t border-line text-[11px] font-medium text-brand-700">
                    {item.roomRef}
                  </p>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>

      {/* Lightbox Modal */}
      {currentPhoto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={currentPhoto.title}
          className="fixed inset-0 z-50 bg-ink/85 flex items-center justify-center p-4"
          onClick={() => setLightboxIndex(null)}
        >
          <div
            className="bg-canvas-pure rounded-section max-w-4xl w-full overflow-hidden border border-line shadow-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative bg-ink aspect-[16/10] flex items-center justify-center">
              <img
                src={currentPhoto.imageUrl}
                alt={currentPhoto.title}
                className="w-full h-full object-contain"
              />
              <button
                type="button"
                onClick={() => setLightboxIndex(null)}
                aria-label="Đóng xem ảnh"
                className="absolute top-3 right-3 p-2 rounded-lg bg-canvas-pure/90 text-ink hover:bg-canvas-pure"
              >
                <X className="w-5 h-5" />
              </button>

              {filteredPhotos.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={handlePrev}
                    aria-label="Ảnh trước"
                    className="absolute left-3 top-1/2 -translate-y-1/2 p-2.5 rounded-lg bg-canvas-pure/90 text-ink hover:bg-canvas-pure"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleNext}
                    aria-label="Ảnh tiếp theo"
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 rounded-lg bg-canvas-pure/90 text-ink hover:bg-canvas-pure"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>

            <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-semibold text-brand-700">
                  {currentPhoto.categoryLabel}
                </span>
                <h4 className="text-base font-bold text-ink mt-0.5">
                  {currentPhoto.title}
                </h4>
                <p className="text-xs sm:text-sm text-ink-secondary mt-1">
                  {currentPhoto.subtitle}
                </p>
              </div>
              {currentPhoto.roomRef && (
                <span className="px-3 py-1.5 rounded-lg bg-canvas-warm border border-line text-xs font-semibold text-ink shrink-0">
                  {currentPhoto.roomRef}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
