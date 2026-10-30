import fs from 'node:fs';
import path from 'node:path';
import type { RoomListing } from '../src/types/room';

const SITE_ORIGIN = 'https://adhome.vn';

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatPriceVnd(amount: number): string {
  return new Intl.NumberFormat('vi-VN').format(amount) + 'đ';
}

interface RouteMetaPayload {
  title: string;
  description: string;
  canonicalPath: string;
  ogImage: string;
  robotsMeta?: string;
  jsonLd: Record<string, unknown> | null;
  ssrSummaryHtml: string;
}

function getBaseHtmlTemplate(rootDir: string = process.cwd()): string {
  const candidates = [
    path.join(rootDir, 'dist', 'index.html'),
    path.join(rootDir, 'apps', 'landing', 'dist', 'index.html'),
    path.join(rootDir, 'index.html'),
    path.join(rootDir, 'apps', 'landing', 'index.html'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return fs.readFileSync(c, 'utf-8');
    }
  }
  return `<!doctype html><html lang="vi"><head><meta charset="UTF-8" /><title>AdHome</title><meta name="description" content="" /><link rel="canonical" href="https://adhome.vn/" /><meta property="og:url" content="https://adhome.vn/" /><meta property="og:title" content="" /><meta property="og:description" content="" /><meta property="og:image" content="" /></head><body><div id="root"></div></body></html>`;
}

function injectRouteMeta(baseHtml: string, meta: RouteMetaPayload): string {
  const canonicalUrl = `${SITE_ORIGIN}${meta.canonicalPath}`;
  const fullOgImage = meta.ogImage.startsWith('http')
    ? meta.ogImage
    : `${SITE_ORIGIN}${meta.ogImage}`;

  let html = baseHtml
    .replace(
      /<title>[\s\S]*?<\/title>/,
      `<title>${escapeHtml(meta.title)}</title>`
    )
    .replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/>/,
      `<meta name="description" content="${escapeHtml(meta.description)}" />`
    )
    .replace(
      /<link\s+rel="canonical"\s+href="[^"]*"\s*\/>/,
      `<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />`
    )
    .replace(
      /<meta\s+property="og:url"\s+content="[^"]*"\s*\/>/,
      `<meta property="og:url" content="${escapeHtml(canonicalUrl)}" />`
    )
    .replace(
      /<meta\s+property="og:title"\s+content="[^"]*"\s*\/>/,
      `<meta property="og:title" content="${escapeHtml(meta.title)}" />`
    )
    .replace(
      /<meta\s+property="og:description"\s+content="[^"]*"\s*\/>/,
      `<meta property="og:description" content="${escapeHtml(
        meta.description
      )}" />`
    )
    .replace(
      /<meta\s+property="og:image"\s+content="[^"]*"\s*\/>/,
      `<meta property="og:image" content="${escapeHtml(fullOgImage)}" />`
    );

  // Strip any previously injected dynamic jsonld or robots meta before re-injecting
  html = html.replace(
    /<script id="adhome-dynamic-jsonld" type="application\/ld\+json">[\s\S]*?<\/script>\s*/g,
    ''
  );
  html = html.replace(
    /<meta id="adhome-dynamic-robots" name="robots" content="[^"]*"\s*\/>\s*/g,
    ''
  );

  if (meta.robotsMeta) {
    html = html.replace(
      '</head>',
      `  <meta id="adhome-dynamic-robots" name="robots" content="${escapeHtml(
        meta.robotsMeta
      )}" />\n  </head>`
    );
  }

  if (meta.jsonLd) {
    const scriptTag = `\n    <script id="adhome-dynamic-jsonld" type="application/ld+json">${JSON.stringify(
      meta.jsonLd
    )}</script>\n  </head>`;
    html = html.replace('</head>', scriptTag);
  }

  if (meta.ssrSummaryHtml) {
    html = html.replace(
      /<div id="root">[\s\S]*?<\/div>/,
      `<div id="root"></div>\n  <noscript><div id="ssr-seo-content">${meta.ssrSummaryHtml}</div></noscript>`
    );
  }

  return html;
}

export function buildRoomRouteMeta(room: RoomListing): RouteMetaPayload {
  const priceText = formatPriceVnd(room.price);
  const statusLabel =
    room.status === 'AVAILABLE' ? 'Đang trống' : room.availableFromLabel;
  const primaryImage =
    room.images?.[0]?.url || '/images/rooms/studio-standard-01.webp';

  const roomJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Apartment',
    name: room.title,
    description: room.detailedDescription,
    url: `${SITE_ORIGIN}/phong/${room.slug}`,
    image: (room.images || []).map((img) => `${SITE_ORIGIN}${img.url}`),
    floorSize: {
      '@type': 'QuantitativeValue',
      value: room.area,
      unitCode: 'MTK',
    },
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
  };

  return {
    title: `${room.shortTitle} (${room.area}m² · ${priceText}/tháng) — KĐT Ân Phú | AdHome`,
    description: `${room.title} tại ${room.buildingAddress}. Diện tích ${room.area}m², ${room.furnishedLabel}, giá thuê ${priceText}/tháng (${statusLabel}). ${room.shortDescription}`,
    canonicalPath: `/phong/${room.slug}`,
    ogImage: primaryImage,
    robotsMeta: 'index, follow',
    jsonLd: roomJsonLd,
    ssrSummaryHtml: `<article class="max-w-[1220px] mx-auto px-4 py-12"><h1>${escapeHtml(
      room.title
    )}</h1><p>${escapeHtml(room.buildingName)} (${escapeHtml(
      room.floorName
    )}) · ${escapeHtml(room.buildingAddress)}</p><p>Diện tích: ${
      room.area
    }m² · Giá thuê: ${escapeHtml(priceText)}/tháng · Trạng thái: ${escapeHtml(
      statusLabel
    )}</p><p>${escapeHtml(room.detailedDescription)}</p></article>`,
  };
}

export function renderDynamicSitemapXml(
  publicRooms: RoomListing[],
  updatedAtIso: string = new Date().toISOString()
): string {
  const activeRooms = publicRooms.filter(
    (r) =>
      r.isPublic === true &&
      (r.status === 'AVAILABLE' || r.status === 'COMING_SOON')
  );
  const todayIso = updatedAtIso.slice(0, 10);

  const urls = [
    { loc: `${SITE_ORIGIN}/`, priority: '1.0', changefreq: 'daily' },
    { loc: `${SITE_ORIGIN}/phong-trong`, priority: '0.9', changefreq: 'daily' },
    ...activeRooms.map((r) => ({
      loc: `${SITE_ORIGIN}/phong/${r.slug}`,
      priority: r.status === 'AVAILABLE' ? '0.8' : '0.7',
      changefreq: 'daily',
    })),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${escapeHtml(u.loc)}</loc>
    <lastmod>${todayIso}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>
`;
}

export function renderDynamicRobotsTxt(): string {
  return `User-agent: *
Allow: /

Sitemap: ${SITE_ORIGIN}/sitemap.xml
`;
}

export interface RoomRedirectCandidate {
  slug: string;
  status: string;
  isPublic: boolean;
  previousSlugs: string[];
}

export type DynamicSeoRouteResult =
  | {
      kind: 'HTML';
      status: 200 | 404;
      html: string;
      etag: string;
      robotsHeader: string;
    }
  | {
      kind: 'REDIRECT';
      status: 301;
      location: string;
      etag: string;
    }
  | {
      kind: 'PASS';
    };

/**
 * Dynamically renders SEO HTML directly from PostgreSQL source-of-truth for:
 * - `/`
 * - `/phong-trong`
 * - `/phong/:slug` (including 301 redirects for renamed slugs and 404 + noindex for OCCUPIED/RESERVED/unpublished rooms)
 */
export function renderDynamicSeoRouteFromDb(
  pathname: string,
  publicRooms: RoomListing[],
  allRoomsForRedirectCheck: RoomRedirectCandidate[],
  catalogVersion: number,
  rootDir: string = process.cwd()
): DynamicSeoRouteResult {
  const cleanPath =
    pathname.length > 1 && pathname.endsWith('/')
      ? pathname.slice(0, -1)
      : pathname;
  const etag = `W/"adhome-seo-v${catalogVersion}"`;

  const activeRooms = publicRooms.filter(
    (r) =>
      r.isPublic === true &&
      (r.status === 'AVAILABLE' || r.status === 'COMING_SOON')
  );

  // 1. Home route `/`
  if (cleanPath === '/' || cleanPath === '/index.html') {
    const baseHtml = getBaseHtmlTemplate(rootDir);
    const availCount = activeRooms.filter(
      (r) => r.status === 'AVAILABLE'
    ).length;
    const comingCount = activeRooms.filter(
      (r) => r.status === 'COMING_SOON'
    ).length;
    const minPrice =
      activeRooms.length > 0
        ? Math.min(...activeRooms.map((r) => r.price))
        : 4_300_000;

    const homeHtml = injectRouteMeta(baseHtml, {
      title:
        'AdHome KĐT Ân Phú — Căn hộ dịch vụ & Phòng Studio cho thuê tại Đắk Lắk',
      description: `Hệ thống căn hộ dịch vụ, phòng Studio và 1PN-2PN full nội thất tại Khu đô thị Ân Phú, Phường Tân An, Đắk Lắk. Hiện có ${availCount} phòng đang trống và ${comingCount} phòng sắp có từ ${formatPriceVnd(
        minPrice
      )}/tháng.`,
      canonicalPath: '/',
      ogImage: '/images/rooms/hero-1br-living.webp',
      robotsMeta: 'index, follow',
      jsonLd: null,
      ssrSummaryHtml: '',
    });

    return {
      kind: 'HTML',
      status: 200,
      html: homeHtml,
      etag,
      robotsHeader: 'index, follow',
    };
  }

  // 2. Catalog route `/phong-trong`
  if (cleanPath === '/phong-trong') {
    const baseHtml = getBaseHtmlTemplate(rootDir);
    const itemListJsonLd = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Danh sách phòng cho thuê tại Khu đô thị Ân Phú — AdHome',
      numberOfItems: activeRooms.length,
      itemListElement: activeRooms.map((r, idx) => ({
        '@type': 'ListItem',
        position: idx + 1,
        url: `${SITE_ORIGIN}/phong/${r.slug}`,
        name: r.title,
      })),
    };

    const catalogHtml = injectRouteMeta(baseHtml, {
      title: `Danh sách phòng cho thuê (${activeRooms.length} phòng) tại Khu đô thị Ân Phú, Đắk Lắk | AdHome`,
      description:
        'Tra cứu toàn bộ danh sách phòng Studio, căn hộ 1 phòng ngủ và 2 phòng ngủ mini đang trống hoặc sắp có tại Khu đô thị Ân Phú, Phường Tân An, Đắk Lắk.',
      canonicalPath: '/phong-trong',
      ogImage: '/images/rooms/studio-balcony-3106.webp',
      robotsMeta: 'index, follow',
      jsonLd: itemListJsonLd,
      ssrSummaryHtml: `<main class="max-w-[1220px] mx-auto px-4 py-12"><h1>Danh sách phòng cho thuê tại Khu đô thị Ân Phú (${activeRooms.length} phòng khả dụng)</h1><p>Tra cứu toàn bộ căn hộ đang trống và sắp có theo loại phòng, tòa nhà và mức giá tại Phường Tân An, Đắk Lắk.</p></main>`,
    });

    return {
      kind: 'HTML',
      status: 200,
      html: catalogHtml,
      etag,
      robotsHeader: 'index, follow',
    };
  }

  // 3. Room Detail route `/phong/:slug`
  if (cleanPath.startsWith('/phong/')) {
    const requestedSlug = decodeURIComponent(
      cleanPath.slice('/phong/'.length)
    ).trim();
    if (!requestedSlug || requestedSlug.includes('/')) {
      return { kind: 'PASS' };
    }

    // 3a. Exact match on an active public room
    const matchedActive = activeRooms.find((r) => r.slug === requestedSlug);
    if (matchedActive) {
      const baseHtml = getBaseHtmlTemplate(rootDir);
      const roomHtml = injectRouteMeta(
        baseHtml,
        buildRoomRouteMeta(matchedActive)
      );
      return {
        kind: 'HTML',
        status: 200,
        html: roomHtml,
        etag,
        robotsHeader: 'index, follow',
      };
    }

    // 3b. Check if requestedSlug is in any active public room's `previousSlugs` -> 301 Redirect!
    const renamedTarget = allRoomsForRedirectCheck.find(
      (r) =>
        r.isPublic &&
        (r.status === 'AVAILABLE' || r.status === 'COMING_SOON') &&
        Array.isArray(r.previousSlugs) &&
        r.previousSlugs.includes(requestedSlug)
    );
    if (renamedTarget) {
      return {
        kind: 'REDIRECT',
        status: 301,
        location: `/phong/${renamedTarget.slug}`,
        etag,
      };
    }

    // 3c. Room is OCCUPIED, RESERVED, unpublished (`isPublic: false`), or nonexistent -> 404 + noindex
    const baseHtml = getBaseHtmlTemplate(rootDir);
    const unavailableRoom = allRoomsForRedirectCheck.find(
      (r) =>
        r.slug === requestedSlug ||
        (Array.isArray(r.previousSlugs) &&
          r.previousSlugs.includes(requestedSlug))
    );
    const statusReason = unavailableRoom
      ? `Phòng hiện đã chuyển sang trạng thái ${unavailableRoom.status} (ngừng nhận khách công khai).`
      : 'Mã phòng không tồn tại hoặc đã ngừng công bố.';

    const notFoundHtml = injectRouteMeta(baseHtml, {
      title: 'Phòng đã có khách thuê hoặc ngừng công bố | AdHome KĐT Ân Phú',
      description: `${statusReason} Xem danh sách các căn hộ Studio, 1PN và 2PN khác đang trống tại Khu đô thị Ân Phú, Đắk Lắk.`,
      canonicalPath: '/phong-trong',
      ogImage: '/images/rooms/studio-standard-01.webp',
      robotsMeta: 'noindex, nofollow',
      jsonLd: null,
      ssrSummaryHtml: `<main class="max-w-[1220px] mx-auto px-4 py-16"><h1>Phòng không còn khả dụng</h1><p>${escapeHtml(
        statusReason
      )}</p><p><a href="/phong-trong">Xem các phòng đang trống tại KĐT Ân Phú</a></p></main>`,
    });

    return {
      kind: 'HTML',
      status: 404,
      html: notFoundHtml,
      etag,
      robotsHeader: 'noindex, nofollow',
    };
  }

  return { kind: 'PASS' };
}

/**
 * Synchronizes prerendered static HTML files (`dist/phong/:slug/index.html`,
 * `dist/phong-trong/index.html`, and `dist/sitemap.xml`) from authoritative
 * PostgreSQL public rooms as a build/disk snapshot fallback.
 */
export function syncPrerenderedSeoFiles(
  publicRooms: RoomListing[],
  rootDir: string = process.cwd()
): { synced: boolean; roomCount: number; updatedAt: string } {
  const distDir = path.join(rootDir, 'dist');
  const publicDir = path.join(rootDir, 'public');
  const indexHtmlPath = path.join(distDir, 'index.html');
  const updatedAt = new Date().toISOString();

  if (!fs.existsSync(indexHtmlPath)) {
    return { synced: false, roomCount: 0, updatedAt };
  }

  const baseHtml = fs.readFileSync(indexHtmlPath, 'utf-8');
  const activeRooms = publicRooms.filter(
    (r) =>
      r.isPublic === true &&
      (r.status === 'AVAILABLE' || r.status === 'COMING_SOON')
  );

  // 1. Prerender /phong-trong/index.html
  const catalogDir = path.join(distDir, 'phong-trong');
  fs.mkdirSync(catalogDir, { recursive: true });
  const catalogHtml = injectRouteMeta(baseHtml, {
    title: `Danh sách phòng cho thuê (${activeRooms.length} phòng) tại Khu đô thị Ân Phú, Đắk Lắk | AdHome`,
    description:
      'Tra cứu toàn bộ danh sách phòng Studio, căn hộ 1 phòng ngủ và 2 phòng ngủ mini đang trống hoặc sắp có tại Khu đô thị Ân Phú, Phường Tân An, Đắk Lắk.',
    canonicalPath: '/phong-trong',
    ogImage: '/images/rooms/studio-balcony-3106.webp',
    robotsMeta: 'index, follow',
    jsonLd: null,
    ssrSummaryHtml: `<main class="max-w-[1220px] mx-auto px-4 py-12"><h1>Danh sách phòng cho thuê tại Khu đô thị Ân Phú</h1><p>Tra cứu toàn bộ căn hộ đang trống và sắp có theo loại phòng, tòa nhà và mức giá tại Phường Tân An, Đắk Lắk.</p></main>`,
  });
  fs.writeFileSync(path.join(catalogDir, 'index.html'), catalogHtml, 'utf-8');

  // 2. Clean up stale /phong/:slug directories for rooms no longer public
  const phongBaseDir = path.join(distDir, 'phong');
  fs.mkdirSync(phongBaseDir, { recursive: true });
  const activeSlugs = new Set(activeRooms.map((r) => r.slug));
  for (const entry of fs.readdirSync(phongBaseDir, { withFileTypes: true })) {
    if (entry.isDirectory() && !activeSlugs.has(entry.name)) {
      fs.rmSync(path.join(phongBaseDir, entry.name), {
        recursive: true,
        force: true,
      });
    }
  }

  // 3. Prerender /phong/:slug/index.html for every active public room
  for (const room of activeRooms) {
    const roomDir = path.join(phongBaseDir, room.slug);
    fs.mkdirSync(roomDir, { recursive: true });
    const roomHtml = injectRouteMeta(baseHtml, buildRoomRouteMeta(room));
    fs.writeFileSync(path.join(roomDir, 'index.html'), roomHtml, 'utf-8');
  }

  // 4. Regenerate sitemap.xml & robots.txt
  const sitemapXml = renderDynamicSitemapXml(activeRooms, updatedAt);
  const robotsTxt = renderDynamicRobotsTxt();

  if (fs.existsSync(publicDir)) {
    fs.writeFileSync(path.join(publicDir, 'sitemap.xml'), sitemapXml, 'utf-8');
    fs.writeFileSync(path.join(publicDir, 'robots.txt'), robotsTxt, 'utf-8');
  }
  fs.writeFileSync(path.join(distDir, 'sitemap.xml'), sitemapXml, 'utf-8');
  fs.writeFileSync(path.join(distDir, 'robots.txt'), robotsTxt, 'utf-8');

  return {
    synced: true,
    roomCount: activeRooms.length,
    updatedAt,
  };
}
