import React, { useRef, useState, useEffect } from "react";
import Webcam from "react-webcam";

// ─── FRAME OPTIONS ────────────────────────────────────────────────────────────
const FRAME_OPTIONS = [
    "/assets/frames/heart-frame.png",
    "/assets/frames/heart-frame-2.png",
    "/assets/frames/heart-frame-3.png",
    "/assets/frames/heart-frame-4.png",
];

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const OVERLAP = 12;
const SLOT_WIDTH  = 953 + OVERLAP * 2;
const SLOT_HEIGHT = 599 + OVERLAP * 2;
const videoConstraints = {
    width: SLOT_WIDTH,
    height: SLOT_HEIGHT,
    facingMode: "user",
};
const SLOTS = [
    { x: 123 - OVERLAP, y:   78 - OVERLAP },
    { x: 123 - OVERLAP, y:  680 - OVERLAP },
    { x: 123 - OVERLAP, y: 1286 - OVERLAP },
    { x: 123 - OVERLAP, y: 1885 - OVERLAP },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const sanitizeFilename = (str) =>
    str.trim().replace(/\s+/g, "").replace(/[^a-zA-Z0-9\u00C0-\u024F\u0600-\u06FF]/g, "");

const normalizePhone = (phone) =>
    phone.trim().replace(/[\s\-().]/g, "");

const isValidPhone = (phone) =>
    /^(\+62|62|0)[0-9]{7,13}$/.test(normalizePhone(phone));

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

// ─── COMPONENT ────────────────────────────────────────────────────────────────
export default function PhotoBooth() {
    // Refs
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

    // State
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

    // ── Sync photo count ──
    useEffect(() => { setPhotoCount(photos.length); }, [photos]);

    // ── Load frame image ──
    useEffect(() => {
        if (!selectedFrame) return;
        const img = new Image();
        img.src = selectedFrame;
        img.onload = () => { frameImgRef.current = img; drawCanvas(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedFrame]);

    // ── Redraw canvas on photo/state changes ──
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(drawCanvas, [photos, photoCount]);

    // ── Draw main photo canvas ──
    function drawCanvas() {
        const canvas = canvasRef.current;
        if (!canvas || !frameImgRef.current) return;
        const ctx = canvas.getContext("2d");
        const W = frameImgRef.current.width;
        const H = frameImgRef.current.height;
        canvas.width  = W;
        canvas.height = H;
        ctx.clearRect(0, 0, W, H);

        photos.forEach((p) => {
            const slot  = SLOTS[p.slotIndex];
            const drawW = p.img.width  * p.scale;
            const drawH = p.img.height * p.scale;
            ctx.save();
            ctx.beginPath();
            ctx.rect(slot.x, slot.y, SLOT_WIDTH, SLOT_HEIGHT);
            ctx.clip();
            ctx.drawImage(p.img, slot.x + p.offsetX, slot.y + p.offsetY, drawW, drawH);
            ctx.restore();
        });

        ctx.drawImage(frameImgRef.current, 0, 0, W, H);

        // Sync ke duplikat canvas
        const dup = dupCanvasRef.current;
        if (dup) {
            dup.width  = W;
            dup.height = H;
            dup.getContext("2d").drawImage(canvas, 0, 0);
        }
    }

    // ── Timer ──
    const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

    useEffect(() => {
        if (!sessionStarted) return;
        const t = setInterval(() => {
            setSessionTimeLeft((prev) => {
                if (prev <= 1) { clearInterval(t); setSessionStarted(false); setCanTakePhoto(false); return 0; }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(t);
    }, [sessionStarted]);

    useEffect(() => {
        if (sessionStarted && sessionTimeLeft === 0 && !isSaving && !showSuccessPopup) handleFinalSave();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionTimeLeft, sessionStarted, isSaving, showSuccessPopup]);

    // ── Video capture ──
    const startShortVideoCapture = () => {
        const vid = webcamRef.current?.video;
        if (!vid) return;
        const stream = vid.captureStream?.() || vid.mozCaptureStream?.() || null;
        if (!stream) return;
        const mimeType = MediaRecorder.isTypeSupported("video/mp4") ? "video/mp4" : "video/webm";
        const recorder = new MediaRecorder(stream, { mimeType });
        recordedChunksRef.current = [];
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
                const handleStop = () => {
                    rec.removeEventListener("stop", handleStop);
                    if (slotIndex !== null && liveVideoBlobRef.current)
                        allVideoBlobs.current[slotIndex] = liveVideoBlobRef.current;
                    mediaRecorderRef.current = null;
                    resolve();
                };
                rec.addEventListener("stop", handleStop);
                rec.stop();
            } else resolve();
        });

    // ── Session control ──
    const handleStartSession = () => {
        setShowNameInput(true);
        setNameError("");
        setPhoneError("");
        setUserName("");
        setUserPhone("");
    };

    const handleNameSubmit = () => {
        let valid = true;
        if (!userName.trim())       { setNameError("⚠️ Nama harus diisi!"); valid = false; }
        else                         setNameError("");
        if (!userPhone.trim())       { setPhoneError("⚠️ Nomor telepon harus diisi!"); valid = false; }
        else if (!isValidPhone(userPhone)) { setPhoneError("⚠️ Format tidak valid (contoh: 08123456789 atau +62812...)"); valid = false; }
        else                         setPhoneError("");
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

    // ── Photo logic ──
    const getNextAvailableSlot = () => {
        for (let i = 0; i < SLOTS.length; i++)
            if (!photos.some((p) => p.slotIndex === i)) return i;
        return null;
    };

    const addPhoto = (img, replaceSlotIndex = null) => {
        const targetSlot = replaceSlotIndex !== null ? replaceSlotIndex : getNextAvailableSlot();
        if (targetSlot === null) return;
        const scale  = SLOT_WIDTH / img.width;
        const drawH  = img.height * scale;
        const offsetY = drawH > SLOT_HEIGHT ? (SLOT_HEIGHT - drawH) / 2 : 0;
        setPhotos((prev) => {
            const filtered = prev.filter((p) => p.slotIndex !== targetSlot);
            const next = [...filtered, { img, slotIndex: targetSlot, scale, offsetX: 0, offsetY }];
            if (next.length === 4) { setMode("decorate"); setAllPhotosTaken(true); setShowRetakeCamera(false); }
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
            } else setCountdown(current);
        }, 1000);
    };

    const redoLastPhoto = () => {
        if (!photos.length) return;
        const last = photos[photos.length - 1];
        setPhotos((prev) => prev.filter((p) => p !== last));
        setSelectedPhotoIndex(null);
        setRetakeSlotIndex(last.slotIndex);
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
        setPhotos((prev) => prev.filter((_, i) => i !== selectedPhotoIndex));
        setSelectedPhotoIndex(null);
        setRetakeSlotIndex(photoToReplace.slotIndex);
        setCanTakePhoto(true);
        setShowRetakeCamera(true);
    };

    // ── Canvas drag ──
    const getCoords = (e) => {
        const r = canvasRef.current.getBoundingClientRect();
        return {
            x: (e.clientX - r.left) * (canvasRef.current.width  / r.width),
            y: (e.clientY - r.top)  * (canvasRef.current.height / r.height),
        };
    };
    const handleMouseDown = (e) => {
        const { x, y } = getCoords(e);
        if (mode === "photo" || mode === "decorate") {
            for (let i = photos.length - 1; i >= 0; i--) {
                const p = photos[i], slot = SLOTS[p.slotIndex];
                const w = p.img.width * p.scale, h = p.img.height * p.scale;
                if (x >= slot.x + p.offsetX && x <= slot.x + p.offsetX + w &&
                    y >= slot.y + p.offsetY && y <= slot.y + p.offsetY + h) {
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
    const handleMouseMove = (e) => {
        if (draggingPhoto === null || mode !== "photo") return;
        const { x, y } = getCoords(e);
        setPhotos((prev) => {
            const updated = [...prev];
            const p = updated[draggingPhoto], slot = SLOTS[p.slotIndex];
            const w = p.img.width * p.scale, h = p.img.height * p.scale;
            p.offsetX = Math.min(Math.max(x - slot.x - dragOffset.x, SLOT_WIDTH  - w), 0);
            p.offsetY = Math.min(Math.max(y - slot.y - dragOffset.y, SLOT_HEIGHT - h), 0);
            return updated;
        });
    };
    const handleMouseUp = () => setDraggingPhoto(null);

    // ── Video preview ──
    const drawVideosOnCanvas = (ctx, videoElements, cW, cH, frameImg, xOffset = 0, curPhotos = []) => {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(xOffset, 0, cW, cH);
        videoElements.forEach(({ video, slotIndex }) => {
            const slot = SLOTS[slotIndex];
            const fallback = curPhotos.find((p) => p.slotIndex === slotIndex);
            if (!slot) return;
            ctx.save();
            ctx.beginPath();
            ctx.rect(xOffset + slot.x, slot.y, SLOT_WIDTH, SLOT_HEIGHT);
            ctx.clip();
            if (video.readyState >= 2) {
                const vw = video.videoWidth || SLOT_WIDTH, vh = video.videoHeight || SLOT_HEIGHT;
                const sc = SLOT_WIDTH / vw, dH = vh * sc;
                const oY = dH > SLOT_HEIGHT ? (SLOT_HEIGHT - dH) / 2 : 0;
                ctx.drawImage(video, xOffset + slot.x, slot.y + oY, SLOT_WIDTH, dH);
            } else if (fallback) {
                ctx.drawImage(fallback.img,
                    xOffset + slot.x + fallback.offsetX,
                    slot.y + fallback.offsetY,
                    fallback.img.width  * fallback.scale,
                    fallback.img.height * fallback.scale);
            }
            ctx.restore();
        });
        if (frameImg) ctx.drawImage(frameImg, xOffset, 0, cW, cH);
    };

    useEffect(() => {
        if (allPhotosTaken && Object.keys(allVideoBlobs.current).length > 0) startVideoPreview();
        else stopVideoPreview();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allPhotosTaken]);

    const startVideoPreview = async () => {
        if (!frameImgRef.current) return;
        stopVideoPreview();
        const frameImg = frameImgRef.current;
        const cW = frameImg.width, cH = frameImg.height;

        // Placeholder dari foto statis
        const pc = videoPreviewCanvasRef.current, ph = canvasRef.current;
        if (pc && ph) {
            pc.width = cW * 2; pc.height = cH;
            const ctx = pc.getContext("2d");
            ctx.drawImage(ph, 0, 0); ctx.drawImage(ph, cW, 0);
        }

        const videoElements = [];
        for (let i = 0; i < 4; i++) {
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
                if (item.video.readyState >= 3) { r(); return; }
                item.video.addEventListener("canplay", r, { once: true });
                item.video.load();
            })
        ));
        await Promise.all(videoElements.map((item) => item.video.play().catch(() => {})));

        const canvas = videoPreviewCanvasRef.current;
        if (!canvas) return;
        canvas.width = cW * 2; canvas.height = cH;
        const ctx = canvas.getContext("2d");
        const off = document.createElement("canvas");
        off.width = cW; off.height = cH;
        const offCtx = off.getContext("2d", { alpha: false });
        let lastTime = 0;
        const animate = (time) => {
            videoPreviewAnimRef.current = requestAnimationFrame(animate);
            const elapsed = time - lastTime;
            if (elapsed > 1000 / 30) {
                lastTime = time - (elapsed % (1000 / 30));
                drawVideosOnCanvas(offCtx, videoElements, cW, cH, frameImg, 0, photos);
                ctx.drawImage(off, 0, 0);
                ctx.drawImage(off, cW, 0);
            }
        };
        videoPreviewAnimRef.current = requestAnimationFrame(animate);
    };

    const stopVideoPreview = () => {
        if (videoPreviewAnimRef.current) { cancelAnimationFrame(videoPreviewAnimRef.current); videoPreviewAnimRef.current = null; }
        videoPreviewElementsRef.current.forEach((item) => {
            item.video.pause();
            URL.revokeObjectURL(item.video.src);
            if (document.body.contains(item.video)) document.body.removeChild(item.video);
        });
        videoPreviewElementsRef.current = [];
    };

    // ── Create combined video blob ──
    const createCombinedVideoBlob = () =>
        new Promise(async (resolve) => {
            try {
                if (!frameImgRef.current) { resolve(null); return; }
                const frameImg = frameImgRef.current;
                const cW = frameImg.width, cH = frameImg.height;
                const rc = document.createElement("canvas");
                rc.width = cW * 2; rc.height = cH;
                const ctx = rc.getContext("2d");

                const videoElements = [];
                for (let i = 0; i < 4; i++) {
                    if (!allVideoBlobs.current[i]) continue;
                    const v = document.createElement("video");
                    v.src = URL.createObjectURL(allVideoBlobs.current[i]);
                    v.muted = true; v.loop = true; v.playsInline = true; v.style.display = "none";
                    document.body.appendChild(v);
                    videoElements.push({ video: v, slotIndex: i });
                }
                if (!videoElements.length) { resolve(null); return; }

                await Promise.all(videoElements.map((item) =>
                    new Promise((r) => {
                        if (item.video.readyState >= 3) { r(); return; }
                        item.video.addEventListener("canplay", r, { once: true });
                        item.video.load();
                    })
                ));

                const mimeType = MediaRecorder.isTypeSupported("video/mp4") ? "video/mp4"
                    : MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9"
                    : "video/webm";
                const mr = new MediaRecorder(rc.captureStream(30), { mimeType, videoBitsPerSecond: 5_000_000 });
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

                await Promise.all(videoElements.map((item) => item.video.play().catch(() => {})));

                const off = document.createElement("canvas");
                off.width = cW; off.height = cH;
                const offCtx = off.getContext("2d", { alpha: false });
                drawVideosOnCanvas(offCtx, videoElements, cW, cH, frameImg, 0, photos);
                ctx.drawImage(off, 0, 0); ctx.drawImage(off, cW, 0);
                mr.start();

                let active = true, lastTime = 0;
                const loop = (time) => {
                    if (!active) return;
                    requestAnimationFrame(loop);
                    const el = time - lastTime;
                    if (el > 1000 / 30) {
                        lastTime = time - (el % (1000 / 30));
                        drawVideosOnCanvas(offCtx, videoElements, cW, cH, frameImg, 0, photos);
                        ctx.drawImage(off, 0, 0); ctx.drawImage(off, cW, 0);
                    }
                };
                requestAnimationFrame(loop);
                setTimeout(() => { active = false; videoElements.forEach((i) => i.video.pause()); mr.stop(); }, 5000);
            } catch (err) { console.error("❌ Video error:", err); resolve(null); }
        });

    // ── Create combined photo blob (JPG) + cutting guide ──
    const createCombinedPhotoBlob = () => {
        const src = canvasRef.current;
        if (!src) return Promise.resolve(null);
        const combined = document.createElement("canvas");
        combined.width  = src.width  * 2;
        combined.height = src.height;
        const ctx = combined.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, combined.width, combined.height);
        ctx.drawImage(src, 0, 0);
        ctx.drawImage(src, src.width, 0);
        drawCuttingGuide(ctx, combined.width, combined.height);
        return new Promise((resolve) => combined.toBlob(resolve, "image/jpeg", 0.95));
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
        setSaveProgress(40);

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
                {sessionStarted && (
                    <div style={S.timerBadge}>{formatTime(sessionTimeLeft)}</div>
                )}
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
                            <button style={{ ...S.button, fontSize: 44, padding: "20px 60px" }} onClick={handleStartSession}>
                                Start
                            </button>
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
                                        style={{ ...S.frameThumb, transform: selectedFrame === src ? "scale(1.08)" : "scale(1)", boxShadow: selectedFrame === src ? "0 12px 30px rgba(255,122,162,0.45)" : S.frameThumb.boxShadow }}
                                    />
                                ))}
                            </div>
                        </div>
                    )
                ) : (
                    <div style={{ display: "flex", gap: 50, justifyContent: "center", alignItems: "stretch" }}>
                        {/* LEFT: webcam */}
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                            {(mode === "photo" || showRetakeCamera) && (
                                <>
                                    <div style={{ width: "100%", display: "flex", justifyContent: "center" }}>
                                        <div style={{ position: "relative", width: 1280, maxWidth: "100%" }}>
                                            <Webcam
                                                audio={false} ref={webcamRef}
                                                screenshotFormat="image/png"
                                                videoConstraints={videoConstraints}
                                                mirrored={true}
                                                style={{ width: "100%", borderRadius: 18, objectFit: "cover" }}
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

                        {/* RIGHT: strip preview */}
                        <div style={{ display: "flex", flexDirection: "row", gap: 20, alignItems: "flex-start" }}>
                            {/* Foto strip */}
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                                <div style={S.previewLabel}>📸 Foto</div>
                                <div style={{ display: "flex", boxShadow: "0 10px 30px rgba(0,0,0,0.15)", borderRadius: 14, overflow: "hidden", outline: showRetakeButton ? "3px solid #ff7aa2" : "none" }}>
                                    <canvas ref={canvasRef}
                                        style={{ width: 290, height: 760, display: "block", cursor: mode === "decorate" ? "pointer" : "default" }}
                                        onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
                                    />
                                    {mode === "decorate" && (
                                        <canvas ref={dupCanvasRef} style={{ width: 290, height: 760, display: "block" }} />
                                    )}
                                </div>
                            </div>

                            {/* Video preview */}
                            {allPhotosTaken && (
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                                    <div style={S.previewLabel}>🎬 Video</div>
                                    <div style={{ width: 580, height: 760, borderRadius: 14, overflow: "hidden", boxShadow: "0 10px 30px rgba(255,122,162,0.25)" }}>
                                        <canvas ref={videoPreviewCanvasRef} style={{ width: 580, height: 760, display: "block" }} />
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
        width: 320, cursor: "pointer", borderRadius: 14,
        boxShadow: "0 8px 8px rgba(0,0,0,0.15)",
        transition: "transform 0.25s ease, box-shadow 0.25s ease",
    },
    mainContent: {
        width: "min(1600px, 98vw)", display: "flex",
        justifyContent: "center", alignItems: "flex-start", minHeight: 900,
    },
    previewLabel: { fontSize: 26, color: "#8c5b4a", marginBottom: 12, fontWeight: "bold", letterSpacing: 1 },
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
