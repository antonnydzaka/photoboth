const fs = require('fs');
const PNG = require('pngjs').PNG;

fs.createReadStream('./public/assets/frames/heart-frame.png')
    .pipe(new PNG({ filterType: 4 }))
    .on('parsed', function() {
        const slots = [];
        let inSlot = false;
        let currentSlot = null;
        let leftX = 9999;
        let rightX = 0;
        
        for(let y = 0; y < this.height; y++) {
            let rowHasTrans = false;
            let rowLeft = 9999;
            let rowRight = 0;
            for(let x = 0; x < this.width; x++) {
                let idx = (this.width * y + x) << 2;
                let alpha = this.data[idx+3];
                if (alpha < 50) {
                    rowHasTrans = true;
                    if (x < rowLeft) rowLeft = x;
                    if (x > rowRight) rowRight = x;
                }
            }
            if (rowHasTrans) {
                if (!inSlot) {
                    inSlot = true;
                    currentSlot = { yStart: y, yEnd: y };
                    leftX = Math.min(leftX, rowLeft);
                    rightX = Math.max(rightX, rowRight);
                } else {
                    currentSlot.yEnd = y;
                    leftX = Math.min(leftX, rowLeft);
                    rightX = Math.max(rightX, rowRight);
                }
            } else {
                if (inSlot) {
                    inSlot = false;
                    slots.push({ y: currentSlot.yStart, h: currentSlot.yEnd - currentSlot.yStart + 1 });
                    currentSlot = null;
                }
            }
        }
        if (inSlot) slots.push({ y: currentSlot.yStart, h: currentSlot.yEnd - currentSlot.yStart + 1 });
        
        console.log("X:", leftX, "W:", rightX - leftX + 1);
        console.log("SLOTS:", slots);
    });
