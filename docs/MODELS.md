# Developer model catalog

`electron/model-catalog.json` is the central catalog. It is packaged with the app; neither startup nor listing models contacts a server. Changing the catalog requires rebuilding/releasing the app, but no settings UI change. The renderer receives names, descriptions, total download sizes, status and selection through the preload bridge; it never supplies download URLs or filesystem paths.

## Adding a model

1. Add a `files` entry for every new binary: a unique key, safe `.bin` basename (`name`), ordered HTTPS source/mirror `urls`, exact byte `size`, and SHA-256 `sha256`. Use the source's published LFS SHA-256 or independently verify the artifact. All downloads require both size and hash verification. Keep existing shared file keys when reusing a VAD model.
2. Append a `models` entry: unique stable lowercase hyphenated `id`, display `name`, `description`, optional Persian `descriptionFa`, `engine`, human-readable `compatibility`, and keys for `modelFile` and `vadFile` in `files`.
3. Use `engine: "whisper.cpp-ggml-v1"` only for GGML Whisper models supported by both bundled CPU and Vulkan engines, with the configured Silero VAD. Other engines are omitted from the supported model list. Do not label a new engine/format as compatible without verifying native inference. A new engine family requires backend support.
4. Rebuild, open Settings → Models, download the new entry, select it, and transcribe a public fixture on each supported platform/backend. Verify restart/offline behavior. `npm run test:models` also verifies a temporary catalog-only Tiny model addition using its configured upstream source.

Example model (after adding the referenced file):

```json
{
  "id": "my-whisper-model",
  "name": "My Whisper model",
  "description": "Explain its language coverage and processing tradeoff.",
  "engine": "whisper.cpp-ggml-v1",
  "compatibility": "GGML Whisper; bundled whisper.cpp CPU/Vulkan and Silero v5 VAD.",
  "modelFile": "my-model-file-key",
  "vadFile": "silero-v5"
}
```

Treat IDs as persistent settings keys. Prefer new IDs and filenames for different weights; if replacing a file in place, update its size/hash. Old files will fail validation and require an explicit re-download. Do not reuse one filename for different catalog file keys. URLs may redirect (including Hugging Face's signed storage redirects); a failed source falls through to the next configured mirror. Sources must serve the raw binary, not an HTML landing page or Git LFS pointer.

## Storage and job behavior

Files live in `app.getPath('userData')/models`, outside the installed resources directory. There is no automatic migration/download from the old bundled `models/` directory. Selection lives in an atomically replaced `selection.json` in that folder. The user explicitly selects a verified downloaded model. The selected model and VAD paths are captured when the next job starts, so switching models during a job only affects later jobs and CPU fallback retains the captured model. History records the stable model ID in its existing `quality` field; legacy history remains readable.

Downloads stream to `.partial` files, enforce the expected byte limit, then verify the full SHA-256 before an atomic rename. Shared files are downloaded once even for concurrent model requests. Download errors expose a retry; process interruption leaves partial files ignored and the next attempt replaces them. Previously verified final files are reused. Completed files are hashed again after app restart and when file metadata changes. Model listing/selection/transcription makes no network request. The renderer's network block remains enabled; only explicit catalog download operations in the main process fetch model files. Uninstall/reinstall behavior for app data is controlled by the OS/installer; deleting the app data folder deletes downloaded models and selection.

## Verification

- `node --test tests/models.test.cjs`: isolated catalog/store tests including corruption, partial files, HTTP/stream failure, mirrors, concurrent shared downloads, selection snapshots, restart/offline and packaging/setup exclusions.
- `node tests/models-desktop.cjs` (after `npm run build`): launches an isolated app copy and profile, actually downloads both production models plus a catalog-only Tiny entry, transcribes the public Persian fixture with both, switches during an active job, restarts, then transcribes with both while network requests fail. It needs internet initially, roughly 1.8 GB free space, and installed native runtimes. The test deletes its temporary profile/downloads and preserves the normal user profile and existing development models.
