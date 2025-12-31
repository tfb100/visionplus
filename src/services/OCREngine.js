import { createWorker } from 'tesseract.js';

class OCREngine {
    constructor() {
        this.worker = null;
        this.isLoaded = false;
        this.isProcessing = false;
    }

    async load() {
        if (this.isLoaded) return;
        try {
            this.worker = await createWorker('por'); // Inicia com Português
            this.isLoaded = true;
            console.log('OCR Engine carregada');
        } catch (e) {
            console.error('Falha ao carregar Tesseract:', e);
        }
    }

    async recognize(imageSource) {
        if (!this.isLoaded || this.isProcessing) return null;

        this.isProcessing = true;
        try {
            const { data: { text } } = await this.worker.recognize(imageSource);
            this.isProcessing = false;
            return text.trim();
        } catch (e) {
            console.error('Erro no OCR:', e);
            this.isProcessing = false;
            return null;
        }
    }

    async terminate() {
        if (this.worker) {
            await this.worker.terminate();
            this.isLoaded = false;
        }
    }
}

export default new OCREngine();
