// ============================================
// ⚠️ UPDATE THIS EVERY TIME COLAB RESTARTS
// Paste the ngrok URL printed from Cell 7
// ============================================
const API_URL = " https://mechanistic-roguish-luke.ngrok-free.dev"; // ← CHANGE THIS
// ============================================

let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let recordingTimer = null;
let recordingSeconds = 0;
let audioBlob = null;
let stream = null;
let audioContext = null;
let analyser = null;
let animationId = null;
let currentAudioUrl = null;
let recordingMimeType = '';

const HEADERS = {
    'ngrok-skip-browser-warning': 'true',
    'User-Agent': 'NepglishConverter/1.0'
};

// ============================================
// INIT
// ============================================
window.addEventListener('load', async () => {
    console.log('🎤 Nepglish Converter loaded!');
    await checkConnection();
});

async function checkConnection() {
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    statusText.textContent = 'Connecting...';
    statusDot.className = 'status-dot';

    try {
        const response = await fetch(`${API_URL}/health`, {
            method: 'GET',
            headers: HEADERS,
            signal: AbortSignal.timeout(10000)
        });
        if (response.ok) {
            const data = await response.json();
            statusDot.className = 'status-dot connected';
            statusText.textContent = 'Connected ✓';
            console.log('✅ Backend connected!', data);
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (error) {
        statusDot.className = 'status-dot error';
        statusText.textContent = 'Not Connected ✗';
        console.error('❌ Connection failed:', error);
        showToast('❌ Backend not connected! Check Colab is running.', 'error');
    }
}

// ============================================
// RECORDING
// ============================================
async function toggleRecording() {
    if (isRecording) {
        stopRecording();
    } else {
        await startRecording();
    }
}

async function startRecording() {
    try {
        console.log('🎤 Requesting microphone...');

        const audioPlayer = document.getElementById('audioPlayer');
        audioPlayer.pause();
        audioPlayer.currentTime = 0;

        stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        setupVisualizer(stream);

        const mimeCandidates = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/ogg;codecs=opus',
            'audio/ogg',
            'audio/mp4'
        ];
        const chosenMimeType = mimeCandidates.find(type => MediaRecorder.isTypeSupported(type)) || '';

        mediaRecorder = chosenMimeType
            ? new MediaRecorder(stream, { mimeType: chosenMimeType })
            : new MediaRecorder(stream);

        recordingMimeType = mediaRecorder.mimeType || chosenMimeType;
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) audioChunks.push(event.data);
        };

        mediaRecorder.onstop = () => {
            cleanupStreamAndVisualizer();
            processRecording();
        };

        mediaRecorder.onerror = (event) => {
            showToast(`Recording error: ${event.error}`, 'error');
        };

        mediaRecorder.start(250);
        isRecording = true;
        updateRecordButton(true);

        recordingSeconds = 0;
        document.getElementById('timer').textContent = '00:00';
        document.getElementById('timer').classList.add('recording');

        recordingTimer = setInterval(() => {
            recordingSeconds++;
            const m = Math.floor(recordingSeconds / 60).toString().padStart(2, '0');
            const s = (recordingSeconds % 60).toString().padStart(2, '0');
            document.getElementById('timer').textContent = `${m}:${s}`;
        }, 1000);

        document.getElementById('results').style.display = 'none';
        document.getElementById('audioSection').style.display = 'none';
        document.getElementById('convertBtn').disabled = true;

        showToast('🎤 Recording... Speak now!', 'info');

    } catch (error) {
        if (error.name === 'NotAllowedError') {
            showToast('❌ Microphone access denied!', 'error');
        } else if (error.name === 'NotFoundError') {
            showToast('❌ No microphone found!', 'error');
        } else {
            showToast(`❌ Microphone error: ${error.message}`, 'error');
        }
    }
}

function stopRecording() {
    if (!isRecording) return;
    isRecording = false;
    updateRecordButton(false);

    if (recordingTimer) {
        clearInterval(recordingTimer);
        recordingTimer = null;
    }
    document.getElementById('timer').classList.remove('recording');

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        try {
            mediaRecorder.requestData();
            setTimeout(() => {
                if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                    mediaRecorder.stop();
                }
            }, 200);
        } catch (error) {
            cleanupStreamAndVisualizer();
        }
    } else {
        cleanupStreamAndVisualizer();
    }
}

function processRecording() {
    if (audioChunks.length === 0) {
        showToast('❌ No audio captured! Try again.', 'error');
        return;
    }

    const chunkType = audioChunks.find(chunk => chunk.type)?.type || '';
    const blobType = recordingMimeType || chunkType || 'audio/webm';

    audioBlob = new Blob(audioChunks, { type: blobType });

    if (audioBlob.size < 100) {
        showToast('⚠️ Recording too short! Speak longer.', 'error');
        audioBlob = null;
        return;
    }

    if (currentAudioUrl) URL.revokeObjectURL(currentAudioUrl);

    const audioUrl = URL.createObjectURL(audioBlob);
    currentAudioUrl = audioUrl;

    const audioPlayer = document.getElementById('audioPlayer');
    audioPlayer.pause();
    audioPlayer.currentTime = 0;
    audioPlayer.src = '';
    audioPlayer.load();

    setTimeout(() => {
        audioPlayer.src = audioUrl;
        audioPlayer.load();
    }, 100);

    document.getElementById('audioSection').style.display = 'block';
    document.getElementById('convertBtn').disabled = false;
    showToast('✅ Recording ready! Click ▶️ to play or ⚡ to convert', 'success');
}

function cleanupStreamAndVisualizer() {
    if (animationId) { cancelAnimationFrame(animationId); animationId = null; }
    if (audioContext) { audioContext.close().catch(() => {}); audioContext = null; }
    analyser = null;
    if (stream) { stream.getTracks().forEach(track => track.stop()); stream = null; }
    mediaRecorder = null;
    recordingMimeType = '';

    document.getElementById('visualizer').style.display = 'none';
    document.getElementById('visualizerPlaceholder').style.display = 'flex';
}

function updateRecordButton(recording) {
    const btn = document.getElementById('recordBtn');
    const icon = document.getElementById('recordIcon');
    const text = document.getElementById('recordText');
    if (recording) {
        btn.classList.add('recording');
        icon.textContent = '⏹️';
        text.textContent = 'Stop Recording';
    } else {
        btn.classList.remove('recording');
        icon.textContent = '🎤';
        text.textContent = 'Start Recording';
    }
}

// ============================================
// VISUALIZER
// ============================================
function setupVisualizer(stream) {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;

        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        const canvas = document.getElementById('visualizer');
        const ctx = canvas.getContext('2d');
        canvas.style.display = 'block';
        document.getElementById('visualizerPlaceholder').style.display = 'none';

        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);

        const width = rect.width;
        const height = rect.height;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        function draw() {
            animationId = requestAnimationFrame(draw);
            analyser.getByteFrequencyData(dataArray);
            ctx.fillStyle = '#0f0f1a';
            ctx.fillRect(0, 0, width, height);
            const barWidth = (width / bufferLength) * 2.5;
            let x = 0;
            for (let i = 0; i < bufferLength; i++) {
                const barHeight = (dataArray[i] / 255) * height * 0.9;
                const gradient = ctx.createLinearGradient(0, height - barHeight, 0, height);
                gradient.addColorStop(0, '#6366f1');
                gradient.addColorStop(0.5, '#a855f7');
                gradient.addColorStop(1, '#ec4899');
                ctx.fillStyle = gradient;
                ctx.fillRect(x, height - barHeight, barWidth, barHeight);
                x += barWidth + 1;
            }
        }
        draw();
    } catch (e) {
        console.warn('Visualizer error:', e);
    }
}

// ============================================
// CONVERT
// ============================================
async function convertSpeech() {
    if (!audioBlob) {
        showToast('❌ No recording! Please record first.', 'error');
        return;
    }

    document.getElementById('loading').style.display = 'block';
    document.getElementById('results').style.display = 'none';
    document.getElementById('convertBtn').disabled = true;
    document.getElementById('recordBtn').disabled = true;

    startLoadingAnimation();

    try {
        const extensionFromMime = (mime) => {
            if (!mime) return 'webm';
            if (mime.includes('mp4')) return 'mp4';
            if (mime.includes('ogg')) return 'ogg';
            if (mime.includes('wav')) return 'wav';
            return 'webm';
        };

        const formData = new FormData();
        const extension = extensionFromMime(audioBlob.type);
        formData.append('audio', audioBlob, `recording.${extension}`);

        const response = await fetch(`${API_URL}/convert`, {
            method: 'POST',
            headers: HEADERS,
            body: formData,
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({ detail: `Error ${response.status}` }));
            throw new Error(err.detail || `HTTP Error ${response.status}`);
        }

        const data = await response.json();
        displayResults(data);

    } catch (error) {
        console.error('❌ Conversion error:', error);
        document.getElementById('loading').style.display = 'none';
        document.getElementById('convertBtn').disabled = false;
        document.getElementById('recordBtn').disabled = false;
        showToast(`❌ ${error.message}`, 'error');
    }
}

let loadingInterval = null;

function startLoadingAnimation() {
    const steps = ['step1', 'step2', 'step3', 'step4'];
    let current = 0;
    const icons = { step1: '🎤', step2: '🧠', step3: '🔄', step4: '🕉️' };

    steps.forEach(id => {
        const el = document.getElementById(id);
        el.className = 'loading-step';
        el.querySelector('.step-icon').textContent = icons[id];
    });

    document.getElementById('step1').className = 'loading-step active';

    loadingInterval = setInterval(() => {
        const el = document.getElementById(steps[current]);
        el.className = 'loading-step done';
        el.querySelector('.step-icon').textContent = '✅';
        current++;
        if (current < steps.length) {
            document.getElementById(steps[current]).className = 'loading-step active';
        } else {
            clearInterval(loadingInterval);
        }
    }, 2000);
}

// ============================================
// DISPLAY RESULTS
// ============================================
function displayResults(data) {
    clearInterval(loadingInterval);
    document.getElementById('loading').style.display = 'none';
    document.getElementById('convertBtn').disabled = false;
    document.getElementById('recordBtn').disabled = false;

    document.getElementById('romanizedText').textContent = data.romanized || '—';
    document.getElementById('englishText').textContent = data.english || '—';
    document.getElementById('devanagariText').textContent = data.devanagari || '—';
    document.getElementById('detectedLang').textContent = capitalizeFirst(data.detected_language || 'unknown');
    document.getElementById('confidence').textContent = `${((data.confidence || 0) * 100).toFixed(0)}%`;

    document.getElementById('results').style.display = 'block';

    setTimeout(() => {
        document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);

    showToast('✅ Conversion complete!', 'success');
}

// ============================================
// UTILITIES
// ============================================
function copyText(elementId) {
    const text = document.getElementById(elementId).textContent;
    if (!text || text === '—') return;
    navigator.clipboard.writeText(text).then(() => {
        showToast('📋 Copied!', 'success');
    }).catch(() => {
        showToast('❌ Copy failed', 'error');
    });
}

function clearAll() {
    if (isRecording) stopRecording();
    cleanupStreamAndVisualizer();
    audioBlob = null;
    audioChunks = [];
    recordingSeconds = 0;
    document.getElementById('timer').textContent = '00:00';
    document.getElementById('timer').classList.remove('recording');
    document.getElementById('audioSection').style.display = 'none';
    document.getElementById('results').style.display = 'none';
    document.getElementById('loading').style.display = 'none';
    document.getElementById('convertBtn').disabled = true;
    document.getElementById('recordBtn').disabled = false;

    const audioPlayer = document.getElementById('audioPlayer');
    audioPlayer.pause();
    audioPlayer.currentTime = 0;
    audioPlayer.src = '';
    audioPlayer.load();

    if (currentAudioUrl) {
        URL.revokeObjectURL(currentAudioUrl);
        currentAudioUrl = null;
    }

    updateRecordButton(false);
    showToast('🗑️ Cleared!', 'info');
}

function recordAgain() {
    clearAll();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function showToast(message, type = 'info') {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}