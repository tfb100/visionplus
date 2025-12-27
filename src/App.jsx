import React, { useRef, useEffect, useState } from 'react';
import DetectionEngine from './services/DetectionEngine';
import SpeechService from './services/SpeechService';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Camera as CameraIcon, Settings, Volume2, Mic, Pause, Play, AlertTriangle, RefreshCw, Terminal, HelpCircle, Navigation } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function App() {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [isModelLoaded, setIsModelLoaded] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [detailingMode, setDetailingMode] = useState('detailed');
    const [detections, setDetections] = useState([]);
    const [lastAnnouncementTime, setLastAnnouncementTime] = useState(0);
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
                addLog('Iniciando Vision+ Safety...');
                await DetectionEngine.load();
                setIsModelLoaded(true);
                addLog('IA de Segurança pronta.');
                await startCamera();
                SpeechService.speak('Sistema carregado. Alerta de travessia ativado.');
            } catch (err) {
                setError(`Erro: ${err.message}`);
                addLog(`ERRO: ${err.message}`);
            }
        };
        init();
    }, []);

    const startCamera = async () => {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(d => d.kind === 'videoinput');

            const constraints = {
                video: {
                    facingMode: videoDevices.length > 1 ? 'environment' : 'user',
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
            throw err;
        }
    };

    useEffect(() => {
        let animationFrame;
        const runDetection = async () => {
            if (videoRef.current && isModelLoaded && !isPaused && !error && videoRef.current.readyState === 4) {
                try {
                    const preds = await DetectionEngine.detect(videoRef.current);
                    setDetections(preds);
                    drawDetections(preds);
                    handleSpeechAndHaptics(preds);
                } catch (err) { }
            }
            animationFrame = requestAnimationFrame(runDetection);
        };

        if (isModelLoaded) runDetection();
        return () => cancelAnimationFrame(animationFrame);
    }, [isModelLoaded, isPaused, detailingMode, error]);

    const drawDetections = (preds) => {
        if (!canvasRef.current || !videoRef.current) return;
        const ctx = canvasRef.current.getContext('2d');
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
        const now = Date.now();

        // Safety Critical Check (Immediate)
        const critical = preds.find(p => p.isSafetyCritical && p.risk === 'high' && p.status === 'certain');
        if (critical && now - lastAnnouncementTime > 2000) {
            // Vibrate for danger
            await Haptics.impact({ style: ImpactStyle.Heavy });
            const msg = DetectionEngine.getDetailedDescription(critical);
            SpeechService.speak(msg, true); // Interrupt for safety
            setLastAnnouncementTime(now);
            return;
        }

        // Regular Announcement
        if (now - lastAnnouncementTime < 4500) return;

        if (preds.length > 0) {
            const sorted = [...preds].sort((a, b) => {
                if (a.isSafetyCritical && !b.isSafetyCritical) return -1;
                if (b.isSafetyCritical && !a.isSafetyCritical) return 1;
                return b.score - a.score;
            });

            const best = sorted[0];
            const announcement = DetectionEngine.getDetailedDescription(best);

            SpeechService.speak(announcement);
            setLastAnnouncementTime(now);
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div className={`status-dot ${isPaused ? 'paused' : 'active'}`} />
                        <span style={{ fontWeight: '800', letterSpacing: '0.5px' }}>VISION+ CROSSING</span>
                    </div>
                    <button onClick={() => setShowDebug(!showDebug)} className="debug-toggle">
                        <Terminal size={18} />
                    </button>
                </header>

                <main style={{ flex: 1, padding: '1rem', display: 'flex', flexDirection: 'column' }}>
                    {showDebug && (
                        <div className="debug-overlay">
                            <div className="log-list">
                                {debugLogs.map((log, i) => <div key={i} className="log-item">{log}</div>)}
                            </div>
                            <button
                                onClick={(e) => { e.stopPropagation(); SpeechService.speak('Teste de voz'); Haptics.vibrate(); }}
                                className="test-audio-btn"
                            >
                                Testar Voz e Vibração
                            </button>
                        </div>
                    )}

                    <div style={{ marginTop: 'auto' }}>
                        <AnimatePresence>
                            {detections.find(d => d.class === 'traffic light' && d.status === 'certain') && (
                                <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} className="safety-banner">
                                    <Navigation size={24} />
                                    <span>MODO TRAVESSIA: SEMÁFORO DETECTADO</span>
                                </motion.div>
                            )}

                            {detections.filter(d => d.risk === 'high').slice(0, 1).map((d, i) => (
                                <motion.div key={`risk-${i}`} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} className="risk-banner">
                                    <AlertTriangle size={24} />
                                    <span>ALERTA: {DetectionEngine.translate(d.class).toUpperCase()} PRÓXIMO</span>
                                </motion.div>
                            ))}

                            {detections.find(d => d.isFloorBarrier && d.status === 'certain' && d.risk !== 'high') && (
                                <motion.div key="barrier" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} className="barrier-banner">
                                    <AlertTriangle size={24} />
                                    <span>OBSTÁCULO NO CHÃO</span>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </main>

                <footer className="control-panel">
                    <button className={`control-btn ${isPaused ? 'active' : ''}`} onClick={() => setIsPaused(!isPaused)}>
                        {isPaused ? <Play fill="currentColor" size={28} /> : <Pause fill="currentColor" size={28} />}
                    </button>
                    <button className={`control-btn ${detailingMode === 'detailed' ? 'active' : ''}`} onClick={() => setDetailingMode(detailingMode === 'simple' ? 'detailed' : 'simple')}>
                        <Volume2 size={28} />
                    </button>
                </footer>
            </div>

            <style jsx>{`
        .status-dot { width: 12px; height: 12px; border-radius: 50%; }
        .active { background: #22c55e; box-shadow: 0 0 10px #22c55e; }
        .paused { background: #facc15; }
        
        .debug-overlay {
          background: rgba(0,0,0,0.8); border-radius: 12px; padding: 12px;
          font-family: monospace; color: #0f0; font-size: 10px;
        }
        
        .test-audio-btn {
          background: #22c55e; color: black; border: none; padding: 6px;
          border-radius: 4px; font-weight: bold; width: 100%; margin-top: 8px;
        }

        .risk-banner {
          background: #ef4444; color: white; padding: 18px; border-radius: 18px;
          font-weight: 900; display: flex; align-items: center; gap: 12px;
          border: 3px solid white; box-shadow: 0 10px 30px rgba(239, 68, 68, 0.6);
          margin-top: 10px;
        }

        .safety-banner {
          background: #22c55e; color: white; padding: 14px; border-radius: 14px;
          font-weight: bold; display: flex; align-items: center; gap: 12px;
          border: 2px solid white; box-shadow: 0 5px 20px rgba(34, 197, 94, 0.4);
        }

        .barrier-banner {
          background: #facc15; color: black; padding: 16px; border-radius: 16px;
          font-weight: 900; display: flex; align-items: center; gap: 12px;
          border: 3px solid black; box-shadow: 0 10px 20px rgba(250, 204, 21, 0.4);
          margin-top: 10px;
        }
      `}</style>
        </div>
    );
}

export default App;
