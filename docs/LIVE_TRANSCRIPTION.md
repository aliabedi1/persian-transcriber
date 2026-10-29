# Live transcription

Implements issue #2 in sequence: microphone, Windows loopback, combined capture, then a Linux monitor adapter. The existing file and record-then-transcribe paths remain available.

## Capture and inference

`LiveTranscription` owns the capture lifecycle. An AudioWorklet averages channels and resamples to 16 kHz mono PCM, sending 100 ms packets over the existing isolated preload bridge. It never plays captured audio back to the speakers. The activity meter measures captured PCM. Pause discards incoming audio; stop flushes the last partial packet before closing tracks and the AudioContext.

`createLiveSession` keeps at most 120 seconds of PCM, serializes inference, and emits transcript updates while capture continues. Windows are eight seconds with one second of overlap. Timestamps are relative to captured audio, excluding pauses. Completed passages remain available after an inference failure. Overlap merging removes matching suffix/prefix words only across overlapping audio; it preserves later repeated phrases. It is not speaker diarization or acoustic echo cancellation.

`createLiveEngine` starts the bundled `whisper-server` on a temporary loopback port with a random request prefix. Only the main process makes inference requests; renderer networking stays blocked. The selected model and processor are fixed for each session. Auto retries CPU if GPU startup fails. Whisper stays loaded between windows. A separate small CPU Silero VAD executable rejects windows without speech: the bundled server's built-in VAD can crash on a zero-speech result. Temporary WAV data and the native server are removed when the session closes.

## Platform behavior

| Platform | Microphone | System audio | Combined |
| --- | --- | --- | --- |
| Windows x64 | Chromium microphone capture | Electron loopback | Both streams mixed once through the same AudioContext |
| Linux x64 | Chromium microphone capture | FFmpeg PulseAudio input from the default sink monitor | Native PCM mixed with microphone inside the AudioWorklet |

Windows display requests are allowed only from Ava's main frame while a system-audio session is active. The desktop stream includes a video track required by the display API, but video is never encoded, saved, or sent to inference. All tracks close on stop. Capture includes output audio beyond a single meeting app. Changing output devices can interrupt capture and requires restarting it.

Linux requires `pactl` (`pulseaudio-utils`), a running PulseAudio or PipeWire-Pulse server, a monitor for the default sink, and FFmpeg with PulseAudio input. Capability checks verify those requirements and disable unsupported sources. No X11/Wayland screen-capture access is needed. Linux hardware behavior is unverified in this Windows development environment.

Microphone echo cancellation is requested. Headphones are recommended when combining microphone and playback; duplicate speech can still occur. Simultaneous speakers and noisy audio can reduce accuracy. Updates are chunked, not instantaneous word-by-word captions. Insufficient inference throughput causes increasing delay; the bounded queue produces a recoverable error rather than growing without limit.

## Validation

Run after `npm run build`:

```powershell
node --test tests/live.test.cjs tests/system-audio.test.cjs tests/pcm-capture.test.cjs
npm run test:live
```

The unit tests cover window/tail timing, overlap merging, preserving legitimate repetition, queue limits, completed-text preservation after failure, resampling/downmixing, native-system mixing, pause behavior, Linux prerequisites, PCM framing and subprocess cleanup.

The Windows desktop suite uses Chromium's simulated microphone and real Windows output loopback with a public Persian fixture. It verifies nonzero PCM, transcript updates before stop, pause/resume, track cleanup and saved history/exports. In the default repeatable run only recognition/model availability are simulated. The microphone case also tests denied permissions without losing an existing transcript. Profiles and outputs are disposable.

To run real recognition using development models and the public fixture:

```powershell
$env:AVA_TEST_LIVE_REAL = '1'
$env:AVA_TEST_LIVE_DEVICE = 'cpu' # or gpu on supported hardware
node tests/live-desktop.cjs microphone
node tests/live-desktop.cjs system
node tests/live-desktop.cjs both
```

System/combined cases play the public fixture through the current output device. Live tests do not use or save private user audio. Re-run Linux system capture on an actual PulseAudio/PipeWire desktop before claiming hardware validation.

`node tests/live-native.cjs cpu` (or `gpu`) checks the persistent engine against silence, an eight-second public Persian clip, then silence again. On the development PC, that clip took approximately 24 seconds on CPU and one second on the RX 6700 XT Vulkan GPU, excluding initial model loading. These short checks are not sustained-session benchmarks. CPU capture works, but this CPU/model combination cannot sustain real-time throughput; use GPU or pause to let inference catch up.

Interaction reference: [Wispr Flow's desktop navigation](https://docs.wisprflow.ai/articles/5096240724-navigating-the-wispr-flow-app-desktop-ios-and-android) informed the compact source selection, activity feedback and transcript review. Ava retains offline recognition and incremental meeting transcripts.
