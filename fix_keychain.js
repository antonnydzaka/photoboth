const fs = require('fs');
const path = require('path');
const PNG = require('pngjs').PNG;

const directory = './public/assets/keychain/';

fs.readdirSync(directory).forEach(file => {
    if (file.endsWith('.png')) {
        const filePath = path.join(directory, file);
        fs.createReadStream(filePath)
            .pipe(new PNG({ filterType: 4 }))
            .on('parsed', function() {
                // Target aspect ratio is 709 / 1535 = 0.461889
                const targetRatio = 709 / 1535;
                const currentRatio = this.width / this.height;
                
                // Only fix if the ratio is significantly off
                if (Math.abs(currentRatio - targetRatio) < 0.01) {
                    console.log(`Skipped ${file}: already correct ratio`);
                    return;
                }
                
                let newWidth, newHeight;
                if (currentRatio < targetRatio) {
                    // Image is too tall/narrow. Pad width.
                    newHeight = this.height;
                    newWidth = Math.round(this.height * targetRatio);
                } else {
                    // Image is too wide/short. Pad height.
                    newWidth = this.width;
                    newHeight = Math.round(this.width / targetRatio);
                }
                
                const newPng = new PNG({ width: newWidth, height: newHeight });
                
                // Fill with transparent
                for (let y = 0; y < newPng.height; y++) {
                    for (let x = 0; x < newPng.width; x++) {
                        let idx = (newPng.width * y + x) << 2;
                        newPng.data[idx] = 255;
                        newPng.data[idx+1] = 255;
                        newPng.data[idx+2] = 255;
                        newPng.data[idx+3] = 255;
                    }
                }
                
                // Copy original image into center
                const offsetX = Math.round((newWidth - this.width) / 2);
                const offsetY = Math.round((newHeight - this.height) / 2);
                
                this.bitblt(newPng, 0, 0, this.width, this.height, offsetX, offsetY);
                
                newPng.pack().pipe(fs.createWriteStream(filePath)).on('finish', () => {
                    console.log(`Fixed ${file}: ${this.width}x${this.height} -> ${newWidth}x${newHeight}`);
                });
            });
    }
});
