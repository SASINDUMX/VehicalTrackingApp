const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Create a valid PNG buffer using pixel generator
function createPng(width, height, pixelFn) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // 8-bit depth
  ihdrData.writeUInt8(6, 9); // RGBA color type
  ihdrData.writeUInt8(0, 10); // Compression
  ihdrData.writeUInt8(0, 11); // Filter
  ihdrData.writeUInt8(0, 12); // Interlace

  const ihdrChunk = makeChunk('IHDR', ihdrData);

  // Raw image data: height rows, each starting with filter byte 0, followed by width * 4 bytes
  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(height * rowSize);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter None
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const col = pixelFn(x, y, width, height);
      rawData[pxOffset] = col[0];
      rawData[pxOffset + 1] = col[1];
      rawData[pxOffset + 2] = col[2];
      rawData[pxOffset + 3] = col[3] !== undefined ? col[3] : 255;
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', compressedData);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
  const length = data.length;
  const chunk = Buffer.alloc(8 + length + 4);
  chunk.writeUInt32BE(length, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);

  const crc = calculateCrc(Buffer.concat([Buffer.from(type, 'ascii'), data]));
  chunk.writeInt32BE(crc, 8 + length);
  return chunk;
}

// Standard CRC32 table
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function calculateCrc(buf) {
  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ (-1));
}

function dist(x1, y1, x2, y2) {
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}

function renderIconPixel(x, y, w, h) {
  // Normalize coordinates to 512x512 space
  const scale = w / 512;
  const nx = x / scale;
  const ny = y / scale;

  const cx = 256;
  const cy = 256;
  const dCenter = dist(nx, ny, cx, cy);

  // Deep dark automotive slate base
  const radialFactor = Math.min(1, dCenter / 360);
  let r = Math.round(15 - radialFactor * 6);
  let g = Math.round(23 - radialFactor * 10);
  let b = Math.round(42 - radialFactor * 20);

  // Outer Telemetry Circle (Radius 178 to 186 in 512px space)
  if (dCenter <= 186) {
    r = 17; g = 26; b = 46;
    if (dCenter >= 178 && dCenter <= 184) {
      r = 6; g = 182; b = 212; // Cyan primary #06b6d4
    } else if (dCenter > 184 && dCenter <= 186) {
      r = 14; g = 116; b = 144;
    } else if (dCenter >= 175 && dCenter < 178) {
      r = 14; g = 116; b = 144;
    }
  }

  // --- MODERN LUXURY SUV PROFILE ---
  // Rear wheel: (182, 224), Front wheel: (334, 224)
  const dRearWheel = dist(nx, ny, 182, 224);
  const dFrontWheel = dist(nx, ny, 334, 224);

  let isInsideSuvBody = false;
  let isSuvWindow = false;
  let isHeadlight = false;
  let isTaillight = false;
  let isAeroAccent = false;

  if (nx >= 132 && nx <= 392 && ny >= 138 && ny <= 226) {
    let topY = 999;
    let bottomY = 226;

    if (nx >= 132 && nx < 155) {
      // Rear aerodynamic spoiler & sloping tailgate
      topY = 144 + (155 - nx) * 2.2;
    } else if (nx >= 155 && nx <= 285) {
      // Sleek coupe-SUV roofline gently descending
      topY = 140 + (nx - 210) * 0.05;
    } else if (nx > 285 && nx <= 336) {
      // Windshield fastback slope (A-pillar)
      topY = 144 + (nx - 285) * 0.65;
    } else if (nx > 336 && nx <= 384) {
      // Sculpted athletic hood
      topY = 177 + (nx - 336) * 0.18;
    } else if (nx > 384 && nx <= 392) {
      // Front grille / nose drop
      topY = 186 + (nx - 384) * 4.5;
    }

    // Underbody rocker
    if (nx >= 212 && nx <= 304) {
      bottomY = 220;
    }

    if (ny >= topY && ny <= bottomY) {
      isInsideSuvBody = true;
    }

    // Panoramic glass cabin
    if (ny >= topY + 5 && ny <= 176) {
      if (nx >= 170 && nx <= 280) {
        if (Math.abs(nx - 228) > 3) { // Thin B-pillar
          isSuvWindow = true;
        }
      } else if (nx > 280 && nx <= 330) {
        const winSlopeTop = 148 + (nx - 280) * 0.65;
        if (ny >= winSlopeTop && ny <= 176) {
          isSuvWindow = true;
        }
      } else if (nx >= 158 && nx < 170) {
        // Rear quarter glass
        const rearWinTop = 148 + (170 - nx) * 1.5;
        if (ny >= rearWinTop && ny <= 176) {
          isSuvWindow = true;
        }
      }
    }

    // Front dynamic LED Headlight (Swept-back cyber blade)
    if (nx >= 370 && nx <= 391 && ny >= 183 && ny <= 190) {
      if (Math.abs((ny - 185) - (nx - 370) * 0.2) <= 1.8) {
        isHeadlight = true;
      }
    }

    // Rear LED Taillight Blade (Connected horizontal light bar)
    if (nx >= 134 && nx <= 152 && ny >= 183 && ny <= 188) {
      if (Math.abs(ny - 185) <= 1.5) {
        isTaillight = true;
      }
    }

    // Cyber side mirror
    if (nx >= 288 && nx <= 300 && ny >= 172 && ny <= 176) {
      isAeroAccent = true;
    }
  }

  // Wheel arches cutout
  if (dRearWheel <= 31 || dFrontWheel <= 31) {
    isInsideSuvBody = false;
  }

  // Paint the SUV
  if (isHeadlight) {
    r = 56; g = 189; b = 248; // Bright Xenon Cyan #38bdf8
  } else if (isTaillight) {
    r = 239; g = 68; b = 68; // Sport red LED bar #ef4444
  } else if (isAeroAccent) {
    r = 6; g = 182; b = 212; // Cyan mirror
  } else if (isSuvWindow) {
    // High-tech tinted cockpit glass with diagonal sheen
    if ((nx - ny * 1.6) % 24 < 6) {
      r = 56; g = 189; b = 248; // Sun glare stripe
    } else {
      r = 15; g = 40; b = 68;
    }
  } else if (isInsideSuvBody) {
    // Sleek dual-tone automotive body
    // Upper contrast roof / pillar (floating roof style): ny <= 147
    if (ny <= 147 && nx >= 155 && nx <= 285) {
      r = 6; g = 182; b = 212; // Cyan floating roof accent
    } else if (Math.abs(ny - 181) <= 1 && nx >= 150 && nx <= 375) {
      r = 255; g = 255; b = 255; // White chrome shoulder crease
    } else if (Math.abs(ny - 216) <= 1 && nx >= 212 && nx <= 304) {
      r = 6; g = 182; b = 212; // Cyan lower aero rocker sill
    } else {
      // High-grade metallic white body
      const grad = (ny - 140) / 80;
      r = Math.round(240 - grad * 35);
      g = Math.round(245 - grad * 30);
      b = Math.round(252 - grad * 25);
    }
  }

  // 19-inch Sport Wheels
  [182, 334].forEach(wx => {
    const dW = dist(nx, ny, wx, 224);
    if (dW <= 28) {
      if (dW >= 20 && dW <= 28) {
        r = 25; g = 30; b = 40; // Tire rubber
      } else if (dW >= 17 && dW < 20) {
        r = 6; g = 182; b = 212; // Cyan rim ring
      } else if (dW <= 17) {
        const angle = Math.atan2(ny - 224, nx - wx);
        const spoke = Math.cos(angle * 5);
        if (spoke > 0.38 || dW <= 4) {
          r = 245; g = 250; b = 255; // Multi-spoke alloy
        } else {
          r = 12; g = 18; b = 28;
          if (dW >= 5 && dW <= 12 && Math.abs(nx - wx - 4) <= 3 && ny < 224) {
            r = 6; g = 182; b = 212; // Cyan brake caliper
          }
        }
      }
    }
  });

  // Telemetry track line beneath wheels
  if (ny >= 238 && ny <= 241 && nx >= 125 && nx <= 387 && dCenter <= 186) {
    r = 6; g = 182; b = 212;
  }

  // --- 'UM' BOLD BRAND LOGO (ny from 272 to 336) ---
  const textY = 272;
  const textH = 64;
  if (ny >= textY && ny <= textY + textH) {
    const ly = ny - textY;

    // 'U': nx from 162 to 234
    if (nx >= 162 && nx <= 234) {
      const lx = nx - 162;
      const stroke = 15;
      const isLeftStem = lx < stroke && ly <= textH - 12;
      const isRightStem = lx > 72 - stroke && ly <= textH - 12;
      const isBottom = ly >= textH - stroke && lx >= 8 && lx <= 64;
      const isBL = lx < stroke && ly > textH - 12 && (lx - 12) ** 2 + (ly - (textH - 12)) ** 2 <= 144;
      const isBR = lx > 72 - stroke && ly > textH - 12 && (lx - (72 - 12)) ** 2 + (ly - (textH - 12)) ** 2 <= 144;
      if (isLeftStem || isRightStem || isBottom || isBL || isBR) {
        r = 255; g = 255; b = 255;
      }
    }

    // 'M': nx from 256 to 346
    if (nx >= 256 && nx <= 346) {
      const lx = nx - 256;
      const stroke = 15;
      const isLeftStem = lx < stroke;
      const isRightStem = lx > 90 - stroke;
      const leftDiagDist = Math.abs(ly - (lx * (textH - 10) / 45));
      const rightDiagDist = Math.abs(ly - ((90 - lx) * (textH - 10) / 45));
      const isLeftDiag = lx >= 10 && lx <= 48 && leftDiagDist <= 9;
      const isRightDiag = lx >= 42 && lx <= 80 && rightDiagDist <= 9;
      if (isLeftStem || isRightStem || isLeftDiag || isRightDiag) {
        r = 56; g = 189; b = 248;
      }
    }
  }

  // Telemetry dots pill (ny from 354 to 376)
  if (ny >= 354 && ny <= 376 && Math.abs(nx - cx) <= 85) {
    r = 12; g = 35; b = 64;
    if (Math.abs(nx - cx) >= 83 || Math.floor(ny) === 354 || Math.floor(ny) === 376) {
      r = 2; g = 132; b = 199;
    }
    const dotX = (nx - cx + 60) % 30;
    if (Math.abs(dotX) <= 3 && Math.abs(ny - 365) <= 3) {
      r = 6; g = 182; b = 212;
    }
  }

  return [r, g, b, 255];
}

console.log('Generating 512x512 and 192x192 icons...');
const png512 = createPng(512, 512, renderIconPixel);
const png192 = createPng(192, 192, renderIconPixel);

const targets512 = [
  'assets/icon.png',
  'assets/favicon.png',
  'assets/splash-icon.png',
  'assets/adaptive-icon.png',
  'public/icon.png',
  'public/favicon.png'
];

targets512.forEach(t => {
  const fullPath = path.join(__dirname, '..', t);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, png512);
  console.log('Wrote 512x512:', t, '(', png512.length, 'bytes)');
});

const path192 = path.join(__dirname, '..', 'public', 'icon-192.png');
fs.writeFileSync(path192, png192);
console.log('Wrote 192x192: public/icon-192.png (', png192.length, 'bytes)');

// Also write to assets/icon-192.png
const assets192 = path.join(__dirname, '..', 'assets', 'icon-192.png');
fs.writeFileSync(assets192, png192);

console.log('All brand icons generated successfully!');
