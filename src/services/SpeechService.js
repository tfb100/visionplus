import { TextToSpeech } from '@capacitor-community/text-to-speech';

class SpeechService {
  constructor() {
    this.isNative = typeof window !== 'undefined' && !!window.Capacitor;
    this.synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    this.lang = 'pt-BR';
    this.rate = 1.0;
  }

  async speak(text, priority = false) {
    if (this.isNative) {
      try {
        await TextToSpeech.speak({
          text: text,
          lang: this.lang,
          rate: this.rate,
          category: 'ambient',
        });
        return;
      } catch (e) {
        console.error('Native TTS failed, falling back to web:', e);
      }
    }

    // Web Fallback
    if (this.synth) {
      if (priority) this.synth.cancel();
      if (this.synth.speaking && !priority) return;

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = this.lang;
      utterance.rate = this.rate;
      this.synth.speak(utterance);
    } else {
      console.warn('TTS não disponível:', text);
    }
  }

  setRate(rate) {
    this.rate = rate;
  }
}

export default new SpeechService();
