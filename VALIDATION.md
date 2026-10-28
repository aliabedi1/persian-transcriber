# Validation

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
