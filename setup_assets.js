/**
 * Script untuk membuat semua aset yang dibutuhkan:
 * 1. 3 background putih (bg-welcome.png, bg-smile.png, bg-decorate.png)
 * 2. 10 frame (frame-1.png s/d frame-10.png) — copy dari yang ada, sisanya dummy putih
 * 3. 10 keychain (keychain-1.png s/d keychain-10.png) — copy dari template-panduan-v3.png
 * 4. 15 stiker (sticker-1.png s/d sticker-15.png) — copy dari yang ada, sisanya dummy putih
 */

const fs = require('fs');
const path = require('path');

// Minimal 1x1 white PNG (valid PNG file)
function createWhitePNG() {
    const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
    return Buffer.from(base64, 'base64');
}

const PUBLIC = path.join(__dirname, 'public', 'assets');

// === 1. BACKGROUNDS ===
console.log('=== Creating Backgrounds ===');
const bgDir = path.join(PUBLIC, 'backgrounds');
if (!fs.existsSync(bgDir)) fs.mkdirSync(bgDir, { recursive: true });

const bgNames = ['bg-welcome.png', 'bg-smile.png', 'bg-decorate.png'];
bgNames.forEach(name => {
    const dest = path.join(bgDir, name);
    if (!fs.existsSync(dest)) {
        fs.writeFileSync(dest, createWhitePNG());
        console.log(`  Created ${name}`);
    } else {
        console.log(`  ${name} already exists, skipping`);
    }
});

// === 2. FRAMES ===
console.log('\n=== Creating Frames ===');
const frameDir = path.join(PUBLIC, 'frames');
const existingFrames = fs.readdirSync(frameDir).filter(f => f.endsWith('.png'));
console.log(`  Found existing frames: ${existingFrames.join(', ')}`);

for (let i = 1; i <= 10; i++) {
    const dest = path.join(frameDir, `frame-${i}.png`);
    if (!fs.existsSync(dest)) {
        const sourceIdx = (i - 1) % existingFrames.length;
        const source = path.join(frameDir, existingFrames[sourceIdx]);
        fs.copyFileSync(source, dest);
        console.log(`  Created frame-${i}.png (copied from ${existingFrames[sourceIdx]})`);
    } else {
        console.log(`  frame-${i}.png already exists, skipping`);
    }
}

// === 3. KEYCHAIN ===
console.log('\n=== Creating Keychain Frames ===');
const kcDir = path.join(PUBLIC, 'keychain');
const panduanV3 = path.join(kcDir, 'template-panduan-v3.png');

if (!fs.existsSync(panduanV3)) {
    console.log('  template-panduan-v3.png not found! Using heart-frame.png as fallback.');
}

const kcSource = fs.existsSync(panduanV3) ? panduanV3 : path.join(kcDir, 'heart-frame.png');

for (let i = 1; i <= 10; i++) {
    const dest = path.join(kcDir, `keychain-${i}.png`);
    if (!fs.existsSync(dest)) {
        fs.copyFileSync(kcSource, dest);
        console.log(`  Created keychain-${i}.png (copied from ${path.basename(kcSource)})`);
    } else {
        console.log(`  keychain-${i}.png already exists, skipping`);
    }
}

// === 4. STICKERS ===
console.log('\n=== Creating Stickers ===');
const stickerDir = path.join(PUBLIC, 'stickers');
const existingStickers = fs.readdirSync(stickerDir).filter(f => f.endsWith('.png'));
console.log(`  Found existing stickers: ${existingStickers.join(', ')}`);

for (let i = 1; i <= 15; i++) {
    const dest = path.join(stickerDir, `sticker-${i}.png`);
    if (!fs.existsSync(dest)) {
        const sourceIdx = (i - 1) % existingStickers.length;
        const source = path.join(stickerDir, existingStickers[sourceIdx]);
        fs.copyFileSync(source, dest);
        console.log(`  Created sticker-${i}.png (copied from ${existingStickers[sourceIdx]})`);
    } else {
        console.log(`  sticker-${i}.png already exists, skipping`);
    }
}

console.log('\nSemua aset berhasil dibuat!');
console.log('\nStruktur file:');
console.log('  backgrounds/ : bg-welcome.png, bg-smile.png, bg-decorate.png');
console.log('  frames/      : frame-1.png ... frame-10.png');
console.log('  keychain/    : keychain-1.png ... keychain-10.png');
console.log('  stickers/    : sticker-1.png ... sticker-15.png');
console.log('\nUntuk mengganti aset, cukup timpa file dengan gambar baru menggunakan nama yang sama!');
