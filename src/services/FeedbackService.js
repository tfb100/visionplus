import { Haptics, ImpactStyle } from '@capacitor/haptics';

class FeedbackService {
    constructor() {
        this.audioCtx = null;
        this.isInitialized = false;
    }

    init() {
        if (this.isInitialized) return;
        try {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            this.isInitialized = true;
        } catch (e) {
            console.error('Web Audio API não suportada:', e);
        }
    }

    /**
     * Toca um bipe posicionado no espaço (L/R)
     * @param {number} panValue - Valor de -1 (total esquerda) a 1 (total direita)
     * @param {string} risk - 'high', 'medium', or 'low'
     */
    async playSpatialBeep(panValue, risk = 'low') {
        if (!this.isInitialized) this.init();
        if (!this.audioCtx) return;

        // Resume context if suspended (common in browsers)
        if (this.audioCtx.state === 'suspended') {
            await this.audioCtx.resume();
        }

        const oscillator = this.audioCtx.createOscillator();
        const gainNode = this.audioCtx.createGain();
        const panner = this.audioCtx.createStereoPanner();

        oscillator.type = 'sine';

        // Frequência baseada no risco
        // High Risk: Agudo e curto (Atenção imediata)
        // Low Risk: Grave e suave (Informação)
        if (risk === 'high') {
            oscillator.frequency.setValueAtTime(880, this.audioCtx.currentTime); // A5
            gainNode.gain.setValueAtTime(0.3, this.audioCtx.currentTime);
        } else if (risk === 'medium') {
            oscillator.frequency.setValueAtTime(440, this.audioCtx.currentTime); // A4
            gainNode.gain.setValueAtTime(0.15, this.audioCtx.currentTime);
        } else {
            oscillator.frequency.setValueAtTime(220, this.audioCtx.currentTime); // A3
            gainNode.gain.setValueAtTime(0.1, this.audioCtx.currentTime);
        }

        panner.pan.setValueAtTime(panValue, this.audioCtx.currentTime);

        oscillator.connect(panner);
        panner.connect(gainNode);
        gainNode.connect(this.audioCtx.destination);

        const duration = risk === 'high' ? 0.15 : 0.3;
        oscillator.start();
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);
        oscillator.stop(this.audioCtx.currentTime + duration);
    }

    /**
     * Toca áudio (Buffer) espacialmente (Melhor para Cloud TTS)
     */
    async playSpatialAudio(audioBuffer, panValue) {
        if (!this.audioCtx) return;
        const source = this.audioCtx.createBufferSource();
        source.buffer = audioBuffer;

        const panner = this.audioCtx.createStereoPanner();
        panner.pan.setValueAtTime(panValue, this.audioCtx.currentTime);

        source.connect(panner);
        panner.connect(this.audioCtx.destination);
        source.start();
    }

    /**
     * Executa vibrações baseadas no risco
     */
    async vibrateForRisk(risk) {
        try {
            if (risk === 'high') {
                // Alerta Crítico: Pulsos rápidos e fortes
                await Haptics.impact({ style: ImpactStyle.Heavy });
                setTimeout(() => Haptics.impact({ style: ImpactStyle.Heavy }), 150);
            } else if (risk === 'medium') {
                await Haptics.impact({ style: ImpactStyle.Medium });
            } else {
                await Haptics.impact({ style: ImpactStyle.Light });
            }
        } catch (e) {
            console.warn('Haptics não disponível');
        }
    }
}

export default new FeedbackService();
