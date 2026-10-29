# Validation

## Release 1.5.0 (2026-10-29)

- Built the Windows x64 NSIS installer from version 1.5.0. The unpacked executable reports 1.5.0; CPU/GPU Whisper servers and the CPU VAD helper are present, and no model directory is bundled.
- Ran the packaged Windows app with a disposable profile and the public Persian FLEURS sample fed through Chromium's simulated microphone. Real local live recognition, stop/save, persisted history, model settings, light/dark appearance and all six README screenshots passed without renderer errors. No normal user profile or private recording was used.
- Build, lint and all 27 unit tests pass. Source desktop, recording and live-capture regressions passed before packaging. Linux release CI now also exercises microphone/system/combined capture through a virtual PulseAudio output monitor; this does not substitute for physical Linux audio hardware testing.

## Live transcription — issue #2 (2026-10-29)

- Build and lint pass. All 27 engine/model/history/platform/timing/recording/live/system-audio/worklet unit tests pass.
- Windows desktop checks pass for microphone, real system-output loopback and both sources, including nonzero PCM, transcript updates before stop, pause/resume, releasing tracks, history and TXT/SRT/VTT exports. The repeatable suite simulates recognition; separate real checks pass on CPU for microphone and GPU for system and combined capture, using the public Persian FLEURS fixture.
- The native engine regression passes silence → real Persian speech → silence on CPU and GPU. Eight seconds of speech took about 24 seconds on CPU and one second on the AMD RX 6700 XT GPU, excluding model loading. This short test is not a sustained benchmark; CPU falls behind with this model/hardware.
- English live controls and Persian RTL history/transcript were visually inspected, including the minimum 860 px window width. Renderer networking remains blocked. Live sessions have display names and session identifiers, rather than pretending a retained recording exists.
- Linux capability detection, PCM framing, process cleanup and microphone/system mixing have unit coverage. Linux audio hardware and Linux packaging were not run in this Windows environment. Windows installer generation was not performed; packaging includes the server and VAD helper.

See [live transcription](docs/LIVE_TRANSCRIPTION.md) for reproduction commands and limitations.

## Microphone recording — issue #1 (2026-10-29)

Implemented locally; not a published release. Start/stop controls, elapsed time, playback preview and microphone errors are available in Persian and English. Recordings use the existing local transcription, editing, history and export flow. Temporary microphone audio is removed on replacement or normal app exit.

- `npm run test:recording` passes with real Chromium microphone capture through a simulated audio device, the actual Electron permission handlers and IPC, real FFmpeg decoding, playback loading, progress, history and TXT/SRT/VTT saving. Recognition/model availability are stubbed for this repeatable suite. It also covers denied/missing/busy microphones, empty recordings, recorder errors, invalid media, camera denial, upload regression, and temporary-file cleanup on replacement and app exit. Store unit tests reject unsupported, empty and oversized input.
- Real CPU recognition also passed on Windows using the existing local Turbo Q5 and Silero models, with the public Persian FLEURS fixture fed into Chromium's simulated microphone. No recognition stub or model download was used for that run. The recorded WebM produced Persian text and saved history/exports; selecting that audio as a file also transcribed successfully. This verifies the path, not general recognition accuracy or physical microphone hardware.
- Build, lint, all 17 engine/model/history/platform/timing/recording unit tests and the existing desktop readiness/isolation/network checks pass. The English recording preview was visually inspected. Linux and physical microphone hardware have not been tested for this change.

After preparing native tools, run `npm run build` and `npm run test:recording`. For real recognition, also provide the existing local `models/ggml-large-v3-turbo-q5_0.bin`, `models/ggml-silero-v5.1.2.bin` and `tests/fixtures/persian-fleurs.wav`, set `AVA_TEST_RECORDING_REAL=1`, then run `node tests/recording-desktop.cjs`. Test app copies, profiles and outputs are disposable; the normal app profile is preserved.

## Optional models — issue #3 (2026-10-29)

Implemented and tested locally on the developer's Windows x64 PC with isolated app copies/profiles. These results describe the current working tree, not a published release.

- Fresh profile: no model files downloaded at installation/setup/first launch; startup creates only the empty model storage folder. Missing-model guidance links to Settings → Models. The renderer still blocks outbound fetch.
- Explicit downloads: actually downloaded and SHA-256/size-verified Large v3 Turbo Q5, Large v3 Q5 and the shared Silero VAD through the app. Both production models transcribed the public `tests/fixtures/persian-fleurs.wav` fixture with the real CPU engine (one passage each; no inference stub). This checks operation, not recognition accuracy.
- Switching: each model was selected and used for inference. Selecting Turbo while a real Large v3 job was active left that job's recorded model as Large v3. The next job used the selected model. Separate UI checks clicked both Use model buttons and checked backend selection/readiness and persistence after reload.
- Restart/offline: closed and relaunched with the same temporary profile. Selection and all downloaded files persisted. Both production models transcribed again with main-process fetch forced to fail and the browser context offline. No OS network-adapter settings were changed.
- Failure/retry: injected a disconnected-network error in the main-process fetch used by the downloader. The settings row showed an actionable error and Retry download. Restored real fetch and successfully downloaded from the configured source. Store tests also cover HTTP failures, interrupted streams, short/corrupt downloads, a crash-left partial file, missing files, retry, mirrors and shared concurrent files.
- Catalog extension: added a temporary `developer-tiny` entry and its file metadata/source only to an isolated catalog. It appeared in settings and actually downloaded `ggml-tiny.bin` from its configured Hugging Face URL with SHA-256 `be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21`. No settings UI change was needed. This test entry is not in the production catalog.
- UI: visually inspected English and Persian settings, including a 390 px-wide layout; selection controls, status, sizes and recovery copy are visible without horizontal overflow. No renderer exceptions in the full model desktop suite.
- Build/packaging: TypeScript/Vite build, lint, 15 engine/model/history/platform/timing unit tests, dashboard, tour, history and custom-select desktop checks passed. `npm run pack` produced `release/win-unpacked/Ava.exe`; verified its resources contain no `.bin` model files. Fresh-profile IPC/readiness/isolation checks also passed against the packaged executable.

Reproduce the complete real-download suite with `npm run test:models` after building the UI and preparing native tools. It downloads roughly 1.7 GB into disposable storage, performs native CPU inference, and removes its temporary app/profile afterward. The developer's normal profile, recordings and existing source models were preserved. Linux runtime verification and building/running the NSIS installer were not performed for this change; Windows packaging and both OS packaging/setup exclusions were checked. Developer catalog instructions are in [docs/MODELS.md](docs/MODELS.md).

Test computer: Windows x64, Intel i5-12400F, 16 GB RAM. CPU-only inference. No NVIDIA CUDA requirement.

- TypeScript + Vite production build: passed.
- Oxlint: passed with no warnings after excluding installed skill examples and permitting shadcn's generated variant exports.
- Unit tests: Persian kaf/yeh normalization with half-space preservation; subtitle timestamp boundaries and Unicode; subprocess failure and cancellation.
- English end-to-end smoke test: official Whisper.cpp JFK sample, decoded locally with the multilingual turbo model.
- Persian engine smoke test: first WAV in the public Google FLEURS `fa_ir` development archive, `10049006222377318397.wav`. Roughly 9.5 seconds of speech processed in 14.395 seconds including local FFmpeg conversion/model loading. This is one short sample, not a general performance or accuracy benchmark.

Reference:

> بزرگترین مسابقه سال در ماه دسامبر در زمین‌های چوگان «لاس کانیتاس» اتفاق می‌افتد.

Output:

> بزرگترین مسابقه سال در ماه دسام در زمینهای چوگان لاس کانیگاس اتفاق می افتاد.

The test confirms working Persian output and also exposes errors in the month, place name, orthography and verb tense. Review is necessary. No accuracy percentage is claimed.

Engine archive SHA-256 (matches GitHub release asset digest):
`6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb`

Model SHA-256:
`394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2`

`npm ci --dry-run --ignore-scripts --offline` confirms the package manifest and lockfile agree. npm 12 failed while refreshing the lockfile for an optional WASM package; npm 11.13 refreshed it successfully. Three low-severity audit reports occur through the development-only shadcn CLI/deepmerge dependency tree. No npm packages are required by the Electron main-process code at runtime; the renderer is bundled.

Desktop integration passed in both the development Electron launch and the final self-contained `outputs/Ava/Ava.exe` build:

- Model/engine readiness and disabled start before file selection.
- Renderer Node isolation and blocked outbound fetch.
- Native selection of an MP4 made from the public Persian test recording; actual FFmpeg extraction and Whisper inference, with no recognition stubs.
- Editing Persian passages and copying the edited text.
- TXT, SRT and VTT exports contain the edits.
- Cancellation is reported and an invalid media file produces a recoverable error.
- No renderer JavaScript exceptions.

The MP4 smoke test output differs slightly from the lossless WAV test, including an additional initial-letter error. This further supports reviewing transcripts rather than treating the result as exact.

Visually inspected the actual Electron window and saved a screenshot. The self-contained Windows output is approximately 1.2 GB, includes model and native engines, and does not depend on a Python/Node installation. A desktop shortcut points to the prepared output launcher.

## GPU selection

Vulkan GPU detection identified the AMD Radeon RX 6700 XT. Direct GPU inference of the 9.5-second public Persian WAV completed in about 4.9 seconds of engine time (including model loading). This is a short smoke test, not a general benchmark. Auto-mode desktop integration verified actual GPU activation, transcription, exports and cancellation. Missing-backend detection returns unavailable so CPU remains usable. GPU changes speed, not recognition reliability.

Persian interface: verified default fa/RTL, switching to English/LTR, persistence after reload, and visually inspected the Persian layout.

## Quiet-intro repetition fix (1.1.0)

A private local recording reproduced the exact repeated Latin-phrase failure on CPU and GPU. Tests on a 60-second excerpt showed that volume normalization and clearing text context did not resolve it. Silero VAD removed the repeated phrase, while a later spoken excerpt remained transcribable. A 200 ms speech pad improved boundary coverage. A synthetic 60-second silent WAV produced zero passages. The local regression was run before the fix (failed) and after the fix (passed). No private audio or recovered transcript is committed here.

The optional large-v3 Q5_0 model was checksum-verified (d75795ecff3f83b5faa89d1900604ad8c780abd5739fae406de19f23ecd98ad1). Silero v5.1.2 SHA-256: 29940d98d42b91fbd05ce489f3ecf7c72f0a42f027e4875919a28fb4c04ea2cf. Accuracy still varies; the larger model also misheard words in the test clips. No equivalence to a hosted service is claimed.

Full local-recording rerun with the Faster model and VAD completed in 373.459 seconds. It produced 2,625 passages, reached 4,444.62 seconds in the source timeline, contained no PYM/JBZ phrase, and had a maximum identical-passage streak of two. This checks the reported repetition failure, not word-for-word accuracy. The full run used the initial default speech pad; the final 200 ms pad was separately checked on the reproduction excerpt. The installed desktop app was tested against that excerpt using the Higher accuracy model.

## Automatic saving and history (main branch)

SQLite persistence, Unicode TXT/SRT/VTT exports, same-name job separation, edited text persistence, pagination and custom save-folder settings passed storage tests. A failed file destination retained the database entry and recovered after changing folders and retrying. OS default-folder construction was checked using Windows and POSIX path implementations. Desktop integration with an isolated test profile checked the latest-five list, two date groups, opening/editing a record, changing folders, automatic export after real local inference, and persistence after restarting the installed app. Screenshots use only a public sample and a disposable profile; no user recordings/history are published.

## Linux release (1.3.0)

Ubuntu 24.04 x64 release job [40774799462](https://github.com/aliabedi1/persian-transcriber/actions/runs/40774799462) passed. CPU and Vulkan engines were compiled from pinned Whisper.cpp source; non-glibc dependencies and checksum-verified models are bundled. Built AppImage and Debian packages. The packaged executable passed real Persian inference using the public FLEURS fixture, editing, clipboard, TXT/SRT/VTT export, cancellation, invalid-file handling, renderer isolation and network blocking. Engine and SQLite storage tests passed on Linux. Windows packaged integration also passed with real Persian audio.

Linux requires an AVX2-capable x64 CPU and Ubuntu 24.04 or a compatible system. Physical Linux GPU hardware was not tested; Vulkan requires a compatible vendor driver. macOS and Linux ARM installers are not provided. The release tests launch the packaged executable from linux-unpacked, rather than installing the Debian package or mounting the AppImage.
