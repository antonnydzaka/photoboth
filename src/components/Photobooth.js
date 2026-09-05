import React, { useRef, useState, useEffect } from "react";
import Webcam from "react-webcam";

// ─── TEMPLATE CONFIGURATION ──────────────────────────────────────────────────
// Ganti asset di sini tanpa mengubah kode lain
const TEMPLATE = {
    frames: [
        "/assets/frames/heart-frame.png",
        "/assets/frames/heart-frame-2.png",
        "/assets/frames/heart-frame-3.png",
        "/assets/frames/heart-frame-4.png",
    ],
    name: {
        fontSize: 90,         // ukuran font nama di canvas output
        color: "#8c5b4a",
        fontFamily: "CantikaCute, Arial",
        fontWeight: "bold",
        align: "center",
        offsetFromBottom: 110, // jarak dari bawah canvas
    },
    phone: {
        fontSize: 62,         // ukuran font telepon di canvas output
        color: "#8c5b4a",
        fontFamily: "CantikaCute, Arial",
        fontWeight: "normal",
        align: "center",
        offsetFromBottom: 44, // jarak dari bawah canvas
    },
};

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const OVERLAP = 12;
const videoConstraints = {
    width: 953 + OVERLAP * 2,
    height: 599 + OVERLAP * 2,
    facingMode: "user",
};
const SLOT_WIDTH = 953 + OVERLAP * 2;
const SLOT_HEIGHT = 599 + OVERLAP * 2;

// Foto slot positions (x, y) di dalam frame
const SLOTS = [
    { x: 123 - OVERLAP, y: 78 - OVERLAP },
    { x: 123 - OVERLAP, y: 680 - OVERLAP },
    { x: 123 - OVERLAP, y: 1286 - OVERLAP },
    { x: 123 - OVERLAP, y: 1885 - OVERLAP },
];

// ─── HELPER: Sanitasi nama untuk filename ────────────────────────────────────
const sanitizeFilename = (str) =>
    str.trim().replace(/\s+/g, "").replace(/[^a-zA-Z0-9\u00C0-\u024F\u0600-\u06FF]/g, "");

// ─── HELPER: Normalisasi nomor telepon ───────────────────────────────────────
const normalizePhone = (phone) =>
    phone.trim().replace(/[\s\-().]/g, "");

// ─── HELPER: Validasi nomor telepon ──────────────────────────────────────────
const isValidPhone = (phone) => {
    const normalized = normalizePhone(phone);
    return /^(\+62|62|0)[0-9]{7,13}$/.test(normalized);
};

// ─── HELPER: Gambar teks nama & telepon ke canvas context ────────────────────
const drawNamePhone = (ctx, userName, userPhone, canvasWidth, canvasHeight, xOffset = 0) => {
    if (userName) {
        ctx.fillStyle = TEMPLATE.name.color;
        ctx.font = `${TEMPLATE.name.fontWeight} ${TEMPLATE.name.fontSize}px ${TEMPLATE.name.fontFamily}`;
        ctx.textAlign = TEMPLATE.name.align;
        ctx.fillText(
            userName.trim(),
            xOffset + canvasWidth / 2,
            canvasHeight - TEMPLATE.name.offsetFromBottom
        );
    }
    if (userPhone) {
        ctx.fillStyle = TEMPLATE.phone.color;
        ctx.font = `${TEMPLATE.phone.fontWeight} ${TEMPLATE.phone.fontSize}px ${TEMPLATE.phone.fontFamily}`;
        ctx.textAlign = TEMPLATE.phone.align;
        ctx.fillText(
            normalizePhone(userPhone),
            xOffset + canvasWidth / 2,
            canvasHeight - TEMPLATE.phone.offsetFromBottom
        );
    }
};

// ─── HELPER: Gambar cutting guide (hanya untuk file export combined) ─────────
const drawCuttingGuide = (ctx, totalWidth, totalHeight) => {
    const midX = totalWidth / 2;
    ctx.save();
    ctx.setLineDash([18, 10]);
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(midX, 0);
    ctx.lineTo(midX, totalHeight);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
};

// ─── COMPONENT ───────────────────────────────────────────────────────────────
export default function PhotoBooth() {
    const webcamRef = useRef(null);
    const canvasRef = useRef(null);
    const dupCanvasRef = useRef(null);
    const videoPreviewCanvasRef = useRef(null);
    const frameImgRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const recordedChunksRef = useRef([]);
    const liveVideoBlobRef = useRef(null);
    const allVideoBlobs = useRef({});
    const videoPreviewAnimRef = useRef(null);
    const videoPreviewElementsRef = useRef([]);

    // ── State ──
    const [selectedFrame, setSelectedFrame] = useState(null);
    const [mode, setMode] = useState("photo");
    const [sessionStarted, setSessionStarted] = useState(false);
    const [sessionTimeLeft, setSessionTimeLeft] = useState(180);
    const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(null);
    const [retakeSlotIndex, setRetakeSlotIndex] = useState(null);
    const [userName, setUserName] = useState("");
    const [userPhone, setUserPhone] = useState("");
    const [showNameInput, setShowNameInput] = useState(false);
    const [nameError, setNameError] = useState("");
    const [phoneError, setPhoneError] = useState("");
    const [photos, setPhotos] = useState([]);
    const [photoCount, setPhotoCount] = useState(0);
    const [canTakePhoto, setCanTakePhoto] = useState(true);
    const [draggingPhoto, setDraggingPhoto] = useState(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [countdown, setCountdown] = useState(null);
    const [allPhotosTaken, setAllPhotosTaken] = useState(false);
    const [showRetakeCamera, setShowRetakeCamera] = useState(false);
    const [showSuccessPopup, setShowSuccessPopup] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [saveProgress, setSaveProgress] = useState(0); // 0-100

    // ── Sync photo count ──
    useEffect(() => {
        setPhotoCount(photos.length);
    }, [photos]);

    // ── Load frame image ──
    useEffect(() => {
        if (!selectedFrame) return;
        const img = new Image();
        img.src = selectedFrame;
        img.onload = () => {
            frameImgRef.current = img;
            drawCanvas();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedFrame]);

    // ── Re-draw canvas when photos / username / phone change ──
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(drawCanvas, [photos, photoCount, userName, userPhone]);

    // ─── Draw main photo canvas ──────────────────────────────────────────────
    function drawCanvas() {
        const canvas = canvasRef.current;
        if (!canvas || !frameImgRef.current) return;

        const ctx = canvas.getContext("2d");
        const frameWidth = frameImgRef.current.width;
        const frameHeight = frameImgRef.current.height;
        canvas.width = frameWidth;
        canvas.height = frameHeight;

        ctx.clearRect(0, 0, frameWidth, frameHeight);

        // Draw photos
        photos.forEach((p) => {
            const slot = SLOTS[p.slotIndex];
            const drawW = p.img.width * p.scale;
            const drawH = p.img.height * p.scale;
            ctx.save();
            ctx.beginPath();
            ctx.rect(slot.x, slot.y, SLOT_WIDTH, SLOT_HEIGHT);
            ctx.clip();
            ctx.drawImage(p.img, slot.x + p.offsetX, slot.y + p.offsetY, drawW, drawH);
            ctx.restore();
        });

        // Draw frame overlay
        ctx.drawImage(frameImgRef.current, 0, 0, frameWidth, frameHeight);

        // Sync to duplicate canvas
        const dupCanvas = dupCanvasRef.current;
        if (dupCanvas) {
            dupCanvas.width = frameWidth;
            dupCanvas.height = frameHeight;
            dupCanvasRef.current.getContext("2d").drawImage(canvas, 0, 0);
        }
    }

    // ─── Timer ───────────────────────────────────────────────────────────────
    const formatTime = (seconds) => {
        const min = Math.floor(seconds / 60);
        const sec = seconds % 60;
        return `${min}:${String(sec).padStart(2, "0")}`;
    };

    useEffect(() => {
        if (!sessionStarted) return;
        const timer = setInterval(() => {
            setSessionTimeLeft((prev) => {
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

    // ─── Auto-save when timer hits 0 ─────────────────────────────────────────
    useEffect(() => {
        if (sessionStarted && sessionTimeLeft === 0 && !isSaving && !showSuccessPopup) {
            handleFinalSave();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionTimeLeft, sessionStarted, isSaving, showSuccessPopup]);

    // ─── Video capture helpers ────────────────────────────────────────────────
    const startShortVideoCapture = () => {
        const videoElement = webcamRef.current?.video;
        if (!videoElement) return;
        const stream =
            videoElement.captureStream?.() ||
            videoElement.mozCaptureStream?.() ||
            null;
        if (!stream) return;

        const mimeType = MediaRecorder.isTypeSupported("video/mp4")
            ? "video/mp4"
            : "video/webm";
        const recorder = new MediaRecorder(stream, { mimeType });
        recordedChunksRef.current = [];
        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) recordedChunksRef.current.push(e.data);
        };
        recorder.onstop = () => {
            liveVideoBlobRef.current = new Blob(recordedChunksRef.current, {
                type: mimeType,
            });
            recordedChunksRef.current = [];
        };
        recorder.start();
        mediaRecorderRef.current = recorder;
    };

    const stopShortVideoCapture = (slotIndex = null) =>
        new Promise((resolve) => {
            if (
                mediaRecorderRef.current &&
                mediaRecorderRef.current.state !== "inactive"
            ) {
                const recorder = mediaRecorderRef.current;
                const handleStop = () => {
                    recorder.removeEventListener("stop", handleStop);
                    if (slotIndex !== null && liveVideoBlobRef.current) {
                        allVideoBlobs.current[slotIndex] = liveVideoBlobRef.current;
                    }
                    mediaRecorderRef.current = null;
                    resolve();
                };
                recorder.addEventListener("stop", handleStop);
                recorder.stop();
            } else {
                resolve();
            }
        });

    // ─── Session / frame control ──────────────────────────────────────────────
    const handleStartSession = () => {
        setShowNameInput(true);
        setNameError("");
        setPhoneError("");
        setUserName("");
        setUserPhone("");
    };

    const handleNameSubmit = () => {
        let valid = true;
        if (!userName.trim()) {
            setNameError("⚠️ Nama harus diisi!");
            valid = false;
        } else {
            setNameError("");
        }
        if (!userPhone.trim()) {
            setPhoneError("⚠️ Nomor telepon harus diisi!");
            valid = false;
        } else if (!isValidPhone(userPhone)) {
            setPhoneError("⚠️ Format nomor tidak valid (contoh: 08123456789 atau +62812...)");
            valid = false;
        } else {
            setPhoneError("");
        }
        if (!valid) return;

        setShowNameInput(false);
        setSessionStarted(true);
        setSessionTimeLeft(180);
        setCanTakePhoto(false);
        setSelectedPhotoIndex(null);
        setRetakeSlotIndex(null);
        setMode("photo");
    };

    const handleBack = () => {
        if (!selectedFrame) return;
        setSelectedFrame(null);
        setMode("photo");
        setCanTakePhoto(false);
        setSelectedPhotoIndex(null);
        setRetakeSlotIndex(null);
    };

    // ─── Photo logic ──────────────────────────────────────────────────────────
    const getNextAvailableSlot = () => {
        for (let i = 0; i < SLOTS.length; i++) {
            if (!photos.some((p) => p.slotIndex === i)) return i;
        }
        return null;
    };

    const addPhoto = (img, replaceSlotIndex = null) => {
        const targetSlot =
            replaceSlotIndex !== null ? replaceSlotIndex : getNextAvailableSlot();
        if (targetSlot === null) return;

        const scale = SLOT_WIDTH / img.width;
        const drawH = img.height * scale;
        const offsetY = drawH > SLOT_HEIGHT ? (SLOT_HEIGHT - drawH) / 2 : 0;

        setPhotos((prev) => {
            const filtered = prev.filter((p) => p.slotIndex !== targetSlot);
            const next = [
                ...filtered,
                { img, slotIndex: targetSlot, scale, offsetX: 0, offsetY },
            ];
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

    const takePhotoNow = (slotIndex) => {
        const src = webcamRef.current.getScreenshot();
        if (!src) return;
        const img = new Image();
        img.src = src;
        img.onload = () => addPhoto(img, slotIndex);
    };

    const capturePhoto = () => {
        if (!canTakePhoto || countdown !== null || !sessionStarted || sessionTimeLeft <= 0)
            return;

        setCanTakePhoto(false);
        setCountdown(5);
        const targetSlot =
            retakeSlotIndex !== null ? retakeSlotIndex : getNextAvailableSlot();
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
        setPhotos((prev) => prev.filter((p) => p !== lastPhoto));
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
        setPhotos((prev) => prev.filter((_, idx) => idx !== selectedPhotoIndex));
        setSelectedPhotoIndex(null);
        setRetakeSlotIndex(photoToReplace.slotIndex);
        setCanTakePhoto(true);
        setShowRetakeCamera(true);
    };

    // ─── Canvas drag ──────────────────────────────────────────────────────────
    const getCoords = (e) => {
        const r = canvasRef.current.getBoundingClientRect();
        return {
            x: (e.clientX - r.left) * (canvasRef.current.width / r.width),
            y: (e.clientY - r.top) * (canvasRef.current.height / r.height),
        };
    };

    const handleMouseDown = (e) => {
        const { x, y } = getCoords(e);
        if (mode === "photo" || mode === "decorate") {
            for (let i = photos.length - 1; i >= 0; i--) {
                const p = photos[i];
                const slot = SLOTS[p.slotIndex];
                const w = p.img.width * p.scale;
                const h = p.img.height * p.scale;
                if (
                    x >= slot.x + p.offsetX &&
                    x <= slot.x + p.offsetX + w &&
                    y >= slot.y + p.offsetY &&
                    y <= slot.y + p.offsetY + h
                ) {
                    if (mode === "photo") {
                        setDraggingPhoto(i);
                        setDragOffset({
                            x: x - slot.x - p.offsetX,
                            y: y - slot.y - p.offsetY,
                        });
                    }
                    setSelectedPhotoIndex(i);
                    return;
                }
            }
        }
        if (mode === "decorate") setSelectedPhotoIndex(null);
    };

    const handleMouseMove = (e) => {
        if (draggingPhoto === null || mode !== "photo") return;
        const { x, y } = getCoords(e);
        setPhotos((prev) => {
            const updated = [...prev];
            const p = updated[draggingPhoto];
            const slot = SLOTS[p.slotIndex];
            const w = p.img.width * p.scale;
            const h = p.img.height * p.scale;
            p.offsetX = Math.min(Math.max(x - slot.x - dragOffset.x, SLOT_WIDTH - w), 0);
            p.offsetY = Math.min(Math.max(y - slot.y - dragOffset.y, SLOT_HEIGHT - h), 0);
            return updated;
        });
    };

    const handleMouseUp = () => setDraggingPhoto(null);

    // ─── Video preview (dual strip) ───────────────────────────────────────────
    const drawVideosOnCanvas = (
        ctx,
        videoElements,
        canvasWidth,
        canvasHeight,
        frameImg,
        xOffset = 0,
        currentPhotos = []
    ) => {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(xOffset, 0, canvasWidth, canvasHeight);

        videoElements.forEach((item) => {
            const slot = SLOTS[item.slotIndex];
            const video = item.video;
            const fallbackPhoto = currentPhotos.find(
                (p) => p.slotIndex === item.slotIndex
            );
            if (slot) {
                ctx.save();
                ctx.beginPath();
                ctx.rect(xOffset + slot.x, slot.y, SLOT_WIDTH, SLOT_HEIGHT);
                ctx.clip();
                if (video.readyState >= 2) {
                    const vw = video.videoWidth || SLOT_WIDTH;
                    const vh = video.videoHeight || SLOT_HEIGHT;
                    const scale = SLOT_WIDTH / vw;
                    const drawH = vh * scale;
                    const offsetY = drawH > SLOT_HEIGHT ? (SLOT_HEIGHT - drawH) / 2 : 0;
                    ctx.drawImage(
                        video,
                        xOffset + slot.x,
                        slot.y + offsetY,
                        SLOT_WIDTH,
                        drawH
                    );
                } else if (fallbackPhoto) {
                    const drawW = fallbackPhoto.img.width * fallbackPhoto.scale;
                    const drawH = fallbackPhoto.img.height * fallbackPhoto.scale;
                    ctx.drawImage(
                        fallbackPhoto.img,
                        xOffset + slot.x + fallbackPhoto.offsetX,
                        slot.y + fallbackPhoto.offsetY,
                        drawW,
                        drawH
                    );
                }
                ctx.restore();
            }
        });

        if (frameImg) ctx.drawImage(frameImg, xOffset, 0, canvasWidth, canvasHeight);
    };

    useEffect(() => {
        if (allPhotosTaken && Object.keys(allVideoBlobs.current).length > 0) {
            startVideoPreview();
        } else {
            stopVideoPreview();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allPhotosTaken]);

    const startVideoPreview = async () => {
        if (!frameImgRef.current) return;
        stopVideoPreview();

        const frameImg = frameImgRef.current;
        const canvasWidth = frameImg.width;
        const canvasHeight = frameImg.height;

        // Placeholder segera dari foto statis
        const previewCanvas = videoPreviewCanvasRef.current;
        const photoCanvas = canvasRef.current;
        if (previewCanvas && photoCanvas) {
            previewCanvas.width = canvasWidth * 2;
            previewCanvas.height = canvasHeight;
            const ctx = previewCanvas.getContext("2d");
            ctx.drawImage(photoCanvas, 0, 0);
            ctx.drawImage(photoCanvas, canvasWidth, 0);
        }

        const videoElements = [];
        for (let i = 0; i < 4; i++) {
            if (!allVideoBlobs.current[i]) continue;
            const video = document.createElement("video");
            video.src = URL.createObjectURL(allVideoBlobs.current[i]);
            video.muted = true;
            video.loop = true;
            video.playsInline = true;
            video.style.display = "none";
            document.body.appendChild(video);
            videoElements.push({ video, slotIndex: i });
        }
        if (videoElements.length === 0) return;
        videoPreviewElementsRef.current = videoElements;

        await Promise.all(
            videoElements.map(
                (item) =>
                    new Promise((resolve) => {
                        if (item.video.readyState >= 3) { resolve(); return; }
                        item.video.addEventListener("canplay", resolve, { once: true });
                        item.video.load();
                    })
            )
        );
        await Promise.all(videoElements.map((item) => item.video.play().catch(() => {})));

        const previewCanvas2 = videoPreviewCanvasRef.current;
        if (!previewCanvas2) return;
        previewCanvas2.width = canvasWidth * 2;
        previewCanvas2.height = canvasHeight;
        const ctx = previewCanvas2.getContext("2d");

        const offscreen = document.createElement("canvas");
        offscreen.width = canvasWidth;
        offscreen.height = canvasHeight;
        const offCtx = offscreen.getContext("2d", { alpha: false });

        let lastTime = 0;
        const fpsInterval = 1000 / 30;

        const animate = (time) => {
            videoPreviewAnimRef.current = requestAnimationFrame(animate);
            const elapsed = time - lastTime;
            if (elapsed > fpsInterval) {
                lastTime = time - (elapsed % fpsInterval);
                drawVideosOnCanvas(offCtx, videoElements, canvasWidth, canvasHeight, frameImg, 0, photos);
                ctx.drawImage(offscreen, 0, 0);
                ctx.drawImage(offscreen, canvasWidth, 0);
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

    // ─── Create combined video (MP4/WebM) for export ──────────────────────────
    const createCombinedVideoBlob = () =>
        new Promise(async (resolve) => {
            try {
                if (!frameImgRef.current) { resolve(null); return; }

                const frameImg = frameImgRef.current;
                const videoDuration = 5;
                const canvasWidth = frameImg.width;
                const canvasHeight = frameImg.height;

                const recordCanvas = document.createElement("canvas");
                recordCanvas.width = canvasWidth * 2;
                recordCanvas.height = canvasHeight;
                const ctx = recordCanvas.getContext("2d");

                const videoElements = [];
                for (let i = 0; i < 4; i++) {
                    if (!allVideoBlobs.current[i]) continue;
                    const video = document.createElement("video");
                    video.src = URL.createObjectURL(allVideoBlobs.current[i]);
                    video.muted = true;
                    video.loop = true;
                    video.playsInline = true;
                    video.style.display = "none";
                    document.body.appendChild(video);
                    videoElements.push({ video, slotIndex: i });
                }
                if (videoElements.length === 0) { resolve(null); return; }

                await Promise.all(
                    videoElements.map(
                        (item) =>
                            new Promise((r) => {
                                if (item.video.readyState >= 3) { r(); return; }
                                item.video.addEventListener("canplay", r, { once: true });
                                item.video.load();
                            })
                    )
                );

                const stream = recordCanvas.captureStream(30);
                const mimeType = MediaRecorder.isTypeSupported("video/mp4")
                    ? "video/mp4"
                    : MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
                    ? "video/webm;codecs=vp9"
                    : "video/webm";

                const mediaRecorder = new MediaRecorder(stream, {
                    mimeType,
                    videoBitsPerSecond: 5_000_000, // 5 Mbps untuk HD
                });
                const chunks = [];
                mediaRecorder.ondataavailable = (e) => {
                    if (e.data.size > 0) chunks.push(e.data);
                };
                mediaRecorder.onstop = () => {
                    const blob = new Blob(chunks, { type: mimeType });
                    videoElements.forEach((item) => {
                        item.video.pause();
                        URL.revokeObjectURL(item.video.src);
                        if (document.body.contains(item.video))
                            document.body.removeChild(item.video);
                    });
                    resolve(blob);
                };

                await Promise.all(videoElements.map((item) => item.video.play().catch(() => {})));

                const offscreen = document.createElement("canvas");
                offscreen.width = canvasWidth;
                offscreen.height = canvasHeight;
                const offCtx = offscreen.getContext("2d", { alpha: false });

                // Frame awal sebelum recorder mulai
                drawVideosOnCanvas(offCtx, videoElements, canvasWidth, canvasHeight, frameImg, 0, photos);
                ctx.drawImage(offscreen, 0, 0);
                ctx.drawImage(offscreen, canvasWidth, 0);

                mediaRecorder.start();
                let active = true;
                let lastTime = 0;
                const fpsInterval = 1000 / 30;

                const recordAnimate = (time) => {
                    if (!active) return;
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
                    active = false;
                    videoElements.forEach((item) => item.video.pause());
                    mediaRecorder.stop();
                }, videoDuration * 1000);
            } catch (err) {
                console.error("❌ Video error:", err);
                resolve(null);
            }
        });

    // ─── Create combined photo (JPG) for export, WITH cutting guide ───────────
    const createCombinedPhotoBlob = () => {
        const photoCanvas = canvasRef.current;
        if (!photoCanvas) return null;

        const W = photoCanvas.width;
        const H = photoCanvas.height;
        const combined = document.createElement("canvas");
        combined.width = W * 2;
        combined.height = H;
        const ctx = combined.getContext("2d");

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, combined.width, combined.height);
        ctx.drawImage(photoCanvas, 0, 0);
        ctx.drawImage(photoCanvas, W, 0);

        // Cutting guide hanya di file export
        drawCuttingGuide(ctx, combined.width, combined.height);

        // Kembalikan sebagai JPG berkualitas tinggi
        return new Promise((resolve) => {
            combined.toBlob(resolve, "image/jpeg", 0.95);
        });
    };

    // ─── Save file ke backend / fallback download ─────────────────────────────
    const saveFile = async (filename, blob) => {
        try {
            const resp = await fetch(
                `http://localhost:5000/api/save-blob?filename=${encodeURIComponent(filename)}`,
                {
                    method: "POST",
                    body: blob,
                    headers: { "Content-Type": "application/octet-stream" },
                }
            );
            if (resp.ok) return;
        } catch (_) {
            // fallback ke download
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    // ─── Handle final save ────────────────────────────────────────────────────
    const handleFinalSave = async () => {
        if (isSaving || showSuccessPopup) return;
        setIsSaving(true);
        setSaveProgress(0);

        // Buat nama file dari nama + telepon
        const safeName = sanitizeFilename(userName);
        const safePhone = normalizePhone(userPhone).replace(/\+/g, "");
        const fileBase = safeName && safePhone ? `${safeName}${safePhone}` : `photo-${Date.now()}`;

        // 1. Simpan foto JPG (40%)
        setSaveProgress(10);
        const photoBlob = await createCombinedPhotoBlob();
        if (photoBlob) await saveFile(`${fileBase}.jpg`, photoBlob);
        setSaveProgress(40);

        // 2. Simpan video (40% → 90%)
        const videoBlob = await createCombinedVideoBlob();
        setSaveProgress(90);
        if (videoBlob) {
            const ext = videoBlob.type.includes("mp4") ? "mp4" : "webm";
            await saveFile(`${fileBase}.${ext}`, videoBlob);
        }

        setSaveProgress(100);
        setIsSaving(false);
        setShowSuccessPopup(true);

        setTimeout(() => {
            setShowSuccessPopup(false);
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
        }, 2500);
    };

    // ─── Derived values ───────────────────────────────────────────────────────
    const showRetakeButton =
        selectedPhotoIndex !== null && photos[selectedPhotoIndex];

    // ─── RENDER ───────────────────────────────────────────────────────────────
    return (
        <div style={styles.centerCol}>
            {/* ── TOP BAR ── */}
            <div style={styles.topBar}>
                {selectedFrame && (
                    <button style={{ ...styles.button, position: "absolute", left: 0, top: 10, height: 44, padding: "0 20px" }} onClick={handleBack}>
                        ← Back
                    </button>
                )}
                {sessionStarted && (
                    <div style={styles.timerBadge}>{formatTime(sessionTimeLeft)}</div>
                )}
                <h1 style={styles.titleBar}>
                    {!selectedFrame
                        ? "₊✩‧₊˚ Welcome ౨ৎ ˚₊✩‧₊"
                        : mode === "photo"
                        ? "⋆｡‧˚ʚ Smile :)ɞ˚‧｡⋆"
                        : ". ݁₊ ⊹ . ݁Let's decorate . ⊹ ₊ ݁."}
                </h1>
            </div>

            {/* ── MAIN CONTENT ── */}
            <div style={styles.mainContent}>
                {!selectedFrame ? (
                    /* ── FRAME PICKER / START ── */
                    !sessionStarted ? (
                        <div style={styles.col}>
                            <button
                                style={{ ...styles.button, fontSize: 44, padding: "20px 60px" }}
                                onClick={handleStartSession}
                            >
                                Start
                            </button>
                        </div>
                    ) : (
                        <div style={styles.col}>
                            <div style={{ fontSize: 52, color: "#8c5b4a", fontWeight: "bold", marginTop: 10 }}>
                                Pilih frame kamu
                            </div>
                            <div style={{ display: "flex", gap: 24, flexWrap: "wrap", justifyContent: "center" }}>
                                {TEMPLATE.frames.map((src) => (
                                    <img
                                        key={src}
                                        src={src}
                                        alt="frame"
                                        onClick={() => { setSelectedFrame(src); setCanTakePhoto(true); }}
                                        onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.08)"; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
                                        style={{
                                            ...styles.frameThumb,
                                            transform: selectedFrame === src ? "scale(1.08)" : "scale(1)",
                                            boxShadow: selectedFrame === src ? "0 12px 30px rgba(255,122,162,0.45)" : styles.frameThumb.boxShadow,
                                        }}
                                    />
                                ))}
                            </div>
                        </div>
                    )
                ) : (
                    /* ── PHOTO SESSION / DECORATE ── */
                    <div style={{ ...styles.row, justifyContent: "center", alignItems: "stretch" }}>
                        {/* LEFT: webcam */}
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start" }}>
                            {(mode === "photo" || showRetakeCamera) && (
                                <>
                                    <div style={{ width: "100%", display: "flex", justifyContent: "center" }}>
                                        <div style={{ position: "relative", width: 1280, maxWidth: "100%" }}>
                                            <Webcam
                                                audio={false}
                                                ref={webcamRef}
                                                screenshotFormat="image/png"
                                                videoConstraints={videoConstraints}
                                                mirrored={true}
                                                style={{ width: "100%", borderRadius: 18, objectFit: "cover" }}
                                            />
                                            {countdown != null && (
                                                <div style={styles.countdownOverlay}>{countdown}</div>
                                            )}
                                        </div>
                                    </div>
                                    <div style={{ marginTop: 20, display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
                                        {canTakePhoto && sessionStarted && (
                                            <button style={styles.button} onClick={capturePhoto}>
                                                {showRetakeCamera ? "📷 Ambil Foto" : "Take Photo"}
                                            </button>
                                        )}
                                        {photoCount > 0 && mode === "photo" && (
                                            <button style={{ ...styles.button, fontSize: 24, padding: "6px 14px" }} onClick={redoLastPhoto}>
                                                ⟳
                                            </button>
                                        )}
                                        {showRetakeButton && mode === "photo" && (
                                            <button style={{ ...styles.button, background: "#fff0f4" }} onClick={retakeSelectedPhoto}>
                                                Retake selected
                                            </button>
                                        )}
                                    </div>
                                </>
                            )}

                            {mode === "decorate" && !showRetakeCamera && (
                                <div style={styles.col}>
                                    {showRetakeButton ? (
                                        <div style={{ textAlign: "center" }}>
                                            <div style={{ fontSize: 18, color: "#8c5b4a", marginBottom: 12 }}>Foto dipilih — mau diganti?</div>
                                            <button style={{ ...styles.button, background: "#fff0f4", fontSize: 18 }} onClick={retakeSelectedPhoto}>
                                                📷 Retake foto ini
                                            </button>
                                        </div>
                                    ) : (
                                        <div style={{ fontSize: 16, color: "#b08a80", textAlign: "center", maxWidth: 300 }}>
                                            💡 Klik foto di strip untuk memilih dan retake
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* RIGHT: preview strip */}
                        <div style={{ display: "flex", flexDirection: "row", gap: 20, alignItems: "flex-start" }}>
                            {/* Foto strip */}
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                                <div style={styles.previewLabel}>📸 Foto</div>
                                <div style={{
                                    display: "flex",
                                    boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
                                    borderRadius: 14,
                                    overflow: "hidden",
                                    outline: showRetakeButton ? "3px solid #ff7aa2" : "none",
                                }}>
                                    <canvas
                                        ref={canvasRef}
                                        style={{ width: 290, height: 760, display: "block", cursor: mode === "decorate" ? "pointer" : "default" }}
                                        onMouseDown={handleMouseDown}
                                        onMouseMove={handleMouseMove}
                                        onMouseUp={handleMouseUp}
                                    />
                                    {mode === "decorate" && (
                                        <canvas ref={dupCanvasRef} style={{ width: 290, height: 760, display: "block" }} />
                                    )}
                                </div>
                            </div>

                            {/* Video preview */}
                            {allPhotosTaken && (
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                                    <div style={styles.previewLabel}>🎬 Video</div>
                                    <div style={{ position: "relative", width: 580, height: 760, borderRadius: 14, overflow: "hidden", boxShadow: "0 10px 30px rgba(255,122,162,0.25)" }}>
                                        <canvas ref={videoPreviewCanvasRef} style={{ width: 580, height: 760, display: "block" }} />
                                    </div>
                                </div>
                            )}

                            {/* Finish button */}
                            {mode === "decorate" && allPhotosTaken && (
                                <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 4 }}>
                                    <button
                                        style={{ ...styles.button, fontSize: 30, padding: "16px 34px", opacity: isSaving ? 0.7 : 1, cursor: isSaving ? "not-allowed" : "pointer" }}
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

            {/* ── MODAL: INPUT NAMA & TELEPON ── */}
            {showNameInput && (
                <div style={styles.modalOverlay}>
                    <div style={styles.modalBox}>
                        <h2 style={{ margin: "0 0 28px 0", color: "#8c5b4a", fontSize: 40 }}>
                            Data Peserta
                        </h2>

                        {/* Nama */}
                        <label style={styles.inputLabel}>Nama</label>
                        <input
                            type="text"
                            placeholder="Nama lengkap..."
                            value={userName}
                            onChange={(e) => { setUserName(e.target.value); setNameError(""); }}
                            onKeyPress={(e) => { if (e.key === "Enter") document.getElementById("input-phone")?.focus(); }}
                            style={{ ...styles.input, borderColor: nameError ? "#ff6b6b" : "#ff7aa2", marginBottom: nameError ? 6 : 20 }}
                            autoFocus
                        />
                        {nameError && <div style={styles.errorText}>{nameError}</div>}

                        {/* Nomor Telepon */}
                        <label style={styles.inputLabel}>Nomor Telepon</label>
                        <input
                            id="input-phone"
                            type="tel"
                            placeholder="08123456789 atau +62812..."
                            value={userPhone}
                            onChange={(e) => { setUserPhone(e.target.value); setPhoneError(""); }}
                            onKeyPress={(e) => { if (e.key === "Enter") handleNameSubmit(); }}
                            style={{ ...styles.input, borderColor: phoneError ? "#ff6b6b" : "#ff7aa2", marginBottom: phoneError ? 6 : 24 }}
                        />
                        {phoneError && <div style={styles.errorText}>{phoneError}</div>}

                        <button style={{ ...styles.button, fontSize: 28, padding: "16px 40px", width: "100%" }} onClick={handleNameSubmit}>
                            OK — Mulai Sesi
                        </button>
                    </div>
                </div>
            )}

            {/* ── MODAL: SAVING / SUCCESS ── */}
            {(isSaving || showSuccessPopup) && (
                <div style={styles.modalOverlay}>
                    <div style={{ ...styles.modalBox, padding: "50px 80px" }}>
                        <div style={{ fontSize: 72, marginBottom: 20 }}>{isSaving ? "⏳" : "✅"}</div>
                        <h2 style={{ margin: "0 0 20px", color: "#8c5b4a", fontSize: 42, fontFamily: "CantikaCute" }}>
                            {isSaving ? "Mohon tunggu..." : "Berhasil disimpan!"}
                        </h2>
                        {isSaving && (
                            <div style={styles.progressBarWrap}>
                                <div style={{ ...styles.progressBarFill, width: `${saveProgress}%` }} />
                            </div>
                        )}
                        {isSaving && (
                            <div style={{ fontSize: 18, color: "#b08a80", marginTop: 10 }}>{saveProgress}%</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const styles = {
    centerCol: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 20,
    },
    topBar: {
        width: "min(1600px, 98vw)",
        height: 110,
        position: "relative",
        marginBottom: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
    },
    titleBar: {
        margin: 0,
        lineHeight: "110px",
        textAlign: "center",
        width: "100%",
        fontSize: 60,
        fontFamily: "CantikaCute, cursive",
        color: "#8c5b4a",
    },
    timerBadge: {
        position: "absolute",
        right: 0,
        top: 12,
        padding: "14px 28px",
        borderRadius: 999,
        background: "#fff0f4",
        border: "2px solid #ff7aa2",
        color: "#8c5b4a",
        fontWeight: "bold",
        fontSize: 44,
        minWidth: 140,
        textAlign: "center",
        boxShadow: "0 8px 18px rgba(255,122,162,0.2)",
    },
    button: {
        padding: "16px 32px",
        fontSize: 30,
        cursor: "pointer",
        fontFamily: "CantikaCute, cursive",
        color: "#8c5b4a",
        border: "2px solid #8c5b4a",
        borderRadius: 12,
        background: "white",
        transition: "opacity 0.2s",
    },
    row: { display: "flex", gap: 50, alignItems: "flex-start" },
    col: { display: "flex", flexDirection: "column", alignItems: "center", gap: 24 },
    frameThumb: {
        width: 320,
        cursor: "pointer",
        borderRadius: 14,
        boxShadow: "0 8px 8px rgba(0,0,0,0.15)",
        transition: "transform 0.25s ease, box-shadow 0.25s ease",
    },
    mainContent: {
        width: "min(1600px, 98vw)",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        minHeight: 900,
    },
    previewLabel: {
        fontSize: 26,
        color: "#8c5b4a",
        marginBottom: 12,
        fontWeight: "bold",
        letterSpacing: 1,
    },
    countdownOverlay: {
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 160,
        fontWeight: "bold",
        color: "white",
        textShadow: "0 4px 20px rgba(0,0,0,0.6)",
        background: "rgba(0,0,0,0.25)",
        borderRadius: 18,
        pointerEvents: "none",
    },
    // Modal
    modalOverlay: {
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 999,
    },
    modalBox: {
        background: "white",
        padding: "52px 56px",
        borderRadius: 24,
        textAlign: "center",
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        minWidth: 520,
        maxWidth: "92vw",
    },
    inputLabel: {
        display: "block",
        textAlign: "left",
        fontSize: 26,
        fontWeight: "bold",
        color: "#8c5b4a",
        marginBottom: 10,
        fontFamily: "CantikaCute, cursive",
    },
    input: {
        width: "100%",
        padding: "18px 22px",
        fontSize: 26,
        border: "2px solid #ff7aa2",
        borderRadius: 12,
        boxSizing: "border-box",
        fontFamily: "CantikaCute, cursive",
        outline: "none",
    },
    errorText: {
        color: "#ff6b6b",
        fontSize: 16,
        marginBottom: 16,
        fontWeight: "bold",
        textAlign: "left",
    },
    // Progress bar
    progressBarWrap: {
        width: "100%",
        height: 16,
        background: "#ffe0ea",
        borderRadius: 999,
        overflow: "hidden",
        marginTop: 10,
    },
    progressBarFill: {
        height: "100%",
        background: "linear-gradient(90deg, #ff7aa2, #ffb3c6)",
        borderRadius: 999,
        transition: "width 0.4s ease",
    },
};
