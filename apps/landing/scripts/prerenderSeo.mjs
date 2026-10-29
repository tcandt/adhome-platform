import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const SITE_ORIGIN = 'https://adhome.vn';
const ROOT_DIR = process.cwd();
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.DATABASE_URL ||
        'postgresql://postgres:postgres@127.0.0.1:5432/adhome_v2?schema=public',
    },
  },
});

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatPriceVnd(amount) {
  return new Intl.NumberFormat('vi-VN').format(amount) + 'đ';
}

async function loadPublicRoomsFromPostgreSql() {
  const rows = await prisma.publicRoomListing.findMany({
    where: {
      isPublic: true,
      status: { in: ['AVAILABLE', 'COMING_SOON'] },
    },
    orderBy: { displayOrder: 'asc' },
  });
  return rows;
}

function injectRouteMeta(
  baseHtml,
  { title, description, canonicalPath, ogImage, jsonLd, ssrSummaryHtml }
) {
  const canonicalUrl = `${SITE_ORIGIN}${canonicalPath}`;
  const fullOgImage = ogImage.startsWith('http')
    ? ogImage
    : `${SITE_ORIGIN}${ogImage}`;

  let html = baseHtml
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/>/,
      `<meta name="description" content="${escapeHtml(description)}" />`
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
      `<meta property="og:title" content="${escapeHtml(title)}" />`
    )
    .replace(
      /<meta\s+property="og:description"\s+content="[^"]*"\s*\/>/,
      `<meta property="og:description" content="${escapeHtml(description)}" />`
    )
    .replace(
      /<meta\s+property="og:image"\s+content="[^"]*"\s*\/>/,
      `<meta property="og:image" content="${escapeHtml(fullOgImage)}" />`
    );

  if (jsonLd) {
    const scriptTag = `\n    <script id="adhome-dynamic-jsonld" type="application/ld+json">${JSON.stringify(
      jsonLd
    )}</script>\n  </head>`;
    html = html.replace('</head>', scriptTag);
  }

  if (ssrSummaryHtml) {
    html = html.replace(
      '<div id="root"></div>',
      `<div id="root">${ssrSummaryHtml}</div>`
    );
  }

  return html;
}

async function run() {
  if (!fs.existsSync(DIST_DIR)) {
    console.error('dist directory not found. Run vite build first.');
    process.exit(1);
  }

  try {
    const baseHtml = fs.readFileSync(path.join(DIST_DIR, 'index.html'), 'utf-8');
    const rooms = await loadPublicRoomsFromPostgreSql();
    const todayIso = new Date().toISOString().slice(0, 10);

    // 1. Prerender /phong-trong/index.html
    const catalogDir = path.join(DIST_DIR, 'phong-trong');
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

    // 2. Prerender /phong/:slug/index.html for each public room in PostgreSQL
    for (const room of rooms) {
      const roomDir = path.join(DIST_DIR, 'phong', room.slug);
      fs.mkdirSync(roomDir, { recursive: true });

      const priceText = formatPriceVnd(room.price);
      const statusLabel =
        room.status === 'AVAILABLE' ? 'Đang trống' : room.availableFromLabel;
      const images = Array.isArray(room.images) ? room.images : [];
      const primaryImage =
        images[0]?.url || '/images/rooms/studio-standard-01.webp';

      const roomJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Apartment',
        name: room.title,
        description: room.detailedDescription,
        url: `${SITE_ORIGIN}/phong/${room.slug}`,
        image: images.map((img) => `${SITE_ORIGIN}${img.url}`),
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

    // 3. Generate sitemap.xml & robots.txt in both public/ and dist/
    const urls = [
      { loc: `${SITE_ORIGIN}/`, priority: '1.0', changefreq: 'daily' },
      {
        loc: `${SITE_ORIGIN}/phong-trong`,
        priority: '0.9',
        changefreq: 'daily',
      },
      ...rooms.map((r) => ({
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

    fs.writeFileSync(path.join(PUBLIC_DIR, 'sitemap.xml'), sitemapXml, 'utf-8');
    fs.writeFileSync(path.join(DIST_DIR, 'sitemap.xml'), sitemapXml, 'utf-8');
    fs.writeFileSync(path.join(PUBLIC_DIR, 'robots.txt'), robotsTxt, 'utf-8');
    fs.writeFileSync(path.join(DIST_DIR, 'robots.txt'), robotsTxt, 'utf-8');

    console.log(
      `[Prerender SEO — PostgreSQL] Prerendered /phong-trong + ${rooms.length} room detail pages, sitemap.xml (${urls.length} URLs), and robots.txt.`
    );
  } finally {
    await prisma.$disconnect();
  }
}

run();
