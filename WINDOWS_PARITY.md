# Windows Parity Progress

## Already in Place
- **Core WineJS runtime:** The browser app can already ingest Win64 executables, interpret entry-point instructions via a toy x86-64 simulator, surface captured `WriteConsole*` output, extract printable strings, and mock basic GUI windows on a canvas whenever `user32`-style imports fire. This lets you watch many LearnWin32 samples “boot” inside the browser today.

- **Cross-platform build tooling and sample corpus:** The repo keeps the upstream LearnWin32 sources, a Zig-based script for cross-compiling them to 64-bit Windows binaries, and end-to-end documentation for reproducing those builds on macOS (complete with the default libraries, target triple, and flag forwarding). That workflow makes it easy to regenerate fixtures without touching a Windows VM, ensuring you always have representative binaries to feed the emulator.

- **Backend plumbing for storage and networking:** A companion Node.js backend already provides block-device virtualization (configurable block/drive counts with per-letter disk images) plus a Winsock-over-WebSocket tunnel so intercepted `WSAStartup`/`connect`/`send`/`recv` calls can be routed to real host sockets. The UI exposes controls for formatting drives and monitoring backend activity, giving today’s emulator persistent storage and TCP reachability that resemble Windows subsystems at a high level.

- **Minimal PE/X86 simulator capabilities:** `emulator.js` parses PE32+ headers, tracks sections/imports, executes a real (though constrained) subset of x86-64 instructions, and hijacks Import Address Table calls to flag console/GUI intent. This forms the scaffolding for more complete parity work because basic program control flow already runs inside the browser.

## Still Needed to Reach Windows Parity
- **Broader CPU coverage:** The interpreter only supports the mainstream instructions emitted by typical MSVC prologues and fails on complex opcodes, self-modifying code, or hand-written assembly. Matching real Windows behavior will require implementing the rest of the x86-64 ISA (including privileged instructions, vector extensions, and unusual control-flow patterns) plus a more faithful execution environment to avoid the current “simulation failure” path.

- **Comprehensive Win32/Win64 API emulation:** Today’s hooks focus on a handful of `kernel32!WriteConsole*`, basic `user32` window-creation calls, and Winsock shims. Achieving parity means modeling far more kernel32/user32/gdi32/comctl32/COM behaviors (message loops, HWND state, device contexts, timers, shell dialogs, etc.) so that GUI-heavy LearnWin32 samples—and real-world apps—can interact with the runtime exactly as they would on Windows.

- **Richer GUI message handling and visualization:** The current faux window simply signals that a GUI API was touched. Windows parity would demand a full message pump, hit-testing, focus management, painting semantics, DPI awareness, and support for more complex drawing APIs (GDI, Direct2D/DirectWrite) to display visuals indistinguishable from native Windows desktops.

- **Robust PE/system integration:** The README explicitly frames the prototypes as “scaffolding” for deeper API hooks, better PE parsing, and safer inspection techniques. To match Windows you’ll need full PE loader semantics (relocations, TLS callbacks, resource sections), dynamic linking behavior, proper security descriptor handling, and hardened analysis tooling that can cope with malicious binaries.

- **Broader automation and platform coverage:** While macOS cross-compilation is solved, Windows parity implies verifying that binaries built here behave identically on real Windows. That requires automated regression suites comparing emulator output to native runs, CI coverage across OSes, and potentially a Windows-native build/debug workflow so contributors can validate fixes against genuine system DLLs.
