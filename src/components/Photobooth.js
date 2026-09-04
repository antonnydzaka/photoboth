import React, { useRef, useState, useEffect, useCallback } from "react";
import Webcam from "react-webcam";

// ============================================================
// CONSTANTS & TEMPLATE CONFIG
// ============================================================
const DEFAULT_FRAMES = [
    "/assets/frames/heart-frame.png",
    "/assets/frames/heart-frame-2.png",
    "/assets/frames/heart-frame-3.png",
    "/assets/frames/heart-frame-4.png",
];

const OVERLAP = 12;
const SLOT_WIDTH = 953 + (OVERLAP * 2);
const SLOT_HEIGHT = 599 + (OVERLAP * 2);
const videoConstraints = { width: SLOT_WIDTH, height: SLOT_HEIGHT, facingMode: "user" };

const SLOTS = [
    { x: 123 - OVERLAP, y: 78 - OVERLAP },
    { x: 123 - OVERLAP, y: 680 - OVERLAP },
    { x: 123 - OVERLAP, y: 1286 - OVERLAP },
    { x: 123 - OVERLAP, y: 1885 - OVERLAP }
];

const DEFAULT_TEMPLATE = {
    name: {
        fontSize: 48,
        fontFamily: 'CantikaCute, Arial',
        color: '#8c5b4a',
        offsetY: -75,
    },
    phone: {
        fontSize: 32,
        fontFamily: 'CantikaCute, Arial',
        color: '#8c5b4a',
        offsetY: -28,
    },
    cuttingGuide: {
        color: 'rgba(255, 0, 0, 0.45)',
        lineWidth: 2,
        dashPattern: [12, 6],
    }
};

// ============================================================
// UTILITY FUNCTIONS
// ============================================================
function sanitizeFilename(name, phone) {
    const cleanName = name.replace(/\s+/g, '').replace(/[/\\:*?"<>|]/g, '');
    const cleanPhone = phone.replace(/[^\d]/g, '');
    return `${cleanName}${cleanPhone}`;
}

function isValidPhone(phone) {
    const digits = phone.replace(/[^\d]/g, '');
    return digits.length >= 8;
}

function dataUrlToBlob(dataUrl) {
    const arr = dataUrl.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/png';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    return new Blob([u8arr], { type: mime });
}

// ============================================================
// COMPONENT
// ============================================================
export default function PhotoBooth() {
    // ---- REFS ----
    const webcamRef = useRef(null);
    const canvasRef = useRef(null);
    const dupCanvasRef = useRef(null);
    const videoPreviewCanvasRef = useRef(null);
    const frameImgRef = useRef(null);
    const logoImgRef = useRef(null);
    const bgImgRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const recordedChunksRef = useRef([]);
    const liveVideoBlobRef = useRef(null);
    const allVideoBlobs = useRef({});
    const videoPreviewAnimRef = useRef(null);
    const videoPreviewElementsRef = useRef([]);

    // ---- STATE: Session ----
    const [selectedFrame, setSelectedFrame] = useState(null);
    const [mode, setMode] = useState("photo");
    const [sessionStarted, setSessionStarted] = useState(false);
    const [sessionTimeLeft, setSessionTimeLeft] = useState(180);

    // ---- STATE: Photos ----
    const [photos, setPhotos] = useState([]);
    const [photoCount, setPhotoCount] = useState(0);
    const [canTakePhoto, setCanTakePhoto] = useState(true);
    const [countdown, setCountdown] = useState(null);
    const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(null);
    const [retakeSlotIndex, setRetakeSlotIndex] = useState(null);
    const [allPhotosTaken, setAllPhotosTaken] = useState(false);
    const [showRetakeCamera, setShowRetakeCamera] = useState(false);

    // ---- STATE: Drag ----
    const [draggingPhoto, setDraggingPhoto] = useState(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

    // ---- STATE: User Input ----
    const [userName, setUserName] = useState("");
    const [userPhone, setUserPhone] = useState("");
    const [showNameInput, setShowNameInput] = useState(false);
    const [nameError, setNameError] = useState("");
    const [phoneError, setPhoneError] = useState("");

    // ---- STATE: Assets ----
    const [customLogo, setCustomLogo] = useState(null);
    const [customBackground, setCustomBackground] = useState(null);
    const [customFrames, setCustomFrames] = useState([]);
    const [logoSettings, setLogoSettings] = useState({
        width: 80, height: 80, offsetX: 0, offsetY: 12, opacity: 1
    });

    // ---- STATE: Output Options ----
    const [outputPNG, setOutputPNG] = useState(true);
    const [outputMP4, setOutputMP4] = useState(true);
    const [showCuttingGuide, setShowCuttingGuide] = useState(false);
    const [includeCuttingGuideInExport, setIncludeCuttingGuideInExport] = useState(false);

    // ---- STATE: Save/Export ----
    const [isSaving, setIsSaving] = useState(false);
    const [showSuccessPopup, setShowSuccessPopup] = useState(false);
    const [videoProgress, setVideoProgress] = useState(null);
    const [generatedResults, setGeneratedResults] = useState(null);

    // ---- STATE: UI ----
    const [showSettings, setShowSettings] = useState(false);
    const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);

    const isMobile = windowWidth < 768;

    // ============================================================
    // CANVAS DRAWING
    // ============================================================
    const drawCuttingGuide = useCallback((ctx, w, h) => {
        ctx.save();
        ctx.strokeStyle = DEFAULT_TEMPLATE.cuttingGuide.color;
        ctx.lineWidth = DEFAULT_TEMPLATE.cuttingGuide.lineWidth;
        ctx.setLineDash(DEFAULT_TEMPLATE.cuttingGuide.dashPattern);

        // Horizontal center line
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();

        // Vertical center line
        ctx.beginPath();
        ctx.moveTo(w / 2, 0);
        ctx.lineTo(w / 2, h);
        ctx.stroke();

        ctx.restore();
    }, []);

    const renderAllLayers = useCallback((ctx, fw, fh, options = {}) => {
        const { includeGuide = false, xOffset = 0 } = options;

        // Layer 1: Background
        if (bgImgRef.current) {
            const bg = bgImgRef.current;
            const scale = Math.max(fw / bg.width, fh / bg.height);
            const bw = bg.width * scale;
            const bh = bg.height * scale;
            ctx.drawImage(bg, xOffset + (fw - bw) / 2, (fh - bh) / 2, bw, bh);
        }

        // Layer 2: Photos
        photos.forEach(p => {
            const slot = SLOTS[p.slotIndex];
            const drawW = p.img.width * p.scale;
            const drawH = p.img.height * p.scale;
            ctx.save();
            ctx.beginPath();
            ctx.rect(xOffset + slot.x, slot.y, SLOT_WIDTH, SLOT_HEIGHT);
            ctx.clip();
            ctx.drawImage(p.img, xOffset + slot.x + p.offsetX, slot.y + p.offsetY, drawW, drawH);
            ctx.restore();
        });

        // Layer 3: Frame
        if (frameImgRef.current) {
            ctx.drawImage(frameImgRef.current, xOffset, 0, fw, fh);
        }

        // Layer 4: Logo
        if (logoImgRef.current) {
            ctx.save();
            ctx.globalAlpha = logoSettings.opacity;
            const lw = logoSettings.width;
            const lh = logoSettings.height;
            const lx = xOffset + (fw - lw) / 2 + logoSettings.offsetX;
            const ly = logoSettings.offsetY;
            ctx.drawImage(logoImgRef.current, lx, ly, lw, lh);
            ctx.restore();
        }

        // Layer 5: Text — Name
        if (userName) {
            ctx.fillStyle = DEFAULT_TEMPLATE.name.color;
            ctx.font = `bold ${DEFAULT_TEMPLATE.name.fontSize}px ${DEFAULT_TEMPLATE.name.fontFamily}`;
            ctx.textAlign = 'center';
            ctx.fillText(userName, xOffset + fw / 2, fh + DEFAULT_TEMPLATE.name.offsetY);
        }

        // Layer 5: Text — Phone
        if (userPhone) {
            ctx.fillStyle = DEFAULT_TEMPLATE.phone.color;
            ctx.font = `${DEFAULT_TEMPLATE.phone.fontSize}px ${DEFAULT_TEMPLATE.phone.fontFamily}`;
            ctx.textAlign = 'center';
            ctx.fillText(userPhone, xOffset + fw / 2, fh + DEFAULT_TEMPLATE.phone.offsetY);
        }

        // Layer 6: Cutting Guide
        if (includeGuide) {
            drawCuttingGuide(ctx, fw, fh);
        }
    }, [photos, userName, userPhone, logoSettings, drawCuttingGuide]);

    const drawCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || !frameImgRef.current) return;

        const ctx = canvas.getContext("2d");
        const fw = frameImgRef.current.width;
        const fh = frameImgRef.current.height;
        canvas.width = fw;
        canvas.height = fh;

        ctx.clearRect(0, 0, fw, fh);
        renderAllLayers(ctx, fw, fh, { includeGuide: showCuttingGuide });

        // Update duplicate canvas
        const dupCanvas = dupCanvasRef.current;
        if (dupCanvas) {
            dupCanvas.width = fw;
            dupCanvas.height = fh;
            const dupCtx = dupCanvas.getContext("2d");
            dupCtx.drawImage(canvas, 0, 0);
        }
    }, [renderAllLayers, showCuttingGuide]);

    // ============================================================
    // EFFECTS: Sync & Canvas
    // ============================================================
    useEffect(() => { setPhotoCount(photos.length); }, [photos]);

    useEffect(() => {
        if (!selectedFrame) return;
        const img = new Image();
        img.src = selectedFrame;
        img.onload = () => {
            frameImgRef.current = img;
            drawCanvas();
        };
    }, [selectedFrame, drawCanvas]);

    useEffect(() => { drawCanvas(); }, [photos, photoCount, userName, userPhone, showCuttingGuide, drawCanvas]);

    // Load logo image
    useEffect(() => {
        if (!customLogo) { logoImgRef.current = null; drawCanvas(); return; }
        const img = new Image();
        img.onload = () => { logoImgRef.current = img; drawCanvas(); };
        img.src = customLogo;
    }, [customLogo, drawCanvas]);

    // Load background image
    useEffect(() => {
        if (!customBackground) { bgImgRef.current = null; drawCanvas(); return; }
        const img = new Image();
        img.onload = () => { bgImgRef.current = img; drawCanvas(); };
        img.src = customBackground;
    }, [customBackground, drawCanvas]);

    // Window resize
    useEffect(() => {
        const handleResize = () => setWindowWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // ============================================================
    // SESSION & INPUT
    // ============================================================
    const formatTime = (seconds) => {
        const min = Math.floor(seconds / 60);
        const sec = seconds % 60;
        return `${min}:${String(sec).padStart(2, "0")}`;
    };

    const handleStartSession = () => {
        setShowNameInput(true);
        setNameError("");
        setPhoneError("");
        setUserName("");
        setUserPhone("");
    };

    const handleNameSubmit = () => {
        let hasError = false;

        if (!userName.trim()) {
            setNameError("⚠️ Nama harus diisi!");
            hasError = true;
        } else {
            setNameError("");
        }

        if (!userPhone.trim()) {
            setPhoneError("⚠️ Nomor telepon harus diisi!");
            hasError = true;
        } else if (!isValidPhone(userPhone)) {
            setPhoneError("⚠️ Format nomor tidak valid (min 8 digit)!");
            hasError = true;
        } else {
            setPhoneError("");
        }

        if (hasError) return;

        setShowNameInput(false);
        setSessionStarted(true);
        setSessionTimeLeft(180);
        setCanTakePhoto(false);
        setSelectedPhotoIndex(null);
        setRetakeSlotIndex(null);
        setMode("photo");
    };

    // Session timer
    useEffect(() => {
        if (!sessionStarted) return;
        const timer = setInterval(() => {
            setSessionTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    setSessionStarted(false);
                    setCanTakePhoto(false);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [sessionStarted]);

    const handleBack = () => {
        if (!selectedFrame) return;
        setSelectedFrame(null);
        setMode("photo");
        setCanTakePhoto(false);
        setSelectedPhotoIndex(null);
        setRetakeSlotIndex(null);
    };

    // ============================================================
    // PHOTO CAPTURE
    // ============================================================
    const getNextAvailableSlot = () => {
        for (let i = 0; i < SLOTS.length; i++) {
            if (!photos.some(p => p.slotIndex === i)) return i;
        }
        return null;
    };

    const addPhoto = (img, replaceSlotIndex = null) => {
        const targetSlot = replaceSlotIndex !== null ? replaceSlotIndex : getNextAvailableSlot();
        if (targetSlot === null) return;

        const scale = SLOT_WIDTH / img.width;
        const drawH = img.height * scale;
        const offsetY = drawH > SLOT_HEIGHT ? (SLOT_HEIGHT - drawH) / 2 : 0;

        setPhotos(prev => {
            const filtered = prev.filter(p => p.slotIndex !== targetSlot);
            const next = [...filtered, { img, slotIndex: targetSlot, scale, offsetX: 0, offsetY }];
            if (next.length === 4) {
                setMode("decorate");
                setAllPhotosTaken(true);
                setShowRetakeCamera(false);
            }
            return next;
        });

        setSelectedPhotoIndex(null);
        setRetakeSlotIndex(null);
        setCanTakePhoto(true);
    };

    const takePhotoNow = () => {
        const src = webcamRef.current.getScreenshot();
        if (!src) return;
        const img = new Image();
        img.src = src;
        img.onload = () => addPhoto(img, retakeSlotIndex);
    };

    // ============================================================
    // VIDEO CAPTURE
    // ============================================================
    const startShortVideoCapture = () => {
        const videoElement = webcamRef.current?.video;
        if (!videoElement) return;

        const stream = videoElement.captureStream
            ? videoElement.captureStream()
            : videoElement.mozCaptureStream
                ? videoElement.mozCaptureStream()
                : null;
        if (!stream) return;

        const mimeType = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm';
        const recorder = new MediaRecorder(stream, { mimeType });
        recordedChunksRef.current = [];

        recorder.ondataavailable = (event) => {
            if (event.data.size > 0) recordedChunksRef.current.push(event.data);
        };

        recorder.onstop = () => {
            liveVideoBlobRef.current = new Blob(recordedChunksRef.current, { type: mimeType });
            recordedChunksRef.current = [];
        };

        recorder.start();
        mediaRecorderRef.current = recorder;
    };

    const stopShortVideoCapture = async (slotIndex = null) => {
        return new Promise((resolve) => {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
                const recorder = mediaRecorderRef.current;
                const handleStop = () => {
                    recorder.removeEventListener('stop', handleStop);
                    if (slotIndex !== null && liveVideoBlobRef.current) {
                        allVideoBlobs.current[slotIndex] = liveVideoBlobRef.current;
                    }
                    mediaRecorderRef.current = null;
                    resolve();
                };
                recorder.addEventListener('stop', handleStop);
                recorder.stop();
            } else {
                resolve();
            }
        });
    };

    const capturePhoto = () => {
        if (!canTakePhoto || countdown !== null || !sessionStarted || sessionTimeLeft <= 0) return;
        setCanTakePhoto(false);
        setCountdown(5);

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
            } else {
                setCountdown(current);
            }
        }, 1000);
    };

    const redoLastPhoto = () => {
        if (!photos.length) return;
        const lastPhoto = photos[photos.length - 1];
        setPhotos(prev => prev.filter(p => p !== lastPhoto));
        setSelectedPhotoIndex(null);
        setRetakeSlotIndex(lastPhoto.slotIndex);
        setCanTakePhoto(true);
        stopVideoPreview();
        setAllPhotosTaken(false);
        setMode("photo");
        setShowRetakeCamera(false);
    };

    const retakeSelectedPhoto = () => {
        if (selectedPhotoIndex === null) return;
        const photoToReplace = photos[selectedPhotoIndex];
        if (!photoToReplace) return;

        stopVideoPreview();
        setAllPhotosTaken(false);
        setPhotos(prev => prev.filter((_, index) => index !== selectedPhotoIndex));
        setSelectedPhotoIndex(null);
        setRetakeSlotIndex(photoToReplace.slotIndex);
        setCanTakePhoto(true);
        setShowRetakeCamera(true);
    };

    // ============================================================
    // ASSET MANAGEMENT
    // ============================================================
    const handleLogoUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (customLogo) URL.revokeObjectURL(customLogo);
        setCustomLogo(URL.createObjectURL(file));
    };

    const handleRemoveLogo = () => {
        if (customLogo) URL.revokeObjectURL(customLogo);
        setCustomLogo(null);
        logoImgRef.current = null;
    };

    const handleBackgroundUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (customBackground) URL.revokeObjectURL(customBackground);
        setCustomBackground(URL.createObjectURL(file));
    };

    const handleRemoveBackground = () => {
        if (customBackground) URL.revokeObjectURL(customBackground);
        setCustomBackground(null);
        bgImgRef.current = null;
    };

    const handleCustomFrameUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const url = URL.createObjectURL(file);
        setCustomFrames(prev => [...prev, url]);
    };

    // ============================================================
    // MOUSE HANDLERS (DRAG & SELECT)
    // ============================================================
    const getCoords = e => {
        const r = canvasRef.current.getBoundingClientRect();
        return {
            x: (e.clientX - r.left) * (canvasRef.current.width / r.width),
            y: (e.clientY - r.top) * (canvasRef.current.height / r.height)
        };
    };

    const handleMouseDown = e => {
        const { x, y } = getCoords(e);
        if (mode === "photo" || mode === "decorate") {
            for (let i = photos.length - 1; i >= 0; i--) {
                const p = photos[i];
                const slot = SLOTS[p.slotIndex];
                const w = p.img.width * p.scale;
                const h = p.img.height * p.scale;
                if (
                    x >= slot.x + p.offsetX && x <= slot.x + p.offsetX + w &&
                    y >= slot.y + p.offsetY && y <= slot.y + p.offsetY + h
                ) {
                    if (mode === "photo") {
                        setDraggingPhoto(i);
                        setDragOffset({ x: x - slot.x - p.offsetX, y: y - slot.y - p.offsetY });
                    }
                    setSelectedPhotoIndex(i);
                    return;
                }
            }
        }
        if (mode === "decorate") setSelectedPhotoIndex(null);
    };

    const handleMouseMove = e => {
        const { x, y } = getCoords(e);
        if (draggingPhoto !== null && mode === "photo") {
            setPhotos(prev => {
                const updated = [...prev];
                const p = updated[draggingPhoto];
                const slot = SLOTS[p.slotIndex];
                const w = p.img.width * p.scale;
                const h = p.img.height * p.scale;
                p.offsetX = x - slot.x - dragOffset.x;
                p.offsetY = y - slot.y - dragOffset.y;
                p.offsetX = Math.min(Math.max(p.offsetX, SLOT_WIDTH - w), 0);
                p.offsetY = Math.min(Math.max(p.offsetY, SLOT_HEIGHT - h), 0);
                return updated;
            });
        }
    };

    const handleMouseUp = () => { setDraggingPhoto(null); };

    // ============================================================
    // VIDEO PREVIEW
    // ============================================================
    const drawVideosOnCanvas = useCallback((ctx, videoElements, canvasWidth, canvasHeight, frameImg, xOffset = 0, currentPhotos = []) => {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(xOffset, 0, canvasWidth, canvasHeight);

        // Background layer
        if (bgImgRef.current) {
            const bg = bgImgRef.current;
            const scale = Math.max(canvasWidth / bg.width, canvasHeight / bg.height);
            const bw = bg.width * scale;
            const bh = bg.height * scale;
            ctx.drawImage(bg, xOffset + (canvasWidth - bw) / 2, (canvasHeight - bh) / 2, bw, bh);
        }

        // Videos in slots
        videoElements.forEach((item) => {
            const slot = SLOTS[item.slotIndex];
            const video = item.video;
            const fallbackPhoto = currentPhotos.find(p => p.slotIndex === item.slotIndex);
            if (slot) {
                ctx.save();
                ctx.beginPath();
                ctx.rect(xOffset + slot.x, slot.y, SLOT_WIDTH, SLOT_HEIGHT);
                ctx.clip();
                if (video.readyState >= 2) {
                    const vw = video.videoWidth || SLOT_WIDTH;
                    const vh = video.videoHeight || SLOT_HEIGHT;
                    const vScale = SLOT_WIDTH / vw;
                    const drawH = vh * vScale;
                    const offY = drawH > SLOT_HEIGHT ? (SLOT_HEIGHT - drawH) / 2 : 0;
                    ctx.drawImage(video, xOffset + slot.x, slot.y + offY, SLOT_WIDTH, drawH);
                } else if (fallbackPhoto) {
                    const drawW = fallbackPhoto.img.width * fallbackPhoto.scale;
                    const drawH = fallbackPhoto.img.height * fallbackPhoto.scale;
                    ctx.drawImage(fallbackPhoto.img, xOffset + slot.x + fallbackPhoto.offsetX, slot.y + fallbackPhoto.offsetY, drawW, drawH);
                }
                ctx.restore();
            }
        });

        // Frame
        if (frameImg) ctx.drawImage(frameImg, xOffset, 0, canvasWidth, canvasHeight);

        // Logo
        if (logoImgRef.current) {
            ctx.save();
            ctx.globalAlpha = logoSettings.opacity;
            ctx.drawImage(logoImgRef.current, xOffset + (canvasWidth - logoSettings.width) / 2 + logoSettings.offsetX, logoSettings.offsetY, logoSettings.width, logoSettings.height);
            ctx.restore();
        }

        // Text: Name
        if (userName) {
            ctx.fillStyle = DEFAULT_TEMPLATE.name.color;
            ctx.font = `bold ${DEFAULT_TEMPLATE.name.fontSize}px ${DEFAULT_TEMPLATE.name.fontFamily}`;
            ctx.textAlign = 'center';
            ctx.fillText(userName, xOffset + canvasWidth / 2, canvasHeight + DEFAULT_TEMPLATE.name.offsetY);
        }
        // Text: Phone
        if (userPhone) {
            ctx.fillStyle = DEFAULT_TEMPLATE.phone.color;
            ctx.font = `${DEFAULT_TEMPLATE.phone.fontSize}px ${DEFAULT_TEMPLATE.phone.fontFamily}`;
            ctx.textAlign = 'center';
            ctx.fillText(userPhone, xOffset + canvasWidth / 2, canvasHeight + DEFAULT_TEMPLATE.phone.offsetY);
        }
    }, [userName, userPhone, logoSettings]);

    const startVideoPreview = useCallback(async () => {
        if (!frameImgRef.current) return;
        stopVideoPreview();

        const frameImg = frameImgRef.current;
        const canvasWidth = frameImg.width;
        const canvasHeight = frameImg.height;

        // Draw placeholder immediately
        const previewCanvas = videoPreviewCanvasRef.current;
        const photoCanvas = canvasRef.current;
        if (previewCanvas && photoCanvas) {
            previewCanvas.width = canvasWidth * 2;
            previewCanvas.height = canvasHeight;
            const ctx = previewCanvas.getContext('2d');
            ctx.drawImage(photoCanvas, 0, 0);
            ctx.drawImage(photoCanvas, canvasWidth, 0);
        }

        // Create video elements
        const videoElements = [];
        for (let i = 0; i < 4; i++) {
            if (!allVideoBlobs.current[i]) continue;
            const video = document.createElement('video');
            video.src = URL.createObjectURL(allVideoBlobs.current[i]);
            video.muted = true;
            video.loop = true;
            video.playsInline = true;
            video.style.display = 'none';
            document.body.appendChild(video);
            videoElements.push({ video, slotIndex: i });
        }

        if (videoElements.length === 0) return;
        videoPreviewElementsRef.current = videoElements;

        await Promise.all(videoElements.map(item =>
            new Promise(resolve => {
                if (item.video.readyState >= 3) { resolve(); return; }
                item.video.addEventListener('canplay', resolve, { once: true });
                item.video.load();
            })
        ));

        await Promise.all(videoElements.map(item => item.video.play().catch(() => { })));

        const previewCanvas2 = videoPreviewCanvasRef.current;
        if (!previewCanvas2) return;
        previewCanvas2.width = canvasWidth * 2;
        previewCanvas2.height = canvasHeight;
        const ctx2 = previewCanvas2.getContext('2d');

        const offscreen = document.createElement('canvas');
        offscreen.width = canvasWidth;
        offscreen.height = canvasHeight;
        const offCtx = offscreen.getContext('2d', { alpha: false });

        let lastTime = 0;
        const fpsInterval = 1000 / 30;

        const animate = (time) => {
            videoPreviewAnimRef.current = requestAnimationFrame(animate);
            const elapsed = time - lastTime;
            if (elapsed > fpsInterval) {
                lastTime = time - (elapsed % fpsInterval);
                drawVideosOnCanvas(offCtx, videoElements, canvasWidth, canvasHeight, frameImg, 0, photos);
                ctx2.drawImage(offscreen, 0, 0);
                ctx2.drawImage(offscreen, canvasWidth, 0);
            }
        };
        videoPreviewAnimRef.current = requestAnimationFrame(animate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [drawVideosOnCanvas, photos]);

    const stopVideoPreview = () => {
        if (videoPreviewAnimRef.current) {
            cancelAnimationFrame(videoPreviewAnimRef.current);
            videoPreviewAnimRef.current = null;
        }
        videoPreviewElementsRef.current.forEach(item => {
            item.video.pause();
            URL.revokeObjectURL(item.video.src);
            if (document.body.contains(item.video)) document.body.removeChild(item.video);
        });
        videoPreviewElementsRef.current = [];
    };

    // ============================================================
    // EXPORT & SAVE
    // ============================================================
    const createExportCanvas = useCallback(() => {
        if (!frameImgRef.current) return null;
        const fw = frameImgRef.current.width;
        const fh = frameImgRef.current.height;
        const expCanvas = document.createElement('canvas');
        expCanvas.width = fw;
        expCanvas.height = fh;
        const ctx = expCanvas.getContext('2d');
        ctx.clearRect(0, 0, fw, fh);
        renderAllLayers(ctx, fw, fh, { includeGuide: includeCuttingGuideInExport });
        return expCanvas;
    }, [renderAllLayers, includeCuttingGuideInExport]);

    const createDuplicatedPhotoUrl = useCallback(() => {
        const expCanvas = createExportCanvas();
        if (!expCanvas) return null;
        const dupCanvas = document.createElement('canvas');
        dupCanvas.width = expCanvas.width * 2;
        dupCanvas.height = expCanvas.height;
        const ctx = dupCanvas.getContext('2d');
        ctx.drawImage(expCanvas, 0, 0);
        ctx.drawImage(expCanvas, expCanvas.width, 0);
        return dupCanvas.toDataURL('image/png');
    }, [createExportCanvas]);

    const saveFileToResultsFolder = async (fileName, blob) => {
        try {
            const response = await fetch('http://localhost:5000/api/save-blob?filename=' + encodeURIComponent(fileName), {
                method: 'POST',
                body: blob,
                headers: { 'Content-Type': 'application/octet-stream' }
            });
            if (response.ok) {
                const data = await response.json();
                console.log('✅ File saved:', data.message);
                return true;
            }
            console.error('❌ Save failed, status:', response.status);
        } catch (err) {
            console.error('❌ Error saving to backend:', err);
        }

        // Fallback: browser download
        console.log('📥 Falling back to browser download...');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return false;
    };

    const createCombinedVideoFrame = useCallback(async () => {
        return new Promise(async (resolve) => {
            try {
                if (!frameImgRef.current || !selectedFrame) {
                    resolve(null);
                    return;
                }

                const frameImg = frameImgRef.current;
                const videoDuration = 5;
                const canvasWidth = frameImg.width;
                const canvasHeight = frameImg.height;
                const combinedWidth = canvasWidth * 2;

                const recordCanvas = document.createElement('canvas');
                recordCanvas.width = combinedWidth;
                recordCanvas.height = canvasHeight;
                const ctx = recordCanvas.getContext('2d');

                setVideoProgress({ stage: 'Preparing', percent: 25 });

                const videoElements = [];
                for (let i = 0; i < 4; i++) {
                    if (!allVideoBlobs.current[i]) continue;
                    const video = document.createElement('video');
                    video.src = URL.createObjectURL(allVideoBlobs.current[i]);
                    video.muted = true;
                    video.loop = true;
                    video.playsInline = true;
                    video.style.display = 'none';
                    document.body.appendChild(video);
                    videoElements.push({ video, slotIndex: i });
                }

                if (videoElements.length === 0) { resolve(null); return; }

                await Promise.all(videoElements.map(item =>
                    new Promise(r => {
                        if (item.video.readyState >= 3) { r(); return; }
                        item.video.addEventListener('canplay', r, { once: true });
                        item.video.load();
                    })
                ));

                setVideoProgress({ stage: 'Rendering', percent: 35 });

                const stream = recordCanvas.captureStream(30);
                const mimeType = MediaRecorder.isTypeSupported('video/mp4')
                    ? 'video/mp4'
                    : MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
                        ? 'video/webm;codecs=vp9'
                        : 'video/webm';
                const mediaRecorder = new MediaRecorder(stream, { mimeType });
                const chunks = [];

                mediaRecorder.ondataavailable = (e) => {
                    if (e.data.size > 0) chunks.push(e.data);
                };

                mediaRecorder.onstop = () => {
                    setVideoProgress({ stage: 'Encoding', percent: 88 });
                    const blob = new Blob(chunks, { type: mimeType });
                    videoElements.forEach(item => {
                        item.video.pause();
                        URL.revokeObjectURL(item.video.src);
                        if (document.body.contains(item.video)) document.body.removeChild(item.video);
                    });
                    resolve(blob);
                };

                await Promise.all(videoElements.map(item => item.video.play().catch(() => { })));

                const offscreen = document.createElement('canvas');
                offscreen.width = canvasWidth;
                offscreen.height = canvasHeight;
                const offCtx = offscreen.getContext('2d', { alpha: false });

                // Draw first frame immediately
                drawVideosOnCanvas(offCtx, videoElements, canvasWidth, canvasHeight, frameImg, 0, photos);
                ctx.drawImage(offscreen, 0, 0);
                ctx.drawImage(offscreen, canvasWidth, 0);

                mediaRecorder.start();

                let recordingActive = true;
                let lastTime = 0;
                const fpsInterval = 1000 / 30;

                // Progress updates during recording
                const startTime = Date.now();
                const progressInterval = setInterval(() => {
                    const elapsed = (Date.now() - startTime) / 1000;
                    const pct = 35 + (elapsed / videoDuration) * 45;
                    setVideoProgress({ stage: 'Rendering', percent: Math.min(Math.round(pct), 80) });
                }, 250);

                const recordAnimate = (time) => {
                    if (!recordingActive) return;
                    requestAnimationFrame(recordAnimate);
                    const elapsed = time - lastTime;
                    if (elapsed > fpsInterval) {
                        lastTime = time - (elapsed % fpsInterval);
                        drawVideosOnCanvas(offCtx, videoElements, canvasWidth, canvasHeight, frameImg, 0, photos);
                        ctx.drawImage(offscreen, 0, 0);
                        ctx.drawImage(offscreen, canvasWidth, 0);
                    }
                };
                requestAnimationFrame(recordAnimate);

                setTimeout(() => {
                    clearInterval(progressInterval);
                    setVideoProgress({ stage: 'Encoding', percent: 82 });
                    recordingActive = false;
                    videoElements.forEach(item => item.video.pause());
                    mediaRecorder.stop();
                }, videoDuration * 1000);

            } catch (err) {
                console.error('❌ Error creating combined video frame:', err);
                resolve(null);
            }
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedFrame, photos, drawVideosOnCanvas]);

    const handleFinalSave = useCallback(async () => {
        if (isSaving || generatedResults) return;
        setIsSaving(true);
        setVideoProgress({ stage: 'Preparing', percent: 5 });

        const baseName = sanitizeFilename(userName, userPhone);
        let photoBlob = null;
        let dupPhotoBlob = null;
        let videoBlob = null;

        // 1. Individual photo (single strip)
        if (outputPNG) {
            setVideoProgress({ stage: 'Preparing', percent: 10 });
            const expCanvas = createExportCanvas();
            if (expCanvas) {
                const url = expCanvas.toDataURL('image/png');
                photoBlob = dataUrlToBlob(url);
                await saveFileToResultsFolder(`${baseName}.png`, photoBlob);
            }

            // 2. Duplicate strip
            setVideoProgress({ stage: 'Preparing', percent: 15 });
            const dupUrl = createDuplicatedPhotoUrl();
            if (dupUrl) {
                dupPhotoBlob = dataUrlToBlob(dupUrl);
                await saveFileToResultsFolder(`${baseName}-strip.png`, dupPhotoBlob);
            }
        }

        // 3. Video
        if (outputMP4) {
            videoBlob = await createCombinedVideoFrame();
            if (videoBlob) {
                setVideoProgress({ stage: 'Finalizing', percent: 92 });
                const ext = videoBlob.type.includes('mp4') ? 'mp4' : 'webm';
                await saveFileToResultsFolder(`${baseName}.${ext}`, videoBlob);
            }
        }

        setVideoProgress({ stage: 'Done', percent: 100 });

        // Store results for download UI
        setGeneratedResults({
            name: userName,
            phone: userPhone,
            baseName,
            photoBlob,
            dupPhotoBlob,
            videoBlob,
            photoUrl: photoBlob ? URL.createObjectURL(photoBlob) : null,
            dupPhotoUrl: dupPhotoBlob ? URL.createObjectURL(dupPhotoBlob) : null,
            videoUrl: videoBlob ? URL.createObjectURL(videoBlob) : null,
        });

        setIsSaving(false);
        setShowSuccessPopup(true);

        setTimeout(() => {
            setVideoProgress(null);
            setShowSuccessPopup(false);
        }, 1500);
    }, [isSaving, generatedResults, userName, userPhone, outputPNG, outputMP4, createExportCanvas, createDuplicatedPhotoUrl, createCombinedVideoFrame]);

    // Auto-save on timer expiry
    useEffect(() => {
        if (sessionStarted && sessionTimeLeft === 0 && !isSaving && !showSuccessPopup && !generatedResults) {
            handleFinalSave();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionTimeLeft, sessionStarted, isSaving, showSuccessPopup, generatedResults]);

    // Auto video preview
    useEffect(() => {
        if (allPhotosTaken && Object.keys(allVideoBlobs.current).length > 0) {
            startVideoPreview();
        } else {
            stopVideoPreview();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allPhotosTaken]);

    // ============================================================
    // DOWNLOAD & NEW SESSION
    // ============================================================
    const handleDownloadFile = (blob, filename) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    const handleNewSession = () => {
        if (generatedResults) {
            if (generatedResults.photoUrl) URL.revokeObjectURL(generatedResults.photoUrl);
            if (generatedResults.dupPhotoUrl) URL.revokeObjectURL(generatedResults.dupPhotoUrl);
            if (generatedResults.videoUrl) URL.revokeObjectURL(generatedResults.videoUrl);
        }
        stopVideoPreview();
        allVideoBlobs.current = {};
        setSessionStarted(false);
        setCanTakePhoto(false);
        setSelectedFrame(null);
        setMode("photo");
        setPhotos([]);
        setPhotoCount(0);
        setSelectedPhotoIndex(null);
        setRetakeSlotIndex(null);
        setCountdown(null);
        setSessionTimeLeft(180);
        setUserName("");
        setUserPhone("");
        setAllPhotosTaken(false);
        setShowRetakeCamera(false);
        setShowSuccessPopup(false);
        setGeneratedResults(null);
        setVideoProgress(null);
    };

    // ============================================================
    // DERIVED
    // ============================================================
    const showRetakeButton = selectedPhotoIndex !== null && photos[selectedPhotoIndex];
    const allFrameOptions = [...DEFAULT_FRAMES, ...customFrames];

    // ============================================================
    // RENDER
    // ============================================================
    return (
        <div style={centerCol}>

            {/* -------- TOP BAR -------- */}
            <div style={{...topBar, width: isMobile ? '95%' : 900}}>
                {selectedFrame && !generatedResults && (
                    <button
                        style={{
                            ...buttonStyle,
                            position: "absolute", left: 0, top: 10,
                            height: 44, padding: "0 18px", lineHeight: "44px",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 18,
                        }}
                        onClick={handleBack}
                    >← Back</button>
                )}

                {sessionStarted && !generatedResults && (
                    <div style={{
                        position: "absolute", right: 0, top: 10,
                        padding: "12px 22px", borderRadius: 999,
                        background: "#fff0f4", border: "2px solid #ff7aa2",
                        color: "#8c5b4a", fontWeight: "bold", fontSize: 32,
                        minWidth: 110, textAlign: "center",
                        boxShadow: "0 8px 18px rgba(255, 122, 162, 0.2)",
                    }}>
                        {formatTime(sessionTimeLeft)}
                    </div>
                )}

                <h1 style={titleBar}>
                    {generatedResults
                        ? "✨ Hasil Generate ✨"
                        : !selectedFrame
                            ? "₊✩‧₊˚ Welcome ౨ৎ ˚₊✩‧₊"
                            : mode === "photo"
                                ? "⋆｡‧˚ʚ Smile :)ɞ˚‧｡⋆"
                                : ". ݁₊ ⊹ . ݁Let's decorate . ⊹ ₊ ݁."}
                </h1>
            </div>

            {/* -------- RESULTS VIEW -------- */}
            {generatedResults && !isSaving && !showSuccessPopup && (
                <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    gap: 20, padding: 30, maxWidth: 600, width: '90%',
                }}>
                    <div style={{
                        background: '#fff9fb', borderRadius: 20, padding: '30px 40px',
                        boxShadow: '0 8px 30px rgba(255,122,162,0.15)', textAlign: 'center',
                        width: '100%', border: '2px solid #ffe0ea',
                    }}>
                        <div style={{ fontSize: 28, fontWeight: 'bold', color: '#8c5b4a', marginBottom: 4 }}>
                            {generatedResults.name}
                        </div>
                        <div style={{ fontSize: 20, color: '#b08a80', marginBottom: 20 }}>
                            {generatedResults.phone}
                        </div>

                        {generatedResults.photoUrl && (
                            <div style={{ marginBottom: 20 }}>
                                <img
                                    src={generatedResults.photoUrl}
                                    alt="Preview"
                                    style={{ maxWidth: 280, borderRadius: 14, boxShadow: '0 6px 20px rgba(0,0,0,0.12)' }}
                                />
                            </div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
                            {generatedResults.photoBlob && (
                                <button
                                    style={{ ...buttonStyle, fontSize: 18, padding: '12px 28px', width: '100%', maxWidth: 320 }}
                                    onClick={() => handleDownloadFile(generatedResults.photoBlob, `${generatedResults.baseName}.png`)}
                                >📥 Download PNG</button>
                            )}
                            {generatedResults.dupPhotoBlob && (
                                <button
                                    style={{ ...buttonStyle, fontSize: 18, padding: '12px 28px', width: '100%', maxWidth: 320 }}
                                    onClick={() => handleDownloadFile(generatedResults.dupPhotoBlob, `${generatedResults.baseName}-strip.png`)}
                                >📥 Download Strip PNG</button>
                            )}
                            {generatedResults.videoBlob && (
                                <button
                                    style={{ ...buttonStyle, fontSize: 18, padding: '12px 28px', width: '100%', maxWidth: 320 }}
                                    onClick={() => {
                                        const ext = generatedResults.videoBlob.type.includes('mp4') ? 'mp4' : 'webm';
                                        handleDownloadFile(generatedResults.videoBlob, `${generatedResults.baseName}.${ext}`);
                                    }}
                                >📥 Download Video</button>
                            )}
                        </div>
                    </div>

                    <button
                        style={{ ...buttonStyle, fontSize: 24, padding: '14px 36px', background: '#fff0f4' }}
                        onClick={handleNewSession}
                    >🔄 Sesi Baru</button>
                </div>
            )}

            {/* -------- MAIN CONTENT (not showing results) -------- */}
            {!generatedResults && (
                <div style={{
                    ...mainContent,
                    width: isMobile ? '95%' : 'auto',
                    height: isMobile ? 'auto' : 'auto',
                    minHeight: 700,
                    flexDirection: isMobile ? 'column' : 'row',
                }}>

                    {/* ==== NO FRAME SELECTED ==== */}
                    {!selectedFrame ? (
                        !sessionStarted ? (
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24, width: '100%' }}>
                                <button style={{ ...buttonStyle, fontSize: 28, padding: "16px 36px" }} onClick={handleStartSession}>
                                    Start
                                </button>
                            </div>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24, width: '100%' }}>
                                <div style={{ fontSize: 36, color: "#8c5b4a", fontWeight: "bold", marginTop: 10 }}>
                                    Pilih frame kamu
                                </div>
                                <div style={{ display: "flex", gap: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
                                    {allFrameOptions.map((src) => {
                                        const isSelected = selectedFrame === src;
                                        return (
                                            <img
                                                key={src}
                                                src={src}
                                                alt="frame"
                                                onClick={() => { setSelectedFrame(src); setCanTakePhoto(true); }}
                                                onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.08)"; e.currentTarget.style.boxShadow = "0 12px 30px rgba(255,122,162,0.45)"; }}
                                                onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = frameThumb.boxShadow; }}
                                                style={{
                                                    ...frameThumb,
                                                    width: isMobile ? 140 : 220,
                                                    transform: isSelected ? "scale(1.08)" : "scale(1)",
                                                    transition: "transform 0.25s ease, box-shadow 0.25s ease",
                                                    boxShadow: isSelected ? "0 12px 30px rgba(255,122,162,0.45)" : frameThumb.boxShadow,
                                                }}
                                            />
                                        );
                                    })}
                                    {/* Upload Custom Frame */}
                                    <label style={{
                                        ...frameThumb,
                                        width: isMobile ? 140 : 220,
                                        height: isMobile ? 280 : 440,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        border: '3px dashed #ffb3c6', background: '#fff8fa',
                                        fontSize: 18, color: '#b08a80', cursor: 'pointer',
                                        flexDirection: 'column', gap: 8,
                                    }}>
                                        <span style={{ fontSize: 36 }}>+</span>
                                        <span>Upload Frame</span>
                                        <input type="file" accept="image/*" onChange={handleCustomFrameUpload} hidden />
                                    </label>
                                </div>
                            </div>
                        )
                    ) : (
                        /* ==== FRAME SELECTED: PHOTO/DECORATE MODE ==== */
                        <div style={{
                            display: 'flex', gap: isMobile ? 20 : 30, justifyContent: "center",
                            alignItems: isMobile ? 'center' : "flex-start",
                            flexDirection: isMobile ? 'column' : 'row',
                            width: '100%',
                        }}>

                            {/* ---- LEFT PANEL ---- */}
                            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", maxWidth: isMobile ? '100%' : 520 }}>

                                {/* Webcam */}
                                {(mode === "photo" || showRetakeCamera) && (
                                    <>
                                        <div style={{ width: "100%", display: "flex", justifyContent: "center" }}>
                                            <div style={{ position: "relative", width: isMobile ? '100%' : 500, maxWidth: "100%" }}>
                                                <Webcam
                                                    audio={false}
                                                    ref={webcamRef}
                                                    screenshotFormat="image/png"
                                                    videoConstraints={videoConstraints}
                                                    mirrored={true}
                                                    style={{ width: "100%", height: "auto", borderRadius: 18, objectFit: "cover" }}
                                                />
                                                {countdown != null && (
                                                    <div style={{
                                                        position: "absolute", inset: 0,
                                                        display: "flex", alignItems: "center", justifyContent: "center",
                                                        fontSize: 96, fontWeight: "bold", color: "white",
                                                        textShadow: "0 4px 20px rgba(0,0,0,0.6)",
                                                        background: "rgba(0,0,0,0.25)", borderRadius: 18, pointerEvents: "none",
                                                    }}>
                                                        {countdown}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
                                            {canTakePhoto && sessionStarted && (
                                                <button style={{ ...buttonStyle, fontSize: 20, padding: '10px 24px' }} onClick={capturePhoto}>
                                                    {showRetakeCamera ? "📷 Ambil Foto" : "📷 Take Photo"}
                                                </button>
                                            )}
                                            {photoCount > 0 && mode === "photo" && (
                                                <button style={{ ...buttonStyle, fontSize: 22, padding: "4px 14px" }} onClick={redoLastPhoto}>⟳</button>
                                            )}
                                            {showRetakeButton && mode === "photo" && (
                                                <button style={{ ...buttonStyle, background: "#fff0f4" }} onClick={retakeSelectedPhoto}>
                                                    Retake selected
                                                </button>
                                            )}
                                        </div>
                                    </>
                                )}

                                {/* Decorate mode hints */}
                                {mode === "decorate" && !showRetakeCamera && (
                                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, paddingTop: 20 }}>
                                        {showRetakeButton ? (
                                            <div style={{ textAlign: "center" }}>
                                                <div style={{ fontSize: 16, color: "#8c5b4a", marginBottom: 10 }}>
                                                    Foto dipilih — mau diganti?
                                                </div>
                                                <button style={{ ...buttonStyle, background: "#fff0f4", fontSize: 18 }} onClick={retakeSelectedPhoto}>
                                                    📷 Retake foto ini
                                                </button>
                                            </div>
                                        ) : (
                                            <div style={{ fontSize: 15, color: "#b08a80", textAlign: "center", maxWidth: 300 }}>
                                                💡 Klik foto di strip untuk memilih dan retake
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* ---- SETTINGS PANEL ---- */}
                                <div style={{
                                    width: '100%', marginTop: 20,
                                    background: '#fff9fb', borderRadius: 16, border: '1px solid #ffe0ea',
                                    overflow: 'hidden',
                                }}>
                                    <button
                                        onClick={() => setShowSettings(!showSettings)}
                                        style={{
                                            width: '100%', padding: '12px 20px', border: 'none',
                                            background: 'transparent', cursor: 'pointer',
                                            fontSize: 18, fontFamily: 'CantikaCute', color: '#8c5b4a',
                                            fontWeight: 'bold', textAlign: 'left',
                                        }}
                                    >
                                        ⚙️ {showSettings ? 'Sembunyikan Settings' : 'Tampilkan Settings'}
                                    </button>

                                    {showSettings && (
                                        <div style={{ padding: '0 20px 20px' }}>

                                            {/* DESIGN ASSETS */}
                                            <div style={sectionLabel}>DESIGN ASSETS</div>

                                            {/* Logo */}
                                            <div style={assetRow}>
                                                <span style={{ fontSize: 16, fontWeight: 'bold' }}>Logo</span>
                                                {customLogo ? (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                        <img src={customLogo} alt="logo" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'contain' }} />
                                                        <label style={smallUploadBtn}>
                                                            Replace
                                                            <input type="file" accept="image/*" onChange={handleLogoUpload} hidden />
                                                        </label>
                                                        <button onClick={handleRemoveLogo} style={smallRemoveBtn}>✕</button>
                                                    </div>
                                                ) : (
                                                    <label style={smallUploadBtn}>
                                                        Upload Logo
                                                        <input type="file" accept="image/*" onChange={handleLogoUpload} hidden />
                                                    </label>
                                                )}
                                            </div>

                                            {/* Logo Size Slider */}
                                            {customLogo && (
                                                <div style={{ marginBottom: 10, paddingLeft: 8 }}>
                                                    <label style={{ fontSize: 13, color: '#b08a80' }}>
                                                        Size: {logoSettings.width}px
                                                        <input type="range" min="30" max="300" value={logoSettings.width}
                                                            onChange={e => {
                                                                const v = parseInt(e.target.value);
                                                                setLogoSettings(s => ({ ...s, width: v, height: v }));
                                                            }}
                                                            style={{ width: '100%' }}
                                                        />
                                                    </label>
                                                    <label style={{ fontSize: 13, color: '#b08a80' }}>
                                                        Opacity: {Math.round(logoSettings.opacity * 100)}%
                                                        <input type="range" min="10" max="100" value={Math.round(logoSettings.opacity * 100)}
                                                            onChange={e => setLogoSettings(s => ({ ...s, opacity: parseInt(e.target.value) / 100 }))}
                                                            style={{ width: '100%' }}
                                                        />
                                                    </label>
                                                </div>
                                            )}

                                            {/* Background */}
                                            <div style={assetRow}>
                                                <span style={{ fontSize: 16, fontWeight: 'bold' }}>Background</span>
                                                {customBackground ? (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                        <img src={customBackground} alt="bg" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover' }} />
                                                        <label style={smallUploadBtn}>
                                                            Replace
                                                            <input type="file" accept="image/*" onChange={handleBackgroundUpload} hidden />
                                                        </label>
                                                        <button onClick={handleRemoveBackground} style={smallRemoveBtn}>✕</button>
                                                    </div>
                                                ) : (
                                                    <label style={smallUploadBtn}>
                                                        Upload Background
                                                        <input type="file" accept="image/*" onChange={handleBackgroundUpload} hidden />
                                                    </label>
                                                )}
                                            </div>

                                            {/* OUTPUT OPTIONS */}
                                            <div style={{ ...sectionLabel, marginTop: 16 }}>OUTPUT</div>

                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                <label style={checkboxLabel}>
                                                    <input type="checkbox" checked={outputPNG} onChange={e => setOutputPNG(e.target.checked)} />
                                                    Generate PNG
                                                </label>
                                                <label style={checkboxLabel}>
                                                    <input type="checkbox" checked={outputMP4} onChange={e => setOutputMP4(e.target.checked)} />
                                                    Generate MP4
                                                </label>
                                                <label style={checkboxLabel}>
                                                    <input type="checkbox" checked={showCuttingGuide} onChange={e => setShowCuttingGuide(e.target.checked)} />
                                                    Show Cutting Guide
                                                </label>
                                                {showCuttingGuide && (
                                                    <label style={{ ...checkboxLabel, paddingLeft: 24 }}>
                                                        <input type="checkbox" checked={includeCuttingGuideInExport} onChange={e => setIncludeCuttingGuideInExport(e.target.checked)} />
                                                        Include in exported file
                                                    </label>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* ---- RIGHT PANEL: Canvas + Video Preview ---- */}
                            <div style={{ display: "flex", flexDirection: isMobile ? 'column' : 'row', gap: 16, alignItems: isMobile ? 'center' : 'flex-start' }}>
                                {/* Photo strip canvas (Duplicated view) */}
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                                    <div style={{ fontSize: 18, color: "#8c5b4a", marginBottom: 8, fontWeight: "bold", letterSpacing: 1 }}>📸 Foto</div>
                                    <div style={{
                                        display: "flex",
                                        boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
                                        borderRadius: 14,
                                        overflow: "hidden",
                                        outline: showRetakeButton ? "3px solid #ff7aa2" : "none",
                                    }}>
                                        <canvas
                                            ref={canvasRef}
                                            style={{
                                                width: isMobile ? 180 : 290, height: isMobile ? 470 : 760,
                                                display: "block",
                                                cursor: mode === "decorate" ? "pointer" : "default",
                                            }}
                                            onMouseDown={handleMouseDown}
                                            onMouseMove={handleMouseMove}
                                            onMouseUp={handleMouseUp}
                                        />
                                        {mode === "decorate" && (
                                            <canvas
                                                ref={dupCanvasRef}
                                                style={{
                                                    width: isMobile ? 180 : 290, height: isMobile ? 470 : 760,
                                                    display: "block",
                                                }}
                                            />
                                        )}
                                    </div>
                                </div>

                                {/* Video preview (dual strip) */}
                                {allPhotosTaken && (
                                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                                        <div style={{ fontSize: 18, color: "#8c5b4a", marginBottom: 8, fontWeight: "bold", letterSpacing: 1 }}>🎬 Video</div>
                                        <div style={{
                                            position: "relative",
                                            width: isMobile ? 360 : 580,
                                            height: isMobile ? 470 : 760,
                                            borderRadius: 14, overflow: "hidden",
                                            boxShadow: "0 10px 30px rgba(255,122,162,0.25)"
                                        }}>
                                            <canvas
                                                ref={videoPreviewCanvasRef}
                                                style={{
                                                    width: isMobile ? 360 : 580,
                                                    height: isMobile ? 470 : 760,
                                                    display: "block",
                                                }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Finish button */}
                                {mode === "decorate" && allPhotosTaken && (
                                    <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 4 }}>
                                        <button
                                            style={{
                                                ...buttonStyle, fontSize: 28, padding: "14px 30px",
                                                opacity: isSaving ? 0.7 : 1,
                                                cursor: isSaving ? "not-allowed" : "pointer"
                                            }}
                                            onClick={handleFinalSave}
                                            disabled={isSaving}
                                        >
                                            {isSaving ? "⏳ Saving..." : "✅ Finish"}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* -------- NAME + PHONE INPUT MODAL -------- */}
            {showNameInput && (
                <div style={{
                    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                    background: "rgba(0, 0, 0, 0.6)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    zIndex: 999,
                }}>
                    <div style={{
                        background: "white", padding: "40px",
                        borderRadius: 24, textAlign: "center",
                        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
                        minWidth: isMobile ? 300 : 440, maxWidth: '90%',
                    }}>
                        <h2 style={{ margin: "0 0 24px 0", color: "#8c5b4a", fontSize: 30 }}>
                            DATA PESERTA
                        </h2>

                        {/* Nama */}
                        <div style={{ textAlign: 'left', marginBottom: 6 }}>
                            <label style={{ fontSize: 18, fontWeight: 'bold', color: '#8c5b4a' }}>Nama</label>
                        </div>
                        <input
                            type="text"
                            placeholder="Masukkan nama..."
                            value={userName}
                            onChange={(e) => { setUserName(e.target.value); setNameError(""); }}
                            onKeyDown={(e) => { if (e.key === 'Enter') document.getElementById('phoneInput')?.focus(); }}
                            style={{
                                width: "100%", padding: "14px 18px", fontSize: 20,
                                border: nameError ? "2px solid #ff6b6b" : "2px solid #ff7aa2",
                                borderRadius: 12, boxSizing: "border-box", marginBottom: 6,
                                fontFamily: "CantikaCute",
                            }}
                            autoFocus
                        />
                        {nameError && (
                            <div style={{ color: "#ff6b6b", fontSize: 15, marginBottom: 12, fontWeight: "bold", textAlign: 'left' }}>
                                {nameError}
                            </div>
                        )}

                        {/* Nomor Telepon */}
                        <div style={{ textAlign: 'left', marginBottom: 6, marginTop: nameError ? 0 : 12 }}>
                            <label style={{ fontSize: 18, fontWeight: 'bold', color: '#8c5b4a' }}>Nomor Telepon</label>
                        </div>
                        <input
                            id="phoneInput"
                            type="tel"
                            placeholder="08xxxxxxxxxx"
                            value={userPhone}
                            onChange={(e) => { setUserPhone(e.target.value); setPhoneError(""); }}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleNameSubmit(); }}
                            style={{
                                width: "100%", padding: "14px 18px", fontSize: 20,
                                border: phoneError ? "2px solid #ff6b6b" : "2px solid #ff7aa2",
                                borderRadius: 12, boxSizing: "border-box", marginBottom: 6,
                                fontFamily: "CantikaCute",
                            }}
                        />
                        {phoneError && (
                            <div style={{ color: "#ff6b6b", fontSize: 15, marginBottom: 12, fontWeight: "bold", textAlign: 'left' }}>
                                {phoneError}
                            </div>
                        )}

                        <button
                            style={{
                                ...buttonStyle, fontSize: 22, padding: "14px 32px",
                                width: "100%", marginTop: 16,
                                background: '#fff0f4',
                            }}
                            onClick={handleNameSubmit}
                        >
                            Mulai ✨
                        </button>
                    </div>
                </div>
            )}

            {/* -------- PROGRESS & SUCCESS POPUP -------- */}
            {(isSaving || showSuccessPopup) && (
                <div style={{
                    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                    background: "rgba(0, 0, 0, 0.6)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    zIndex: 2000,
                }}>
                    <div style={{
                        background: "white", padding: "50px 60px",
                        borderRadius: 24, textAlign: "center",
                        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
                        minWidth: isMobile ? 280 : 400,
                    }}>
                        <div style={{ fontSize: 64, marginBottom: 20 }}>
                            {showSuccessPopup && !isSaving ? "✅" : "⏳"}
                        </div>

                        {videoProgress && isSaving ? (
                            <>
                                <h2 style={{ margin: '0 0 16px', color: "#8c5b4a", fontSize: 24, fontFamily: "CantikaCute" }}>
                                    {videoProgress.stage === 'Preparing' && 'Mempersiapkan...'}
                                    {videoProgress.stage === 'Rendering' && 'Merender video...'}
                                    {videoProgress.stage === 'Encoding' && 'Encoding...'}
                                    {videoProgress.stage === 'Finalizing' && 'Finalisasi...'}
                                    {videoProgress.stage === 'Done' && 'Selesai!'}
                                </h2>
                                {/* Progress bar */}
                                <div style={{
                                    width: '100%', height: 12, background: '#ffe0ea',
                                    borderRadius: 6, overflow: 'hidden', marginBottom: 8,
                                }}>
                                    <div style={{
                                        width: `${videoProgress.percent}%`,
                                        height: '100%',
                                        background: 'linear-gradient(90deg, #ff7aa2, #ff5580)',
                                        borderRadius: 6,
                                        transition: 'width 0.3s ease',
                                    }} />
                                </div>
                                <div style={{ fontSize: 16, color: '#b08a80' }}>
                                    {videoProgress.percent}%
                                </div>
                            </>
                        ) : (
                            <h2 style={{ margin: 0, color: "#8c5b4a", fontSize: 28, fontFamily: "CantikaCute" }}>
                                {showSuccessPopup ? "Berhasil! ✨" : "Mohon tunggu..."}
                            </h2>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ============================================================
// STYLES
// ============================================================
const centerCol = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 20,
    paddingBottom: 40,
};

const topBar = {
    width: 900,
    minHeight: 80,
    position: "relative",
    marginBottom: 16,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
};

const buttonStyle = {
    padding: "10px 20px",
    fontSize: 20,
    cursor: "pointer",
    fontFamily: "CantikaCute",
    color: "#8c5b4a",
    border: "2px solid #8c5b4a",
    borderRadius: 10,
    background: "white",
    transition: 'all 0.2s ease',
};

const frameThumb = {
    cursor: "pointer",
    borderRadius: 14,
    boxShadow: "0 8px 8px rgba(0,0,0,0.15)",
};

const titleBar = {
    margin: 0,
    lineHeight: "80px",
    textAlign: "center",
    width: "100%",
    fontSize: 36,
};

const mainContent = {
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
};

const sectionLabel = {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#b08a80',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 10,
    borderBottom: '1px solid #ffe0ea',
    paddingBottom: 6,
};

const assetRow = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    color: '#8c5b4a',
};

const smallUploadBtn = {
    padding: '6px 14px',
    fontSize: 13,
    cursor: 'pointer',
    fontFamily: 'CantikaCute',
    color: '#8c5b4a',
    border: '1.5px solid #ffb3c6',
    borderRadius: 8,
    background: '#fff0f4',
};

const smallRemoveBtn = {
    padding: '4px 10px',
    fontSize: 14,
    cursor: 'pointer',
    border: '1.5px solid #ffb3c6',
    borderRadius: 8,
    background: '#fff0f4',
    color: '#ff6b6b',
    fontWeight: 'bold',
};

const checkboxLabel = {
    fontSize: 16,
    color: '#8c5b4a',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
};
