import React, { useRef, useState, useEffect, useCallback } from "react";
import Webcam from "react-webcam";

// Frame asset asli: 1200 × 3000 px, tapi kita naikkan kanvas ke 3576 px
// agar frame baru bisa 100% pas (full bleed) dengan kertas 4R tanpa distorsi.
const FRAME_W = 1200;
const FRAME_H = 3576; // Full 4R (1200 x 3576) = 2400 x 3576 (2 strip)

// Offset untuk memusatkan bingkai lama (3000) ke kanvas baru (3576)
const OLD_FRAME_OFFSET_Y = (3576 - 3000) / 2; // 288



// ─── FRAME OPTIONS ────────────────────────────────────────────────────────────
const FRAME_OPTIONS = [
    "/assets/frames/heart-frame.png",
    "/assets/frames/heart-frame-2.png",
    "/assets/frames/heart-frame-3.png",
    "/assets/frames/heart-frame-4.png",
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const sanitizeFilename = (str) =>
    str.trim().replace(/\s+/g, "").replace(/[^a-zA-Z0-9\u00C0-\u024F\u0600-\u06FF]/g, "");

const normalizePhone = (phone) =>
    phone.trim().replace(/[\s\-().]/g, "");

const isValidPhone = (phone) =>
    /^(\+62|62|0)[0-9]{7,13}$/.test(normalizePhone(phone));

// Cover-fit: isi slot penuh tanpa distorsi (crop jika perlu)
const coverFit = (imgW, imgH, slotW, slotH) => {
    const scale = Math.max(slotW / imgW, slotH / imgH);
    const drawW = imgW * scale;
    const drawH = imgH * scale;
    const offsetX = (slotW - drawW) / 2;
    const offsetY = (slotH - drawH) / 2;
    return { scale, drawW, drawH, offsetX, offsetY };
};

const drawCuttingGuide = (ctx, totalWidth, totalHeight) => {
    ctx.save();
    ctx.setLineDash([20, 12]);
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(totalWidth / 2, 0);
    ctx.lineTo(totalWidth / 2, totalHeight);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
};

// ─── COMPONENT ────────────────────────────────────────────────────────────────
export default function PhotoBooth() {
    const webcamRef               = useRef(null);
    const canvasRef               = useRef(null);
    const dupCanvasRef            = useRef(null);
    const videoPreviewCanvasRef   = useRef(null);
    const frameImgRef             = useRef(null);
    const mediaRecorderRef        = useRef(null);
    const recordedChunksRef       = useRef([]);
    const liveVideoBlobRef        = useRef(null);
    const allVideoBlobs           = useRef({});
    const videoPreviewAnimRef     = useRef(null);
    const videoPreviewElementsRef = useRef([]);
    // Offscreen canvas persisten untuk preview (tidak re-create tiap frame)
    const offscreenRef            = useRef(null);

    const [selectedFrame,     setSelectedFrame]     = useState(null);
    const [mode,               setMode]               = useState("photo");
    const [sessionStarted,     setSessionStarted]     = useState(false);
    const [sessionTimeLeft,    setSessionTimeLeft]    = useState(180);
    const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(null);
    const [retakeSlotIndex,    setRetakeSlotIndex]    = useState(null);
    const [userName,           setUserName]           = useState("");
    const [userPhone,          setUserPhone]          = useState("");
    const [showNameInput,      setShowNameInput]      = useState(false);
    const [nameError,          setNameError]          = useState("");
    const [phoneError,         setPhoneError]         = useState("");
    const [photos,             setPhotos]             = useState([]);
    const [photoCount,         setPhotoCount]         = useState(0);
    const [canTakePhoto,       setCanTakePhoto]       = useState(true);
    const [draggingPhoto,      setDraggingPhoto]      = useState(null);
    const [dragOffset,         setDragOffset]         = useState({ x: 0, y: 0 });
    const [countdown,          setCountdown]          = useState(null);
    const [allPhotosTaken,     setAllPhotosTaken]     = useState(false);
    const [showRetakeCamera,   setShowRetakeCamera]   = useState(false);
    const [showSuccessPopup,   setShowSuccessPopup]   = useState(false);
    const [isSaving,           setIsSaving]           = useState(false);
    const [saveProgress,       setSaveProgress]       = useState(0);

    const [frameLayout,        setFrameLayout]        = useState(null);

    useEffect(() => { setPhotoCount(photos.length); }, [photos]);

    // ── Load frame & Dynamic Smart Scan ──
    useEffect(() => {
        if (!selectedFrame) {
            setFrameLayout(null);
            return;
        }
        const img = new Image();
        img.src = selectedFrame;
        img.crossOrigin = "Anonymous";
        img.onload = () => { 
            frameImgRef.current = img; 
            
            // Scan alpha channel untuk mendeteksi posisi lubang transparan secara cerdas!
            const cvs = document.createElement("canvas");
            cvs.width = img.naturalWidth; cvs.height = img.naturalHeight;
            const ctx = cvs.getContext("2d");
            ctx.drawImage(img, 0, 0);
            const data = ctx.getImageData(0, 0, cvs.width, cvs.height).data;
            
            let leftX = 9999, rightX = 0;
            const rawSlots = [];
            let inSlot = false, currentSlot = null;
            
            for(let y = 0; y < cvs.height; y++) {
                let rowHasTrans = false, rowLeft = 9999, rowRight = 0;
                for(let x = 0; x < cvs.width; x++) {
                    if (data[(cvs.width * y + x) * 4 + 3] < 50) {
                        rowHasTrans = true;
                        if (x < rowLeft) rowLeft = x;
                        if (x > rowRight) rowRight = x;
                    }
                }
                if (rowHasTrans) {
                    if (!inSlot) {
                        inSlot = true; currentSlot = { yStart: y, yEnd: y };
                        leftX = Math.min(leftX, rowLeft); rightX = Math.max(rightX, rowRight);
                    } else {
                        currentSlot.yEnd = y;
                        leftX = Math.min(leftX, rowLeft); rightX = Math.max(rightX, rowRight);
                    }
                } else if (inSlot) {
                    inSlot = false;
                    rawSlots.push({ y: currentSlot.yStart, h: currentSlot.yEnd - currentSlot.yStart + 1 });
                }
            }
            if (inSlot) rawSlots.push({ y: currentSlot.yStart, h: currentSlot.yEnd - currentSlot.yStart + 1 });
            
            let drawY = 0, drawH = FRAME_H, scaleY = FRAME_H / cvs.height, scaleX = FRAME_W / cvs.width;
            
            // Kompatibilitas untuk frame lama 1200x3000 agar tidak ditarik gepeng
            if (cvs.height === 3000 && cvs.width === 1200) {
                drawY = OLD_FRAME_OFFSET_Y; drawH = 3000; scaleY = 1;
            }
            
            setFrameLayout({
                drawY, drawH, x: leftX * scaleX, w: (rightX - leftX + 1) * scaleX,
                slots: rawSlots.map(s => ({ y: (s.y * scaleY) + drawY, h: s.h * scaleY }))
            });
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedFrame]);

    // ── Redraw when photos or layout change ──
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(drawCanvas, [photos, photoCount, frameLayout]);

    // ── Draw main photo canvas ──
    function drawCanvas() {
        const canvas = canvasRef.current;
        if (!canvas || !frameImgRef.current || !frameLayout) return;
        const ctx = canvas.getContext("2d");
        canvas.width  = FRAME_W;
        canvas.height = FRAME_H;

        // Background putih
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, FRAME_W, FRAME_H);

        // Gambar foto di setiap slot dengan cover-fit
        photos.forEach((p) => {
            const slot = frameLayout.slots[p.slotIndex];
            if (!slot) return;
            ctx.save();
            ctx.beginPath();
            ctx.rect(frameLayout.x, slot.y, frameLayout.w, slot.h);
            ctx.clip();
            const { drawW, drawH, offsetX, offsetY } = coverFit(p.img.width, p.img.height, frameLayout.w, slot.h);
            ctx.drawImage(
                p.img,
                frameLayout.x + offsetX + p.offsetX,
                slot.y + offsetY + p.offsetY,
                drawW, drawH
            );
            ctx.restore();
        });

        // Frame di atas foto (berdasarkan deteksi dinamis)
        ctx.drawImage(frameImgRef.current, 0, frameLayout.drawY, FRAME_W, frameLayout.drawH);

        // Sync ke dup canvas
        const dup = dupCanvasRef.current;
        if (dup) {
            dup.width  = FRAME_W;
            dup.height = FRAME_H;
            dup.getContext("2d").drawImage(canvas, 0, 0);
        }
    }

    // ── Timer ──
    const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

    useEffect(() => {
        if (!sessionStarted) return;
        const t = setInterval(() => {
            setSessionTimeLeft((prev) => {
                if (prev <= 1) { clearInterval(t); return 0; }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(t);
    }, [sessionStarted]);

    useEffect(() => {
        if (sessionStarted && sessionTimeLeft === 0 && !isSaving && !showSuccessPopup) handleFinalSave();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionTimeLeft, sessionStarted, isSaving, showSuccessPopup]);

    // ── Video capture (rekam webcam per slot) ──
    const startShortVideoCapture = () => {
        const vid = webcamRef.current?.video;
        if (!vid) return;
        const stream = vid.captureStream?.() || vid.mozCaptureStream?.() || null;
        if (!stream) return;
        // Utamakan container mp4 murni jika browser mendukung, kalau tidak fallback ke webm dengan H.264 (hardware accelerated)
        const types = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=h264", "video/webm"];
        const mimeType = types.find(t => MediaRecorder.isTypeSupported(t)) || "video/webm";
        const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
        recordedChunksRef.current = [];
        // timeslice dihapus agar tidak patah-patah (hanya merekam satu chunk besar)
        recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
        recorder.onstop = () => {
            liveVideoBlobRef.current = new Blob(recordedChunksRef.current, { type: mimeType });
            recordedChunksRef.current = [];
        };
        recorder.start(); 
        mediaRecorderRef.current = recorder;
    };

    const stopShortVideoCapture = (slotIndex = null) =>
        new Promise((resolve) => {
            const rec = mediaRecorderRef.current;
            if (rec && rec.state !== "inactive") {
                rec.addEventListener("stop", () => {
                    if (slotIndex !== null && liveVideoBlobRef.current)
                        allVideoBlobs.current[slotIndex] = liveVideoBlobRef.current;
                    mediaRecorderRef.current = null;
                    resolve();
                }, { once: true });
                rec.stop();
            } else resolve();
        });

    // ── Session ──
    const handleStartSession = () => {
        setShowNameInput(true); setNameError(""); setPhoneError("");
        setUserName(""); setUserPhone("");
    };

    const handleNameSubmit = () => {
        let valid = true;
        if (!userName.trim())            { setNameError("⚠️ Nama harus diisi!"); valid = false; } else setNameError("");
        if (!userPhone.trim())           { setPhoneError("⚠️ Nomor telepon harus diisi!"); valid = false; }
        else if (!isValidPhone(userPhone)) { setPhoneError("⚠️ Format tidak valid (contoh: 08123456789)"); valid = false; }
        else setPhoneError("");
        if (!valid) return;
        setShowNameInput(false);
        setSessionStarted(true); setSessionTimeLeft(180);
        setCanTakePhoto(false); setSelectedPhotoIndex(null);
        setRetakeSlotIndex(null); setMode("photo");
    };

    const handleBack = () => {
        setSelectedFrame(null); setMode("photo");
        setCanTakePhoto(false); setSelectedPhotoIndex(null); setRetakeSlotIndex(null);
    };

    // ── Photo logic ──
    const getNextAvailableSlot = () => {
        if (!frameLayout) return null;
        for (let i = 0; i < frameLayout.slots.length; i++)
            if (!photos.some((p) => p.slotIndex === i)) return i;
        return null;
    };

    const addPhoto = (img, replaceSlotIndex = null) => {
        const targetSlot = replaceSlotIndex !== null ? replaceSlotIndex : getNextAvailableSlot();
        if (targetSlot === null || !frameLayout) return;
        setPhotos((prev) => {
            const filtered = prev.filter((p) => p.slotIndex !== targetSlot);
            const next = [...filtered, { img, slotIndex: targetSlot, offsetX: 0, offsetY: 0 }];
            if (next.length === frameLayout.slots.length) { setMode("decorate"); setAllPhotosTaken(true); setShowRetakeCamera(false); }
            return next;
        });
        setSelectedPhotoIndex(null); setRetakeSlotIndex(null); setCanTakePhoto(true);
    };

    const takePhotoNow = (slotIndex) => {
        const src = webcamRef.current.getScreenshot();
        if (!src) return;
        const img = new Image();
        img.src = src;
        img.onload = () => addPhoto(img, slotIndex);
    };

    const capturePhoto = () => {
        if (!canTakePhoto || countdown !== null || !sessionStarted || sessionTimeLeft <= 0) return;
        setCanTakePhoto(false); setCountdown(5);
        const targetSlot = retakeSlotIndex !== null ? retakeSlotIndex : getNextAvailableSlot();
        startShortVideoCapture();
        let current = 5;
        const interval = setInterval(async () => {
            current -= 1;
            if (current === 0) {
                clearInterval(interval);
                await stopShortVideoCapture(targetSlot);
                setCountdown(null);
                takePhotoNow(targetSlot);
            } else setCountdown(current);
        }, 1000);
    };

    const redoLastPhoto = () => {
        if (!photos.length) return;
        const last = photos[photos.length - 1];
        setPhotos((prev) => prev.filter((p) => p !== last));
        setRetakeSlotIndex(last.slotIndex); setCanTakePhoto(true);
        stopVideoPreview(); setAllPhotosTaken(false);
        setMode("photo"); setShowRetakeCamera(false);
    };

    const retakeSelectedPhoto = () => {
        if (selectedPhotoIndex === null) return;
        const photo = photos[selectedPhotoIndex];
        if (!photo) return;
        stopVideoPreview(); setAllPhotosTaken(false);
        setPhotos((prev) => prev.filter((_, i) => i !== selectedPhotoIndex));
        setSelectedPhotoIndex(null); setRetakeSlotIndex(photo.slotIndex);
        setCanTakePhoto(true); setShowRetakeCamera(true);
    };

    // ── Canvas drag ──
    const getCoords = (e) => {
        const r = canvasRef.current.getBoundingClientRect();
        return {
            x: (e.clientX - r.left) * (FRAME_W / r.width),
            y: (e.clientY - r.top)  * (FRAME_H / r.height),
        };
    };
    const handleMouseDown = (e) => {
        if (!frameLayout) return;
        const { x, y } = getCoords(e);
        for (let i = photos.length - 1; i >= 0; i--) {
            const p = photos[i], slot = frameLayout.slots[p.slotIndex];
            if (!slot) continue;
            const { drawW, drawH, offsetX, offsetY } = coverFit(p.img.width, p.img.height, frameLayout.w, slot.h);
            const px = frameLayout.x + offsetX + p.offsetX, py = slot.y + offsetY + p.offsetY;
            if (x >= px && x <= px + drawW && y >= py && y <= py + drawH) {
                if (mode === "photo") {
                    setDraggingPhoto(i);
                    setDragOffset({ x: x - p.offsetX, y: y - p.offsetY });
                }
                setSelectedPhotoIndex(i); return;
            }
        }
        if (mode === "decorate") setSelectedPhotoIndex(null);
    };
    const handleMouseMove = (e) => {
        if (draggingPhoto === null || mode !== "photo" || !frameLayout) return;
        const { x, y } = getCoords(e);
        setPhotos((prev) => {
            const updated = [...prev];
            const p = updated[draggingPhoto];
            const slot = frameLayout.slots[p.slotIndex];
            if (!slot) return updated;
            const { drawW, drawH } = coverFit(p.img.width, p.img.height, frameLayout.w, slot.h);
            const maxX = (drawW - frameLayout.w) / 2;
            const maxY = (drawH - slot.h) / 2;
            p.offsetX = Math.min(Math.max(x - dragOffset.x, -maxX), maxX);
            p.offsetY = Math.min(Math.max(y - dragOffset.y, -maxY), maxY);
            return updated;
        });
    };
    const handleMouseUp = () => setDraggingPhoto(null);

    // ── Draw frame ke canvas video (satu strip) ──────────────────────────────
    // Menggunakan foto sebagai fallback jika video belum ready
    const drawOneStrip = useCallback((ctx, videoEls, cW, cH, frameImg, curPhotos, layout, renderScale = 1) => {
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, cW, cH);

        if (!layout) return;

        ctx.save();
        ctx.scale(renderScale, renderScale);

        videoEls.forEach(({ video, slotIndex }) => {
            const slot = layout.slots[slotIndex];
            if (!slot) return;
            const fallback = curPhotos.find((p) => p.slotIndex === slotIndex);
            
            ctx.save();
            // Clip area slot
            ctx.beginPath();
            ctx.rect(layout.x, slot.y, layout.w, slot.h);
            ctx.clip();

            if (video && video.readyState >= 2 && video.videoWidth > 0) {
                const { drawW, drawH, offsetX, offsetY } = coverFit(
                    video.videoWidth, video.videoHeight, layout.w, slot.h
                );
                // Mirror horizontal dari center slot
                const centerX = layout.x + layout.w / 2;
                const centerY = slot.y + slot.h / 2;
                ctx.translate(centerX, centerY);
                ctx.scale(-1, 1);
                ctx.drawImage(video, -drawW / 2, -drawH / 2, drawW, drawH);
            } else if (fallback) {
                const { drawW, drawH, offsetX, offsetY } = coverFit(
                    fallback.img.width, fallback.img.height, layout.w, slot.h
                );
                ctx.drawImage(
                    fallback.img,
                    layout.x + offsetX + fallback.offsetX,
                    slot.y + offsetY + fallback.offsetY,
                    drawW, drawH
                );
            }
            ctx.restore();
        });

        if (frameImg) {
            ctx.drawImage(frameImg, 0, layout.drawY, FRAME_W, layout.drawH);
        }
        ctx.restore();
    }, []);

    // ── Video preview (dual strip, smooth) ──────────────────────────────────
    useEffect(() => {
        if (allPhotosTaken && Object.keys(allVideoBlobs.current).length > 0) startVideoPreview();
        else stopVideoPreview();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allPhotosTaken]);

    const startVideoPreview = async () => {
        if (!frameImgRef.current) return;
        stopVideoPreview();
        const frameImg = frameImgRef.current;
        const PREVIEW_SCALE = 0.5; // Scale down preview for performance
        const cW = FRAME_W * PREVIEW_SCALE, cH = FRAME_H * PREVIEW_SCALE;

        const previewCanvas = videoPreviewCanvasRef.current;
        if (!previewCanvas) return;
        previewCanvas.width  = cW * 2;
        previewCanvas.height = cH;

        // Buat offscreen persisten
        if (!offscreenRef.current) offscreenRef.current = document.createElement("canvas");
        offscreenRef.current.width  = cW;
        offscreenRef.current.height = cH;
        const offCtx = offscreenRef.current.getContext("2d");

        // Buat video elements — loop=true untuk preview
        const videoElements = [];
        const slotCount = frameLayout ? frameLayout.slots.length : 4;
        for (let i = 0; i < slotCount; i++) {
            if (!allVideoBlobs.current[i]) continue;
            const v = document.createElement("video");
            v.src = URL.createObjectURL(allVideoBlobs.current[i]);
            v.muted = true; v.loop = true; v.playsInline = true; v.style.display = "none";
            document.body.appendChild(v);
            videoElements.push({ video: v, slotIndex: i });
        }
        if (!videoElements.length) return;
        videoPreviewElementsRef.current = videoElements;

        await Promise.all(videoElements.map((item) =>
            new Promise((r) => {
                if (item.video.readyState >= 2) { r(); return; }
                item.video.addEventListener("loadeddata", r, { once: true });
                item.video.load();
            })
        ));

        // Tunggu metadata untuk durasi
        await Promise.all(videoElements.map((item) =>
            new Promise((r) => {
                if (item.video.readyState >= 1) { r(); return; }
                item.video.addEventListener("loadedmetadata", r, { once: true });
            })
        ));

        // Seek ke 0 untuk freeze frame awal
        await Promise.all(videoElements.map((item) =>
            new Promise((r) => {
                item.video.currentTime = 0;
                item.video.addEventListener("seeked", r, { once: true });
            })
        ));

        const mainCtx   = previewCanvas.getContext("2d");
        const photosSnap = photos.slice();

        // Capture freeze frame awal (frame pertama video di detik 0)
        drawOneStrip(offCtx, videoElements, cW, cH, frameImg, photosSnap, frameLayout, PREVIEW_SCALE);
        const freezeStartData = offCtx.getImageData(0, 0, cW, cH);

        // Dapatkan durasi video untuk freeze end
        let videoDuration = 5;
        videoElements.forEach((item) => {
            const dur = item.video.duration;
            if (dur && !isNaN(dur) && isFinite(dur) && dur > videoDuration) {
                videoDuration = dur;
            }
        });
        
        // Seek ke akhir untuk freeze frame akhir
        await Promise.all(videoElements.map((item) =>
            new Promise((r) => {
                const dur = item.video.duration;
                const safeDur = (dur && !isNaN(dur) && isFinite(dur)) ? dur : 5;
                const endTime = Math.max(0, safeDur - 0.1);
                item.video.currentTime = endTime;
                item.video.addEventListener("seeked", r, { once: true });
            })
        ));

        // Capture freeze frame akhir (frame terakhir video)
        drawOneStrip(offCtx, videoElements, cW, cH, frameImg, photosSnap, frameLayout, PREVIEW_SCALE);
        const freezeEndData = offCtx.getImageData(0, 0, cW, cH);

        // Reset ke awal
        await Promise.all(videoElements.map((item) =>
            new Promise((r) => {
                item.video.currentTime = 0;
                item.video.addEventListener("seeked", r, { once: true });
            })
        ));

        const renderFreezeStart = () => {
            offCtx.putImageData(freezeStartData, 0, 0);
            mainCtx.drawImage(offscreenRef.current, 0, 0);
            mainCtx.drawImage(offscreenRef.current, cW, 0);
        };

        const renderFreezeEnd = () => {
            offCtx.putImageData(freezeEndData, 0, 0);
            mainCtx.drawImage(offscreenRef.current, 0, 0);
            mainCtx.drawImage(offscreenRef.current, cW, 0);
        };

        // Timing — freeze 1s → video 5s → freeze 1s = 7s total
        const T_FREEZE_IN  = 1000;
        const T_VIDEO      = 5000;
        const T_FREEZE_OUT = 1000;
        const TOTAL        = T_FREEZE_IN + T_VIDEO + T_FREEZE_OUT;
        let currentPhase = 0; // 0: freeze1, 1: play, 2: freeze2
        const startTime = performance.now();

        let lastFrameTime = startTime;
        const FRAME_INTERVAL = 1000 / 30; // Limit preview to 30fps

        const animate = (now) => {
            videoPreviewAnimRef.current = requestAnimationFrame(animate);
            if (now - lastFrameTime < FRAME_INTERVAL) return;
            lastFrameTime = now;
            const elapsed = now - startTime;
            const loop = elapsed % TOTAL;

            let nextPhase = 0;
            if (loop >= T_FREEZE_IN && loop < T_FREEZE_IN + T_VIDEO) nextPhase = 1;
            else if (loop >= T_FREEZE_IN + T_VIDEO) nextPhase = 2;

            if (nextPhase !== currentPhase) {
                if (nextPhase === 0) {
                    videoElements.forEach((v) => {
                        v.video.pause();
                        v.video.currentTime = 0; // Pre-seek to 0 early to prevent glitch!
                    });
                } else if (nextPhase === 1) {
                    videoElements.forEach((v) => v.video.play().catch(() => {}));
                } else if (nextPhase === 2) {
                    videoElements.forEach((v) => v.video.pause());
                }
                currentPhase = nextPhase;
            }

            if (nextPhase === 0) renderFreezeStart();
            else if (nextPhase === 1) {
                drawOneStrip(offCtx, videoElements, cW, cH, frameImg, photosSnap, frameLayout, PREVIEW_SCALE);
                mainCtx.drawImage(offscreenRef.current, 0, 0);
                mainCtx.drawImage(offscreenRef.current, cW, 0);
            } else {
                renderFreezeEnd();
            }
        };
        videoPreviewAnimRef.current = requestAnimationFrame(animate);
    };

    const stopVideoPreview = () => {
        if (videoPreviewAnimRef.current) {
            cancelAnimationFrame(videoPreviewAnimRef.current);
            videoPreviewAnimRef.current = null;
        }
        videoPreviewElementsRef.current.forEach((item) => {
            item.video.pause();
            URL.revokeObjectURL(item.video.src);
            if (document.body.contains(item.video)) document.body.removeChild(item.video);
        });
        videoPreviewElementsRef.current = [];
    };

    // ── Create combined video blob ─────────────────────────────────────────────
    // Struktur: freeze 2s → fade in 0.5s → video 5s = ~7.5s total
    const createCombinedVideoBlob = () =>
        new Promise(async (resolve) => {
            try {
                if (!frameImgRef.current) { resolve(null); return; }
                const frameImg = frameImgRef.current;
                const SCALE = 0.5; // Scale down untuk encoding yang super mulus tanpa kehilangan fps
                const cW = FRAME_W * SCALE, cH = FRAME_H * SCALE;
                const photosSnapshot = photos.slice();

                const rc = document.createElement("canvas");
                rc.width = cW * 2; rc.height = cH;
                const rcCtx = rc.getContext("2d");
                rcCtx.fillStyle = "#fff";
                rcCtx.fillRect(0, 0, rc.width, rc.height);

                const off = document.createElement("canvas");
                off.width = cW; off.height = cH;
                const offCtx = off.getContext("2d");

                // loop=false — tidak ada seam glitch
                const videoElements = [];
                const slotCount = frameLayout ? frameLayout.slots.length : 4;
                for (let i = 0; i < slotCount; i++) {
                    if (!allVideoBlobs.current[i]) continue;
                    const v = document.createElement("video");
                    v.src = URL.createObjectURL(allVideoBlobs.current[i]);
                    v.muted = true; v.loop = false; v.playsInline = true;
                    v.style.display = "none";
                    document.body.appendChild(v);
                    videoElements.push({ video: v, slotIndex: i });
                }
                if (!videoElements.length) { resolve(null); return; }

                await Promise.all(videoElements.map((item) =>
                    new Promise((r) => {
                        if (item.video.readyState >= 2) { r(); return; }
                        item.video.addEventListener("loadeddata", r, { once: true });
                        item.video.load();
                    })
                ));

                // Tunggu metadata untuk durasi
                await Promise.all(videoElements.map((item) =>
                    new Promise((r) => {
                        if (item.video.readyState >= 1) { r(); return; }
                        item.video.addEventListener("loadedmetadata", r, { once: true });
                    })
                ));

                await Promise.all(videoElements.map((item) =>
                    new Promise((r) => {
                        item.video.currentTime = 0;
                        item.video.addEventListener("seeked", r, { once: true });
                    })
                ));

                // Capture freeze frame awal (frame pertama video di detik 0)
                drawOneStrip(offCtx, videoElements, cW, cH, frameImg, photosSnapshot, frameLayout, SCALE);
                const freezeStartData = offCtx.getImageData(0, 0, cW, cH);

                // Dapatkan durasi video untuk freeze end
                let videoDuration = 5;
                videoElements.forEach((item) => {
                    const dur = item.video.duration;
                    if (dur && !isNaN(dur) && isFinite(dur) && dur > videoDuration) {
                        videoDuration = dur;
                    }
                });
                
                // Seek ke akhir untuk freeze frame akhir
                await Promise.all(videoElements.map((item) =>
                    new Promise((r) => {
                        const dur = item.video.duration;
                        const safeDur = (dur && !isNaN(dur) && isFinite(dur)) ? dur : 5;
                        const endTime = Math.max(0, safeDur - 0.1);
                        item.video.currentTime = endTime;
                        item.video.addEventListener("seeked", r, { once: true });
                    })
                ));

                // Capture freeze frame akhir (frame terakhir video)
                drawOneStrip(offCtx, videoElements, cW, cH, frameImg, photosSnapshot, frameLayout, SCALE);
                const freezeEndData = offCtx.getImageData(0, 0, cW, cH);

                // Reset ke awal
                await Promise.all(videoElements.map((item) =>
                    new Promise((r) => {
                        item.video.currentTime = 0;
                        item.video.addEventListener("seeked", r, { once: true });
                    })
                ));

                const renderFreezeStart = () => {
                    offCtx.putImageData(freezeStartData, 0, 0);
                    rcCtx.fillStyle = "#fff"; rcCtx.fillRect(0, 0, rc.width, rc.height);
                    rcCtx.drawImage(off, 0, 0);
                    rcCtx.drawImage(off, cW, 0);
                };

                const renderFreezeEnd = () => {
                    offCtx.putImageData(freezeEndData, 0, 0);
                    rcCtx.fillStyle = "#fff"; rcCtx.fillRect(0, 0, rc.width, rc.height);
                    rcCtx.drawImage(off, 0, 0);
                    rcCtx.drawImage(off, cW, 0);
                };

                // Timing — freeze 1s → video 5s → freeze 1s = 7s total
                const T_FREEZE_IN  = 1000;
                const T_VIDEO      = 5000;
                const T_FREEZE_OUT = 1000;
                const TOTAL        = T_FREEZE_IN + T_VIDEO + T_FREEZE_OUT; // 7000ms

                // Paksa penggunaan hardware-accelerated H264 / MP4 agar hasil video 100% mulus saat diputar di HP/Laptop
                const types = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=h264", "video/webm"];
                const mimeType = types.find(t => MediaRecorder.isTypeSupported(t)) || "video/webm";
                const stream = rc.captureStream(30); // 30fps HD
                const mr = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
                const chunks = [];
                mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
                mr.onstop = () => {
                    const blob = new Blob(chunks, { type: mimeType });
                    videoElements.forEach((item) => {
                        item.video.pause();
                        URL.revokeObjectURL(item.video.src);
                        if (document.body.contains(item.video)) document.body.removeChild(item.video);
                    });
                    resolve(blob);
                };

                // Mulai dengan freeze frame awal
                renderFreezeStart();
                mr.start();

                let currentPhase = 0; // 0: freeze1, 1: play, 2: freeze2
                let isDone = false;
                const startTime = performance.now();

                const renderLoop = (now) => {
                    if (isDone) return;
                    const elapsed = now - startTime;

                    if (elapsed >= TOTAL) {
                        isDone = true;
                        videoElements.forEach((v) => v.video.pause());
                        mr.stop();
                        return;
                    }

                    let nextPhase = 0;
                    if (elapsed >= T_FREEZE_IN && elapsed < T_FREEZE_IN + T_VIDEO) nextPhase = 1;
                    else if (elapsed >= T_FREEZE_IN + T_VIDEO) nextPhase = 2;

                    if (nextPhase !== currentPhase) {
                        // Skip setting currentTime=0 on nextPhase=1 here because it's ALREADY 
                        // perfectly set to 0 before mr.start() without async glitches!
                        if (nextPhase === 1) {
                            videoElements.forEach((v) => v.video.play().catch(() => {}));
                        } else if (nextPhase === 2) {
                            videoElements.forEach((v) => v.video.pause());
                        }
                        currentPhase = nextPhase;
                    }

                    if (nextPhase === 0) renderFreezeStart();
                    else if (nextPhase === 1) {
                        drawOneStrip(offCtx, videoElements, cW, cH, frameImg, photosSnapshot, frameLayout, SCALE);
                        rcCtx.fillStyle = "#fff"; rcCtx.fillRect(0, 0, rc.width, rc.height);
                        rcCtx.drawImage(off, 0, 0);
                        rcCtx.drawImage(off, cW, 0);
                    } else {
                        renderFreezeEnd();
                    }

                    requestAnimationFrame(renderLoop);
                };

                requestAnimationFrame(renderLoop);

            } catch (err) {
                console.error("❌ Video error:", err);
                resolve(null);
            }
        });

    // ── Create combined photo blob (JPG + cutting guide) ─────────────────────
    const createCombinedPhotoBlob = () => {
        const src = canvasRef.current;
        if (!src) return Promise.resolve(null);
        
        const combined = document.createElement("canvas");
        combined.width  = FRAME_W * 2;
        combined.height = FRAME_H;
        
        const ctx = combined.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, combined.width, combined.height);
        
        ctx.drawImage(src, 0, 0);
        ctx.drawImage(src, FRAME_W, 0);
        drawCuttingGuide(ctx, combined.width, combined.height);
        return new Promise((r) => combined.toBlob(r, "image/jpeg", 0.95));
    };

    // ── Save file ──
    const saveFile = async (filename, blob) => {
        try {
            const resp = await fetch(
                `http://localhost:5000/api/save-blob?filename=${encodeURIComponent(filename)}`,
                { method: "POST", body: blob, headers: { "Content-Type": "application/octet-stream" } }
            );
            if (resp.ok) return;
        } catch (_) {}
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = filename; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    // ── Final save ──
    const handleFinalSave = async () => {
        if (isSaving || showSuccessPopup) return;
        setIsSaving(true); setSaveProgress(0);
        const safeName  = sanitizeFilename(userName);
        const safePhone = normalizePhone(userPhone).replace(/\+/g, "");
        const fileBase  = safeName && safePhone ? `${safeName}${safePhone}` : `photo-${Date.now()}`;
        setSaveProgress(10);
        const photoBlob = await createCombinedPhotoBlob();
        if (photoBlob) await saveFile(`${fileBase}.jpg`, photoBlob);
        setSaveProgress(45);
        const videoBlob = await createCombinedVideoBlob();
        setSaveProgress(92);
        if (videoBlob) {
            // Selalu simpan sebagai .mp4 sesuai requirement (master prome)
            await saveFile(`${fileBase}.mp4`, videoBlob);
        }
        setSaveProgress(100);
        setIsSaving(false); setShowSuccessPopup(true);
        setTimeout(() => {
            setShowSuccessPopup(false); stopVideoPreview(); allVideoBlobs.current = {};
            setSessionStarted(false); setCanTakePhoto(false); setSelectedFrame(null);
            setMode("photo"); setPhotos([]); setPhotoCount(0);
            setSelectedPhotoIndex(null); setRetakeSlotIndex(null);
            setCountdown(null); setSessionTimeLeft(180);
            setUserName(""); setUserPhone("");
            setAllPhotosTaken(false); setShowRetakeCamera(false);
        }, 2500);
    };

    const showRetakeButton = selectedPhotoIndex !== null && photos[selectedPhotoIndex];

    // ─── RENDER ───────────────────────────────────────────────────────────────
    return (
        <div style={S.centerCol}>
            {/* TOP BAR */}
            <div style={S.topBar}>
                {selectedFrame && (
                    <button style={{ ...S.button, position: "absolute", left: 0, top: 14, height: 50, padding: "0 22px" }} onClick={handleBack}>
                        ← Back
                    </button>
                )}
                {sessionStarted && <div style={S.timerBadge}>{formatTime(sessionTimeLeft)}</div>}
                <h1 style={S.titleBar}>
                    {!selectedFrame ? "₊✩‧₊˚ Welcome ౨ৎ ˚₊✩‧₊"
                        : mode === "photo" ? "⋆｡‧˚ʚ Smile :)ɞ˚‧｡⋆"
                        : ". ݁₊ ⊹ . ݁Let's decorate . ⊹ ₊ ݁."}
                </h1>
            </div>

            {/* MAIN */}
            <div style={S.mainContent}>
                {!selectedFrame ? (
                    !sessionStarted ? (
                        <div style={S.col}>
                            <button style={{ ...S.button, fontSize: 44, padding: "20px 60px" }} onClick={handleStartSession}>Start</button>
                        </div>
                    ) : (
                        <div style={S.col}>
                            <div style={{ fontSize: 52, color: "#8c5b4a", fontWeight: "bold" }}>Pilih frame kamu</div>
                            <div style={{ display: "flex", gap: 24, flexWrap: "wrap", justifyContent: "center" }}>
                                {FRAME_OPTIONS.map((src) => (
                                    <img key={src} src={src} alt="frame"
                                        onClick={() => { setSelectedFrame(src); setCanTakePhoto(true); }}
                                        onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.08)"; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
                                        style={{ ...S.frameThumb, transform: selectedFrame === src ? "scale(1.08)" : "scale(1)" }}
                                    />
                                ))}
                            </div>
                        </div>
                    )
                ) : (
                    <div style={{ display: "flex", gap: 40, justifyContent: "center", alignItems: "flex-start", width: "100%" }}>
                        {/* LEFT: webcam */}
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                            {(mode === "photo" || showRetakeCamera) && (
                                <>
                                    <div style={{ width: "100%", display: "flex", justifyContent: "center" }}>
                                        <div style={{ position: "relative", width: 1400, maxWidth: "100%" }}>
                                            <Webcam
                                                audio={false} ref={webcamRef}
                                                screenshotFormat="image/jpeg"
                                                videoConstraints={frameLayout ? { width: frameLayout.w, height: frameLayout.slots[0].h, facingMode: "user" } : { width: 953, height: 555, facingMode: "user" }}
                                                mirrored={true}
                                                style={{ width: "100%", borderRadius: 18, objectFit: "cover", aspectRatio: frameLayout ? `${frameLayout.w}/${frameLayout.slots[0].h}` : `953/555` }}
                                            />
                                            {countdown != null && <div style={S.countdownOverlay}>{countdown}</div>}
                                        </div>
                                    </div>
                                    <div style={{ marginTop: 20, display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
                                        {canTakePhoto && sessionStarted && (
                                            <button style={S.button} onClick={capturePhoto}>
                                                {showRetakeCamera ? "📷 Ambil Foto" : "Take Photo"}
                                            </button>
                                        )}
                                        {photoCount > 0 && mode === "photo" && (
                                            <button style={{ ...S.button, fontSize: 24, padding: "8px 16px" }} onClick={redoLastPhoto}>⟳</button>
                                        )}
                                        {showRetakeButton && mode === "photo" && (
                                            <button style={{ ...S.button, background: "#fff0f4" }} onClick={retakeSelectedPhoto}>Retake selected</button>
                                        )}
                                    </div>
                                </>
                            )}
                            {mode === "decorate" && !showRetakeCamera && (
                                <div style={S.col}>
                                    {showRetakeButton ? (
                                        <div style={{ textAlign: "center" }}>
                                            <div style={{ fontSize: 20, color: "#8c5b4a", marginBottom: 12 }}>Foto dipilih — mau diganti?</div>
                                            <button style={{ ...S.button, background: "#fff0f4" }} onClick={retakeSelectedPhoto}>📷 Retake foto ini</button>
                                        </div>
                                    ) : (
                                        <div style={{ fontSize: 18, color: "#b08a80", textAlign: "center", maxWidth: 320 }}>
                                            💡 Klik foto di strip untuk memilih dan retake
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* RIGHT: preview strip */}
                        <div style={{ display: "flex", flexDirection: "row", gap: 20, alignItems: "flex-start", flexShrink: 0 }}>
                            {/* Foto strip — aspect ratio 1200:3000 = 2:5 */}
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                                <div style={S.previewLabel}>📸 Foto</div>
                                <div style={{ display: "flex", boxShadow: "0 10px 30px rgba(0,0,0,0.15)", borderRadius: 14, overflow: "hidden", outline: showRetakeButton ? "3px solid #ff7aa2" : "none" }}>
                                    <canvas ref={canvasRef}
                                        style={{ width: 320, height: 954, display: "block", cursor: mode === "decorate" ? "pointer" : "default" }}
                                        onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
                                    />
                                    {mode === "decorate" && (
                                        <canvas ref={dupCanvasRef} style={{ width: 320, height: 954, display: "block" }} />
                                    )}
                                </div>
                            </div>

                            {/* Video preview */}
                            {allPhotosTaken && (
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                                    <div style={S.previewLabel}>🎬 Video</div>
                                    <div style={{ width: 640, height: 954, borderRadius: 14, overflow: "hidden", boxShadow: "0 10px 30px rgba(255,122,162,0.25)" }}>
                                        <canvas ref={videoPreviewCanvasRef} style={{ width: 640, height: 954, display: "block" }} />
                                    </div>
                                </div>
                            )}

                            {/* Finish */}
                            {mode === "decorate" && allPhotosTaken && (
                                <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 4 }}>
                                    <button style={{ ...S.button, fontSize: 30, padding: "16px 34px", opacity: isSaving ? 0.7 : 1, cursor: isSaving ? "not-allowed" : "pointer" }}
                                        onClick={handleFinalSave} disabled={isSaving}>
                                        {isSaving ? "⏳ Saving..." : "✅ Finish"}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* MODAL: Input data */}
            {showNameInput && (
                <div style={S.modalOverlay}>
                    <div style={S.modalBox}>
                        <h2 style={{ margin: "0 0 28px", color: "#8c5b4a", fontSize: 40 }}>Data Peserta</h2>
                        <label style={S.inputLabel}>Nama</label>
                        <input type="text" placeholder="Nama lengkap..."
                            value={userName}
                            onChange={(e) => { setUserName(e.target.value); setNameError(""); }}
                            onKeyPress={(e) => { if (e.key === "Enter") document.getElementById("ph")?.focus(); }}
                            style={{ ...S.input, borderColor: nameError ? "#ff6b6b" : "#ff7aa2", marginBottom: nameError ? 6 : 20 }}
                            autoFocus
                        />
                        {nameError && <div style={S.errorText}>{nameError}</div>}
                        <label style={S.inputLabel}>Nomor Telepon</label>
                        <input id="ph" type="tel" placeholder="08123456789 atau +62812..."
                            value={userPhone}
                            onChange={(e) => { setUserPhone(e.target.value); setPhoneError(""); }}
                            onKeyPress={(e) => { if (e.key === "Enter") handleNameSubmit(); }}
                            style={{ ...S.input, borderColor: phoneError ? "#ff6b6b" : "#ff7aa2", marginBottom: phoneError ? 6 : 24 }}
                        />
                        {phoneError && <div style={S.errorText}>{phoneError}</div>}
                        <button style={{ ...S.button, fontSize: 28, padding: "16px 40px", width: "100%" }} onClick={handleNameSubmit}>
                            OK — Mulai Sesi
                        </button>
                    </div>
                </div>
            )}

            {/* MODAL: Saving / Success */}
            {(isSaving || showSuccessPopup) && (
                <div style={S.modalOverlay}>
                    <div style={{ ...S.modalBox, padding: "50px 80px" }}>
                        <div style={{ fontSize: 72, marginBottom: 20 }}>{isSaving ? "⏳" : "✅"}</div>
                        <h2 style={{ margin: "0 0 20px", color: "#8c5b4a", fontSize: 42, fontFamily: "CantikaCute" }}>
                            {isSaving ? "Mohon tunggu..." : "Berhasil disimpan!"}
                        </h2>
                        {isSaving && (
                            <>
                                <div style={S.progressBarWrap}>
                                    <div style={{ ...S.progressBarFill, width: `${saveProgress}%` }} />
                                </div>
                                <div style={{ fontSize: 20, color: "#b08a80", marginTop: 10 }}>{saveProgress}%</div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const S = {
    centerCol: { display: "flex", flexDirection: "column", alignItems: "center", gap: 20 },
    topBar: {
        width: "min(1600px, 98vw)", height: 110, position: "relative",
        marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "center",
    },
    titleBar: {
        margin: 0, lineHeight: "110px", textAlign: "center", width: "100%",
        fontSize: 60, fontFamily: "CantikaCute, cursive", color: "#8c5b4a",
    },
    timerBadge: {
        position: "absolute", right: 0, top: 12, padding: "14px 28px",
        borderRadius: 999, background: "#fff0f4", border: "2px solid #ff7aa2",
        color: "#8c5b4a", fontWeight: "bold", fontSize: 44, minWidth: 140,
        textAlign: "center", boxShadow: "0 8px 18px rgba(255,122,162,0.2)",
    },
    button: {
        padding: "16px 32px", fontSize: 30, cursor: "pointer",
        fontFamily: "CantikaCute, cursive", color: "#8c5b4a",
        border: "2px solid #8c5b4a", borderRadius: 12, background: "white",
        transition: "opacity 0.2s",
    },
    col: { display: "flex", flexDirection: "column", alignItems: "center", gap: 24 },
    frameThumb: {
        width: 280, cursor: "pointer", borderRadius: 14,
        boxShadow: "0 8px 8px rgba(0,0,0,0.15)",
        transition: "transform 0.25s ease",
    },
    mainContent: {
        width: "min(1600px, 98vw)", display: "flex",
        justifyContent: "center", alignItems: "flex-start", minHeight: 700,
    },
    previewLabel: { fontSize: 22, color: "#8c5b4a", marginBottom: 10, fontWeight: "bold", letterSpacing: 1 },
    countdownOverlay: {
        position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 160, fontWeight: "bold", color: "white",
        textShadow: "0 4px 20px rgba(0,0,0,0.6)", background: "rgba(0,0,0,0.25)",
        borderRadius: 18, pointerEvents: "none",
    },
    modalOverlay: {
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999,
    },
    modalBox: {
        background: "white", padding: "52px 56px", borderRadius: 24,
        textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        minWidth: 520, maxWidth: "92vw",
    },
    inputLabel: {
        display: "block", textAlign: "left", fontSize: 26, fontWeight: "bold",
        color: "#8c5b4a", marginBottom: 10, fontFamily: "CantikaCute, cursive",
    },
    input: {
        width: "100%", padding: "18px 22px", fontSize: 26,
        border: "2px solid #ff7aa2", borderRadius: 12,
        boxSizing: "border-box", fontFamily: "CantikaCute, cursive", outline: "none",
    },
    errorText: { color: "#ff6b6b", fontSize: 16, marginBottom: 16, fontWeight: "bold", textAlign: "left" },
    progressBarWrap: { width: "100%", height: 16, background: "#ffe0ea", borderRadius: 999, overflow: "hidden", marginTop: 10 },
    progressBarFill: { height: "100%", background: "linear-gradient(90deg,#ff7aa2,#ffb3c6)", borderRadius: 999, transition: "width 0.4s ease" },
};
