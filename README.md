# WineJS Experiments

WineJS is a playground for exploring how much of the Win32 execution model can be sketched directly in the browser. The repository combines quick JavaScript runtimes that can inspect `.exe` files, a set of LearnWin32 samples, and Zig-based tooling for producing new binaries to feed the experiments.

## Project Objectives
- Provide a lightweight WineJS prototype (`index.*`) that can load a Windows executable in the browser, walk its entry-point instructions on a toy x86-64 interpreter, surface the observed console output, visualize extracted strings, and fake enough GUI plumbing to render windows on an HTML canvas.
- Offer a repeatable macOS workflow (`scripts/build_win64.sh`) for cross-compiling the LearnWin32 samples to Win64 binaries via Zig so that new artifacts can be generated without booting a Windows VM.
- Preserve the original LearnWin32 source material so it can serve as a reference for Win32 API usage and as realistic input for future WineJS API-hooking experiments.
- Document the build and experimentation flow so contributors can iterate on deeper API emulation, richer GUI message handling, and safer binary inspection techniques.

## Repository Layout
- `index.*` – unified browser runtime that feeds `.exe` bytes into the in-browser x86-64 simulator, logs any intercepted `WriteConsole` payloads, still exposes printable strings for reference, and paints a faux GUI window whenever user32-style calls are observed.
- `LearnWin32/` – upstream tutorials and samples (Hello World, BaseWindow, drawing demos, etc.) that can be rebuilt into new `.exe` fixtures.
- `scripts/build_win64.sh` – helper that shells out to `zig cc`/`zig c++` with the right Windows libraries and target triple.
- `BUILDING_WIN64.md` – detailed walkthrough of installing Zig and compiling an example.
- `build/win64/` – default output folder for the cross-compiled artifacts.

## Getting Started
1. Install [Zig](https://ziglang.org/download/) (`brew install zig`) if you want to recompile or create samples.
2. Build a sample executable, for example:
   ```bash
   scripts/build_win64.sh LearnWin32/HelloWorld/cpp/main.cpp \
     -o build/win64/HelloWorld.exe
   ```
3. Open `index.html` in a modern browser, select one of the compiled `.exe` files, and watch the runtime step through the entry-point instructions. Calls routed through the Import Address Table (for example `kernel32!WriteConsole*` or the common `user32` window creation helpers) are intercepted so the console panel and faux canvas can reflect what the binary attempted to do.

## x86-64 Simulation Overview

The browser runtime now includes `emulator.js`, a minimal PE32+ parser and x86-64 instruction simulator. The shim:

- Parses the executable headers to locate the entry point, section data, and Import Address Table.
- Executes a constrained but real subset of x86-64 instructions (register moves, arithmetic, stack ops, conditional jumps, RIP-relative loads, and the handful of SIMD instructions commonly found in MSVC prologues).
- Intercepts indirect calls that resolve through the IAT so that `WriteConsoleA/W` payloads can be surfaced verbatim and common `user32` routines can be flagged as GUI intent.

The interpreter is intentionally small and only targets Win64 PE files that stick to mainstream compiler output. Complex instructions, self-modifying code, or handwritten assembly that relies on unimplemented opcodes will result in a simulation failure banner inside the UI, at which point the string-extraction panel is still available for manual inspection.

The current prototypes are intentionally small; use them as scaffolding for experimenting with richer API hooks, better PE parsing, or alternative visualization techniques as the project evolves.
