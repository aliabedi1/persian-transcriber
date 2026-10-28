#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Ubuntu 22.04+ x64. Install build dependencies before running (see README).
mkdir -p runtime/linux/{cpu,vulkan,ffmpeg} models
source_dir=$(mktemp -d)
trap 'rm -rf "$source_dir"' EXIT
curl -fL --retry 3 https://github.com/ggml-org/whisper.cpp/archive/d2a764c648779feb36d44363f212a29b00aad1af.tar.gz | tar xz -C "$source_dir" --strip-components=1
for backend in cpu vulkan; do
  vulkan=OFF; [[ "$backend" == vulkan ]] && vulkan=ON
  cmake -S "$source_dir" -B "$source_dir/build-$backend" -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DGGML_NATIVE=OFF -DGGML_VULKAN="$vulkan" -DWHISPER_BUILD_TESTS=OFF
  cmake --build "$source_dir/build-$backend" --target whisper-cli -j 2
  cp "$source_dir/build-$backend/bin/whisper-cli" "runtime/linux/$backend/"
done
cp /usr/bin/ffmpeg runtime/linux/ffmpeg/
# Bundle FFmpeg's non-glibc dependencies; retain the distro's libc and loader.
ldd /usr/bin/ffmpeg | awk '$2 == "=>" && $3 ~ /^\// {print $3}' | while read -r lib; do
  case "$(basename "$lib")" in libc.so.*|libm.so.*|libpthread.so.*|libdl.so.*|librt.so.*|libresolv.so.*) continue;; esac
  cp -L "$lib" runtime/linux/ffmpeg/
done
mkdir -p third-party/linux-package-notices
for notice in /usr/share/doc/*/copyright; do cp "$notice" "third-party/linux-package-notices/$(basename "$(dirname "$notice")").txt"; done
cp "$source_dir/LICENSE" third-party/Whisper-Linux-LICENSE.txt
download() {
  local name="$1" hash="$2" url="$3"
  if [[ ! -f "models/$name" ]] || ! echo "$hash  models/$name" | sha256sum -c - >/dev/null 2>&1; then
    curl -fL --retry 3 "$url" -o "models/$name"
  fi
  echo "$hash  models/$name" | sha256sum -c -
}
download ggml-large-v3-turbo-q5_0.bin 394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2 https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin
download ggml-large-v3-q5_0.bin d75795ecff3f83b5faa89d1900604ad8c780abd5739fae406de19f23ecd98ad1 https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-q5_0.bin
download ggml-silero-v5.1.2.bin 29940d98d42b91fbd05ce489f3ecf7c72f0a42f027e4875919a28fb4c04ea2cf https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin
chmod +x runtime/linux/*/* 2>/dev/null || true
