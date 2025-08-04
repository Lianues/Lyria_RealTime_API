import {css, CSSResultGroup, html, LitElement, svg, PropertyValues} from 'lit';
import {customElement, property, query, state} from 'lit/decorators.js';
import {classMap} from 'lit/directives/class-map.js';
import {styleMap} from 'lit/directives/style-map.js';
import {
  GoogleGenAI,
  type LiveMusicGenerationConfig,
  type LiveMusicServerMessage,
  type LiveMusicSession,
} from '@google/genai';
import {decode, decodeAudioData} from './utils';
import './overlay-scrollbar';

// --- Configuration ---
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  throw new Error("GEMINI_API_KEY is not set in the environment.");
}
const ai = new GoogleGenAI({
  apiKey: API_KEY,
  apiVersion: 'v1alpha',
});
const model = 'lyria-realtime-exp';

// --- Interfaces and Types ---
interface Prompt {
  readonly promptId: string;
  readonly color: string;
  text: string;
  weight: number;
}
type PlaybackState = 'stopped' | 'playing' | 'loading' | 'paused';

// --- Constants ---
const COLORS = ['#9900ff', '#5200ff', '#ff25f6', '#2af6de', '#ffdd28', '#3dffab', '#d8ff3e', '#d9b2ff'];

// --- Utility Functions ---
function throttle(func: (...args: any[]) => void, delay: number) {
  let lastCall = 0;
  return (...args: any[]) => {
    const now = Date.now();
    if (now - lastCall >= delay) {
      func(...args);
      lastCall = now;
    }
  };
}

function getUnusedRandomColor(usedColors: string[]): string {
  const availableColors = COLORS.filter((c) => !usedColors.includes(c));
  if (availableColors.length === 0) {
    return COLORS[Math.floor(Math.random() * COLORS.length)];
  }
  return availableColors[Math.floor(Math.random() * availableColors.length)];
}


// --- Web Components ---

@customElement('weight-slider')
class WeightSlider extends LitElement {
  @property({type: Number}) value = 0;
  @property({type: String}) color = '#000';
  @query('.scroll-container') private scrollContainer!: HTMLDivElement;

  private updateValueFromPosition(clientY: number) {
    const bounds = this.scrollContainer.getBoundingClientRect();
    const trackHeight = bounds.height;
    const relativeY = clientY - bounds.top;
    const normalizedValue = 1 - Math.max(0, Math.min(trackHeight, relativeY)) / trackHeight;
    this.value = normalizedValue * 2;
    this.dispatchEvent(new CustomEvent('input', {detail: this.value}));
  }

  private handlePointerDown(e: PointerEvent) {
    e.preventDefault();
    document.body.classList.add('dragging');
    this.updateValueFromPosition(e.clientY);
    const onMove = (ev: PointerEvent) => this.updateValueFromPosition(ev.clientY);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', () => {
      document.body.classList.remove('dragging');
      window.removeEventListener('pointermove', onMove);
    }, {once: true});
  }
  
  override render() {
    const thumbHeightPercent = (this.value / 2) * 100;
    return html`
      <div class="scroll-container" @pointerdown=${this.handlePointerDown}>
        <div class="slider-container">
          <div id="thumb" style=${styleMap({height: `${thumbHeightPercent}%`, backgroundColor: this.color})}></div>
        </div>
        <div class="value-display">${this.value.toFixed(2)}</div>
      </div>
    `;
  }
  static override styles = css`
    :host { cursor: ns-resize; position: relative; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 5px; }
    .scroll-container { width: 100%; flex-grow: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; }
    .value-display { font-size: 1.3vmin; color: #ccc; margin: 0.5vmin 0; user-select: none; text-align: center; }
    .slider-container { position: relative; width: 10px; height: 100%; background-color: #0009; border-radius: 4px; }
    #thumb { position: absolute; bottom: 0; left: 0; width: 100%; border-radius: 4px; box-shadow: 0 0 3px rgba(0,0,0,0.7); display: block; }
  `;
}

@customElement('prompt-controller')
class PromptController extends LitElement {
    @property({type: String, reflect: true}) promptId = '';
    @property({type: String}) text = '';
    @property({type: Number}) weight = 0;
    @property({type: String}) color = '';
    @query('.prompt-text') private textInput!: HTMLSpanElement;

    private dispatchPromptChange() {
        this.dispatchEvent(new CustomEvent('prompt-changed', {
            detail: { promptId: this.promptId, text: this.text, weight: this.weight, color: this.color },
            bubbles: true, composed: true
        }));
    }

    private updateText() {
        const newText = this.textInput.textContent?.trim();
        if (newText !== undefined && newText !== this.text) {
            this.text = newText;
            this.dispatchPromptChange();
        }
    }

    private _setWeightFromInput(e: Event) {
        const target = e.target as HTMLInputElement;
        const newWeight = parseFloat(target.value);

        if (isNaN(newWeight)) {
            if (target.value.trim() === '') {
                this.weight = 0;
            }
            return;
        }

        const min = Number(target.min) || 0;
        const max = Number(target.max) || 2;
        const clampedWeight = Math.max(min, Math.min(max, newWeight));

        if (clampedWeight !== newWeight) {
            target.value = String(clampedWeight);
        }
        this.weight = clampedWeight;
    }

    private handleWeightInput(e: Event) {
        this._setWeightFromInput(e);
    }

    private updateWeight(e: Event) {
        this._setWeightFromInput(e);
        this.dispatchPromptChange();
    }

    private dispatchPromptRemoved() {
        this.dispatchEvent(new CustomEvent('prompt-removed', { detail: this.promptId, bubbles: true, composed: true }));
    }

    override firstUpdated() {
        this.textInput.textContent = this.text;
    }

    override updated(changedProperties: PropertyValues<this>) {
        if (changedProperties.has('text') && this.textInput.textContent !== this.text) {
            this.textInput.textContent = this.text;
        }
    }

    override render() {
        const handleIcon = svg`
            <svg viewBox="0 0 10 16" fill="currentColor" style="width: 1.5vmin; height: 2vmin;">
                <path d="M4 14c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zM2 6C.9 6 0 6.9 0 8s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6C.9 0 0 .9 0 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"></path>
            </svg>
        `;

        return html`
            <div class="prompt" style=${styleMap({'--prompt-color': this.color})}>
                <div class="drag-handle">${handleIcon}</div>
                <span class="prompt-text" contenteditable="true" @blur=${this.updateText}></span>
                <div class="weight-control">
                    <input type="range" min="0" max="2" step="0.01" .value=${this.weight} @input=${this.handleWeightInput} @change=${this.updateWeight}>
                    <input type="number" class="weight-value" min="0" max="2" step="0.01" .value=${this.weight.toFixed(2)} @input=${this.handleWeightInput} @change=${this.updateWeight}>
                </div>
                <button class="remove-button" @click=${this.dispatchPromptRemoved}>×</button>
            </div>
        `;
    }

    static override styles = css`
        :host { display: block; width: 100%; }
        .prompt { display: flex; align-items: center; gap: 1vmin; background-color: #2a2a2a; border-radius: 8px; padding: 1.2vmin; border-left: 5px solid var(--prompt-color); }
        .drag-handle { cursor: grab; color: #777; }
        .drag-handle:active { cursor: grabbing; }
        .prompt-text { flex-grow: 1; color: #eee; font-size: 1.8vmin; outline: none; padding: 0.5vmin; }
        .prompt-text:focus { background-color: #333; }
        .weight-control { display: flex; align-items: center; gap: 1vmin; }
        .weight-value {
            font-size: 1.6vmin;
            color: #eee;
            background-color: #333;
            border: 1px solid #555;
            border-radius: 4px;
            min-width: 6ch;
            text-align: right;
            box-sizing: border-box;
            padding: 0.2em 0.4em;
            color-scheme: dark;
        }
        @media (prefers-color-scheme: light) {
            .weight-value {
                background-color: white;
                border-color: #ccc;
                color: black;
                color-scheme: light;
            }
        }
        .remove-button { background: transparent; color: #888; border: none; font-size: 2.5vmin; cursor: pointer; }
        .remove-button:hover { color: #fff; }
    `;
}

@customElement('settings-panel')
class SettingsPanel extends LitElement {
    @property({type: String}) playbackState: PlaybackState = 'stopped';
    @property({type: Object}) config: Partial<LiveMusicGenerationConfig> = {};

    private handleAutoChange(e: Event) {
        const target = e.target as HTMLInputElement;
        const isChecked = target.checked;
        const key = target.id.replace('auto-', '') as keyof LiveMusicGenerationConfig;

        if (isChecked) {
            this.config = { ...this.config, [key]: undefined };
        } else {
            this.config = { ...this.config, [key]: 0.5 }; // Default value when unchecked
        }
        this.dispatchEvent(new CustomEvent('settings-changed', { detail: this.config }));
    }

    private _setConfigFromInput(e: Event) {
        const target = e.target as HTMLInputElement;
        const key = target.id as keyof LiveMusicGenerationConfig;
        let value: any = target.type === 'checkbox' ? target.checked : target.value;

        if (target.type === 'range' || target.type === 'number') {
            const min = Number(target.min);
            const max = Number(target.max);

            if (target.value === '') {
                value = undefined;
            } else {
                const numValue = Number(value);
                if (isNaN(numValue)) {
                    value = undefined;
                } else {
                    const clampedValue = Math.max(min, Math.min(max, numValue));
                    if (clampedValue !== numValue) {
                        target.value = String(clampedValue);
                    }
                    value = clampedValue;
                }
            }
        }
        this.config = { ...this.config, [key]: value };
    }

    private handleSettingsInput(e: Event) {
        this._setConfigFromInput(e);
    }

    private handleInputChange(e: Event) {
        this._setConfigFromInput(e);
        this.dispatchEvent(new CustomEvent('settings-changed', { detail: this.config }));
    }

    override render() {
        const cfg = this.config;
        const isPlaying = this.playbackState === 'playing' || this.playbackState === 'loading';
        const scaleMap = new Map([
            ['Auto', 'SCALE_UNSPECIFIED'], ['C Major / A Minor', 'C_MAJOR_A_MINOR'], ['C# Major / A# Minor', 'D_FLAT_MAJOR_B_FLAT_MINOR'],
            ['D Major / B Minor', 'D_MAJOR_B_MINOR'], ['D# Major / C Minor', 'E_FLAT_MAJOR_C_MINOR'], ['E Major / C# Minor', 'E_MAJOR_D_FLAT_MINOR'],
            ['F Major / D Minor', 'F_MAJOR_D_MINOR'], ['F# Major / D# Minor', 'G_FLAT_MAJOR_E_FLAT_MINOR'], ['G Major / E Minor', 'G_MAJOR_E_MINOR'],
            ['G# Major / F Minor', 'A_FLAT_MAJOR_F_MINOR'], ['A Major / F# Minor', 'A_MAJOR_G_FLAT_MINOR'], ['A# Major / G Minor', 'B_FLAT_MAJOR_G_MINOR'],
            ['B Major / G# Minor', 'B_MAJOR_A_FLAT_MINOR'],
        ]);

        return html`
            <div class="settings-grid">
                <!-- Sliders -->
                <div class="setting">
                    <label for="guidance">Guidance</label>
                    <div class="slider-group">
                        <input type="range" id="guidance" min="0" max="6" step="0.1" .value=${cfg.guidance} @input=${this.handleSettingsInput} @change=${this.handleInputChange}>
                        <input type="number" id="guidance" min="0" max="6" step="0.1" .value=${cfg.guidance?.toFixed(1)} @input=${this.handleSettingsInput} @change=${this.handleInputChange} class="value-input">
                    </div>
                </div>
                <div class="setting">
                    <label for="temperature">Temperature</label>
                     <div class="slider-group">
                        <input type="range" id="temperature" min="0" max="3" step="0.1" .value=${cfg.temperature} @input=${this.handleSettingsInput} @change=${this.handleInputChange}>
                        <input type="number" id="temperature" min="0" max="3" step="0.1" .value=${cfg.temperature?.toFixed(1)} @input=${this.handleSettingsInput} @change=${this.handleInputChange} class="value-input">
                    </div>
                </div>
                <div class="setting">
                    <label for="topK">Top K</label>
                    <div class="slider-group">
                        <input type="range" id="topK" min="1" max="1000" step="1" .value=${cfg.topK} @input=${this.handleSettingsInput} @change=${this.handleInputChange}>
                        <input type="number" id="topK" min="1" max="1000" step="1" .value=${cfg.topK} @input=${this.handleSettingsInput} @change=${this.handleInputChange} class="value-input">
                    </div>
                </div>
                <div class="setting">
                    <div class="label-with-checkbox">
                        <label for="density">Density</label>
                        <div>
                            <input type="checkbox" id="auto-density" @change=${this.handleAutoChange} .checked=${cfg.density === undefined}>
                            <label for="auto-density">Auto</label>
                        </div>
                    </div>
                    <div class="slider-group">
                        <input type="range" id="density" min="0" max="1" step="0.05" .value=${cfg.density ?? 0.5} @input=${this.handleSettingsInput} @change=${this.handleInputChange} .disabled=${cfg.density === undefined}>
                        <input type="number" id="density" min="0" max="1" step="0.05" .value=${cfg.density?.toFixed(2) ?? ''} @input=${this.handleSettingsInput} @change=${this.handleInputChange} class="value-input" .disabled=${cfg.density === undefined} placeholder="Auto">
                    </div>
                </div>
                <div class="setting">
                    <div class="label-with-checkbox">
                        <label for="brightness">Brightness</label>
                        <div>
                            <input type="checkbox" id="auto-brightness" @change=${this.handleAutoChange} .checked=${cfg.brightness === undefined}>
                            <label for="auto-brightness">Auto</label>
                        </div>
                    </div>
                    <div class="slider-group">
                        <input type="range" id="brightness" min="0" max="1" step="0.05" .value=${cfg.brightness ?? 0.5} @input=${this.handleSettingsInput} @change=${this.handleInputChange} .disabled=${cfg.brightness === undefined}>
                        <input type="number" id="brightness" min="0" max="1" step="0.05" .value=${cfg.brightness?.toFixed(2) ?? ''} @input=${this.handleSettingsInput} @change=${this.handleInputChange} class="value-input" .disabled=${cfg.brightness === undefined} placeholder="Auto">
                    </div>
                </div>
                <!-- Inputs and Selects -->
                <div class="setting">
                    <label for="bpm">BPM</label>
                    <input type="number" id="bpm" min="60" max="200" .value=${cfg.bpm ?? ''} @input=${this.handleSettingsInput} @change=${this.handleInputChange} placeholder="Auto" .disabled=${isPlaying}>
                </div>
                <div class="setting">
                    <label for="seed">Seed</label>
                    <input type="number" id="seed" min="0" max="2147483647" .value=${cfg.seed ?? ''} @input=${this.handleSettingsInput} @change=${this.handleInputChange} placeholder="Auto">
                </div>
                <div class="setting">
                    <label for="scale">Scale</label>
                    <select id="scale" @change=${this.handleInputChange} .disabled=${isPlaying}>
                        ${[...scaleMap.entries()].map(([name, value]) => html`<option .value=${value}>${name}</option>`)}
                    </select>
                </div>
                <!-- Checkboxes -->
                <div class="setting checkbox-group">
                    <div>
                        <input type="checkbox" id="muteBass" .checked=${!!cfg.muteBass} @change=${this.handleInputChange}>
                        <label for="muteBass">Mute Bass</label>
                    </div>
                    <div>
                        <input type="checkbox" id="muteDrums" .checked=${!!cfg.muteDrums} @change=${this.handleInputChange}>
                        <label for="muteDrums">Mute Drums</label>
                    </div>
                    <div>
                        <input type="checkbox" id="onlyBassAndDrums" .checked=${!!cfg.onlyBassAndDrums} @change=${this.handleInputChange}>
                        <label for="onlyBassAndDrums">Bass & Drums Only</label>
                    </div>
                </div>
            </div>
        `;
    }

    public getConfig(): Partial<LiveMusicGenerationConfig> {
        return this.config;
    }

    static override styles = css`
        :host { display: block; background-color: #2a2a2a; border-radius: 8px; padding: 2vmin; margin-top: 2vmin; }
        .settings-grid { display: grid; grid-template-columns: 1fr; gap: 1.5vmin; }
        .setting { display: flex; flex-direction: column; font-size: 1.5vmin; color: #ccc; }
        label { margin-bottom: 0.5vmin; }
        input[type="range"] { width: 100%; }
        input[type="number"], select {
            background-color: #333;
            border: 1px solid #555;
            color: #eee;
            border-radius: 4px;
            padding: 0.5em;
            width: 100%;
            box-sizing: border-box;
            color-scheme: dark;
        }
        @media (prefers-color-scheme: light) {
            input[type="number"], select {
                background-color: white;
                border-color: #ccc;
                color: black;
                color-scheme: light;
            }
        }
        .checkbox-group { display: flex; flex-direction: column; gap: 0.5vmin; }
        .checkbox-group div { display: flex; align-items: center; }
        input[type="checkbox"] { margin-right: 0.5em; }
        .label-with-checkbox { display: flex; justify-content: space-between; align-items: center; }
        .label-with-checkbox div { display: flex; align-items: center; gap: 0.5em; }
        .label-with-checkbox label { margin-bottom: 0; }
        .slider-group { display: flex; align-items: center; gap: 1em; }
        .slider-group input[type="range"] { flex-grow: 1; }
        .value-input { width: 6em; text-align: right; }
        input:disabled { opacity: 0.5; }
    `;
}

@customElement('prompt-dj-app')
class PromptDjApp extends LitElement {
    @query('settings-panel') private settingsPanel!: SettingsPanel;
    @query('#visualizer') private visualizerCanvas!: HTMLCanvasElement;
    @state() private prompts: Prompt[] = [];
    @state() private settings: Partial<LiveMusicGenerationConfig> = {
        temperature: 1.1,
        topK: 40,
        guidance: 4.0,
    };
    @state() private playbackState: PlaybackState = 'stopped';
    @state() private totalDuration = 0;
    @state() private currentPlaybackTime = 0;
    @state() private activeSources: AudioBufferSourceNode[] = [];
    @state() private decodedAudioBuffers: AudioBuffer[] = [];
    @state() private isSeeking = false;
    private animationFrameId?: number;
    private streamStartTime = 0;
    private nextPromptId = 0;
    private session?: LiveMusicSession;
    private receivedAudioChunks: Uint8Array[] = [];
    private audioContext = new ((window as any).AudioContext || (window as any).webkitAudioContext)({ sampleRate: 48000 });
    private outputNode = this.audioContext.createGain();
    private analyser: AnalyserNode;
    private frequencyData: Uint8Array;
    private nextStartTime = 0;
    private readonly bufferTime = 1.0;
    private potentialDragTarget: HTMLElement | null = null;
    private visualizerCtx?: CanvasRenderingContext2D | null;

    constructor() {
        super();
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 2048;
        const bufferLength = this.analyser.frequencyBinCount;
        this.frequencyData = new Uint8Array(bufferLength);
        this.outputNode.connect(this.analyser);
        this.analyser.connect(this.audioContext.destination);
        this.addInitialPrompts();
    }

    override firstUpdated() {
        this.visualizerCtx = this.visualizerCanvas.getContext('2d');
    }
    
    addInitialPrompts() {
        this.addPrompt('Minimal Techno', 1);
        this.addPrompt('Bossa Nova', 1);
    }

    async connectToSession() {
        this.playbackState = 'loading';
        try {
            this.session = await ai.live.music.connect({
                model: model,
                callbacks: {
                    onmessage: (msg: LiveMusicServerMessage) => this.handleServerMessage(msg),
                    onerror: (err) => { console.error('Session error:', err); this.stopAudio(); },
                },
            });
            await this.setSessionPrompts();
            await this._sendSettingsToSession(this.settings);
            this.loadAudio();
        } catch (e) {
            console.error('Failed to connect to session:', e);
            this.playbackState = 'stopped';
        }
    }

    handleServerMessage(msg: LiveMusicServerMessage) {
        if (msg.serverContent?.audioChunks?.[0]?.data) {
            const decoded = decode(msg.serverContent.audioChunks[0].data);
            this.receivedAudioChunks.push(decoded);
            this.requestUpdate('receivedAudioChunks');

            decodeAudioData(decoded, this.audioContext, 48000, 2).then(audioBuffer => {
                this.decodedAudioBuffers.push(audioBuffer);
                if (this.playbackState === 'paused' || this.playbackState === 'stopped') return;
                
                this.totalDuration += audioBuffer.duration;
                const source = this.audioContext.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(this.outputNode);
                this.activeSources.push(source);
                source.onended = () => {
                    this.activeSources = this.activeSources.filter(s => s !== source);
                };

                const now = this.audioContext.currentTime;
                if (this.nextStartTime === 0) {
                    this.nextStartTime = now + this.bufferTime;
                    this.streamStartTime = this.nextStartTime;
                    this.updateProgress();
                }

                if (this.playbackState === 'loading') {
                    this.playbackState = 'playing';
                }

                if (this.nextStartTime < now) {
                    this.nextStartTime = now;
                }
                
                source.start(this.nextStartTime);
                this.nextStartTime += audioBuffer.duration;
            });
        }
    }

    setSessionPrompts = throttle(async () => {
        if (!this.session) return;
        const promptsToSend = this.prompts.filter(p => p.weight > 0);
        try {
            await this.session.setWeightedPrompts({ weightedPrompts: promptsToSend });
        } catch (e) {
            console.error('Failed to set prompts:', e);
        }
    }, 200);

    _sendSettingsToSession = throttle(async (config: Partial<LiveMusicGenerationConfig>) => {
        if (!this.session) return;
        try {
            await this.session.setMusicGenerationConfig({ musicGenerationConfig: config });
        } catch (e) {
            console.error('Failed to update settings:', e);
        }
    }, 200);

    handleSettingsChanged(e: CustomEvent<LiveMusicGenerationConfig>) {
        this.settings = e.detail;
        this._sendSettingsToSession(this.settings);
    }

    handlePromptChanged(e: CustomEvent<Prompt>) {
        const changedPrompt = e.detail;
        this.prompts = this.prompts.map(p => p.promptId === changedPrompt.promptId ? changedPrompt : p);
        this.setSessionPrompts();
    }

    addPrompt(text = 'New Prompt', weight = 1) {
        const promptId = `prompt-${this.nextPromptId++}`;
        const usedColors = this.prompts.map(p => p.color);
        const color = getUnusedRandomColor(usedColors);
        this.prompts = [...this.prompts, { promptId, text, weight, color }];
        this.setSessionPrompts();
    }

    handlePromptRemoved(e: CustomEvent<string>) {
        this.prompts = this.prompts.filter(p => p.promptId !== e.detail);
        this.setSessionPrompts();
    }
    
    async handlePlayPause() {
        if (this.playbackState === 'playing' || this.playbackState === 'loading') {
            this.pauseAudio();
        } else if (this.playbackState === 'paused' || this.playbackState === 'stopped') {
            if (!this.session) {
                await this.connectToSession();
            } else {
                this.loadAudio();
            }
        }
    }
    
    loadAudio() {
        if (!this.session) return;
        this.audioContext.resume();
        this.updateProgress();
        this.session.play();
        this.playbackState = (this.playbackState === 'paused') ? 'playing' : 'loading';
        this.outputNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        this.outputNode.gain.linearRampToValueAtTime(1, this.audioContext.currentTime + 0.1);
    }
    
    private clearAllSources() {
        this.activeSources.forEach(source => source.stop());
        this.activeSources = [];
    }

    pauseAudio() {
        if (!this.session) return;
        if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
        this.session.pause();
        this.playbackState = 'paused';
        this.outputNode.gain.setValueAtTime(this.outputNode.gain.value, this.audioContext.currentTime);
        this.outputNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.1);
        this.clearAllSources();
    }

    stopAudio() {
        if (this.session) {
            this.session.stop();
            this.session = undefined;
        }
        if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
        this.clearAllSources();
        this.playbackState = 'stopped';
        this.nextStartTime = 0;
        this.totalDuration = 0;
        this.currentPlaybackTime = 0;
        this.streamStartTime = 0;
        this.receivedAudioChunks = [];
        this.decodedAudioBuffers = [];
    }
    
    handleReset = () => this.stopAudio();

    updateProgress = () => {
        if (this.isSeeking) {
            this.animationFrameId = requestAnimationFrame(this.updateProgress);
            return;
        }
        if (this.playbackState !== 'playing' && this.playbackState !== 'loading') return;
        const elapsed = this.audioContext.currentTime - this.streamStartTime;
        this.currentPlaybackTime = Math.max(0, Math.min(elapsed, this.totalDuration));
        this.visualize();
        this.animationFrameId = requestAnimationFrame(this.updateProgress);
    }


    private handleMouseDown(e: MouseEvent) {
        const path = e.composedPath();
        const handle = path.find(el => el instanceof HTMLElement && el.classList.contains('drag-handle'));
        const promptController = path.find(el => el instanceof HTMLElement && el.tagName.toLowerCase() === 'prompt-controller');

        if (handle && promptController) {
            this.potentialDragTarget = promptController as HTMLElement;
        } else {
            this.potentialDragTarget = null;
        }
    }

    private writeWavHeader(dataLength: number, sampleRate: number, numChannels: number, bitsPerSample: number): Uint8Array {
        const buffer = new ArrayBuffer(44);
        const view = new DataView(buffer);
        const writeString = (offset: number, str: string) => {
            for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
        };
        writeString(0, 'RIFF');
        view.setUint32(4, 36 + dataLength, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true);
        view.setUint16(32, numChannels * (bitsPerSample / 8), true);
        view.setUint16(34, bitsPerSample, true);
        writeString(36, 'data');
        view.setUint32(40, dataLength, true);
        return new Uint8Array(buffer);
    }

    private handleDownloadWav = () => {
        if (this.receivedAudioChunks.length === 0) return;
        const totalLength = this.receivedAudioChunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const concatenatedData = new Uint8Array(totalLength);
        let offset = 0;
        this.receivedAudioChunks.forEach(chunk => {
            concatenatedData.set(chunk, offset);
            offset += chunk.length;
        });
        const header = this.writeWavHeader(totalLength, this.audioContext.sampleRate, 2, 16);
        const wavData = new Uint8Array(header.length + totalLength);
        wavData.set(header, 0);
        wavData.set(concatenatedData, header.length);
        const blob = new Blob([wavData], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `lyria-music-${new Date().toISOString().slice(0,11).replace(/-/g,'')}.wav`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    private handleDownloadMp3 = () => {
        if (this.receivedAudioChunks.length === 0) return;

        // 1. Concatenate all raw audio chunks
        const totalLength = this.receivedAudioChunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const concatenatedData = new Uint8Array(totalLength);
        let offset = 0;
        this.receivedAudioChunks.forEach(chunk => {
            concatenatedData.set(chunk, offset);
            offset += chunk.length;
        });

        // 2. Convert raw bytes to 16-bit PCM samples and de-interleave
        const pcm = new Int16Array(concatenatedData.buffer);
        const numChannels = 2;
        const numSamples = pcm.length / numChannels;
        const left = new Int16Array(numSamples);
        const right = new Int16Array(numSamples);

        for (let i = 0; i < numSamples; i++) {
            left[i] = pcm[i * 2];
            right[i] = pcm[i * 2 + 1];
        }

        // 3. Use the Web Worker for encoding
        const worker = new Worker(new URL('./mp3-encoder-worker.ts', import.meta.url));

        worker.onmessage = (e: MessageEvent) => {
            if (e.data.error) {
                console.error("MP3 encoding error:", e.data.error);
                alert(`抱歉，MP3编码失败: ${e.data.error}`);
                return;
            }

            const { mp3Data } = e.data;
            const blob = new Blob(mp3Data, { type: 'audio/mp3' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `lyria-music-${new Date().toISOString().slice(0,11).replace(/-/g,'')}.mp3`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            worker.terminate();
        };

        worker.onerror = (e) => {
            console.error('Worker error:', e);
            alert('编码工作线程发生错误。');
            worker.terminate();
        };

        // 4. Send data to the worker, transferring ownership of the buffers
        worker.postMessage({
            left,
            right,
            sampleRate: this.audioContext.sampleRate,
        }, [left.buffer, right.buffer]);
    }

    private handleImportConfig = async () => {
        try {
            const configString = await navigator.clipboard.readText();
            const newConfig = JSON.parse(configString);

            // Basic validation
            if (!newConfig || !Array.isArray(newConfig.prompts) || typeof newConfig.settings !== 'object') {
                throw new Error('无效的配置格式。');
            }

            const newPrompts = newConfig.prompts.map((p: any) => {
                const promptId = `prompt-${this.nextPromptId++}`;
                const usedColors = this.prompts.map(pr => pr.color).concat(newConfig.prompts.map((pr:any) => pr.color));
                const color = getUnusedRandomColor(usedColors);
                return {
                    promptId,
                    text: String(p.text ?? 'New Prompt'),
                    weight: Number(p.weight ?? 1),
                    color,
                };
            });

            this.prompts = newPrompts;
            this.settings = { ...this.settings, ...newConfig.settings };
            this.setSessionPrompts();
            this._sendSettingsToSession(this.settings);
            alert('配置导入成功！');
        } catch (err) {
            console.error('导入配置失败:', err);
            alert(`导入配置失败: ${err instanceof Error ? err.message : '未知错误'}`);
        }
    }

    private handleExportConfig = () => {
        const configToExport = {
            prompts: this.prompts.map(({ text, weight }) => ({ text, weight })),
            settings: this.settings,
        };
        const configString = JSON.stringify(configToExport, null, 2);
        navigator.clipboard.writeText(configString).then(() => {
            alert('配置已复制到剪贴板！');
        }, (err) => {
            console.error('无法将配置复制到剪贴板: ', err);
            alert('复制配置失败。');
        });
    }

    private formatDuration = (seconds: number) => `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;

    private draggedElement: HTMLElement | null = null;
    
    handleDragStart(e: DragEvent) {
        if (e.target !== this.potentialDragTarget) {
            e.preventDefault();
            return;
        }
        this.draggedElement = e.target as HTMLElement;
        e.dataTransfer!.effectAllowed = 'move';
        this.potentialDragTarget = null;
    }

    handleDragOver(e: DragEvent) {
        e.preventDefault();
        const target = (e.target as HTMLElement).closest('prompt-controller');
        if (target && target !== this.draggedElement) {
            const rect = target.getBoundingClientRect();
            const isAfter = e.clientY > rect.top + rect.height / 2;
            if (isAfter) {
                target.parentElement?.insertBefore(this.draggedElement!, target.nextSibling);
            } else {
                target.parentElement?.insertBefore(this.draggedElement!, target);
            }
        }
    }

    handleDrop() {
        if (!this.draggedElement) return;
        const container = this.shadowRoot!.querySelector('#prompts-container')!;
        const newOrderedIds = Array.from(container.children)
            .map(child => child.getAttribute('promptId'))
            .filter((id): id is string => id !== null);

        this.prompts = newOrderedIds.map(id => this.prompts.find(p => p.promptId === id)!);
        this.draggedElement = null;
        this.potentialDragTarget = null;
        this.setSessionPrompts();
    }

    private seekToTime(seekTime: number) {
        this.clearAllSources();
        this.currentPlaybackTime = seekTime;
        this.streamStartTime = this.audioContext.currentTime - seekTime;
        this.nextStartTime = this.audioContext.currentTime;

        let accumulatedDuration = 0;
        let hasScheduled = false;
        for (const buffer of this.decodedAudioBuffers) {
            const bufferEnd = accumulatedDuration + buffer.duration;
            if (!hasScheduled && bufferEnd >= seekTime) {
                const offset = seekTime - accumulatedDuration;
                this.scheduleBuffer(buffer, this.nextStartTime, offset);
                hasScheduled = true;
            } else if (hasScheduled) {
                this.scheduleBuffer(buffer, this.nextStartTime);
            }
            accumulatedDuration = bufferEnd;
        }

        if (this.playbackState === 'paused') {
            this.playbackState = 'playing';
            this.session?.play();
        }
    }

    private scheduleBuffer(buffer: AudioBuffer, startTime: number, offset = 0) {
        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this.outputNode);
        source.start(startTime, offset);
        this.activeSources.push(source);
        source.onended = () => { this.activeSources = this.activeSources.filter(s => s !== source); };
        this.nextStartTime = startTime + (buffer.duration - offset);
    }

    private handleSeek = (e: MouseEvent) => {
        if (this.playbackState === 'stopped' || !this.totalDuration) return;
        if ((e.target as HTMLElement).classList.contains('progress-handle')) return;

        const progressBar = this.shadowRoot!.querySelector('.progress-bar-container') as HTMLElement;
        const rect = progressBar.getBoundingClientRect();
        const seekRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        this.seekToTime(this.totalDuration * seekRatio);
    }

    private drawVisualizer() {
        if (!this.visualizerCtx || !this.visualizerCanvas) return;
        const canvas = this.visualizerCanvas;
        const ctx = this.visualizerCtx;
        if (canvas.width !== canvas.offsetWidth || canvas.height !== canvas.offsetHeight) {
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
        }
        const bufferLength = this.analyser.frequencyBinCount;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const barWidth = (canvas.width / (bufferLength/2));
        let barHeight;
        let x = 0;
        for(let i = 0; i < bufferLength; i++) {
            barHeight = this.frequencyData[i] * (canvas.height / 255);
            const r = barHeight + (25 * (i/bufferLength));
            const g = 250 * (i/bufferLength);
            const b = 50;
            ctx.fillStyle = "rgba(" + r + "," + g + "," + b + ", 0.6)";
            ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
            x += barWidth + 1;
        }
    }

    private visualize = () => {
        if (this.playbackState !== 'playing') return;
        this.analyser.getByteFrequencyData(this.frequencyData);
        this.drawVisualizer();
    }

    private handleSeekPointerDown = (e: PointerEvent) => {
        if (this.playbackState === 'stopped' || !this.totalDuration) return;

        this.isSeeking = true;
        const target = e.target as HTMLElement;
        target.setPointerCapture(e.pointerId);

        const onPointerMove = (moveEvent: PointerEvent) => {
            const progressBar = this.shadowRoot!.querySelector('.progress-bar-container') as HTMLElement;
            const rect = progressBar.getBoundingClientRect();
            const seekRatio = Math.max(0, Math.min(1, (moveEvent.clientX - rect.left) / rect.width));
            this.currentPlaybackTime = this.totalDuration * seekRatio;
        };

        const onPointerUp = (upEvent: PointerEvent) => {
            this.isSeeking = false;
            target.releasePointerCapture(upEvent.pointerId);
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);

            const progressBar = this.shadowRoot!.querySelector('.progress-bar-container') as HTMLElement;
            const rect = progressBar.getBoundingClientRect();
            const seekRatio = Math.max(0, Math.min(1, (upEvent.clientX - rect.left) / rect.width));
            this.seekToTime(this.totalDuration * seekRatio);
        };

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp, { once: true });
    }

    override render() {
        const progressPercent = (this.currentPlaybackTime / this.totalDuration) * 100 || 0;
        return html`
            <div id="background" style=${styleMap({backgroundImage: this.makeBackground()})}></div>
            <canvas id="visualizer"></canvas>
            <div class="main-content">
                <div class="prompts-area"
                     @mousedown=${this.handleMouseDown}
                     @prompt-changed=${this.handlePromptChanged}
                     @prompt-removed=${this.handlePromptRemoved}
                     @dragover=${this.handleDragOver}
                     @drop=${this.handleDrop}>
                   <overlay-scrollbar>
                       <div id="prompts-container">
                           ${this.prompts.map(p => html`
                               <prompt-controller
                                draggable="true"
                                @dragstart=${this.handleDragStart}
                                .promptId=${p.promptId}
                                .text=${p.text}
                                .weight=${p.weight}
                                .color=${p.color}>
                                </prompt-controller>
                            `)}
                        </div>
                    </overlay-scrollbar>
                    <button class="add-button" @click=${() => this.addPrompt()}>+</button>
                </div>
                <div class="panel-area">
                    <overlay-scrollbar>
                        <settings-panel
                            .playbackState=${this.playbackState}
                            .config=${this.settings}
                            @settings-changed=${this.handleSettingsChanged}></settings-panel>
                    </overlay-scrollbar>
                </div>
            </div>
            <div class="playback-container">
                 <div class="duration-display">${this.formatDuration(this.currentPlaybackTime)}</div>
                <div class="progress-bar-container" @click=${this.handleSeek}>
                    <div class="progress-bar" style=${styleMap({width: `${progressPercent}%`})}></div>
                    <div class="progress-handle" style=${styleMap({left: `${progressPercent}%`})} @pointerdown=${this.handleSeekPointerDown}></div>
                </div>
                <div class="duration-display">${this.formatDuration(this.totalDuration)}</div>
                <div class="button-group">
                    <button class="play-button" @click=${this.handlePlayPause}>
                        ${this.playbackState === 'playing' ? '暂停' : this.playbackState === 'loading' ? '加载中...' : '播放'}
                    </button>
                    <button class="reset-button" @click=${this.handleReset}>重置</button>
                    <button class="config-button" @click=${this.handleImportConfig}>导入配置</button>
                    <button class="config-button" @click=${this.handleExportConfig}>导出配置</button>
                    <button class="download-button" @click=${this.handleDownloadWav} .disabled=${this.receivedAudioChunks.length === 0}>下载WAV</button>
                    <button class="download-button" @click=${this.handleDownloadMp3} .disabled=${this.receivedAudioChunks.length === 0}>下载MP3</button>
                </div>
            </div>
        `;
    }

    private makeBackground() {
        const bg: string[] = [];
        this.prompts.forEach((p, i) => {
            const alpha = Math.min(p.weight / 1.5, 0.7);
            const x = (i % 4) / 3 * 100;
            const y = Math.floor(i / 4) / 3 * 100;
            bg.push(`radial-gradient(circle at ${x}% ${y}%, ${p.color}${Math.round(alpha*255).toString(16).padStart(2, '0')} 0px, ${p.color}00 ${p.weight * 50}%)`);
        });
        return bg.join(', ');
    }
    
    static override styles = css`
        :host { display: flex; flex-direction: column; height: 100%; padding: 2vmin; box-sizing: border-box; }
        #visualizer {
            position: absolute;
            bottom: 0;
            left: 0;
            width: 100%;
            height: 25vh;
            z-index: -1;
            pointer-events: none;
            opacity: 0.5;
        }
        #background { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: -1; transition: background-image 0.5s; }
        .main-content { display: flex; flex: 1; gap: 2vmin; overflow: hidden; }
        .prompts-area { display: flex; flex-direction: column; flex-basis: 82.5%; gap: 2vmin; overflow: hidden; }
        .panel-area { flex-basis: 17.5%; overflow: hidden; padding: 0 1vmin; }
        #prompts-container { display: flex; flex-direction: column; gap: 1.5vmin; padding-right: 1vmin; }
        .add-button { font-size: 3vmin; cursor: pointer; background: #333; color: #fff; border: 1px solid #555; border-radius: 8px; height: 5vmin; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
        .playback-container { display: flex; justify-content: center; align-items: center; padding: 2vmin; gap: 1.5vmin; width: 100%; max-width: 1200px; margin: 0 auto; }
        .progress-bar-container { position: relative; height: 8px; flex-grow: 1; background-color: #333; border-radius: 4px; cursor: pointer; }
        .progress-bar { height: 100%; background-color: #5200ff; border-radius: 4px; transition: width 0.1s linear; }
        .progress-handle { position: absolute; top: 50%; transform: translate(-50%, -50%); width: 16px; height: 16px; background-color: white; border-radius: 50%; cursor: grab; z-index: 10; }
        .progress-handle:active { cursor: grabbing; }
        .duration-display { font-size: 2.5vmin; color: #ccc; font-family: monospace; white-space: nowrap; }
        .button-group { display: flex; gap: 1.5vmin; }
        .play-button, .download-button, .reset-button, .config-button { font-size: 2vmin; padding: 1.5vmin 3vmin; cursor: pointer; border-radius: 50px; border: none; min-width: 10vmin; text-align: center; white-space: nowrap; }
        .play-button { background: #5200ff; color: white; }
        .reset-button { background: #555; color: white; }
        .reset-button:hover { background: #666; }
        .download-button, .config-button { background: transparent; color: #5200ff; border: 1px solid #5200ff; }
        .download-button:disabled { opacity: 0.4; cursor: not-allowed; border-color: #444; color: #444; }
        .download-button:hover:not(:disabled), .config-button:hover { background-color: #5200ff22; }
    `;
}

const app = document.createElement('prompt-dj-app');
document.getElementById('root')!.appendChild(app);

declare global {
  interface HTMLElementTagNameMap {
    'prompt-dj-app': PromptDjApp;
    'prompt-controller': PromptController;
    'weight-slider': WeightSlider;
    'settings-panel': SettingsPanel;
  }
}