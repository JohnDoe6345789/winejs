#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <winsock2.h>
#include <ws2tcpip.h>

#include <cwchar>
#include <string>

namespace {

constexpr UINT kSocketMessage = WM_APP + 1337;

HWND g_hwndStatus = nullptr;
HWND g_hwndHost = nullptr;
HWND g_hwndPort = nullptr;
HWND g_hwndNickname = nullptr;
HWND g_hwndConnect = nullptr;
HWND g_hwndLog = nullptr;
HWND g_hwndMessage = nullptr;
HWND g_hwndSend = nullptr;

SOCKET g_socket = INVALID_SOCKET;
bool g_connecting = false;
bool g_connected = false;
std::string g_recvBuffer;

void SendNickname();

std::wstring Utf8ToWide(const std::string &input) {
    if (input.empty()) {
        return L"";
    }
    int needed = MultiByteToWideChar(CP_UTF8, 0, input.c_str(), static_cast<int>(input.size()), nullptr, 0);
    std::wstring result(needed, L'\0');
    MultiByteToWideChar(CP_UTF8, 0, input.c_str(), static_cast<int>(input.size()), result.data(), needed);
    return result;
}

std::string WideToUtf8(const std::wstring &input) {
    if (input.empty()) {
        return "";
    }
    int needed = WideCharToMultiByte(CP_UTF8, 0, input.c_str(), static_cast<int>(input.size()), nullptr, 0, nullptr, nullptr);
    std::string result(needed, '\0');
    WideCharToMultiByte(CP_UTF8, 0, input.c_str(), static_cast<int>(input.size()), result.data(), needed, nullptr, nullptr);
    return result;
}

void AppendLog(const std::wstring &line) {
    if (!g_hwndLog) {
        return;
    }
    std::wstring text = line;
    text.append(L"\r\n");
    int length = GetWindowTextLengthW(g_hwndLog);
    SendMessageW(g_hwndLog, EM_SETSEL, length, length);
    SendMessageW(g_hwndLog, EM_REPLACESEL, FALSE, reinterpret_cast<LPARAM>(text.c_str()));
}

void SetStatus(const std::wstring &text) {
    if (g_hwndStatus) {
        SetWindowTextW(g_hwndStatus, text.c_str());
    }
}

void UpdateControls() {
    if (!g_hwndConnect || !g_hwndSend) {
        return;
    }
    if (g_connected) {
        SetWindowTextW(g_hwndConnect, L"Disconnect");
        EnableWindow(g_hwndSend, TRUE);
        EnableWindow(g_hwndMessage, TRUE);
    } else if (g_connecting) {
        SetWindowTextW(g_hwndConnect, L"Cancel");
        EnableWindow(g_hwndSend, FALSE);
        EnableWindow(g_hwndMessage, FALSE);
    } else {
        SetWindowTextW(g_hwndConnect, L"Connect");
        EnableWindow(g_hwndSend, FALSE);
        EnableWindow(g_hwndMessage, FALSE);
    }
}

void MarkConnected() {
    if (g_connected) {
        return;
    }
    g_connecting = false;
    g_connected = true;
    AppendLog(L"* Connected.");
    SetStatus(L"Connected");
    UpdateControls();
    SendNickname();
}

void CloseSocket(const std::wstring &reason) {
    if (g_socket != INVALID_SOCKET) {
        closesocket(g_socket);
        g_socket = INVALID_SOCKET;
    }
    bool wasConnected = g_connected || g_connecting;
    g_connected = false;
    g_connecting = false;
    g_recvBuffer.clear();
    UpdateControls();
    SetStatus(L"Disconnected");
    if (wasConnected && !reason.empty()) {
        AppendLog(L"* " + reason);
    }
}

void SendLine(const std::string &payload) {
    if (g_socket == INVALID_SOCKET) {
        return;
    }
    std::string line = payload;
    line.push_back('\n');
    send(g_socket, line.c_str(), static_cast<int>(line.size()), 0);
}

void SendNickname() {
    wchar_t buffer[64];
    GetWindowTextW(g_hwndNickname, buffer, 63);
    std::wstring nick = buffer;
    if (nick.empty()) {
        nick = L"Guest";
    }
    SendLine("NICK:" + WideToUtf8(nick));
}

void LayoutControls(int width, int height) {
    if (width <= 0 || height <= 0) {
        return;
    }
    const int margin = 10;
    const int editHeight = 24;
    const int buttonWidth = 110;

    int x = margin;
    int y = margin;

    if (g_hwndStatus) {
        MoveWindow(g_hwndStatus, x, y, width - 2 * margin, editHeight, TRUE);
    }
    y += editHeight + 4;

    if (g_hwndHost) {
        MoveWindow(g_hwndHost, x, y, 200, editHeight, TRUE);
    }
    if (g_hwndPort) {
        MoveWindow(g_hwndPort, x + 210, y, 70, editHeight, TRUE);
    }
    if (g_hwndNickname) {
        MoveWindow(g_hwndNickname, x + 290, y, 150, editHeight, TRUE);
    }
    if (g_hwndConnect) {
        MoveWindow(g_hwndConnect, width - buttonWidth - margin, y, buttonWidth, editHeight, TRUE);
    }
    y += editHeight + margin;

    int logHeight = height - y - editHeight - 2 * margin;
    if (g_hwndLog) {
        MoveWindow(g_hwndLog, x, y, width - 2 * margin, logHeight, TRUE);
    }
    y += logHeight + margin;

    if (g_hwndMessage) {
        MoveWindow(g_hwndMessage, x, y, width - buttonWidth - 3 * margin, editHeight, TRUE);
    }
    if (g_hwndSend) {
        MoveWindow(g_hwndSend, width - buttonWidth - margin, y, buttonWidth, editHeight, TRUE);
    }
}

bool BeginConnect(HWND hwnd) {
    wchar_t hostBuffer[256];
    wchar_t portBuffer[16];
    GetWindowTextW(g_hwndHost, hostBuffer, 255);
    GetWindowTextW(g_hwndPort, portBuffer, 15);
    if (wcslen(hostBuffer) == 0 || wcslen(portBuffer) == 0) {
        MessageBoxW(hwnd, L"Enter a host and port before connecting.", L"IRC Client", MB_ICONWARNING);
        return false;
    }

    ADDRINFOW hints = {};
    hints.ai_family = AF_UNSPEC;
    hints.ai_socktype = SOCK_STREAM;
    hints.ai_protocol = IPPROTO_TCP;

    PADDRINFOW result = nullptr;
    if (GetAddrInfoW(hostBuffer, portBuffer, &hints, &result) != 0) {
        MessageBoxW(hwnd, L"Unable to resolve host.", L"IRC Client", MB_ICONERROR);
        return false;
    }

    SOCKET sock = INVALID_SOCKET;
    bool immediate = false;
    for (PADDRINFOW ptr = result; ptr != nullptr; ptr = ptr->ai_next) {
        sock = socket(ptr->ai_family, ptr->ai_socktype, ptr->ai_protocol);
        if (sock == INVALID_SOCKET) {
            continue;
        }
        if (WSAAsyncSelect(sock, hwnd, kSocketMessage, FD_CONNECT | FD_READ | FD_CLOSE) == SOCKET_ERROR) {
            closesocket(sock);
            sock = INVALID_SOCKET;
            continue;
        }
        if (connect(sock, ptr->ai_addr, static_cast<int>(ptr->ai_addrlen)) == SOCKET_ERROR) {
            int error = WSAGetLastError();
            if (error != WSAEWOULDBLOCK && error != WSAEINPROGRESS) {
                closesocket(sock);
                sock = INVALID_SOCKET;
                continue;
            }
        } else {
            immediate = true;
        }
        break;
    }
    FreeAddrInfoW(result);

    if (sock == INVALID_SOCKET) {
        MessageBoxW(hwnd, L"Connecting failed for all addresses.", L"IRC Client", MB_ICONERROR);
        return false;
    }
    g_socket = sock;
    if (immediate) {
        MarkConnected();
    } else {
        g_connecting = true;
        SetStatus(L"Connecting...");
        UpdateControls();
        AppendLog(L"* Connecting...");
    }
    return true;
}

void HandleIncomingLine(const std::string &line) {
    if (line.rfind("FROM:", 0) == 0) {
        size_t secondColon = line.find(':', 5);
        if (secondColon != std::string::npos) {
            std::string nick = line.substr(5, secondColon - 5);
            std::string text = line.substr(secondColon + 1);
            AppendLog(Utf8ToWide(nick) + L": " + Utf8ToWide(text));
        }
        return;
    }
    if (line.rfind("INFO:", 0) == 0) {
        AppendLog(L"* " + Utf8ToWide(line.substr(5)));
        return;
    }
    if (line == "PONG") {
        AppendLog(L"* Server heartbeat acknowledged.");
        return;
    }
}

void DrainSocket() {
    char buffer[512];
    while (true) {
        int received = recv(g_socket, buffer, sizeof(buffer), 0);
        if (received > 0) {
            g_recvBuffer.append(buffer, received);
            size_t pos;
            while ((pos = g_recvBuffer.find('\n')) != std::string::npos) {
                std::string line = g_recvBuffer.substr(0, pos);
                g_recvBuffer.erase(0, pos + 1);
                if (!line.empty() && line.back() == '\r') {
                    line.pop_back();
                }
                HandleIncomingLine(line);
            }
        } else if (received == 0) {
            CloseSocket(L"Server closed the connection.");
            return;
        } else {
            int error = WSAGetLastError();
            if (error == WSAEWOULDBLOCK) {
                return;
            }
            CloseSocket(L"Connection dropped.");
            return;
        }
    }
}

void HandleSocketMessage(HWND hwnd, WPARAM wParam, LPARAM lParam) {
    if (static_cast<SOCKET>(wParam) != g_socket) {
        return;
    }
    int event = WSAGETSELECTEVENT(lParam);
    int error = WSAGETSELECTERROR(lParam);
    if (error != 0) {
        CloseSocket(L"Socket error.");
        return;
    }

    switch (event) {
    case FD_CONNECT:
        MarkConnected();
        break;
    case FD_READ:
        DrainSocket();
        break;
    case FD_CLOSE:
        CloseSocket(L"Disconnected.");
        break;
    default:
        break;
    }
}

void SendChatMessage() {
    if (!g_connected) {
        MessageBeep(MB_ICONWARNING);
        return;
    }
    wchar_t buffer[512];
    GetWindowTextW(g_hwndMessage, buffer, 511);
    std::wstring text = buffer;
    if (text.empty()) {
        return;
    }
    SetWindowTextW(g_hwndMessage, L"");
    AppendLog(L"You: " + text);
    SendLine("MSG:" + WideToUtf8(text));
}

} // namespace

LRESULT CALLBACK MainWndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
    switch (msg) {
    case WM_CREATE: {
        HFONT font = static_cast<HFONT>(GetStockObject(DEFAULT_GUI_FONT));
        g_hwndStatus = CreateWindowExW(0, L"STATIC", L"Disconnected", WS_CHILD | WS_VISIBLE,
                                       0, 0, 0, 0, hwnd, reinterpret_cast<HMENU>(10), nullptr, nullptr);
        SendMessageW(g_hwndStatus, WM_SETFONT, reinterpret_cast<WPARAM>(font), TRUE);

        g_hwndHost = CreateWindowExW(WS_EX_CLIENTEDGE, L"EDIT", L"127.0.0.1",
                                     WS_CHILD | WS_VISIBLE | ES_AUTOHSCROLL,
                                     0, 0, 0, 0, hwnd, reinterpret_cast<HMENU>(11), nullptr, nullptr);
        SendMessageW(g_hwndHost, WM_SETFONT, reinterpret_cast<WPARAM>(font), TRUE);

        g_hwndPort = CreateWindowExW(WS_EX_CLIENTEDGE, L"EDIT", L"6667",
                                     WS_CHILD | WS_VISIBLE | ES_NUMBER,
                                     0, 0, 0, 0, hwnd, reinterpret_cast<HMENU>(12), nullptr, nullptr);
        SendMessageW(g_hwndPort, WM_SETFONT, reinterpret_cast<WPARAM>(font), TRUE);

        g_hwndNickname = CreateWindowExW(WS_EX_CLIENTEDGE, L"EDIT", L"Guest",
                                         WS_CHILD | WS_VISIBLE | ES_AUTOHSCROLL,
                                         0, 0, 0, 0, hwnd, reinterpret_cast<HMENU>(13), nullptr, nullptr);
        SendMessageW(g_hwndNickname, WM_SETFONT, reinterpret_cast<WPARAM>(font), TRUE);

        g_hwndConnect = CreateWindowExW(0, L"BUTTON", L"Connect",
                                        WS_CHILD | WS_VISIBLE | BS_PUSHBUTTON,
                                        0, 0, 0, 0, hwnd, reinterpret_cast<HMENU>(14), nullptr, nullptr);
        SendMessageW(g_hwndConnect, WM_SETFONT, reinterpret_cast<WPARAM>(font), TRUE);

        g_hwndLog = CreateWindowExW(WS_EX_CLIENTEDGE, L"EDIT", nullptr,
                                    WS_CHILD | WS_VISIBLE | ES_MULTILINE | ES_AUTOVSCROLL | ES_READONLY | WS_VSCROLL,
                                    0, 0, 0, 0, hwnd, reinterpret_cast<HMENU>(15), nullptr, nullptr);
        SendMessageW(g_hwndLog, WM_SETFONT, reinterpret_cast<WPARAM>(font), TRUE);

        g_hwndMessage = CreateWindowExW(WS_EX_CLIENTEDGE, L"EDIT", nullptr,
                                        WS_CHILD | WS_VISIBLE | ES_AUTOHSCROLL,
                                        0, 0, 0, 0, hwnd, reinterpret_cast<HMENU>(16), nullptr, nullptr);
        SendMessageW(g_hwndMessage, WM_SETFONT, reinterpret_cast<WPARAM>(font), TRUE);

        g_hwndSend = CreateWindowExW(0, L"BUTTON", L"Send",
                                     WS_CHILD | WS_VISIBLE | BS_PUSHBUTTON,
                                     0, 0, 0, 0, hwnd, reinterpret_cast<HMENU>(17), nullptr, nullptr);
        SendMessageW(g_hwndSend, WM_SETFONT, reinterpret_cast<WPARAM>(font), TRUE);

        UpdateControls();
        break;
    }
    case WM_COMMAND:
        switch (LOWORD(wParam)) {
        case 14:
            if (HIWORD(wParam) == BN_CLICKED) {
                if (g_connected || g_connecting) {
                    CloseSocket(L"Disconnected by user.");
                    SetStatus(L"Disconnected");
                } else {
                    BeginConnect(hwnd);
                }
            }
            break;
        case 17:
            if (HIWORD(wParam) == BN_CLICKED) {
                SendChatMessage();
            }
            break;
        default:
            break;
        }
        break;
    case WM_SIZE: {
        int width = LOWORD(lParam);
        int height = HIWORD(lParam);
        LayoutControls(width, height);
        break;
    }
    case WM_GETMINMAXINFO: {
        auto *mmi = reinterpret_cast<MINMAXINFO *>(lParam);
        mmi->ptMinTrackSize.x = 520;
        mmi->ptMinTrackSize.y = 400;
        break;
    }
    case WM_DESTROY:
        CloseSocket(L"");
        PostQuitMessage(0);
        break;
    default:
        if (msg == kSocketMessage) {
            HandleSocketMessage(hwnd, wParam, lParam);
        } else {
            return DefWindowProcW(hwnd, msg, wParam, lParam);
        }
    }
    return 0;
}

int APIENTRY wWinMain(_In_ HINSTANCE hInstance,
                      _In_opt_ HINSTANCE,
                      _In_ LPWSTR,
                      _In_ int nCmdShow) {
    WSADATA wsaData;
    if (WSAStartup(MAKEWORD(2, 2), &wsaData) != 0) {
        MessageBoxW(nullptr, L"WSAStartup failed.", L"IRC Client", MB_ICONERROR);
        return 0;
    }

    const wchar_t kClassName[] = L"IrcChatClientWindow";
    WNDCLASSEXW wc = {};
    wc.cbSize = sizeof(wc);
    wc.lpfnWndProc = MainWndProc;
    wc.hInstance = hInstance;
    wc.hCursor = LoadCursor(nullptr, IDC_ARROW);
    wc.hbrBackground = reinterpret_cast<HBRUSH>(COLOR_WINDOW + 1);
    wc.lpszClassName = kClassName;

    if (!RegisterClassExW(&wc)) {
        WSACleanup();
        return 0;
    }

    HWND hwnd = CreateWindowExW(0, kClassName, L"Mini IRC Client",
                                WS_OVERLAPPEDWINDOW,
                                CW_USEDEFAULT, CW_USEDEFAULT, 720, 520,
                                nullptr, nullptr, hInstance, nullptr);
    if (!hwnd) {
        WSACleanup();
        return 0;
    }

    ShowWindow(hwnd, nCmdShow);
    UpdateWindow(hwnd);

    MSG msg;
    while (GetMessageW(&msg, nullptr, 0, 0)) {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }

    WSACleanup();
    return static_cast<int>(msg.wParam);
}
