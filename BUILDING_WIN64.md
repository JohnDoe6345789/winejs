# Building Win64 samples on macOS

The Win32 examples under `LearnWin32/` can be cross-compiled into native 64-bit
Windows executables directly on macOS by using the Zig toolchain, which bundles
Clang/LLD and the Windows SDK libraries.

## 1. Install Zig

```bash
brew install zig
# or download a release matching your platform from https://ziglang.org/download/
```

Verify it works:

```bash
zig version
```

## 2. Build an example

Use the helper script to compile either C (`zig cc`) or C++ (`zig c++`) sources.
The script adds the libs that the samples commonly need (`kernel32`, `user32`,
`gdi32`, `shell32`, `ole32`), enables the Unicode entry point (`-municode`), and
targets the `x86_64-windows-gnu` triple.

```bash
scripts/build_win64.sh LearnWin32/HelloWorld/cpp/main.cpp \
  -o build/win64/HelloWorld.exe
```

The resulting `.exe` lives under `build/win64/` by default. You can inspect it
with `file build/win64/HelloWorld.exe` or run it inside Wine/VM/real Windows.

### Passing extra flags or libraries

Anything after `--` is forwarded to the Zig compiler. This lets you define
preprocessor symbols or link additional libraries:

```bash
scripts/build_win64.sh LearnWin32/SimpleDrawing/main.c \
  -- -DUNICODE=1 -ld2d1 -ldwrite
```

## 3. Why Zig?

Zig ships self-contained cross-compilers for macOS, so no additional SDK
downloads are needed. As long as Zig is on `PATH`, the script can generate
Win64 binaries on any Apple Silicon or Intel Mac.
