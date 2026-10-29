// Downmix and average into 16 kHz signed PCM in 100 ms packets. No audio playback.
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super(); this.enabled = true; this.sum = 0; this.count = 0; this.phase = 0;
    this.packet = new Int16Array(1600); this.index = 0;
    this.system = []; this.systemIndex = 0; this.mode = 'microphone';
    this.port.onmessage = ({ data }) => {
      if (data instanceof ArrayBuffer) {
        if (!this.enabled) return;
        const queued = this.system.reduce((n, packet) => n + packet.length, 0) - this.systemIndex;
        if (queued > 32000) { this.port.postMessage({ error: 'System audio processing cannot keep up. Stop and retry.' }); return; }
        this.system.push(new Int16Array(data));
      } else if (data?.mode) this.mode = data.mode;
      else if (data === 'flush') {
        // Native system capture may have one final partial packet after its pipe closes.
        while (this.system.length) this.emit(this.nextSystem() / (this.mode === 'both' ? 2 : 1));
        this.flush(); this.port.postMessage('flushed');
      } else {
        this.flush(); this.enabled = data === 'resume'; this.system = []; this.systemIndex = 0;
      }
    };
  }
  nextSystem() {
    if (!this.system.length) return 0;
    const value = this.system[0][this.systemIndex++] / 32768;
    if (this.systemIndex === this.system[0].length) { this.system.shift(); this.systemIndex = 0; }
    return value;
  }
  emit(value) {
    const sample = Math.max(-1, Math.min(1, value));
    this.packet[this.index++] = Math.round(sample * (sample < 0 ? 32768 : 32767));
    if (this.index === this.packet.length) { this.port.postMessage(this.packet.buffer, [this.packet.buffer]); this.packet = new Int16Array(1600); this.index = 0; }
  }
  flush() {
    if (this.index) { const packet = this.packet.slice(0, this.index); this.port.postMessage(packet.buffer, [packet.buffer]); this.index = 0; }
    this.sum = 0; this.count = 0; this.phase = 0;
  }
  process(inputs, outputs) {
    const channels = inputs[0];
    if (!this.enabled) return true;
    const frames = channels?.[0]?.length || outputs[0]?.[0]?.length || 128;
    for (let i = 0; i < frames; i++) {
      let value = 0;
      for (const channel of channels || []) value += channel[i] / channels.length;
      this.sum += value; this.count++; this.phase += 16000;
      if (this.phase >= sampleRate) {
        this.phase -= sampleRate;
        const mic = this.sum / this.count;
        this.emit(this.mode === 'system' ? this.nextSystem() : this.mode === 'both' ? (mic + this.nextSystem()) / 2 : mic);
        this.sum = 0; this.count = 0;
      }
    }
    return true;
  }
}
registerProcessor('pcm-capture', PcmCapture);
