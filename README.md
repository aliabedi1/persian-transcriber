# Ava · آوا

A private Windows desktop app for Persian audio/video transcription. Electron + React + shadcn/ui. No paid API, no account, and no uploads. After the one-time downloads, transcription works offline.

## Install from a release

Download `Ava-Setup-1.1.0-x64.exe` from the GitHub release and open it. The installer installs for the current Windows user, creates desktop and Start menu shortcuts, and includes the model and engine. No terminal, extraction, Node.js, Python, or additional downloads are needed. Remove Ava through Windows Settings > Apps. The build is unsigned, so Windows may display a publisher warning.

## Use

The prepared Windows folder includes the engine, model, FFmpeg, and application. Open **Ava.exe**. Choose a recording, leave the spoken language on **Persian**, and click **Transcribe recording**. Review passages, edit them, and copy or save TXT, SRT, or VTT. All exports include your edits. Save before closing: transcripts are not automatically retained.

Common media formats include MP3, WAV, M4A, AAC, OGG/Opus, FLAC, MP4, MKV, MOV, WebM and AVI. FFmpeg extracts the first/default audio stream and converts it locally. Recordings with no audio, damaged files, and unsupported codecs produce errors.

## Develop

Requires Windows x64, Node.js, FFmpeg, and internet **during setup only**.

```powershell
./setup.ps1
npm start
```

If FFmpeg is missing, install it with `winget install --id Gyan.FFmpeg.Shared -e`, reopen PowerShell, then rerun setup. Setup verifies the engine against the GitHub release checksum and the model against its pinned SHA-256. It downloads no recordings. Source clones exclude models and native binaries; the prepared local app already includes these.

```powershell
npm run build
npm test
npm run test:desktop
npm run pack
```

`npm run pack` creates `release/win-unpacked/Ava.exe` and its required companion files. Keep the whole folder together. It runs without Node.js or Python installed. This is an unsigned local build.

## Diagnosis and choices

The initial Windows computer has a 12th generation i5, 16 GB memory and an AMD GPU. NVIDIA CUDA builds do not target that GPU. Whisper.cpp supports Vulkan in source builds, but its selected official Windows prebuilt release supplies a CPU build. The separate official CPU engine remains available, with at most eight threads. The Processor selector offers Auto (default), GPU (Vulkan), and CPU. Auto probes the bundled Vulkan backend for a real device, selects GPU when available, and retries on the separate CPU engine if GPU inference fails. An explicit GPU choice reports errors rather than silently switching. The processor choice is saved locally. A compatible AMD, NVIDIA or Intel GPU and working Vulkan driver are required. The Vulkan prebuilt comes from nyancodex/whisper-server-vulkan-windows v0.1.0, checksum-verified during setup. Long recordings may take substantial time; there is no service-imposed duration limit.

The bundled multilingual **large-v3-turbo Q5_0** model is about 547 MiB. Persian language is selected explicitly by default. Arabic kaf/yeh are normalized to Persian forms while preserving half-spaces. English, Arabic and automatic language detection are also available. This is transcription, not translation. Timestamped passages are editable; there is no automatic speaker identification, live microphone capture or cloud cleanup.

The recognition model is open source but not perfect. Noise, music, overlapping speech, accents, names, and specialist language can reduce quality or cause invented text. Review the result. Quality evidence and measured smoke-test results are recorded in `VALIDATION.md`.

## Privacy

The renderer loads bundled files only. CSP disallows network connections and Electron blocks HTTP, HTTPS and WebSocket requests. No telemetry, remote fonts or remote UI scripts. Node integration is disabled; a sandboxed preload exposes a narrow IPC API. FFmpeg accepts only local-file and pipe protocols. Native subprocesses receive argument arrays, never shell command strings.

Recordings are read from their original location. Intermediate WAV/JSON files live in an OS temporary directory and are removed after completion, failure or cancellation. A sudden power loss or forced process termination can leave temporary files. Exported files are saved only where you choose. Source code alone is stored on GitHub; models, media, transcripts and runtime binaries are ignored.

## Sources and licenses

- [Whisper.cpp](https://github.com/ggml-org/whisper.cpp) — MIT, official `b5454` Windows CPU build.
- [Whisper models](https://huggingface.co/ggerganov/whisper.cpp) and [OpenAI Whisper](https://github.com/openai/whisper) — model source and MIT license.
- [shadcn/ui skill](https://ui.shadcn.com/docs/skills) — installed into `.agents/skills/shadcn`, components generated with the official CLI.
- [FFmpeg](https://ffmpeg.org/legal.html) — the local Gyan shared build has its own licenses and build configuration; native binaries are not committed to this source repository.
- [FLEURS](https://huggingface.co/datasets/google/fleurs) — public Persian sample used only for local validation; not bundled or uploaded.

## Add to Codex desktop

Add this repository folder as a local project using Codex's Projects menu. The git remote is already configured. Local project registration is a desktop UI action and is not performed by setup.ps1.

## Interface language

Persian is the default interface language and uses RTL layout with a bundled Persian font. Select English in the header for LTR. The interface choice is saved locally and is separate from the recording language.

## Quiet audio and accuracy

Version 1.1.0 enables local Silero voice activity detection with 200 ms speech padding. This prevents the reproduced repeated-text failure on a quiet introduction while retaining the original recording timestamps. Both CPU and Vulkan use speech detection. The default Higher accuracy setting uses large-v3 Q5_0; Faster uses large-v3-turbo Q5_0. Bigger models are slower and do not guarantee correct wording. Both models and the VAD model are bundled, so no transcription is uploaded.

To run the private-recording regression locally, set `AVA_REPRO_AUDIO` to a short reproduction clip and run `npm run test:repetition`. Set `AVA_REPRO_DEVICE=cpu` to test CPU. No user recording is part of this repository.
