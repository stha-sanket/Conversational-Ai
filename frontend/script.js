document.addEventListener("DOMContentLoaded", () => {
    const recordBtn = document.getElementById("record-btn");
    const statusText = document.getElementById("status-text");
    const languageSelect = document.getElementById("language");
    const finalTextElement = document.getElementById("final-text");
    const interimTextElement = document.getElementById("interim-text");
    const copyBtn = document.getElementById("copy-btn");
    const clearBtn = document.getElementById("clear-btn");
    const btnText = recordBtn.querySelector(".btn-text");
    const clearHistoryBtn = document.getElementById("clear-history-btn");

    let isRecording = false;
    let finalTranscript = "";
    let globalStream = null;

    // -- Background Audio Recording (For History) --
    let backgroundRecorder = null;
    let backgroundChunks = [];

    // -- Web Speech API Variables --
    let recognition = null;
    window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    // -- Vosk (Web Audio API / WebSocket) Variables --
    let websocket = null;
    let audioContext = null;
    let processor = null;

    // -----------------------------------------
    // INDEXEDDB SETUP (FOR HISTORY)
    // -----------------------------------------
    const dbName = "SpeechHistoryDB";
    const storeName = "history";
    let db;

    const initDB = () => new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onerror = () => reject("IndexedDB failed");
        request.onsuccess = (e) => {
            db = e.target.result;
            loadHistory();
            resolve();
        };
        request.onupgradeneeded = (e) => {
            db = e.target.result;
            if (!db.objectStoreNames.contains(storeName)) {
                db.createObjectStore(storeName, { keyPath: "id" });
            }
        };
    });

    initDB().catch(console.error);

    function saveHistoryItem(record) {
        if (!db) return;
        const tx = db.transaction([storeName], "readwrite");
        const store = tx.objectStore(storeName);
        store.add(record);
        tx.oncomplete = () => loadHistory();
    }

    function loadHistory() {
        if (!db) return;
        const tx = db.transaction([storeName], "readonly");
        const store = tx.objectStore(storeName);
        const request = store.getAll();
        request.onsuccess = () => renderHistory(request.result);
    }

    function clearHistory() {
        if (!db) return;
        const tx = db.transaction([storeName], "readwrite");
        const store = tx.objectStore(storeName);
        store.clear();
        tx.oncomplete = () => loadHistory();
    }

    function renderHistory(items) {
        const list = document.getElementById("history-list");
        const section = document.getElementById("history-section");
        
        if (items.length === 0) {
            section.style.display = "none";
            return;
        }
        
        section.style.display = "flex";
        list.innerHTML = "";
        
        items.sort((a, b) => b.id - a.id).forEach(item => {
            const audioUrl = URL.createObjectURL(item.audio);
            
            const div = document.createElement("div");
            div.className = "history-item";
            div.innerHTML = `
                <div class="history-item-header">
                    <span>${item.date}</span>
                    <span>${item.language}</span>
                </div>
                <div class="history-item-text">${item.text}</div>
                <audio controls src="${audioUrl}"></audio>
            `;
            list.appendChild(div);
        });
    }

    clearHistoryBtn.addEventListener("click", () => {
        if (confirm("Are you sure you want to clear all recording history?")) {
            clearHistory();
        }
    });

    // -----------------------------------------
    // HYBRID RECORDING LOGIC
    // -----------------------------------------
    async function startRecording() {
        isRecording = true;
        recordBtn.classList.add("recording");
        btnText.innerText = "Stop Recording";
        statusText.innerText = "Connecting...";
        
        // Always get mic stream to record audio for history
        try {
            globalStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err) {
            console.error("Error accessing microphone:", err);
            statusText.innerText = "Microphone access denied.";
            stopRecording();
            return;
        }

        // Start background recording
        backgroundChunks = [];
        backgroundRecorder = new MediaRecorder(globalStream);
        backgroundRecorder.ondataavailable = e => {
            if (e.data.size > 0) backgroundChunks.push(e.data);
        };
        backgroundRecorder.onstop = () => {
            const textToSave = finalTranscript.trim();
            if (textToSave.length > 0) {
                const audioBlob = new Blob(backgroundChunks, { type: 'audio/webm' });
                saveHistoryItem({
                    id: Date.now(),
                    date: new Date().toLocaleString(),
                    text: textToSave,
                    audio: audioBlob,
                    language: languageSelect.options[languageSelect.selectedIndex].text
                });
            }
        };
        backgroundRecorder.start();

        const selectedLang = languageSelect.value;
        
        // If Nepali, use the browser's built-in Web Speech API
        if (selectedLang === "ne-NP") {
            startWebSpeechAPI(selectedLang);
        } 
        // If English, use the Python Vosk WebSocket backend
        else {
            startVoskAPI();
        }
    }

    function stopRecording() {
        isRecording = false;
        recordBtn.classList.remove("recording");
        btnText.innerText = "Start Recording";
        
        if (statusText.innerText === "Listening..." || statusText.innerText.includes("API")) {
            statusText.innerText = "Click to start";
        }

        // Stop background recording
        if (backgroundRecorder && backgroundRecorder.state !== "inactive") {
            backgroundRecorder.stop();
        }

        // Stop Web Speech API
        if (recognition) {
            recognition.stop();
        }

        // Stop Vosk Web Audio API
        if (processor) {
            processor.disconnect();
            processor = null;
        }
        if (audioContext) {
            audioContext.close();
            audioContext = null;
        }
        if (websocket) {
            websocket.close();
            websocket = null;
        }

        // Release microphone
        if (globalStream) {
            globalStream.getTracks().forEach(track => track.stop());
            globalStream = null;
        }
        
        interimTextElement.innerHTML = "";
    }

    // -----------------------------------------
    // WEB SPEECH API (NEPALI)
    // -----------------------------------------
    function startWebSpeechAPI(lang) {
        if (!window.SpeechRecognition) {
            statusText.innerText = "Web Speech API not supported in this browser. Cannot do Nepali.";
            stopRecording();
            return;
        }

        recognition = new window.SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = lang;

        recognition.onstart = () => {
            statusText.innerText = "Listening... (Cloud API)";
        };

        recognition.onresult = (event) => {
            let interimTranscript = "";
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript + " ";
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }
            updateUI(finalTranscript, interimTranscript);
        };

        recognition.onerror = (event) => {
            console.error("Speech Recognition Error:", event.error);
            if (event.error !== "aborted") {
                statusText.innerText = "Error: " + event.error;
            }
        };

        recognition.onend = () => {
            // Auto-restart if we are still supposed to be recording
            if (isRecording) {
                try {
                    recognition.start();
                } catch (e) {
                    console.error("Restart failed", e);
                }
            }
        };

        try {
            recognition.start();
        } catch (e) {
            console.error(e);
        }
    }

    // -----------------------------------------
    // VOSK BACKEND API (ENGLISH)
    // -----------------------------------------
    function startVoskAPI() {
        websocket = new WebSocket("ws://localhost:8000/ws/transcribe");

        websocket.onopen = () => {
            statusText.innerText = "Listening... (Vosk Local API)";
            
            audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
            const source = audioContext.createMediaStreamSource(globalStream);
            processor = audioContext.createScriptProcessor(4096, 1, 1);

            const gainNode = audioContext.createGain();
            gainNode.gain.value = 0; // Prevent echo

            source.connect(processor);
            processor.connect(gainNode);
            gainNode.connect(audioContext.destination);

            processor.onaudioprocess = (e) => {
                if (websocket.readyState === WebSocket.OPEN) {
                    const inputData = e.inputBuffer.getChannelData(0);
                    const int16Data = new Int16Array(inputData.length);
                    for (let i = 0; i < inputData.length; i++) {
                        let s = Math.max(-1, Math.min(1, inputData[i]));
                        int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                    }
                    websocket.send(int16Data.buffer);
                }
            };
        };

        websocket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            if (data.text !== undefined && data.text !== "") {
                finalTranscript += data.text + " ";
                updateUI(finalTranscript, "");
            } else if (data.partial !== undefined) {
                updateUI(finalTranscript, data.partial);
            }
        };

        websocket.onerror = (error) => {
            console.error("WebSocket Error:", error);
            statusText.innerText = "Connection error. Is Python backend running?";
            stopRecording();
        };
    }

    // -----------------------------------------
    // UI HANDLERS
    // -----------------------------------------
    function updateUI(finalText, interimText) {
        finalTextElement.innerHTML = finalText;
        interimTextElement.innerHTML = interimText;
        
        const outputBox = document.getElementById("output-box");
        outputBox.scrollTop = outputBox.scrollHeight;

        if (finalText || interimText) {
            outputBox.style.setProperty('--placeholder-display', 'none');
        } else {
            outputBox.style.removeProperty('--placeholder-display');
        }
    }

    recordBtn.addEventListener("click", () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    });

    languageSelect.addEventListener("change", () => {
        if (isRecording) {
            stopRecording();
            setTimeout(() => {
                startRecording();
            }, 500);
        }
    });

    copyBtn.addEventListener("click", () => {
        const textToCopy = finalTranscript.trim();
        if (!textToCopy) return;

        navigator.clipboard.writeText(textToCopy).then(() => {
            const originalIcon = copyBtn.innerText;
            copyBtn.innerText = "✅";
            setTimeout(() => { copyBtn.innerText = originalIcon; }, 2000);
        });
    });

    clearBtn.addEventListener("click", () => {
        finalTranscript = "";
        updateUI("", "");
    });
});