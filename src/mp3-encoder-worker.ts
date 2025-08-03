/// <reference lib="webworker" />

declare const lamejs: any;

// Using importScripts to load the library in the worker scope
// The path needs to be accessible from the final deployed location.
// Vite usually handles this, but we reference it from the root.
importScripts('/node_modules/lamejs/lame.min.js');

self.onmessage = (e: MessageEvent) => {
    const { left, right, sampleRate } = e.data;

    if (!lamejs) {
        self.postMessage({ error: 'lamejs not loaded' });
        return;
    }

    try {
        const mp3Encoder = new lamejs.Mp3Encoder(2, sampleRate, 128); // Stereo, input sample rate, 128kbps
        const mp3Data: Int8Array[] = [];
        const sampleBlockSize = 1152; // LAME's internal block size

        for (let i = 0; i < left.length; i += sampleBlockSize) {
            const leftChunk = left.subarray(i, i + sampleBlockSize);
            const rightChunk = right.subarray(i, i + sampleBlockSize);
            const mp3buf = mp3Encoder.encodeBuffer(leftChunk, rightChunk);
            if (mp3buf.length > 0) {
                mp3Data.push(mp3buf);
            }
        }

        const mp3buf = mp3Encoder.flush();
        if (mp3buf.length > 0) {
            mp3Data.push(mp3buf);
        }

        // Post the MP3 data back to the main thread, transferring ownership of the buffers
        self.postMessage({
            mp3Data: mp3Data,
        }, mp3Data.map(b => b.buffer));

    } catch (err: any) {
        self.postMessage({ error: err.message });
    }
};