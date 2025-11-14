#!/usr/bin/env bash

# Cross-compiles a C/C++ Win32 sample to a 64-bit Windows executable using zig.

set -euo pipefail

usage() {
    cat <<'USAGE'
Usage: scripts/build_win64.sh <source> [-o output.exe] [-- <extra zig flags>]

Example:
  scripts/build_win64.sh LearnWin32/HelloWorld/cpp/main.cpp \
    -o build/win64/HelloWorld.exe -- -DUNICODE=1

The script requires zig to be available on PATH. Use Homebrew (`brew install zig`)
or download a release from https://ziglang.org/download/.
USAGE
}

if [[ $# -lt 1 ]]; then
    usage
    exit 1
fi

if ! command -v zig >/dev/null 2>&1; then
    echo "Error: zig not found on PATH. Install zig before running this script." >&2
    exit 2
fi

SOURCE=""
OUTPUT=""
EXTRA=()

while [[ $# -gt 0 ]]; do
    case "$1" in
        -h|--help)
            usage
            exit 0
            ;;
        -o|--output)
            if [[ $# -lt 2 ]]; then
                echo "Error: missing value for $1" >&2
                exit 1
            fi
            OUTPUT="$2"
            shift 2
            ;;
        --)
            shift
            EXTRA+=("$@")
            break
            ;;
        -*)
            echo "Unknown option: $1" >&2
            usage
            exit 1
            ;;
        *)
            if [[ -z "${SOURCE}" ]]; then
                SOURCE="$1"
            else
                EXTRA+=("$1")
            fi
            shift
            ;;
    esac
done

if [[ -z "${SOURCE}" ]]; then
    echo "Error: missing source file" >&2
    usage
    exit 1
fi

if [[ ! -f "${SOURCE}" ]]; then
    echo "Error: source file '${SOURCE}' does not exist" >&2
    exit 1
fi

EXT="${SOURCE##*.}"
if [[ -z "${OUTPUT}" ]]; then
    base="$(basename "${SOURCE}")"
    stem="${base%.*}"
    OUTPUT="build/win64/${stem}.exe"
fi

mkdir -p "$(dirname "${OUTPUT}")"

DEFAULT_FLAGS=(-municode)
DEFAULT_LIBS=(-lkernel32 -luser32 -lgdi32 -lshell32 -lole32 -lws2_32)
TARGET_TRIPLE="x86_64-windows-gnu"

if [[ "${EXT}" == "c" ]]; then
    COMPILER=(zig cc)
else
    COMPILER=(zig c++)
fi

CMD=("${COMPILER[@]}" -target "${TARGET_TRIPLE}" -O2 "${SOURCE}" \
  "${DEFAULT_FLAGS[@]}" \
  -o "${OUTPUT}" \
  "${DEFAULT_LIBS[@]}")

if [[ ${#EXTRA[@]} -gt 0 ]]; then
    CMD+=("${EXTRA[@]}")
fi

set -x
"${CMD[@]}"
