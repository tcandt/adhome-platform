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
  jsonLd: Record<string, unknown> | null;
  ssrSummaryHtml: string;
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

  // Strip any previously injected dynamic jsonld before re-injecting
  html = html.replace(
    /<script id="adhome-dynamic-jsonld" type="application\/ld\+json">[\s\S]*?<\/script>\s*/g,
    ''
  );

  if (meta.jsonLd) {
    const scriptTag = `\n    <script id="adhome-dynamic-jsonld" type="application/ld+json">${JSON.stringify(
      meta.jsonLd
    )}</script>\n  </head>`;
    html = html.replace('</head>', scriptTag);
  }

  if (meta.ssrSummaryHtml) {
    html = html.replace(
      /<div id="root">[\s\S]*?<\/div>/,
      `<div id="root">${meta.ssrSummaryHtml}</div>`
    );
  }

  return html;
}

/**
 * Synchronizes prerendered static HTML files (`dist/phong/:slug/index.html`,
 * `dist/phong-trong/index.html`, and `dist/sitemap.xml`) from authoritative
 * PostgreSQL public rooms so that SEO crawlers and direct URL visitors never
 * receive stale prices or statuses after Console updates.
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
  const todayIso = updatedAt.slice(0, 10);

  // 1. Prerender /phong-trong/index.html
  const catalogDir = path.join(distDir, 'phong-trong');
  fs.mkdirSync(catalogDir, { recursive: true });
  const catalogHtml = injectRouteMeta(baseHtml, {
    title: 'Danh sách phòng cho thuê tại Khu đô thị Ân Phú, Đắk Lắk | AdHome',
    description:
      'Tra cứu toàn bộ danh sách phòng Studio, căn hộ 1 phòng ngủ và 2 phòng ngủ mini đang trống hoặc sắp có tại Khu đô thị Ân Phú, Phường Tân An, Đắk Lắk.',
    canonicalPath: '/phong-trong',
    ogImage: '/images/rooms/studio-balcony-3106.webp',
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

    const roomHtml = injectRouteMeta(baseHtml, {
      title: `${room.shortTitle} (${room.area}m² · ${priceText}/tháng) — KĐT Ân Phú | AdHome`,
      description: `${room.title} tại ${room.buildingAddress}. Diện tích ${room.area}m², ${room.furnishedLabel}, giá thuê ${priceText}/tháng (${statusLabel}). ${room.shortDescription}`,
      canonicalPath: `/phong/${room.slug}`,
      ogImage: primaryImage,
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
    });

    fs.writeFileSync(path.join(roomDir, 'index.html'), roomHtml, 'utf-8');
  }

  // 4. Regenerate sitemap.xml & robots.txt
  const urls = [
    { loc: `${SITE_ORIGIN}/`, priority: '1.0', changefreq: 'daily' },
    { loc: `${SITE_ORIGIN}/phong-trong`, priority: '0.9', changefreq: 'daily' },
    ...activeRooms.map((r) => ({
      loc: `${SITE_ORIGIN}/phong/${r.slug}`,
      priority: r.status === 'AVAILABLE' ? '0.8' : '0.7',
      changefreq: 'daily',
    })),
  ];

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
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

  const robotsTxt = `User-agent: *
Allow: /

Sitemap: ${SITE_ORIGIN}/sitemap.xml
`;

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
