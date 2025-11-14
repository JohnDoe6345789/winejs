# IRC-Style Win32 Client

This companion Win32 GUI app drives the mini IRC server sample. It exposes host/port/nickname inputs, a connection status strip, a scrollback pane, and a single-line composer with a Send button so it can be operated entirely with mouse and keyboard inside the WineJS emulator.

## Features
- Uses `WSAAsyncSelect` to surface `FD_CONNECT`, `FD_READ`, and `FD_CLOSE` into the message loop, which keeps Winsock I/O responsive without worker threads.
- Speaks the newline-delimited protocol understood by the server (`NICK:<name>`, `MSG:<text>`, and `INFO`/`FROM` notifications) and shows everything in UTF-8-friendly wide strings.
- Handles instant connect/disconnect cycles, surfacing connection state in the GUI and falling back to `MessageBeep` when the user tries to send while offline.

## Building

```bash
scripts/build_win64.sh LearnWin32/IrcChatClient/cpp/main.cpp \
  -o build/win64/IrcChatClient.exe
```

Once compiled, you can run the client locally against the server or upload both executables into WineJS. When the emulator’s backend tunnel is attached the client can connect to the host-side server from inside the simulated Win64 environment, letting you inspect the Winsock activity logs in the browser alongside the GUI output.
