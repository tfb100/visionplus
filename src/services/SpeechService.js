import { TextToSpeech } from '@capacitor-community/text-to-speech';

class SpeechService {
  constructor() {
    this.isNative = typeof window !== 'undefined' && !!window.Capacitor;
    this.synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    this.lang = 'pt-BR';
    this.rate = 1.0;
  }

  async speak(text, priority = false) {
    if (this.isSpeakingNow && !priority) return;

    this.isSpeakingNow = true;

    if (this.isNative) {
      try {
        await TextToSpeech.speak({
          text: text,
          lang: this.lang,
          rate: this.rate,
          category: 'ambient',
        });
        this.isSpeakingNow = false;
        return;
      } catch (e) {
        console.error('Native TTS failed, falling back to web:', e);
        this.isSpeakingNow = false;
      }
    }

    // Web Fallback
    if (this.synth) {
      if (priority) this.synth.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = this.lang;
      utterance.rate = this.rate;
      utterance.onend = () => {
        this.isSpeakingNow = false;
      };
      utterance.onerror = () => {
        this.isSpeakingNow = false;
      };

      this.synth.speak(utterance);
    } else {
      console.warn('TTS não disponível:', text);
      this.isSpeakingNow = false;
    }
  }

  setRate(rate) {
    this.rate = rate;
  }
}

export default new SpeechService();
