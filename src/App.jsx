import React, { useRef, useEffect, useState } from 'react';
import DetectionEngine from './services/DetectionEngine';
import SpeechService from './services/SpeechService';
import FeedbackService from './services/FeedbackService';
import OCREngine from './services/OCREngine';
import VoiceCommandService from './services/VoiceCommandService';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Camera as CameraIcon, Settings, Volume2, Mic, Pause, Play, AlertTriangle, RefreshCw, Terminal, HelpCircle, Navigation, Home, Map, Type, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function App() {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [isModelLoaded, setIsModelLoaded] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [appMode, setAppMode] = useState('street'); // 'street' or 'indoor'
    const [detections, setDetections] = useState([]);
    const [facingMode, setFacingMode] = useState('environment'); // Default to back camera
    const [lastAnnouncements, setLastAnnouncements] = useState({}); // Track last voice for each class
    const [detectionInterval, setDetectionInterval] = useState(100); // Adaptive interval in ms
    const [consecutiveEmptyFrames, setConsecutiveEmptyFrames] = useState(0);
    const [isOCRProcessing, setIsOCRProcessing] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [error, setError] = useState(null);
    const [debugLogs, setDebugLogs] = useState([]);
    const [showDebug, setShowDebug] = useState(false);

    const addLog = (msg) => {
        console.log(msg);
        setDebugLogs(prev => [...prev.slice(-10), `${new Date().toLocaleTimeString()}: ${msg}`]);
    };

    useEffect(() => {
        const init = async () => {
            try {
                addLog('Iniciando Vision+ Master...');
                await Promise.all([
                    DetectionEngine.load(),
                    OCREngine.load()
                ]);
                setIsModelLoaded(true);
                addLog('IA e OCR prontos.');
                await startCamera();
                SpeechService.speak('Vision Plus pronto. Modo Rua ativado.', true);
            } catch (err) {
                setError(`Erro: ${err.message}`);
                addLog(`ERRO: ${err.message}`);
            }
        };
        init();
    }, []);

    const toggleMode = () => {
        let newMode;
        if (appMode === 'street') newMode = 'indoor';
        else if (appMode === 'indoor') newMode = 'reading';
        else newMode = 'street';

        setAppMode(newMode);
        const msgs = {
            'street': 'Modo Rua ativado',
            'indoor': 'Modo Interno ativado',
            'reading': 'Modo Leitura ativado. Aponte para o texto.'
        };
        SpeechService.speak(msgs[newMode], true);
        addLog(msgs[newMode]);
    };

    const performOCR = async () => {
        if (isOCRProcessing || !videoRef.current) return;

        setIsOCRProcessing(true);
        SpeechService.speak('Lendo...', true);

        // Use a canvas to capture the current frame
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = videoRef.current.videoWidth;
        tempCanvas.height = videoRef.current.videoHeight;
        const ctx = tempCanvas.getContext('2d');
        ctx.drawImage(videoRef.current, 0, 0);

        const text = await OCREngine.recognize(tempCanvas);
        setIsOCRProcessing(false);

        if (text && text.length > 3) {
            addLog(`OCR: ${text}`);
            SpeechService.speak(text);
        } else {
            SpeechService.speak('Nenhum texto identificado.', true);
        }
    };

    const startVoiceCommand = () => {
        if (isListening) return;

        setIsListening(true);
        FeedbackService.playSpatialBeep(0, 'medium'); // Beep central para indicar escuta

        VoiceCommandService.startListening((newMode) => {
            setIsListening(false);
            if (newMode && newMode !== appMode) {
                setAppMode(newMode);
                const msgs = {
                    'street': 'Modo Rua ativado',
                    'indoor': 'Modo Interno ativado',
                    'reading': 'Modo Leitura ativado'
                };
                SpeechService.speak(msgs[newMode], true);
                addLog(`Voz: Mudando para ${newMode}`);
            }
        });

        // Timeout fallback if it ends without result
        setTimeout(() => setIsListening(false), 5000);
    };

    const toggleCamera = () => {
        const newFacingMode = facingMode === 'user' ? 'environment' : 'user';
        setFacingMode(newFacingMode);
        addLog(`Trocando para câmera ${newFacingMode === 'user' ? 'frontal' : 'traseira'}`);
        SpeechService.speak(`Câmera ${newFacingMode === 'user' ? 'frontal' : 'traseira'} ativada`, true);
    };

    const startCamera = async () => {
        try {
            // Stop any existing streams first
            if (videoRef.current && videoRef.current.srcObject) {
                videoRef.current.srcObject.getTracks().forEach(track => track.stop());
            }

            const constraints = {
                video: {
                    facingMode: facingMode,
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                }
            };

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.onloadedmetadata = () => videoRef.current.play();
            }
        } catch (err) {
            addLog(`Câmera: ${err.message}`);
            setError(`Erro de Câmera: ${err.message}`);
            // If environment fails, try user as fallback
            if (facingMode === 'environment') {
                setFacingMode('user');
            }
        }
    };

    useEffect(() => {
        if (isModelLoaded) startCamera();
    }, [facingMode]);

    useEffect(() => {
        let timeoutId;
        const runDetection = async () => {
            if (videoRef.current && isModelLoaded && !isPaused && !error && videoRef.current.readyState === 4) {
                try {
                    const preds = await DetectionEngine.detect(videoRef.current, appMode);
                    setDetections(preds);
                    drawDetections(preds);
                    handleSpeechAndHaptics(preds);

                    // Adaptive FPS Logic
                    const hasCritical = preds.some(p => p.isSafetyCritical);
                    const hasObjects = preds.length > 0;

                    if (hasCritical) {
                        setDetectionInterval(0); // Max speed
                        setConsecutiveEmptyFrames(0);
                    } else if (hasObjects) {
                        setDetectionInterval(300); // Normal economy
                        setConsecutiveEmptyFrames(0);
                    } else {
                        const newEmptyCount = consecutiveEmptyFrames + 1;
                        setConsecutiveEmptyFrames(newEmptyCount);
                        // If empty for more than 10 frames, slow down significantly
                        setDetectionInterval(newEmptyCount > 10 ? 1000 : 500);
                    }
                } catch (err) { }
            }
            timeoutId = setTimeout(() => {
                requestAnimationFrame(runDetection);
            }, detectionInterval);
        };

        if (isModelLoaded) runDetection();
        return () => clearTimeout(timeoutId);
    }, [isModelLoaded, isPaused, appMode, error, detectionInterval, consecutiveEmptyFrames]);

    const drawDetections = (preds) => {
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx || !videoRef.current) return;

        const vw = videoRef.current.clientWidth;
        const vh = videoRef.current.clientHeight;

        if (ctx.canvas.width !== vw || ctx.canvas.height !== vh) {
            ctx.canvas.width = vw;
            ctx.canvas.height = vh;
        }

        ctx.clearRect(0, 0, vw, vh);
        const scaleX = vw / videoRef.current.videoWidth;
        const scaleY = vh / videoRef.current.videoHeight;

        preds.forEach(p => {
            const [x, y, w, h] = p.bbox;
            let color = '#facc15';
            if (p.isSafetyCritical) color = '#ef4444';
            else if (p.status === 'uncertain' || p.status === 'unknown') color = '#9ca3af';
            else if (p.status === 'get_closer') color = '#3b82f6';

            ctx.strokeStyle = color;
            ctx.lineWidth = p.isSafetyCritical ? 6 : 3;
            ctx.strokeRect(x * scaleX, y * scaleY, w * scaleX, h * scaleY);
        });
    };

    const handleSpeechAndHaptics = async (preds) => {
        if (SpeechService.isSpeakingNow) return;

        const now = Date.now();
        const COOLDOWN_GLOBAL = 3500; // General wait between any speech
        const COOLDOWN_SAME_OBJECT = 10000; // Don't repeat same object too fast

        // Filter valid predictions
        const validPreds = preds.filter(p => p.status === 'certain' || p.status === 'get_closer');
        if (validPreds.length === 0) return;

        // Sort by Priority: Safety Critical > High Risk > Medium Risk > Low Risk
        const sorted = [...validPreds].sort((a, b) => {
            if (a.isSafetyCritical !== b.isSafetyCritical) return b.isSafetyCritical ? 1 : -1;
            const riskMap = { high: 3, medium: 2, low: 1 };
            return riskMap[b.risk] - riskMap[a.risk];
        });

        const best = sorted[0];
        const lastTime = lastAnnouncements[best.class] || 0;

        // Check if we should speak
        const timeSinceLastSpeech = now - (lastAnnouncements._lastGlobalTime || 0);
        const timeSinceSameObject = now - lastTime;

        if (timeSinceLastSpeech > COOLDOWN_GLOBAL && timeSinceSameObject > COOLDOWN_SAME_OBJECT) {
            // Spatial Feedback
            const [x, y, w, h] = best.bbox;
            const centerX = x + w / 2;
            const videoWidth = videoRef.current ? videoRef.current.videoWidth : 640;
            const panValue = (centerX / (videoWidth / 2)) - 1; // Normalize to -1 to 1

            // Trigger Spatial Beep and Vibration
            FeedbackService.playSpatialBeep(panValue, best.risk);
            FeedbackService.vibrateForRisk(best.risk);

            const announcement = DetectionEngine.getDetailedDescription(best, appMode);
            SpeechService.speak(announcement);

            setLastAnnouncements(prev => ({
                ...prev,
                [best.class]: now,
                _lastGlobalTime: now
            }));
        }
    };

    return (
        <div className="app-container">
            <div className="camera-container" onClick={() => setShowDebug(!showDebug)}>
                <video ref={videoRef} autoPlay playsInline muted />
                <canvas ref={canvasRef} />
            </div>

            <div className="overlay">
                <header className="status-bar">
                    <div className="mode-indicator" onClick={toggleMode}>
                        {appMode === 'street' ? <Map size={20} /> : <Home size={20} />}
                        <span>MODO {appMode === 'street' ? 'RUA' : 'INTERNO'}</span>
                    </div>
                    <button onClick={() => setShowDebug(!showDebug)} className="debug-toggle">
                        <Terminal size={18} />
                    </button>
                    <button onClick={startVoiceCommand} className={`voice-cmd-btn ${isListening ? 'listening' : ''}`}>
                        <Mic size={24} />
                    </button>
                </header>

                <main className="main-content">
                    {showDebug && (
                        <div className="debug-overlay">
                            <div className="log-list">
                                {debugLogs.map((log, i) => <div key={i} className="log-item">{log}</div>)}
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); Haptics.vibrate(); toggleMode(); }} className="test-audio-btn">
                                Testar Feedback
                            </button>
                        </div>
                    )}

                    <div className="banner-anchor">
                        <AnimatePresence>
                            {appMode === 'street' && detections.find(d => d.class === 'traffic light' && d.status === 'certain') && (
                                <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} className="safety-banner">
                                    <Navigation size={24} />
                                    <span>TRAVESSIA ATIVA</span>
                                </motion.div>
                            )}

                            {detections.find(d => d.isFloorBarrier && d.status === 'certain') && (
                                <motion.div key="barrier" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} className="barrier-banner">
                                    <AlertTriangle size={24} />
                                    <span>OBSTÁCULO À FRENTE</span>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </main>

                <footer className="control-panel">
                    <button className="control-btn mode-switch" onClick={toggleMode} aria-label="Trocar Modo">
                        {appMode === 'street' && <Map size={32} />}
                        {appMode === 'indoor' && <Home size={32} />}
                        {appMode === 'reading' && <Type size={32} />}
                        <span className="btn-label">Modo</span>
                    </button>

                    {appMode === 'reading' ? (
                        <button className={`control-btn action-btn ${isOCRProcessing ? 'loading' : ''}`} onClick={performOCR} aria-label="Ler Texto">
                            {isOCRProcessing ? <RefreshCw className="spin" size={32} /> : <Search size={32} />}
                            <span className="btn-label">Ler Agora</span>
                        </button>
                    ) : (
                        <button className="control-btn camera-switch" onClick={toggleCamera} aria-label="Trocar Câmeras">
                            <RefreshCw size={32} />
                            <span className="btn-label">Câmera</span>
                        </button>
                    )}

                    <button className={`control-btn ${isPaused ? 'active' : ''}`} onClick={() => setIsPaused(!isPaused)} aria-label="Pausar">
                        {isPaused ? <Play fill="currentColor" size={32} /> : <Pause fill="currentColor" size={32} />}
                        <span className="btn-label">{isPaused ? 'Resumir' : 'Pausar'}</span>
                    </button>
                </footer>
            </div>

            <style jsx>{`
                .status-bar { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: rgba(0,0,0,0.5); backdrop-filter: blur(8px); }
                .mode-indicator { display: flex; align-items: center; gap: 8px; font-weight: 800; color: #facc15; background: rgba(0,0,0,0.6); padding: 8px 16px; border-radius: 20px; border: 1px solid #facc15; }
                
                .main-content { flex: 1; padding: 1rem; display: flex; flexDirection: column; justify-content: space-between; }
                .banner-anchor { margin-top: auto; display: flex; flex-direction: column; gap: 10px; }

                .control-panel { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; padding: 12px; background: linear-gradient(to top, rgba(0,0,0,1), transparent); }
                .control-btn { height: 80px; background: rgba(30,30,30,0.8); border: 1px solid #444; border-radius: 16px; color: white; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; transition: all 0.2s; }
                .control-btn.active { background: #facc15; color: black; border-color: white; }
                .control-btn.mode-switch { background: rgba(59, 130, 246, 0.2); border-color: #3b82f6; }
                .control-btn.action-btn { background: #ef4444; border-color: white; font-weight: bold; }
                .btn-label { font-size: 11px; font-weight: bold; text-transform: uppercase; }

                .voice-cmd-btn { background: rgba(0,0,0,0.6); border: 2px solid #facc15; color: #facc15; border-radius: 50%; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; transition: all 0.3s; margin-left: 10px; }
                .voice-cmd-btn.listening { background: #ef4444; border-color: white; color: white; animation: pulse 1s infinite; scale: 1.1; }

                @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); } 70% { box-shadow: 0 0 0 15px rgba(239, 68, 68, 0); } 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); } }
                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

                .safety-banner { background: #22c55e; color: white; padding: 16px; border-radius: 16px; font-weight: bold; display: flex; align-items: center; gap: 12px; border: 2px solid white; box-shadow: 0 5px 20px rgba(34, 197, 94, 0.4); }
                .barrier-banner { background: #facc15; color: black; padding: 16px; border-radius: 16px; font-weight: 900; display: flex; align-items: center; gap: 12px; border: 2px solid black; box-shadow: 0 10px 20px rgba(250, 204, 21, 0.4); }
                
                .debug-overlay { background: rgba(0,0,0,0.8); border-radius: 12px; padding: 12px; font-family: monospace; color: #0f0; font-size: 10px; z-index: 100; }
                .test-audio-btn { background: #22c55e; color: black; border: none; padding: 8px; border-radius: 4px; font-weight: bold; width: 100%; margin-top: 8px; }
                .log-list { max-height: 100px; overflow-y: auto; }
            `}</style>
        </div>
    );
}

export default App;
