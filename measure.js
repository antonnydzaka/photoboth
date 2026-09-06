const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');

async function measure() {
    const img = await loadImage('./public/assets/frames/heart-frame.png');
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    
    const idata = ctx.getImageData(0, 0, img.width, img.height).data;
    
    const slots = [];
    let inSlot = false;
    let currentSlot = null;
    
    // Scan by rows, looking for mostly transparent pixels in the middle (e.g. x=600)
    for(let y = 0; y < img.height; y++) {
        const x = 600;
        const i = (y * img.width + x) * 4;
        const alpha = idata[i+3];
        
        if (alpha < 50) { // transparent
            if (!inSlot) {
                inSlot = true;
                currentSlot = { yStart: y, yEnd: y };
            } else {
                currentSlot.yEnd = y;
            }
        } else { // opaque
            if (inSlot) {
                inSlot = false;
                slots.push(currentSlot);
                currentSlot = null;
            }
        }
    }
    if (inSlot) slots.push(currentSlot);
    
    console.log(slots.map(s => ({ y: s.yStart, h: s.yEnd - s.yStart + 1 })));
}

measure();
