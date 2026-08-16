const fs = require('fs');
const path = require('path');

const distHtmlPath = path.join(__dirname, '..', 'dist', 'index.html');
if (fs.existsSync(distHtmlPath)) {
  let html = fs.readFileSync(distHtmlPath, 'utf8');

  const pwaTags = `
    <!-- PWA & Android Standalone -->
    <link rel="manifest" href="/manifest.json" />
    <meta name="mobile-web-app-capable" content="yes" />

    <!-- iOS Safari Standalone Full-Screen -->
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="UM Tracking" />
    <link rel="apple-touch-icon" href="/icon.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="/icon.png" />
    <link rel="apple-touch-icon" sizes="192x192" href="/icon.png" />
    <link rel="apple-touch-icon" sizes="512x512" href="/icon.png" />
  `;

  if (!html.includes('apple-mobile-web-app-capable')) {
    html = html.replace('</head>', `${pwaTags}</head>`);
    fs.writeFileSync(distHtmlPath, html);
    console.log('Injected standalone PWA tags into dist/index.html');
  }
}

// Copy public/ assets into dist/
const publicDir = path.join(__dirname, '..', 'public');
const distDir = path.join(__dirname, '..', 'dist');
if (fs.existsSync(publicDir)) {
  fs.cpSync(publicDir, distDir, { recursive: true });
  console.log('Copied public/ assets into dist/');
}
