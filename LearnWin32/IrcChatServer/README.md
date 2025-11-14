# IRC-Style Win32 Server

This sample hosts a tiny IRC-inspired chat room with a pure Win32 GUI so it can be cross-compiled to Win64 and exercised inside the WineJS simulator. The window shows a running log, the connected clients list, the listening port, and a Start/Stop button.

## Features
- Sets up a Winsock listener and surfaces every `FD_ACCEPT`, `FD_READ`, and `FD_CLOSE` event through the window message loop using `WSAAsyncSelect`, keeping the entire server single-threaded.
- Tracks connected clients, nicknames, and per-socket receive buffers so newline-delimited protocol frames can be spooled back into structured events.
- Broadcasts system notices (`INFO:<text>`) and chat payloads (`FROM:<nick>:<message>`) to every client, echoing activity into the GUI log while keeping the network encoding UTF-8 friendly.

The protocol expects clients to send a nickname line first (`NICK:<display name>`). User text is relayed with `MSG:<payload>`. Any line that equals `PING` receives `PONG` so frontends can keep the connection alive.

## Building

Use the Zig helper script to cross-compile the sample into a PE32+ executable that WineJS can load:

```bash
scripts/build_win64.sh LearnWin32/IrcChatServer/cpp/main.cpp \
  -o build/win64/IrcChatServer.exe
```

The server relies on Winsock, so the shared build script already links `ws2_32.lib`. Run the resulting binary directly on Windows or feed it into the WineJS emulator alongside the client sample. The emulator’s backend socket tunnel lets the simulated process talk to the host’s TCP stack, so you can watch the entire request/response flow without leaving the browser.
