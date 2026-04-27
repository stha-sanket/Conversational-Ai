import os
import json
import logging
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from vosk import Model, KaldiRecognizer

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# Allow CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 🔥 Load Vosk model ONCE (important)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "model", "model")

if not os.path.exists(MODEL_PATH):
    logger.error(f"Model folder not found at {MODEL_PATH}")
    model = None
else:
    logger.info("Loading Vosk model...")
    model = Model(MODEL_PATH)
    logger.info("Vosk model loaded successfully.")

@app.websocket("/ws/transcribe")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    if model is None:
        await websocket.send_text(json.dumps({"error": "Vosk model is not loaded on the server."}))
        await websocket.close(code=1011)
        return

    # AudioContext is configured to 16000 Hz on the frontend
    sample_rate = 16000
    recognizer = KaldiRecognizer(model, sample_rate)

    try:
        while True:
            # Receive audio chunk as binary data
            data = await websocket.receive_bytes()

            # Process audio chunk
            if recognizer.AcceptWaveform(data):
                # Final result for this chunk of speech
                result = recognizer.Result()
                await websocket.send_text(result)
            else:
                # Partial result
                partial = recognizer.PartialResult()
                await websocket.send_text(partial)

    except WebSocketDisconnect:
        logger.info("Client disconnected.")
    except Exception as e:
        logger.error(f"Error during transcription: {e}")
        try:
            await websocket.close()
        except:
            pass