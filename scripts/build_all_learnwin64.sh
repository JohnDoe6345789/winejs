#!/usr/bin/env bash

# Builds every LearnWin32 sample into a 64-bit Windows executable via Zig.

set -euo pipefail

usage() {
    cat <<'USAGE'
Usage: scripts/build_all_learnwin64.sh [-- <extra zig flags>]

Invokes scripts/build_win64.sh for each C/C++ sample in LearnWin32/.
Anything after -- is forwarded to every zig invocation (e.g. -DUNICODE=1).
USAGE
}

EXTRA=()

while [[ $# -gt 0 ]]; do
    case "$1" in
        -h|--help)
            usage
            exit 0
            ;;
        --)
            shift
            EXTRA+=("$@")
            break
            ;;
        *)
            echo "Unknown option: $1" >&2
            usage
            exit 1
            ;;
    esac
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_SCRIPT="${ROOT}/scripts/build_win64.sh"
EXAMPLES_DIR="${ROOT}/LearnWin32"

if [[ ! -x "${BUILD_SCRIPT}" ]]; then
    echo "Error: ${BUILD_SCRIPT} not found or not executable" >&2
    exit 1
fi

if [[ ! -d "${EXAMPLES_DIR}" ]]; then
    echo "Error: ${EXAMPLES_DIR} directory not found" >&2
    exit 1
fi

mapfile -t SOURCES < <(find "${EXAMPLES_DIR}" -type f \( -name '*.c' -o -name '*.cpp' \) | sort)

if [[ ${#SOURCES[@]} -eq 0 ]]; then
    echo "Error: no C/C++ sources found under ${EXAMPLES_DIR}" >&2
    exit 1
fi

pushd "${ROOT}" >/dev/null

for src in "${SOURCES[@]}"; do
    relative="${src#"${ROOT}/"}"
    parent_dir="$(basename "$(dirname "${src}")")"
    if [[ "${parent_dir}" == "c" || "${parent_dir}" == "cpp" ]]; then
        example_dir="$(basename "$(dirname "$(dirname "${src}")")")"
    else
        example_dir="${parent_dir}"
    fi

    stem="$(basename "${src%.*}")"
    output_dir="build/win64/${example_dir}"
    mkdir -p "${output_dir}"
    output="${output_dir}/${stem}.exe"

    echo "==> Building ${relative}"
    if [[ ${#EXTRA[@]} -gt 0 ]]; then
        scripts/build_win64.sh "${relative}" -o "${output}" -- "${EXTRA[@]}"
    else
        scripts/build_win64.sh "${relative}" -o "${output}"
    fi
done

popd >/dev/null

echo "Successfully built ${#SOURCES[@]} example(s). Binaries are under build/win64/."
