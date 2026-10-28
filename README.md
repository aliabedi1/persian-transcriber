# Ava · آوا

A Windows app that turns Persian audio and video into editable text. Transcription runs on your computer, including when you are offline. There is no account or paid API.

## Install

1. Open the [latest release](https://github.com/aliabedi1/persian-transcriber/releases/latest).
2. Download **Ava-Setup-1.1.0-x64.exe** and run it.
3. Open **Ava** from the desktop or Start menu.

The installer includes the models and tools. No Python, Node.js, or separate model download is needed. The download is about **1.7 GB**; the installed app uses about **2.3 GB**. Allow extra disk space during installation.

The installer is unsigned, so Windows may show a publisher warning. Uninstall through **Windows Settings → Apps**.

## Use

1. Click **انتخاب فایل / Choose file** and select an audio or video file.
2. Set **زبان گفتار / Spoken language** to the language in the recording. Persian is selected by default.
3. Choose an accuracy setting and processor, or keep the defaults below.
4. Click **تبدیل به متن / Transcribe recording**.
5. Review and edit the passages. Use **Copy**, **TXT**, **SRT**, or **VTT** to save the result.

On the main branch, completed transcriptions are saved automatically as TXT, SRT, and VTT under **Documents/Ava**, in date folders. Use **Change folder** to choose another location. Windows, Linux, and macOS folder locations come from the OS. Changing the folder affects future jobs; existing files stay where they were saved.

The main page lists the latest five transcriptions. Use **All history / سوابق** to browse entries grouped by date and reopen them without the original recording. Edits can be saved with **Save changes / ذخیرهٔ تغییرات**. History and settings are stored in a local SQLite database in the app data folder. If automatic file saving fails, the app keeps the history entry and offers a retry.

The 1.1.0 installer still requires manual export; automatic saving and history are currently on main.

Common inputs include MP3, M4A, WAV, OGG, FLAC, MP4, MKV, MOV, and WebM. Video files must contain an audio track.

| Setting | Options |
| --- | --- |
| Accuracy | **Higher accuracy** uses large-v3 Q5_0. **Faster** uses large-v3-turbo Q5_0. A larger model is slower and does not always give a better result. |
| Processor | **Auto** uses a detected Vulkan GPU, with CPU fallback. Select **CPU** or **GPU** to choose manually. GPU mode needs a compatible driver. |
| Interface | **فارسی** uses RTL; **English** uses LTR. This is separate from the recording language. |
| Appearance | System (default), Light, and Dark are available in the header on main. System follows OS changes until you choose an override. |

## Screenshots

Persian interface in light mode:

![Persian workspace in light mode](docs/screenshots/persian-light.png)

A transcript in dark mode, with editing and export controls:

![Persian transcript in dark mode](docs/screenshots/persian-dark-transcript.png)

History groups saved transcriptions by date:

![Transcription history grouped by date](docs/screenshots/history.png)

Screenshots show the main branch. Timers, the System/Light/Dark selector, automatic saving, and history are on main; the 1.1.0 installer predates those changes. The example audio is a public Persian sample from [Google FLEURS](https://huggingface.co/datasets/google/fleurs), not a user's recording.

## What to expect

- Speech detection skips non-speech sections before transcription.
- Recordings are processed locally and are not uploaded. Temporary audio is removed after completion or cancellation; a crash can leave temporary files.
- Automatic transcripts can contain wrong words, especially names and technical terms. Review them before use.
- Ava does not identify speakers, translate recordings, or record a live microphone.

See [VALIDATION.md](VALIDATION.md) for tests and known accuracy limits.

## Run from source

Requires Windows x64, Node.js, and FFmpeg. Internet is needed for the initial dependency and model downloads.

```powershell
git clone https://github.com/aliabedi1/persian-transcriber.git
cd persian-transcriber
# Install FFmpeg if needed, then reopen PowerShell:
winget install --id Gyan.FFmpeg.Shared -e
./setup.ps1
npm start
```

```powershell
npm run build          # Build the interface
npm test               # Engine unit tests
npm run test:desktop   # Desktop checks
npm run test:timing    # Timer checks
npm run test:history   # SQLite storage and history checks
npm run dist:win       # Build the Windows installer
```

The app uses Electron, React, and shadcn/ui. Models and native binaries are downloaded by setup and excluded from Git.

## Credits and license

Ava's code is [MIT licensed](LICENSE). It uses [Whisper.cpp](https://github.com/ggml-org/whisper.cpp), [Whisper models](https://huggingface.co/ggerganov/whisper.cpp), [Silero VAD](https://github.com/snakers4/silero-vad), [FFmpeg](https://ffmpeg.org/), and a [community Windows Vulkan build](https://github.com/nyancodex/whisper-server-vulkan-windows). Third-party software retains its own license; notices are in [third-party](third-party/).
