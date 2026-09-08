const fs = require('fs');
const PNG = require('pngjs').PNG;

// Kertas cetak keychain
const W = 709;
const H = 1535;

const png = new PNG({ width: W, height: H });

// Slot properties for perfect 1.474 aspect ratio (matching main frame)
const slotX = 93;
const slotW = 522;
const slots = [
    { y: 20, h: 354 },
    { y: 387, h: 354 },
    { y: 754, h: 354 },
    { y: 1121, h: 354 }
];

for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
        const idx = (W * y + x) << 2;
        
        // Cek apakah pixel berada di dalam salah satu slot (lubang foto)
        let inHole = false;
        if (x >= slotX && x < slotX + slotW) {
            for (let s of slots) {
                if (y >= s.y && y < s.y + s.h) {
                    inHole = true;
                    break;
                }
            }
        }
        
        if (inHole) {
            // Transparan penuh (lubang foto)
            png.data[idx] = 0;
            png.data[idx + 1] = 0;
            png.data[idx + 2] = 0;
            png.data[idx + 3] = 0;
        } else {
            // Area frame, diwarnai abu-abu muda dengan opacity 80%
            png.data[idx] = 200;
            png.data[idx + 1] = 200;
            png.data[idx + 2] = 200;
            png.data[idx + 3] = 255;
        }
        
        // Buat garis tepi (border tipis) di sekitar lubang untuk panduan yang lebih jelas
        let isBorder = false;
        if ((x === slotX - 1 || x === slotX + slotW) && slots.some(s => y >= s.y - 1 && y <= s.y + s.h)) isBorder = true;
        if ((x >= slotX - 1 && x <= slotX + slotW) && slots.some(s => y === s.y - 1 || y === s.y + s.h)) isBorder = true;
        
        if (isBorder) {
            // Garis border warna merah menyala untuk panduan potong
            png.data[idx] = 255;
            png.data[idx + 1] = 0;
            png.data[idx + 2] = 0;
            png.data[idx + 3] = 255;
        }
    }
}

png.pack().pipe(fs.createWriteStream('./public/assets/keychain/template-panduan-v4.png'))
    .on('finish', () => {
        console.log('✅ Berhasil membuat template panduan: public/assets/keychain/template-panduan-v4.png');
    });
