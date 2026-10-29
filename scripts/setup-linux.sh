#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Ubuntu 24.04+ x64. Install build dependencies before running (see README).
mkdir -p runtime/linux/{cpu,vulkan,ffmpeg}
source_dir=$(mktemp -d)
trap 'rm -rf "$source_dir"' EXIT
curl -fL --retry 3 https://github.com/ggml-org/whisper.cpp/archive/d2a764c648779feb36d44363f212a29b00aad1af.tar.gz | tar xz -C "$source_dir" --strip-components=1
for backend in cpu vulkan; do
  vulkan=OFF; [[ "$backend" == vulkan ]] && vulkan=ON
  cmake -S "$source_dir" -B "$source_dir/build-$backend" -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DGGML_NATIVE=OFF -DGGML_VULKAN="$vulkan" -DWHISPER_BUILD_TESTS=OFF
  cmake --build "$source_dir/build-$backend" --target whisper-cli whisper-server -j 2
  cp "$source_dir/build-$backend/bin/whisper-cli" "runtime/linux/$backend/"
  cp "$source_dir/build-$backend/bin/whisper-server" "runtime/linux/$backend/"
  if [[ "$backend" == cpu ]]; then
    cmake --build "$source_dir/build-$backend" --target whisper-vad-speech-segments -j 2
    cp "$source_dir/build-$backend/bin/whisper-vad-speech-segments" runtime/linux/cpu/
  fi
done
cp /usr/bin/ffmpeg runtime/linux/ffmpeg/
# Bundle FFmpeg's non-glibc dependencies; retain the distro's libc and loader.
for executable in runtime/linux/cpu/whisper-cli runtime/linux/cpu/whisper-server runtime/linux/cpu/whisper-vad-speech-segments runtime/linux/vulkan/whisper-cli runtime/linux/vulkan/whisper-server runtime/linux/ffmpeg/ffmpeg; do
  ldd "$executable" | awk '$2 == "=>" && $3 ~ /^\// {print $3}' | while read -r lib; do
    case "$(basename "$lib")" in libc.so.*|libm.so.*|libpthread.so.*|libdl.so.*|librt.so.*|libresolv.so.*) continue;; esac
    cp -L "$lib" "$(dirname "$executable")/"
  done
done

mkdir -p third-party/linux-package-notices
for notice in /usr/share/doc/*/copyright; do cp "$notice" "third-party/linux-package-notices/$(basename "$(dirname "$notice")").txt"; done
cp "$source_dir/LICENSE" third-party/Whisper-Linux-LICENSE.txt
chmod +x runtime/linux/*/* 2>/dev/null || true
