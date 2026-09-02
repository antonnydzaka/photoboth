import React, { useRef, useState, useEffect } from "react";
import Webcam from "react-webcam";

const frameOptions = [
    "/assets/frames/heart-frame.png",
    "/assets/frames/heart-frame-2.png",
    "/assets/frames/heart-frame-3.png",
    "/assets/frames/heart-frame-4.png",
];

const videoConstraints = { width: 953, height: 599, facingMode: "user" };
const SLOT_WIDTH = 953;
const SLOT_HEIGHT = 599;


export default function PhotoBooth() {
    const webcamRef = useRef(null);
    const canvasRef = useRef(null);
    const dupCanvasRef = useRef(null); // Second canvas for duplicated photo preview
    const videoPreviewCanvasRef = useRef(null);
    const frameImgRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const recordedChunksRef = useRef([]);
    const liveVideoBlobRef = useRef(null);
    const allVideoBlobs = useRef({}); // Store all 4 video blobs by slot index
    const videoPreviewAnimRef = useRef(null); // requestAnimationFrame ref for video preview
    const videoPreviewElementsRef = useRef([]); // Video elements for preview

    const slots = [
        { x: 123, y: 78 },
        { x: 123, y: 680 },
        { x: 123, y: 1286 },
        { x: 123, y: 1885 }
    ];

    const [selectedFrame, setSelectedFrame] = useState(null);
    const [mode, setMode] = useState("photo");
    const [sessionStarted, setSessionStarted] = useState(false);
    const [sessionTimeLeft, setSessionTimeLeft] = useState(180);
    const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(null);
    const [retakeSlotIndex, setRetakeSlotIndex] = useState(null);
    const [userName, setUserName] = useState("");
    const [showNameInput, setShowNameInput] = useState(false);
    const [nameError, setNameError] = useState("");

    const [photos, setPhotos] = useState([]);
    const [photoCount, setPhotoCount] = useState(0);
    const [canTakePhoto, setCanTakePhoto] = useState(true);
    const [draggingPhoto, setDraggingPhoto] = useState(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [countdown, setCountdown] = useState(null);

    const [videoPreviewReady, setVideoPreviewReady] = useState(false);
    const [allPhotosTaken, setAllPhotosTaken] = useState(false);
    const [showRetakeCamera, setShowRetakeCamera] = useState(false);
    const [showResult, setShowResult] = useState(false);
    const [resultPhotoUrl, setResultPhotoUrl] = useState(null);
    const [resultVideoUrl, setResultVideoUrl] = useState(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        setPhotoCount(photos.length);
    }, [photos]);

    useEffect(() => {
        if (!selectedFrame) return;
        const img = new Image();
        img.src = selectedFrame;

        img.onload = () => {
            frameImgRef.current = img;
            drawCanvas();
        }
    }, [selectedFrame]);

    const drawCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas || !frameImgRef.current) return;

        const ctx = canvas.getContext("2d");

        const frameWidth = frameImgRef.current.width;
        const frameHeight = frameImgRef.current.height;
        canvas.width = frameWidth;
        canvas.height = frameHeight;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        photos.forEach(p => {
            const slot = slots[p.slotIndex];
            const drawW = p.img.width * p.scale;
            const drawH = p.img.height * p.scale;
            const dx = slot.x + p.offsetX;
            const dy = slot.y + p.offsetY;

            ctx.save();
            ctx.beginPath();
            ctx.rect(slot.x, slot.y, SLOT_WIDTH, SLOT_HEIGHT);
            ctx.clip();
            ctx.drawImage(p.img, dx, dy, drawW, drawH);
            ctx.restore();
        });

        ctx.drawImage(frameImgRef.current, 0, 0, frameWidth, frameHeight);

        // Draw to duplicate canvas
        const dupCanvas = dupCanvasRef.current;
        if (dupCanvas) {
            dupCanvas.width = frameWidth;
            dupCanvas.height = frameHeight;
            const dupCtx = dupCanvas.getContext("2d");
            dupCtx.drawImage(canvas, 0, 0);
        }
    };

    useEffect(drawCanvas, [photos, photoCount]);

    const formatTime = (seconds) => {
        const min = Math.floor(seconds / 60);
        const sec = seconds % 60;
        return `${min}:${String(sec).padStart(2, "0")}`;
    };

    const startShortVideoCapture = () => {
        const videoElement = webcamRef.current?.video;
        if (!videoElement) return;

        const stream = videoElement.captureStream
            ? videoElement.captureStream()
            : videoElement.mozCaptureStream
                ? videoElement.mozCaptureStream()
                : null;

        if (!stream) return;

        const recorder = new MediaRecorder(stream);
        recordedChunksRef.current = [];

        recorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunksRef.current.push(event.data);
            }
        };

        recorder.onstop = () => {
            liveVideoBlobRef.current = new Blob(recordedChunksRef.current, { type: "video/webm" });
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
                    
                    // Store video for this slot if slotIndex provided
                    if (slotIndex !== null && liveVideoBlobRef.current) {
                        allVideoBlobs.current[slotIndex] = liveVideoBlobRef.current;
                        console.log(`📹 Saved video for slot ${slotIndex}`);
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

    const handleStartSession = () => {
        setShowNameInput(true);
        setNameError("");
        setUserName("");
    };

    const handleNameSubmit = () => {
        if (!userName.trim()) {
            setNameError("⚠️ Nama harus diisi!");
            return;
        }
        
        setNameError("");
        setShowNameInput(false);
        setSessionStarted(true);
        setSessionTimeLeft(180);
        setCanTakePhoto(false);
        setSelectedPhotoIndex(null);
        setRetakeSlotIndex(null);
        setMode("photo");
    };

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

    const getNextAvailableSlot = () => {
        for (let i = 0; i < slots.length; i++) {
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

    const takePhotoNow = (slotIndex) => {
        const src = webcamRef.current.getScreenshot();
        if (!src) return;
        const img = new Image();
        img.src = src;
        img.onload = () => addPhoto(img, retakeSlotIndex);
    };

    const capturePhoto = () => {
        if (!canTakePhoto || countdown !== null || !sessionStarted || sessionTimeLeft <= 0) return;

        setCanTakePhoto(false);
        setCountdown(5);
        
        // Determine which slot will be used
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

        // Tetap di mode decorate, tampilkan kamera untuk retake
        stopVideoPreview();
        setAllPhotosTaken(false);
        setPhotos(prev => prev.filter((_, index) => index !== selectedPhotoIndex));
        setSelectedPhotoIndex(null);
        setRetakeSlotIndex(photoToReplace.slotIndex);
        setCanTakePhoto(true);
        setShowRetakeCamera(true);
    };

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
                const slot = slots[p.slotIndex];
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
                            y: y - slot.y - p.offsetY
                        });
                    }
                    setSelectedPhotoIndex(i);
                    return;
                }
            }
        }

        if (mode === "decorate") {
            // Click on empty area deselects photo
            setSelectedPhotoIndex(null);
        }
    };

    const handleMouseMove = e => {
        const { x, y } = getCoords(e);

        if (draggingPhoto !== null && mode === "photo") {
            setPhotos(prev => {
                const updated = [...prev];
                const p = updated[draggingPhoto];
                const slot = slots[p.slotIndex];
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

    const handleMouseUp = () => {
        setDraggingPhoto(null);
    };



    const dataUrlToBlob = (dataUrl) => {
        const arr = dataUrl.split(',');
        const mimeMatch = arr[0].match(/:(.*?);/);
        const mime = mimeMatch ? mimeMatch[1] : 'image/png';
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new Blob([u8arr], { type: mime });
    };

    const saveFileToResultsFolder = async (fileName, blob) => {
        try {
            // Add username prefix to filename
            const namePrefix = userName ? `${userName}-` : "";
            const fullFileName = `${namePrefix}${fileName}`;
            
            console.log(`📤 Attempting to save: ${fullFileName}`);
            
            // Send to backend server
            const response = await fetch('http://localhost:5000/api/save-blob?filename=' + encodeURIComponent(fullFileName), {
                method: 'POST',
                body: blob,
                headers: {
                    'Content-Type': 'application/octet-stream'
                }
            });

            if (response.ok) {
                const data = await response.json();
                console.log('✅ File saved successfully:', data.message);
                return;
            } else {
                console.error('❌ Save failed, status:', response.status);
            }
        } catch (err) {
            console.error('❌ Error saving to backend:', err);
        }

        // Fallback: download to browser
        console.log('📥 Falling back to browser download...');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    // Draw 4 videos simultaneously on a canvas with the selected frame overlay
    const drawVideosOnCanvas = (ctx, videoElements, canvasWidth, canvasHeight, frameImg, xOffset = 0) => {
        // Clear with black background
        ctx.fillStyle = '#000';
        ctx.fillRect(xOffset, 0, canvasWidth, canvasHeight);

        // Draw each video in its slot with clipping
        videoElements.forEach((item) => {
            const slot = slots[item.slotIndex];
            const video = item.video;

            if (slot && video.readyState >= 2) {
                const vw = video.videoWidth || SLOT_WIDTH;
                const vh = video.videoHeight || SLOT_HEIGHT;

                const scale = SLOT_WIDTH / vw;
                const drawH = vh * scale;
                const offsetY = drawH > SLOT_HEIGHT ? (SLOT_HEIGHT - drawH) / 2 : 0;

                ctx.save();
                ctx.beginPath();
                ctx.rect(xOffset + slot.x, slot.y, SLOT_WIDTH, SLOT_HEIGHT);
                ctx.clip();
                ctx.drawImage(video, xOffset + slot.x, slot.y + offsetY, SLOT_WIDTH, drawH);
                ctx.restore();
            }
        });

        // Draw frame on top
        if (frameImg) {
            ctx.drawImage(frameImg, xOffset, 0, canvasWidth, canvasHeight);
        }
    };

    // Start live video preview on the dedicated preview canvas
    const startVideoPreview = async () => {
        if (!frameImgRef.current) return;

        // Stop any previous preview
        stopVideoPreview();

        const frameImg = frameImgRef.current;
        const canvasWidth = frameImg.width;
        const canvasHeight = frameImg.height;

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

        if (videoElements.length === 0) {
            console.log('No videos available for preview');
            return;
        }

        videoPreviewElementsRef.current = videoElements;

        // Wait for all videos to be ready
        await Promise.all(videoElements.map(item =>
            new Promise(resolve => {
                if (item.video.readyState >= 3) { resolve(); return; }
                item.video.addEventListener('canplay', resolve, { once: true });
                item.video.load();
            })
        ));

        // Play all videos
        await Promise.all(videoElements.map(item => item.video.play().catch(() => {})));

        setVideoPreviewReady(true);

        // Animate dual video strip preview
        const previewCanvas = videoPreviewCanvasRef.current;
        if (!previewCanvas) return;
        previewCanvas.width = canvasWidth * 2;
        previewCanvas.height = canvasHeight;
        const ctx = previewCanvas.getContext('2d');

        const animate = () => {
            drawVideosOnCanvas(ctx, videoElements, canvasWidth, canvasHeight, frameImg, 0);
            drawVideosOnCanvas(ctx, videoElements, canvasWidth, canvasHeight, frameImg, canvasWidth);
            videoPreviewAnimRef.current = requestAnimationFrame(animate);
        };
        videoPreviewAnimRef.current = requestAnimationFrame(animate);
    };

    const stopVideoPreview = () => {
        if (videoPreviewAnimRef.current) {
            cancelAnimationFrame(videoPreviewAnimRef.current);
            videoPreviewAnimRef.current = null;
        }
        videoPreviewElementsRef.current.forEach(item => {
            item.video.pause();
            URL.revokeObjectURL(item.video.src);
            if (document.body.contains(item.video)) {
                document.body.removeChild(item.video);
            }
        });
        videoPreviewElementsRef.current = [];
        setVideoPreviewReady(false);
    };

    const createCombinedVideoFrame = async () => {
        return new Promise(async (resolve) => {
            try {
                if (!frameImgRef.current || !selectedFrame) {
                    console.log('No frame selected for video');
                    resolve(null);
                    return;
                }

                const frameImg = frameImgRef.current;
                const videoDuration = 5; // seconds
                const canvasWidth = frameImg.width;
                const canvasHeight = frameImg.height;
                const combinedWidth = canvasWidth * 2;

                const recordCanvas = document.createElement('canvas');
                recordCanvas.width = combinedWidth;
                recordCanvas.height = canvasHeight;
                const ctx = recordCanvas.getContext('2d');

                // Create video elements for recording
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

                if (videoElements.length === 0) {
                    console.log('No videos to combine');
                    resolve(null);
                    return;
                }

                // Wait for videos to load
                await Promise.all(videoElements.map(item =>
                    new Promise(r => {
                        if (item.video.readyState >= 3) { r(); return; }
                        item.video.addEventListener('canplay', r, { once: true });
                        item.video.load();
                    })
                ));

                // Start recording canvas stream
                const stream = recordCanvas.captureStream(30);
                const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
                    ? 'video/webm;codecs=vp9'
                    : 'video/webm';
                const mediaRecorder = new MediaRecorder(stream, { mimeType });
                const chunks = [];

                mediaRecorder.ondataavailable = (e) => {
                    if (e.data.size > 0) chunks.push(e.data);
                };

                mediaRecorder.onstop = () => {
                    const blob = new Blob(chunks, { type: 'video/webm' });
                    videoElements.forEach(item => {
                        item.video.pause();
                        URL.revokeObjectURL(item.video.src);
                        if (document.body.contains(item.video)) document.body.removeChild(item.video);
                    });
                    console.log('✅ Combined video with frame created');
                    resolve(blob);
                };

                // Play all videos simultaneously then start recording
                await Promise.all(videoElements.map(item => item.video.play().catch(() => {})));
                mediaRecorder.start();

                const frameInterval = setInterval(() => {
                    // KIRI: video strip
                    drawVideosOnCanvas(ctx, videoElements, canvasWidth, canvasHeight, frameImg, 0);
                    // KANAN: video strip (duplikat)
                    drawVideosOnCanvas(ctx, videoElements, canvasWidth, canvasHeight, frameImg, canvasWidth);
                }, 1000 / 30);

                setTimeout(() => {
                    clearInterval(frameInterval);
                    videoElements.forEach(item => item.video.pause());
                    mediaRecorder.stop();
                }, videoDuration * 1000);

            } catch (err) {
                console.error('❌ Error creating combined video frame:', err);
                resolve(null);
            }
        });
    };


    // Buat URL foto strip yang diduplikat (foto | foto)
    const createDuplicatedPhotoUrl = () => {
        const photoCanvas = canvasRef.current;
        if (!photoCanvas) return null;
        const dupCanvas = document.createElement('canvas');
        dupCanvas.width = photoCanvas.width * 2;
        dupCanvas.height = photoCanvas.height;
        const ctx = dupCanvas.getContext('2d');
        ctx.drawImage(photoCanvas, 0, 0);
        ctx.drawImage(photoCanvas, photoCanvas.width, 0);
        return dupCanvas.toDataURL('image/png');
    };

    // Klik Finish → buat foto & video gabungan, lalu tampilkan preview
    const resultVideoBlobRef = useRef(null);

    const handleFinish = async () => {
        setIsSaving(true);

        // Buat foto duplikat untuk preview
        const photoUrl = createDuplicatedPhotoUrl();
        setResultPhotoUrl(photoUrl);

        // Buat video duplikat (gabungan) untuk preview
        const videoBlob = await createCombinedVideoFrame();
        if (videoBlob) {
            resultVideoBlobRef.current = videoBlob;
            setResultVideoUrl(URL.createObjectURL(videoBlob));
        }

        setIsSaving(false);
        setShowResult(true);
    };

    // Klik Finish di halaman preview → simpan lalu reset
    const handleFinishFromResult = async () => {
        setIsSaving(true);
        console.log('🎬 Saving files...');

        // Simpan foto duplikat (PNG)
        if (resultPhotoUrl) {
            const blob = dataUrlToBlob(resultPhotoUrl);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            await saveFileToResultsFolder(`photo-${timestamp}.png`, blob);
        }

        // Simpan video duplikat (WebM) — sudah dibuat sebelumnya
        if (resultVideoBlobRef.current) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            await saveFileToResultsFolder(`video-${timestamp}.webm`, resultVideoBlobRef.current);
        }

        console.log('✅ Files saved!');

        // Cleanup
        stopVideoPreview();
        if (resultVideoUrl) {
            URL.revokeObjectURL(resultVideoUrl);
        }
        resultVideoBlobRef.current = null;

        // Reset all state
        setIsSaving(false);
        setShowResult(false);
        setResultPhotoUrl(null);
        setResultVideoUrl(null);
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
        setAllPhotosTaken(false);
        setVideoPreviewReady(false);
        setShowRetakeCamera(false);
    };

    const showRetakeButton = selectedPhotoIndex !== null && photos[selectedPhotoIndex];

    // Auto-start/stop video preview based on allPhotosTaken
    useEffect(() => {
        if (allPhotosTaken && Object.keys(allVideoBlobs.current).length > 0) {
            startVideoPreview();
        } else {
            stopVideoPreview();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allPhotosTaken]);



    return (
        <div style={centerCol}>
            <div style={topBar}>
                {selectedFrame && (
                    <button
                        style={{
                            ...buttonStyle,
                            position: "absolute",
                            left: 0,
                            top: 10,
                            height: 40,
                            padding: "0 16px",
                            lineHeight: "40px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                        onClick={handleBack}
                    > ← Back</button>
                )}

                {sessionStarted && (
                    <div style={{
                        position: "absolute",
                        right: 0,
                        top: 10,
                        padding: "12px 22px",
                        borderRadius: 999,
                        background: "#fff0f4",
                        border: "2px solid #ff7aa2",
                        color: "#8c5b4a",
                        fontWeight: "bold",
                        fontSize: 32,
                        minWidth: 110,
                        textAlign: "center",
                        boxShadow: "0 8px 18px rgba(255, 122, 162, 0.2)",
                    }}>
                        {formatTime(sessionTimeLeft)}
                    </div>
                )}

                {/* ============================================================
                     📝 NAMA PHOTOBOOTH — Ganti teks di bawah ini:
                     Teks pada h1 di bawah adalah judul yang tampil di halaman
                     - Baris pertama  : teks saat pilih frame
                     - Baris kedua    : teks saat sesi foto
                     - Baris ketiga   : teks saat mode decorate/review
                ============================================================ */}
                <h1 style={titleBar}>
                    {!selectedFrame
                        ? "₊✩‧₊˚ Select a frame౨ৎ ˚₊✩‧₊"      // ← GANTI: judul utama / nama photobooth
                        : mode === "photo"
                            ? "⋆｡‧˚ʚ Smile :)ɞ˚‧｡⋆"            // ← GANTI: teks saat ambil foto
                            : ". ݁₊ ⊹ . ݁Let's decorate . ⊹ ₊ ݁."}  {/* ← GANTI: teks saat review */}
                </h1>
            </div>

            <div style={mainContent} >
                {!selectedFrame ? (
                    !sessionStarted ? (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
                            <button style={{ ...buttonStyle, fontSize: 24, padding: "12px 26px" }} onClick={handleStartSession}>
                                Start
                            </button>
                        </div>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
                            <div style={{ fontSize: 40, color: "#8c5b4a", fontWeight: "bold", marginTop: 10 }}>
                                Pilih frame kamu
                            </div>
                            <div style={{ display: "flex", gap: 24 }}>
                                {frameOptions.map((src) => {
                                    const isSelected = selectedFrame === src;

                                    return (
                                        <img
                                            key={src}
                                            src={src}
                                            alt="frame"
                                            onClick={() => {
                                                setSelectedFrame(src);
                                                setCanTakePhoto(true);
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.transform = "scale(1.08)";
                                                e.currentTarget.style.boxShadow = "0 12px 30px rgba(255,122,162,0.45)";
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.transform = "scale(1)";
                                                e.currentTarget.style.boxShadow = frameThumb.boxShadow;
                                            }}
                                            style={{
                                                ...frameThumb,
                                                width: 260,
                                                transform: isSelected ? "scale(1.08)" : "scale(1)",
                                                transition: "transform 0.25s ease, box-shadow 0.25s ease",
                                                boxShadow: isSelected ? "0 12px 30px rgba(255,122,162,0.45)" : frameThumb.boxShadow,
                                            }}
                                        />
                                    )
                                })}
                            </div>
                        </div>
                    )
                ) : (
                    <div style={{ ...row, justifyContent: "center", alignItems: "stretch" }}>

                        {/* LEFT PANEL */}
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start" }}>

                            {/* Kamera: tampil di mode photo ATAU saat retake di mode decorate */}
                            {(mode === "photo" || showRetakeCamera) && (
                                <>
                                    <div style={{ width: "100%", display: "flex", justifyContent: "center" }}>
                                        <div style={{ position: "relative", width: 980, maxWidth: "100%" }}>
                                            <Webcam
                                                audio={false}
                                                ref={webcamRef}
                                                screenshotFormat="image/png"
                                                videoConstraints={videoConstraints}
                                                mirrored={true}
                                                style={{ width: "100%", height: "100%", borderRadius: 18, objectFit: "cover" }}
                                            />
                                            {countdown != null && (
                                                <div style={{
                                                    position: "absolute", inset: 0,
                                                    display: "flex", alignItems: "center", justifyContent: "center",
                                                    fontSize: 96, fontWeight: "bold", color: "white",
                                                    textShadow: "0 4px 20px rgba(0,0,0,0.6)",
                                                    background: "rgba(0,0,0,0.25)", borderRadius: 12, pointerEvents: "none",
                                                }}>
                                                    {countdown}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
                                        {canTakePhoto && sessionStarted && (
                                            <button style={buttonStyle} onClick={capturePhoto}>
                                                {showRetakeCamera ? "📷 Ambil Foto" : "Take Photo"}
                                            </button>
                                        )}
                                        {photoCount > 0 && mode === "photo" && (
                                            <button style={{ ...buttonStyle, fontSize: 22, padding: "4px 10px" }} onClick={redoLastPhoto}>⟳</button>
                                        )}
                                        {showRetakeButton && mode === "photo" && (
                                            <button style={{ ...buttonStyle, background: "#fff0f4" }} onClick={retakeSelectedPhoto}>
                                                Retake selected
                                            </button>
                                        )}

                                    </div>
                                </>
                            )}

                            {/* Mode decorate: hint retake */}
                            {mode === "decorate" && !showRetakeCamera && (
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, paddingTop: 20 }}>
                                    {showRetakeButton ? (
                                        <div style={{ textAlign: "center" }}>
                                            <div style={{ fontSize: 14, color: "#8c5b4a", marginBottom: 10 }}>
                                                Foto dipilih — mau diganti?
                                            </div>
                                            <button style={{ ...buttonStyle, background: "#fff0f4", fontSize: 16 }}
                                                onClick={retakeSelectedPhoto}>
                                                📷 Retake foto ini
                                            </button>
                                        </div>
                                    ) : (
                                        <div style={{ fontSize: 13, color: "#b08a80", textAlign: "center", maxWidth: 300 }}>
                                            💡 Klik foto di strip untuk memilih dan retake
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* RIGHT PANEL: foto strip + video preview */}
                        <div style={{ display: "flex", flexDirection: "row", gap: 16, alignItems: "flex-start" }}>
                            {/* Photo strip canvas (Duplicated view) */}
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                                <div style={{ fontSize: 16, color: "#8c5b4a", marginBottom: 8, fontWeight: "bold", letterSpacing: 1 }}>📸 Foto</div>
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
                                            width: 290, height: 760,
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
                                                width: 290, height: 760,
                                                display: "block",
                                                borderLeft: "1px dashed rgba(255,122,162,0.3)",
                                            }}
                                        />
                                    )}
                                </div>
                            </div>

                            {/* Video preview (dual strip) */}
                            {allPhotosTaken && (
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                                    <div style={{ fontSize: 16, color: "#8c5b4a", marginBottom: 8, fontWeight: "bold", letterSpacing: 1 }}>🎬 Video</div>
                                    <div style={{ position: "relative", width: 580, height: 760, borderRadius: 14, overflow: "hidden", boxShadow: "0 10px 30px rgba(255,122,162,0.25)" }}>
                                        <canvas
                                            ref={videoPreviewCanvasRef}
                                            style={{
                                                width: 580, height: 760,
                                                display: "block",
                                            }}
                                        />
                                        {!videoPreviewReady && (
                                            <div style={{
                                                position: "absolute", inset: 0, display: "flex",
                                                alignItems: "center", justifyContent: "center",
                                                background: "rgba(255,255,255,0.85)",
                                                fontSize: 16, color: "#8c5b4a", fontWeight: "bold",
                                            }}>
                                                ⏳ Loading...
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Finish button */}
                            {mode === "decorate" && allPhotosTaken && (
                                <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 4 }}>
                                    <button
                                        style={{ ...buttonStyle, fontSize: 28, padding: "14px 30px" }}
                                        onClick={handleFinish}
                                    >
                                        ✅ Finish
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>


            {/* Name Input Modal */}
            {showNameInput && (
                <div style={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: "rgba(0, 0, 0, 0.6)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 999,
                }}>
                    <div style={{
                        background: "white",
                        padding: "40px",
                        borderRadius: 20,
                        textAlign: "center",
                        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
                        minWidth: 400,
                    }}>
                        <h2 style={{ margin: "0 0 20px 0", color: "#8c5b4a", fontSize: 28 }}>
                            Masukkan Nama Kamu
                        </h2>
                        
                        <input
                            type="text"
                            placeholder="Nama..."
                            value={userName}
                            onChange={(e) => {
                                setUserName(e.target.value);
                                setNameError("");
                            }}
                            onKeyPress={(e) => {
                                if (e.key === 'Enter') handleNameSubmit();
                            }}
                            style={{
                                width: "100%",
                                padding: "12px 16px",
                                fontSize: 18,
                                border: "2px solid #ff7aa2",
                                borderRadius: 10,
                                boxSizing: "border-box",
                                marginBottom: nameError ? 10 : 20,
                                fontFamily: "CantikaCute",
                            }}
                            autoFocus
                        />

                        {nameError && (
                            <div style={{
                                color: "#ff6b6b",
                                fontSize: 16,
                                marginBottom: 20,
                                fontWeight: "bold",
                            }}>
                                {nameError}
                            </div>
                        )}

                        <button
                            style={{
                                ...buttonStyle,
                                fontSize: 20,
                                padding: "12px 32px",
                                width: "100%",
                            }}
                            onClick={handleNameSubmit}
                        >
                            OK
                        </button>
                    </div>
                </div>
            )}

            {/* Result Page Overlay */}
            {showResult && (
                <div style={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: "linear-gradient(135deg, #fff5f7 0%, #ffe0e8 50%, #ffd6e0 100%)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 1000,
                    overflow: "auto",
                    padding: "30px 20px",
                }}>
                    <div style={{
                        fontSize: 36,
                        fontWeight: "bold",
                        color: "#8c5b4a",
                        marginBottom: 24,
                        textAlign: "center",
                        fontFamily: "CantikaCute",
                    }}>
                        ✨ Hasil Foto & Video ✨
                    </div>

                    <div style={{
                        display: "flex",
                        gap: 32,
                        alignItems: "flex-start",
                        justifyContent: "center",
                        flexWrap: "wrap",
                        maxWidth: 900,
                    }}>
                        {/* Foto Result */}
                        {resultPhotoUrl && (
                            <div style={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                gap: 10,
                            }}>
                                <div style={{
                                    fontSize: 18,
                                    color: "#8c5b4a",
                                    fontWeight: "bold",
                                    fontFamily: "CantikaCute",
                                }}>📸 Foto</div>
                                <img
                                    src={resultPhotoUrl}
                                    alt="Hasil Foto"
                                    style={{
                                        width: 380,
                                        borderRadius: 14,
                                        boxShadow: "0 10px 40px rgba(140, 91, 74, 0.25)",
                                        border: "3px solid #ff7aa2",
                                    }}
                                />
                            </div>
                        )}

                        {/* Video Result - video gabungan */}
                        {resultVideoUrl && (
                            <div style={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                gap: 10,
                            }}>
                                <div style={{
                                    fontSize: 18,
                                    color: "#8c5b4a",
                                    fontWeight: "bold",
                                    fontFamily: "CantikaCute",
                                }}>🎬 Video</div>
                                <video
                                    src={resultVideoUrl}
                                    autoPlay
                                    loop
                                    muted
                                    playsInline
                                    style={{
                                        width: 380,
                                        borderRadius: 14,
                                        boxShadow: "0 10px 40px rgba(140, 91, 74, 0.25)",
                                        border: "3px solid #ff7aa2",
                                    }}
                                />
                            </div>
                        )}
                    </div>

                    <button
                        style={{
                            ...buttonStyle,
                            fontSize: 28,
                            padding: "16px 50px",
                            marginTop: 32,
                            background: isSaving
                                ? "linear-gradient(135deg, #ccc, #ddd)"
                                : "linear-gradient(135deg, #ff7aa2, #ffb6c1)",
                            color: "white",
                            border: "none",
                            borderRadius: 16,
                            boxShadow: "0 8px 25px rgba(255, 122, 162, 0.4)",
                            transition: "transform 0.2s ease, box-shadow 0.2s ease",
                            opacity: isSaving ? 0.7 : 1,
                            cursor: isSaving ? "not-allowed" : "pointer",
                        }}
                        onClick={handleFinishFromResult}
                        disabled={isSaving}
                        onMouseEnter={(e) => {
                            if (!isSaving) {
                                e.currentTarget.style.transform = "scale(1.05)";
                                e.currentTarget.style.boxShadow = "0 12px 35px rgba(255, 122, 162, 0.5)";
                            }
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = "scale(1)";
                            e.currentTarget.style.boxShadow = "0 8px 25px rgba(255, 122, 162, 0.4)";
                        }}
                    >
                        {isSaving ? "⏳ Menyimpan..." : "✅ Finish"}
                    </button>
                </div>
            )}
        </div>
    )
}

// styles
const centerCol = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 20
};
const topBar = {
    width: 900,
    height: 80,
    position: "relative",
    marginBottom: 20,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
}
const buttonStyle = {
    padding: "10px 20px",
    fontSize: 20,
    cursor: "pointer",
    fontFamily: "CantikaCute",
    color: "#8c5b4a",
    border: "2px solid #8c5b4a",
    borderRadius: 8,
    background: "white"
};

const row = { display: "flex", gap: 50, alignItems: "flex-start" };
const frameThumb = {
    width: 240,
    cursor: "pointer",
    borderRadius: 14,
    boxShadow: "0 8px 8px rgba(0,0,0,0.15)"
};

const titleBar = {
    margin: 0,
    lineHeight: "80px",
    textAlign: "center",
    width: "100%",
    fontSize: 36,
}

const mainContent = {
    height: 700,
    width: 900,
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
}
