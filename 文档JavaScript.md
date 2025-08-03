# Music generation using Lyria RealTime

The Gemini API, using [Lyria RealTime](https://deepmind.google/technologies/lyria/realtime/), provides access to a state-of-the-art, real-time, streaming music generation model. It allows developers to build applications where users can interactively create, continuously steer, and perform instrumental music.

**Experimental:** Lyria RealTime is an [experimental model](https://ai.google.dev/gemini-api/docs/models/experimental-models).

To experience what can be built using Lyria RealTime, try it on AI Studio using the [Prompt DJ](https://aistudio.google.com/apps/bundled/promptdj) or the [MIDI DJ](https://aistudio.google.com/apps/bundled/promptdj-midi) apps!

## How music generation works

Lyria RealTime music generation uses a persistent, bidirectional, low-latency streaming connection using [WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API).

## Generate and control music

Lyria RealTime works a bit like the [Live API](https://ai.google.dev/gemini-api/docs/live) in the sense that it is using websockets to keep a real-time communication with the model. It's still not exactly the same as you can't talk to the model and you have to use a specific format to prompt it.

The following code demonstrates how to generate music:

[Python](https://ai.google.dev/gemini-api/docs/music-generation#python)[JavaScript](https://ai.google.dev/gemini-api/docs/music-generation#javascript)

This example initializes the Lyria RealTime session using `client.live.music.connect()`, then sends an initial prompt with `session.setWeightedPrompts()` along with an initial configuration using `session.setMusicGenerationConfig`, starts the music generation using `session.play()` and sets up an `onMessage` callback to process the audio chunks it receives.

```
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({
  apiVersion: 'v1alpha',
});

// Create session object to control music generation.
const session: MusicSession = client.live.music.connect({
  model: 'models/lyria-realtime-exp',
  callbacks: {
    onMessage: (message) => {
      // Application logic: buffer and play using Web Audio API etc.
    },
    onError: (error) => {
      console.error('music session error:', error);
    },
    onClose: () => {
      console.log('Lyria RealTime stream closed.');
    }
  }
}); 

// Send initial prompts and config
await session.setWeightedPrompts({
  weightedPrompts: [{ text: 'minimal techno', weight: 1.0 }],
});
await session.setMusicGenerationConfig({
  musicGenerationConfig: { bpm: 90, temperature: 1.0 },
});

// Start generation
await session.play();
```

For a more complete code sample, refer to those two AI studio apps:

[Try Prompt DJ on AI Studio](https://aistudio.google.com/apps/bundled/promptdj)

[Try MIDI DJ on AI Studio](https://aistudio.google.com/apps/bundled/promptdj-midi)

You can then use `session.play()`, `session.pause()`, `session.stop()` and `session.reset_context()` to start, pause, stop or reset the session.

## Steer music in real-time

### Prompt Lyria RealTime

While the stream is active, you can send new `WeightedPrompt` messages at any time to alter the generated music. The model will smoothly transition based on the new input.

The prompts need to follow the right format with a `text` (the actual prompt), and a `weight`. The `weight` can take any value except `0`. `1.0` is usually a good starting point.

[Python](https://ai.google.dev/gemini-api/docs/music-generation#python)[JavaScript](https://ai.google.dev/gemini-api/docs/music-generation#javascript)

```
  await session.setMusicGenerationConfig({
    weightedPrompts: [
      { text: 'Harmonica', weight: 0.3 },
      { text: 'Afrobeat', weight: 0.7 }
    ],
  });
```

Note that the model transitions can be a bit abrupt when drastically changing the prompts so it's recommended to implement some kind of cross-fading by sending intermediate weight values to the model.

### Update the configuration

You can also update the music generation parameters in real time. You can't just update a parameter, you need to set the whole configuration otherwise the other fields will be reset back to their default values.

Since updating the bpm or the scale is a drastic change for the model you'll also need to tell it to reset its context using `reset_context()` to take the new config into account. It won't stop the stream, but it will be a hard transition. You don't need to do it for the other parameters.

[Python](https://ai.google.dev/gemini-api/docs/music-generation#python)[JavaScript](https://ai.google.dev/gemini-api/docs/music-generation#javascript)

```
  await session.setMusicGenerationConfig({
    musicGenerationConfig: { bpm: 120, density: 0.75 },
  });
  await session.reset_context();
```

## Prompt guide for Lyria RealTime

Here's a non-exhaustive list of prompts you can use to prompt Lyria RealTime:

- Instruments: `303 Acid Bass, 808 Hip Hop Beat, Accordion, Alto Saxophone, Bagpipes, Balalaika Ensemble, Banjo, Bass Clarinet, Bongos, Boomy Bass, Bouzouki, Buchla Synths, Cello, Charango, Clavichord, Conga Drums, Didgeridoo, Dirty Synths, Djembe, Drumline, Dulcimer, Fiddle, Flamenco Guitar, Funk Drums, Glockenspiel, Guitar, Hang Drum, Harmonica, Harp, Harpsichord, Hurdy-gurdy, Kalimba, Koto, Lyre, Mandolin, Maracas, Marimba, Mbira, Mellotron, Metallic Twang, Moog Oscillations, Ocarina, Persian Tar, Pipa, Precision Bass, Ragtime Piano, Rhodes Piano, Shamisen, Shredding Guitar, Sitar, Slide Guitar, Smooth Pianos, Spacey Synths, Steel Drum, Synth Pads, Tabla, TR-909 Drum Machine, Trumpet, Tuba, Vibraphone, Viola Ensemble, Warm Acoustic Guitar, Woodwinds, ...`
- Music Genre: `Acid Jazz, Afrobeat, Alternative Country, Baroque, Bengal Baul, Bhangra, Bluegrass, Blues Rock, Bossa Nova, Breakbeat, Celtic Folk, Chillout, Chiptune, Classic Rock, Contemporary R&B, Cumbia, Deep House, Disco Funk, Drum & Bass, Dubstep, EDM, Electro Swing, Funk Metal, G-funk, Garage Rock, Glitch Hop, Grime, Hyperpop, Indian Classical, Indie Electronic, Indie Folk, Indie Pop, Irish Folk, Jam Band, Jamaican Dub, Jazz Fusion, Latin Jazz, Lo-Fi Hip Hop, Marching Band, Merengue, New Jack Swing, Minimal Techno, Moombahton, Neo-Soul, Orchestral Score, Piano Ballad, Polka, Post-Punk, 60s Psychedelic Rock, Psytrance, R&B, Reggae, Reggaeton, Renaissance Music, Salsa, Shoegaze, Ska, Surf Rock, Synthpop, Techno, Trance, Trap Beat, Trip Hop, Vaporwave, Witch house, ...`
- Mood/Description: `Acoustic Instruments, Ambient, Bright Tones, Chill, Crunchy Distortion, Danceable, Dreamy, Echo, Emotional, Ethereal Ambience, Experimental, Fat Beats, Funky, Glitchy Effects, Huge Drop, Live Performance, Lo-fi, Ominous Drone, Psychedelic, Rich Orchestration, Saturated Tones, Subdued Melody, Sustained Chords, Swirling Phasers, Tight Groove, Unsettling, Upbeat, Virtuoso, Weird Noises, ...`

These are just some examples, Lyria RealTime can do much more. Experiment with your own prompts!

## Best practices

- Client applications must implement robust audio buffering to ensure smooth playback. This helps account for network jitter and slight variations in generation latency.
- Effective prompting:
    - Be descriptive. Use adjectives describing mood, genre, and instrumentation.
    - Iterate and steer gradually. Rather than completely changing the prompt, try adding or modifying elements to morph the music more smoothly.
    - Experiment with weight on `WeightedPrompt` to influence how strongly a new prompt affects the ongoing generation.

## Technical details

This section describes the specifics of how to use Lyria RealTime music generation.

### Specifications

- Output format: Raw 16-bit PCM Audio
- Sample rate: 48kHz
- Channels: 2 (stereo)

### Controls

Music generation can be influenced in real time by sending messages containing:

- `WeightedPrompt`: A text string describing a musical idea, genre, instrument, mood, or characteristic. Multiple prompts can potentially be supplied to blend influences. See [above](https://ai.google.dev/gemini-api/docs/:#steer-music) for more details on how to best prompt Lyria RealTime.
- `MusicGenerationConfig`: Configuration for the music generation process, influencing the characteristics of the output audio.). Parameters include:
    - `guidance`: (float) Range: `[0.0, 6.0]`. Default: `4.0`. Controls how strictly the model follows the prompts. Higher guidance improves adherence to the prompt, but makes transitions more abrupt.
    - `bpm`: (int) Range: `[60, 200]`. Sets the Beats Per Minute you want for the generated music. You need to stop/play or reset the context for the model it take into account the new bpm.
    - `density`: (float) Range: `[0.0, 1.0]`. Controls the density of musical notes/sounds. Lower values produce sparser music; higher values produce "busier" music.
    - `brightness`: (float) Range: `[0.0, 1.0]`. Adjusts the tonal quality. Higher values produce "brighter" sounding audio, generally emphasizing higher frequencies.
    - `scale`: (Enum) Sets the musical scale (Key and Mode) for the generation. Use the [`Scale` enum values](https://ai.google.dev/gemini-api/docs/music-generation#scale-enum) provided by the SDK. You need to stop/play or reset the context for the model it take into account the new scale.
    - `mute_bass`: (bool) Default: `False`. Controls whether the model reduces the outputs' bass.
    - `mute_drums`: (bool) Default: `False`. Controls whether the model outputs reduces the outputs' drums.
    - `only_bass_and_drums`: (bool) Default: `False`. Steer the model to try to only output bass and drums.
- `PlaybackControl`: Commands to control playback aspects, such as play, pause, stop or reset the context.

For `bpm`, `density`, `brightness` and `scale`, if no value is provided, the model will decide what's best according to your initial prompts.

More classical parameters like `temperature` (0.0 to 3.0, default 1.1), `top_k` (1 to 1000, default 40), and `seed` (0 to 2 147 483 647, randomly selected by default) are also customizable in the `MusicGenerationConfig`.

#### Scale Enum Values

Here are all the scale values that the model can accept:

|Enum Value|Scale / Key|
|---|---|
|`C_MAJOR_A_MINOR`|C major / A minor|
|`D_FLAT_MAJOR_B_FLAT_MINOR`|D♭ major / B♭ minor|
|`D_MAJOR_B_MINOR`|D major / B minor|
|`E_FLAT_MAJOR_C_MINOR`|E♭ major / C minor|
|`E_MAJOR_D_FLAT_MINOR`|E major / C♯/D♭ minor|
|`F_MAJOR_D_MINOR`|F major / D minor|
|`G_FLAT_MAJOR_E_FLAT_MINOR`|G♭ major / E♭ minor|
|`G_MAJOR_E_MINOR`|G major / E minor|
|`A_FLAT_MAJOR_F_MINOR`|A♭ major / F minor|
|`A_MAJOR_G_FLAT_MINOR`|A major / F♯/G♭ minor|
|`B_FLAT_MAJOR_G_MINOR`|B♭ major / G minor|
|`B_MAJOR_A_FLAT_MINOR`|B major / G♯/A♭ minor|
|`SCALE_UNSPECIFIED`|Default / The model decides|

The model is capable of guiding the notes that are played, but does not distinguish between relative keys. Thus each enum corresponds both to the relative major and minor. For example, `C_MAJOR_A_MINOR` would correspond to all the white keys of a piano, and `F_MAJOR_D_MINOR` would be all the white keys except B flat.

### Limitations

- Instrumental only: The model generates instrumental music only.
- Safety: Prompts are checked by safety filters. Prompts triggering the filters will be ignored in which case an explanation will be written in the output's `filtered_prompt` field.
- Watermarking: Output audio is always watermarked for identification following our [Responsible AI](https://ai.google/responsibility/principles/) principles.