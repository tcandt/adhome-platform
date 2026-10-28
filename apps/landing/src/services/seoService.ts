import { RoomListing } from '../types/room';
import { formatVndPrice } from './roomService';

const SITE_ORIGIN = 'https://adhome.ductinh.one';

interface SeoMetaConfig {
  title: string;
  description: string;
  canonicalPath: string;
  ogImage?: string;
  jsonLd?: Record<string, unknown> | null;
}

function setMetaTag(selector: string, attr: 'content' | 'href', value: string): void {
  if (typeof document === 'undefined') return;
  const el = document.querySelector(selector);
  if (el) {
    el.setAttribute(attr, value);
  }
}

export function applyPageSeo(config: SeoMetaConfig): void {
  if (typeof document === 'undefined') return;

  document.title = config.title;
  const canonicalUrl = `${SITE_ORIGIN}${
    config.canonicalPath.startsWith('/')
      ? config.canonicalPath
      : '/' + config.canonicalPath
  }`;
  const ogImageUrl = config.ogImage?.startsWith('http')
    ? config.ogImage
    : `${SITE_ORIGIN}${config.ogImage || '/images/rooms/hero-studio-balcony.webp'}`;

  setMetaTag('meta[name="description"]', 'content', config.description);
  setMetaTag('link[rel="canonical"]', 'href', canonicalUrl);
  setMetaTag('meta[property="og:title"]', 'content', config.title);
  setMetaTag('meta[property="og:description"]', 'content', config.description);
  setMetaTag('meta[property="og:url"]', 'content', canonicalUrl);
  setMetaTag('meta[property="og:image"]', 'content', ogImageUrl);

  const existingScript = document.getElementById('adhome-dynamic-jsonld');
  if (config.jsonLd) {
    const script =
      existingScript ||
      (() => {
        const s = document.createElement('script');
        s.id = 'adhome-dynamic-jsonld';
        s.type = 'application/ld+json';
        document.head.appendChild(s);
        return s;
      })();
    script.textContent = JSON.stringify(config.jsonLd);
  } else if (existingScript) {
    existingScript.remove();
  }
}

export function getHomeSeoConfig(): SeoMetaConfig {
  return {
    title:
      'AdHome — Căn hộ dịch vụ & Studio full nội thất tại Khu đô thị Ân Phú, Tân An, Đắk Lắk',
    description:
      'Tìm thuê căn hộ dịch vụ, phòng Studio, 1PN và 2PN mini full nội thất tại Khu đô thị Ân Phú, Phường Tân An, Đắk Lắk. Xem danh sách phòng đang trống và phòng dự kiến sắp có trên AdHome.',
    canonicalPath: '/',
    ogImage: '/images/rooms/hero-studio-balcony.webp',
    jsonLd: null,
  };
}

export function getCatalogSeoConfig(): SeoMetaConfig {
  return {
    title:
      'Danh sách phòng cho thuê tại Khu đô thị Ân Phú, Đắk Lắk | AdHome',
    description:
      'Tra cứu toàn bộ danh sách phòng Studio, căn hộ 1 phòng ngủ và 2 phòng ngủ mini đang trống hoặc sắp có tại Khu đô thị Ân Phú, Phường Tân An, Đắk Lắk.',
    canonicalPath: '/phong-trong',
    ogImage: '/images/rooms/studio-balcony-3106.webp',
    jsonLd: null,
  };
}

export function getRoomDetailSeoConfig(room: RoomListing): SeoMetaConfig {
  const priceText = formatVndPrice(room.price);
  const statusLabel =
    room.status === 'AVAILABLE' ? 'Đang trống' : room.availableFromLabel;
  const primaryImage =
    room.images[0]?.url || '/images/rooms/studio-standard-01.webp';

  return {
    title: `${room.shortTitle} (${room.area}m² · ${priceText}/tháng) — KĐT Ân Phú | AdHome`,
    description: `${room.title} tại ${room.buildingAddress}. Diện tích ${room.area}m², ${room.furnishedLabel}, giá thuê ${priceText}/tháng (${statusLabel}). ${room.shortDescription}`,
    canonicalPath: `/phong/${room.slug}`,
    ogImage: primaryImage,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Apartment',
      name: room.title,
      description: room.detailedDescription,
      url: `${SITE_ORIGIN}/phong/${room.slug}`,
      image: room.images.map((img) => `${SITE_ORIGIN}${img.url}`),
      floorSize: {
        '@type': 'QuantitativeValue',
        value: room.area,
        unitCode: 'MTK',
      },
      numberOfRooms: room.roomType.includes('2PN')
        ? 2
        : room.roomType.includes('1')
        ? 1
        : 1,
      address: {
        '@type': 'PostalAddress',
        streetAddress: `${room.buildingName}, Khu đô thị Ân Phú`,
        addressLocality: 'Phường Tân An',
        addressRegion: 'Đắk Lắk',
        addressCountry: 'VN',
      },
      offers: {
        '@type': 'Offer',
        price: room.price,
        priceCurrency: 'VND',
        availability:
          room.status === 'AVAILABLE'
            ? 'https://schema.org/InStock'
            : 'https://schema.org/PreOrder',
      },
    },
  };
}
