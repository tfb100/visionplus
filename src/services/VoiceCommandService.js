class VoiceCommandService {
    constructor() {
        this.recognition = null;
        this.isListening = false;
        this.onCommand = null;

        if (typeof window !== 'undefined' && (window.webkitSpeechRecognition || window.speechRecognition)) {
            const SpeechRecognition = window.webkitSpeechRecognition || window.speechRecognition;
            this.recognition = new SpeechRecognition();
            this.recognition.lang = 'pt-BR';
            this.recognition.continuous = false;
            this.recognition.interimResults = false;

            this.recognition.onresult = (event) => {
                const command = event.results[0][0].transcript.toLowerCase();
                this.handleCommand(command);
            };

            this.recognition.onend = () => {
                this.isListening = false;
            };

            this.recognition.onerror = (event) => {
                console.error('Erro no reconhecimento de voz:', event.error);
                this.isListening = false;
            };
        }
    }

    startListening(callback) {
        if (!this.recognition || this.isListening) return;
        this.onCommand = callback;
        this.isListening = true;
        try {
            this.recognition.start();
        } catch (e) {
            console.error('Falha ao iniciar reconhecimento:', e);
            this.isListening = false;
        }
    }

    handleCommand(text) {
        console.log('Comando recebido:', text);

        if (text.includes('rua') || text.includes('externo') || text.includes('fora')) {
            if (this.onCommand) this.onCommand('street');
        } else if (text.includes('interno') || text.includes('casa') || text.includes('dentro')) {
            if (this.onCommand) this.onCommand('indoor');
        } else if (text.includes('leitura') || text.includes('ler') || text.includes('texto')) {
            if (this.onCommand) this.onCommand('reading');
        }
    }
}

export default new VoiceCommandService();
