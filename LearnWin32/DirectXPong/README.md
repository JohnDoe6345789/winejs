---
page_type: sample
description: "A Direct2D-powered Pong clone that exercises timers, keyboard input, and sprite rendering."
languages:
- cpp
products:
- windows
- windows-api-win32
---

# DirectX Pong sample

This sample draws a simple Pong game using Direct2D and the same BaseWindow helper that powers the other LearnWin32 projects. Two paddles, a ball, a center net, and score tracking are updated in a timer-driven loop so the executable can be fed directly into the WineJS simulator.

Controls:

* `W` / `S` move the left paddle.
* `Up Arrow` / `Down Arrow` move the right paddle. When no keys are pressed, the right paddle follows the ball automatically so the loop stays busy during simulation.
* `Space` resets the rally, `Esc` exits.

## Build the sample

### Visual Studio

1. Start Visual Studio and create a new **Win32 Desktop Application** project (or open an existing scratch solution).
2. Add `LearnWin32/DirectXPong/cpp/main.cpp` and `basewin.h` to the project, then make sure `d2d1.lib` is listed under the linker inputs.
3. Press F7 or use **Build** \> **Build Solution** to compile the sample.

### WineJS Zig helper

To generate a Win64 binary from macOS or Linux and load it inside the emulator UI, run:

```bash
scripts/build_win64.sh LearnWin32/DirectXPong/cpp/main.cpp -- -ld2d1
```

The resulting `build/win64/main.exe` (or whatever name you pass with `-o`) can then be selected inside `index.html`.

## Run the sample

To debug on Windows, press F5 or use **Debug** \> **Start Debugging**. To run without the debugger, press Ctrl+F5. Inside WineJS, load the compiled executable and the faux canvas will display the paddles, ball, and score changes driven by this Direct2D sample.
