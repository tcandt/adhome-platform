import React, { useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { GalleryPhotoItem } from '../types/room';

interface LivingSpaceSectionProps {
  photos: GalleryPhotoItem[];
}

export const LivingSpaceSection: React.FC<LivingSpaceSectionProps> = ({
  photos,
}) => {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const highlights = [
    {
      title: 'Full nội thất đồng bộ, dọn vào ở thuận tiện',
      description:
        'Trang bị sẵn giường nệm, tủ quần áo, bàn làm việc, máy lạnh, tủ lạnh, bếp nấu và bình nóng lạnh khép kín.',
    },
    {
      title: 'Môi trường sống yên tĩnh tại Khu đô thị Ân Phú',
      description:
        'Hạ tầng đường nội khu rộng thoáng tại Phường Tân An, Đắk Lắk; không gian riêng tư với cổng khóa vân tay và khu để xe tầng trệt.',
    },
    {
      title: 'Chi phí minh bạch theo thực tế sử dụng',
      description:
        'Tiền thuê phòng và biểu phí điện, nước theo đồng hồ riêng từng phòng được thông báo rõ ràng trước khi ký hợp đồng.',
    },
    {
      title: 'Hỗ trợ cư dân ở dài hạn',
      description:
        'Hợp đồng thuê rõ ràng, hỗ trợ thủ tục khai báo tạm trú và bảo trì thiết bị trong suốt quá trình lưu trú.',
    },
  ];

  const rentalSteps = [
    {
      step: '01',
      title: 'Chọn phòng & hẹn lịch xem',
      detail:
        'Xem thông tin diện tích, mức giá trên website và gửi yêu cầu hẹn lịch xem phòng phù hợp với khung giờ của bạn.',
    },
    {
      step: '02',
      title: 'Xem phòng trực tiếp tại Ân Phú',
      detail:
        'Kiểm tra thực tế không gian phòng, ánh sáng, nội thất và trao đổi trực tiếp các điều khoản thuê tại tòa nhà.',
    },
    {
      step: '03',
      title: 'Ký hợp đồng & nhận bàn giao',
      detail:
        'Thống nhất biên bản bàn giao nội thất, chỉ số điện nước ban đầu, cài đặt vân tay và nhận phòng.',
    },
  ];

  const currentPhoto =
    lightboxIndex !== null ? photos[lightboxIndex] : null;

  return (
    <section
      id="khong-gian-song"
      className="py-14 sm:py-20 bg-canvas border-b border-line scroll-mt-20"
    >
      <div className="max-w-[1220px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Part 1: 12-Column Editorial Layout — 4 Core Highlights + Curated Interior Photos */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">
          {/* Left Column (5 cols): Editorial Copy + 4 Highlights */}
          <div className="lg:col-span-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">
              Tiêu chuẩn căn hộ dịch vụ
            </p>
            <h2 className="mt-2 text-2xl sm:text-[32px] font-bold text-ink tracking-[-0.015em] leading-[1.2]">
              Không gian sống &amp; tiện nghi
            </h2>
            <p className="mt-3 text-[15px] sm:text-base text-ink-secondary leading-relaxed">
              Mỗi căn hộ tại Khu đô thị Ân Phú được bố trí hướng tới sự gọn gàng,
              đủ công năng cho người đi làm, nhân viên văn phòng và khách thuê dài
              hạn tại Tân An, Đắk Lắk.
            </p>

            <dl className="mt-8 space-y-6 border-t border-line pt-6">
              {highlights.map((item) => (
                <div key={item.title}>
                  <dt className="text-base font-semibold text-ink">
                    {item.title}
                  </dt>
                  <dd className="mt-1 text-sm text-ink-secondary leading-relaxed">
                    {item.description}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Right Column (7 cols): 4 Non-Redundant Interior/Amenity Photos */}
          <div className="lg:col-span-7">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {photos.map((photo, idx) => (
                <figure
                  key={photo.id}
                  onClick={() => setLightboxIndex(idx)}
                  className="group bg-canvas-pure rounded-card border border-line overflow-hidden cursor-pointer shadow-subtle hover:shadow-cardHover transition-shadow"
                >
                  <div className="relative aspect-[4/3] bg-canvas-warm overflow-hidden">
                    <img
                      src={photo.imageUrl}
                      alt={photo.title}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                    />
                    {photo.isIllustrative && (
                      <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded text-[11px] font-medium bg-canvas-pure/90 text-ink-secondary border border-line">
                        Ảnh minh họa
                      </span>
                    )}
                  </div>
                  <figcaption className="p-4">
                    <h3 className="text-sm font-semibold text-ink">
                      {photo.title}
                    </h3>
                    <p className="mt-1 text-xs text-ink-secondary leading-relaxed">
                      {photo.subtitle}
                    </p>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </div>

        {/* Part 2: Streamlined 3-Step Rental Process */}
        <div className="mt-14 pt-10 border-t border-line">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {rentalSteps.map((s) => (
              <div key={s.step} className="flex items-start gap-4">
                <span className="text-sm font-bold text-brand-700 bg-canvas-warm border border-line rounded-lg px-2.5 py-1 tabular-nums shrink-0 mt-0.5">
                  {s.step}
                </span>
                <div>
                  <h3 className="text-base font-semibold text-ink">
                    {s.title}
                  </h3>
                  <p className="mt-1 text-sm text-ink-secondary leading-relaxed">
                    {s.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Lightbox Modal with Animate UI / Motion */}
      <AnimatePresence>
        {currentPhoto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label={currentPhoto.title}
            className="fixed inset-0 z-50 bg-ink/80 flex items-center justify-center p-4"
            onClick={() => setLightboxIndex(null)}
          >
            <motion.div
              initial={{ scale: 0.97, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.97, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="bg-canvas-pure rounded-section max-w-3xl w-full overflow-hidden border border-line shadow-modal"
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
                  className="absolute top-3 right-3 p-2 rounded-lg bg-canvas-pure/90 text-ink"
                >
                  <X className="w-5 h-5" />
                </button>
                {photos.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setLightboxIndex(
                          ((lightboxIndex ?? 0) - 1 + photos.length) %
                            photos.length
                        )
                      }
                      aria-label="Ảnh trước"
                      className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-canvas-pure/90 text-ink"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setLightboxIndex(
                          ((lightboxIndex ?? 0) + 1) % photos.length
                        )
                      }
                      aria-label="Ảnh tiếp theo"
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-canvas-pure/90 text-ink"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </>
                )}
              </div>
              <div className="p-4 flex items-center justify-between gap-4">
                <div>
                  <h4 className="text-base font-semibold text-ink">
                    {currentPhoto.title}
                  </h4>
                  <p className="text-xs sm:text-sm text-ink-secondary mt-0.5">
                    {currentPhoto.subtitle}
                  </p>
                </div>
                {currentPhoto.isIllustrative && (
                  <span className="px-2.5 py-1 rounded text-xs bg-canvas-warm text-ink-secondary border border-line shrink-0">
                    Ảnh minh họa
                  </span>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
};
