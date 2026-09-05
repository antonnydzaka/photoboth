const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');
const { spawnSync } = require('child_process');

const app  = express();
const PORT = 5000;

// ── ffmpeg-static path ────────────────────────────────────────────────────────
let ffmpegPath = null;
try {
    ffmpegPath = require('ffmpeg-static');
    console.log('✅ ffmpeg available:', ffmpegPath);
} catch (_) {
    console.warn('⚠️  ffmpeg-static not found — video will be saved as-is');
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ limit: '200mb' }));

// ── Ensure hasil folder ───────────────────────────────────────────────────────
const hasilFolder = path.join(__dirname, 'hasil');
if (!fs.existsSync(hasilFolder)) {
    fs.mkdirSync(hasilFolder, { recursive: true });
    console.log('✅ Created hasil folder:', hasilFolder);
}

// ── Helper: konversi file webm → mp4 H.264 via ffmpeg ────────────────────────
function convertToMp4(inputPath, outputPath) {
    if (!ffmpegPath) return false;
    try {
        const result = spawnSync(ffmpegPath, [
            '-y',
            '-i', inputPath,
            '-c:v', 'libx264',
            '-preset', 'fast',       // fast encode, bagus quality
            '-crf', '18',            // quality: 0=lossless, 23=default, 18=HQ
            '-pix_fmt', 'yuv420p',   // wajib untuk kompatibilitas iPhone/Windows
            '-movflags', '+faststart', // streaming-ready
            '-an',                   // no audio
            outputPath
        ], { timeout: 120000 });     // max 2 menit

        if (result.status === 0) {
            console.log('✅ Converted to MP4 H.264:', path.basename(outputPath));
            return true;
        } else {
            console.error('❌ ffmpeg error:', result.stderr?.toString()?.slice(0, 500));
            return false;
        }
    } catch (err) {
        console.error('❌ ffmpeg spawn error:', err.message);
        return false;
    }
}

// ── POST /api/save-blob ───────────────────────────────────────────────────────
// Terima file binary (foto JPG atau video webm/mp4)
// Jika file adalah .mp4 dan ffmpeg tersedia → konversi ke MP4 H.264 sejati
app.post(
    '/api/save-blob',
    express.raw({ type: 'application/octet-stream', limit: '200mb' }),
    (req, res) => {
        try {
            const rawFilename = req.query.filename;
            if (!rawFilename) {
                return res.status(400).json({ error: 'Missing filename' });
            }

            // Sanitize filename
            const safeFilename = path.basename(rawFilename)
                .replace(/[/\\:*?"<>|]/g, '_');
            if (!safeFilename) {
                return res.status(400).json({ error: 'Invalid filename' });
            }

            const isVideo = safeFilename.toLowerCase().endsWith('.mp4');
            const filePath = path.join(hasilFolder, safeFilename);

            if (isVideo && ffmpegPath) {
                // Simpan dulu sebagai .webm sementara
                const tmpPath = filePath.replace(/\.mp4$/i, '_tmp.webm');
                fs.writeFileSync(tmpPath, req.body);
                console.log(`📥 Received video (${req.body.length} bytes) → converting...`);

                const ok = convertToMp4(tmpPath, filePath);

                // Hapus file temp
                try { fs.unlinkSync(tmpPath); } catch (_) {}

                if (ok) {
                    const size = fs.statSync(filePath).size;
                    console.log(`✅ MP4 saved: ${safeFilename} (${(size/1024/1024).toFixed(2)} MB)`);
                    return res.json({ success: true, message: `MP4 H.264 saved: ${safeFilename}`, converted: true });
                } else {
                    // Fallback: simpan file asli dengan ekstensi .webm
                    const fallbackName = safeFilename.replace(/\.mp4$/i, '.webm');
                    const fallbackPath = path.join(hasilFolder, fallbackName);
                    fs.writeFileSync(tmpPath.replace('_tmp.webm', '.webm'), req.body);
                    console.warn(`⚠️  Conversion failed, saved as webm: ${fallbackName}`);
                    return res.json({ success: true, message: `Saved as webm: ${fallbackName}`, converted: false });
                }
            } else {
                // Foto JPG atau video tanpa ffmpeg → simpan langsung
                fs.writeFileSync(filePath, req.body);
                const size = fs.statSync(filePath).size;
                console.log(`✅ File saved: ${safeFilename} (${(size/1024/1024).toFixed(2)} MB)`);
                return res.json({ success: true, message: `Saved: ${safeFilename}` });
            }
        } catch (err) {
            console.error('❌ Error saving blob:', err);
            res.status(500).json({ error: 'Failed to save file', details: err.message });
        }
    }
);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        ffmpeg: ffmpegPath ? 'available' : 'not found',
        hasilFolder,
        timestamp: new Date().toISOString()
    });
});

app.listen(PORT, () => {
    console.log(`🎉 Photobooth server running on http://localhost:${PORT}`);
    console.log(`📁 Saving files to: ${hasilFolder}`);
    console.log(`🎬 FFmpeg: ${ffmpegPath || 'NOT AVAILABLE'}`);
});
