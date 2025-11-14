#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <winsock2.h>
#include <ws2tcpip.h>

#include <cstdlib>
#include <cwchar>
#include <string>
#include <unordered_map>

struct ClientInfo {
    SOCKET socket = INVALID_SOCKET;
    std::wstring nickname;
    std::string buffer;
};

namespace {

constexpr UINT kSocketMessage = WM_APP + 42;
HWND g_hwndLog = nullptr;
HWND g_hwndClients = nullptr;
HWND g_hwndStartButton = nullptr;
HWND g_hwndStatus = nullptr;
HWND g_hwndPort = nullptr;
HWND g_hwndPortLabel = nullptr;

SOCKET g_listenSocket = INVALID_SOCKET;
bool g_serverRunning = false;
int g_guestCounter = 1;
std::unordered_map<SOCKET, ClientInfo> g_clients;

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

void UpdateClientList() {
    if (!g_hwndClients) {
        return;
    }
    SendMessageW(g_hwndClients, LB_RESETCONTENT, 0, 0);
    for (const auto &entry : g_clients) {
        SendMessageW(g_hwndClients, LB_ADDSTRING, 0, reinterpret_cast<LPARAM>(entry.second.nickname.c_str()));
    }
}

void SetStatusText(const std::wstring &text) {
    if (g_hwndStatus) {
        SetWindowTextW(g_hwndStatus, text.c_str());
    }
}

void SendLine(SOCKET socket, const std::string &line) {
    if (socket == INVALID_SOCKET) {
        return;
    }
    std::string payload = line;
    payload.push_back('\n');
    send(socket, payload.c_str(), static_cast<int>(payload.size()), 0);
}

void Broadcast(const std::string &line) {
    std::string payload = line;
    payload.push_back('\n');
    for (auto it = g_clients.begin(); it != g_clients.end();) {
        SOCKET s = it->first;
        int sent = send(s, payload.c_str(), static_cast<int>(payload.size()), 0);
        if (sent == SOCKET_ERROR && WSAGetLastError() != WSAEWOULDBLOCK) {
            closesocket(s);
            it = g_clients.erase(it);
            UpdateClientList();
        } else {
            ++it;
        }
    }
}

void BroadcastInfo(const std::wstring &text) {
    Broadcast("INFO:" + WideToUtf8(text));
}

void BroadcastChat(const ClientInfo &client, const std::wstring &message) {
    Broadcast("FROM:" + WideToUtf8(client.nickname) + ":" + WideToUtf8(message));
}

void DisconnectClient(SOCKET socket) {
    auto it = g_clients.find(socket);
    if (it == g_clients.end()) {
        return;
    }
    std::wstring nick = it->second.nickname;
    closesocket(socket);
    g_clients.erase(it);
    UpdateClientList();
    if (!nick.empty()) {
        AppendLog(nick + L" disconnected.");
        BroadcastInfo(nick + L" left the chat.");
    }
}

void HandleProtocolLine(ClientInfo &client, const std::string &line) {
    if (line.rfind("NICK:", 0) == 0) {
        std::string newNickUtf8 = line.substr(5);
        std::wstring newNick = Utf8ToWide(newNickUtf8);
        if (newNick.empty()) {
            newNick = L"Guest";
        }
        std::wstring announcement;
        if (client.nickname.empty()) {
            announcement = newNick + L" joined the chat.";
        } else {
            announcement = client.nickname + L" is now known as " + newNick + L".";
        }
        client.nickname = newNick;
        BroadcastInfo(announcement);
        UpdateClientList();
        AppendLog(announcement);
        return;
    }
    if (line.rfind("MSG:", 0) == 0) {
        std::wstring message = Utf8ToWide(line.substr(4));
        if (client.nickname.empty()) {
            client.nickname = L"Guest" + std::to_wstring(g_guestCounter++);
            UpdateClientList();
        }
        AppendLog(client.nickname + L": " + message);
        BroadcastChat(client, message);
        return;
    }
    if (line == "PING") {
        SendLine(client.socket, "PONG");
        return;
    }
}

void DrainClientSocket(ClientInfo &client) {
    char buffer[512];
    while (true) {
        int received = recv(client.socket, buffer, sizeof(buffer), 0);
        if (received > 0) {
            client.buffer.append(buffer, received);
            size_t newline = std::string::npos;
            while ((newline = client.buffer.find('\n')) != std::string::npos) {
                std::string line = client.buffer.substr(0, newline);
                client.buffer.erase(0, newline + 1);
                if (!line.empty() && line.back() == '\r') {
                    line.pop_back();
                }
                HandleProtocolLine(client, line);
            }
        } else if (received == 0) {
            DisconnectClient(client.socket);
            return;
        } else {
            int error = WSAGetLastError();
            if (error == WSAEWOULDBLOCK) {
                return;
            }
            DisconnectClient(client.socket);
            return;
        }
    }
}

void StopServer() {
    if (g_listenSocket != INVALID_SOCKET) {
        closesocket(g_listenSocket);
        g_listenSocket = INVALID_SOCKET;
    }
    for (auto &entry : g_clients) {
        closesocket(entry.first);
    }
    g_clients.clear();
    g_serverRunning = false;
    UpdateClientList();
    SetStatusText(L"Server stopped.");
    if (g_hwndStartButton) {
        SetWindowTextW(g_hwndStartButton, L"Start Server");
    }
}

bool StartServer(HWND hwnd) {
    wchar_t buffer[16] = {};
    GetWindowTextW(g_hwndPort, buffer, 15);
    int port = _wtoi(buffer);
    if (port <= 0) {
        MessageBoxW(hwnd, L"Enter a valid TCP port.", L"IRC Server", MB_ICONWARNING);
        return false;
    }

    ADDRINFOW hints = {};
    hints.ai_family = AF_INET;
    hints.ai_socktype = SOCK_STREAM;
    hints.ai_protocol = IPPROTO_TCP;
    hints.ai_flags = AI_PASSIVE;

    PADDRINFOW result = nullptr;
    wchar_t portBuffer[16];
    _itow_s(port, portBuffer, 10);
    if (GetAddrInfoW(nullptr, portBuffer, &hints, &result) != 0) {
        MessageBoxW(hwnd, L"GetAddrInfo failed.", L"IRC Server", MB_ICONERROR);
        return false;
    }

    SOCKET listenSocket = socket(result->ai_family, result->ai_socktype, result->ai_protocol);
    if (listenSocket == INVALID_SOCKET) {
        FreeAddrInfoW(result);
        MessageBoxW(hwnd, L"Unable to create listening socket.", L"IRC Server", MB_ICONERROR);
        return false;
    }

    BOOL reuse = TRUE;
    setsockopt(listenSocket, SOL_SOCKET, SO_REUSEADDR, reinterpret_cast<const char *>(&reuse), sizeof(reuse));

    if (bind(listenSocket, result->ai_addr, static_cast<int>(result->ai_addrlen)) == SOCKET_ERROR) {
        FreeAddrInfoW(result);
        closesocket(listenSocket);
        MessageBoxW(hwnd, L"Bind failed. Check if the port is already in use.", L"IRC Server", MB_ICONERROR);
        return false;
    }
    FreeAddrInfoW(result);

    if (listen(listenSocket, SOMAXCONN) == SOCKET_ERROR) {
        closesocket(listenSocket);
        MessageBoxW(hwnd, L"Listen failed.", L"IRC Server", MB_ICONERROR);
        return false;
    }

    if (WSAAsyncSelect(listenSocket, hwnd, kSocketMessage, FD_ACCEPT | FD_CLOSE) == SOCKET_ERROR) {
        closesocket(listenSocket);
        MessageBoxW(hwnd, L"WSAAsyncSelect failed.", L"IRC Server", MB_ICONERROR);
        return false;
    }

    g_listenSocket = listenSocket;
    g_serverRunning = true;
    SetWindowTextW(g_hwndStartButton, L"Stop Server");
    SetStatusText(L"Listening on port " + std::to_wstring(port) + L".");
    AppendLog(L"Server started on port " + std::to_wstring(port) + L".");
    return true;
}

void HandleSocketMessage(HWND hwnd, WPARAM wParam, LPARAM lParam) {
    SOCKET socket = static_cast<SOCKET>(wParam);
    int event = WSAGETSELECTEVENT(lParam);
    int error = WSAGETSELECTERROR(lParam);

    if (error != 0) {
        DisconnectClient(socket);
        return;
    }

    switch (event) {
    case FD_ACCEPT: {
        SOCKET clientSocket = accept(g_listenSocket, nullptr, nullptr);
        if (clientSocket == INVALID_SOCKET) {
            return;
        }
        if (WSAAsyncSelect(clientSocket, hwnd, kSocketMessage, FD_READ | FD_CLOSE) == SOCKET_ERROR) {
            closesocket(clientSocket);
            return;
        }
        ClientInfo info;
        info.socket = clientSocket;
        info.nickname = L"Guest" + std::to_wstring(g_guestCounter++);
        g_clients[clientSocket] = info;
        AppendLog(info.nickname + L" connected.");
        BroadcastInfo(info.nickname + L" joined the chat.");
        UpdateClientList();
        break;
    }
    case FD_READ: {
        auto it = g_clients.find(socket);
        if (it == g_clients.end()) {
            break;
        }
        DrainClientSocket(it->second);
        break;
    }
    case FD_CLOSE:
        DisconnectClient(socket);
        break;
    default:
        break;
    }
}

void LayoutControls(int width, int height) {
    if (width <= 0 || height <= 0) {
        return;
    }
    const int margin = 12;
    const int controlHeight = 24;
    const int clientListWidth = 160;

    if (g_hwndStatus) {
        MoveWindow(g_hwndStatus, margin, margin, width - 2 * margin, controlHeight, TRUE);
    }

    int top = margin + controlHeight + 4;
    if (g_hwndPortLabel) {
        MoveWindow(g_hwndPortLabel, margin, top + 4, 40, controlHeight, TRUE);
    }
    if (g_hwndPort) {
        MoveWindow(g_hwndPort, margin + 42, top, 60, controlHeight, TRUE);
    }
    if (g_hwndStartButton) {
        MoveWindow(g_hwndStartButton, margin + 108, top, 120, controlHeight, TRUE);
    }

    top += controlHeight + margin;
    int logWidth = width - clientListWidth - 3 * margin;
    if (g_hwndLog) {
        MoveWindow(g_hwndLog, margin, top, logWidth, height - top - margin, TRUE);
    }
    if (g_hwndClients) {
        MoveWindow(g_hwndClients, width - clientListWidth - margin, top, clientListWidth, height - top - margin, TRUE);
    }
}

} // namespace

LRESULT CALLBACK MainWndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
    switch (msg) {
    case WM_CREATE: {
        HFONT font = static_cast<HFONT>(GetStockObject(DEFAULT_GUI_FONT));
        g_hwndStatus = CreateWindowExW(0, L"STATIC", L"Server stopped.", WS_CHILD | WS_VISIBLE,
                                       0, 0, 0, 0, hwnd, nullptr, nullptr, nullptr);
        SendMessageW(g_hwndStatus, WM_SETFONT, reinterpret_cast<WPARAM>(font), TRUE);

        g_hwndPortLabel = CreateWindowExW(0, L"STATIC", L"Port:", WS_CHILD | WS_VISIBLE,
                                          0, 0, 0, 0, hwnd, reinterpret_cast<HMENU>(1), nullptr, nullptr);
        SendMessageW(g_hwndPortLabel, WM_SETFONT, reinterpret_cast<WPARAM>(font), TRUE);

        g_hwndPort = CreateWindowExW(WS_EX_CLIENTEDGE, L"EDIT", L"6667",
                                     WS_CHILD | WS_VISIBLE | ES_NUMBER,
                                     0, 0, 0, 0, hwnd, reinterpret_cast<HMENU>(2), nullptr, nullptr);
        SendMessageW(g_hwndPort, WM_SETFONT, reinterpret_cast<WPARAM>(font), TRUE);

        g_hwndStartButton = CreateWindowExW(0, L"BUTTON", L"Start Server", WS_CHILD | WS_VISIBLE,
                                            0, 0, 0, 0, hwnd, reinterpret_cast<HMENU>(3), nullptr, nullptr);
        SendMessageW(g_hwndStartButton, WM_SETFONT, reinterpret_cast<WPARAM>(font), TRUE);

        g_hwndLog = CreateWindowExW(WS_EX_CLIENTEDGE, L"EDIT", nullptr,
                                    WS_CHILD | WS_VISIBLE | ES_MULTILINE | ES_AUTOVSCROLL | ES_READONLY | WS_VSCROLL,
                                    0, 0, 0, 0, hwnd, reinterpret_cast<HMENU>(4), nullptr, nullptr);
        SendMessageW(g_hwndLog, WM_SETFONT, reinterpret_cast<WPARAM>(font), TRUE);

        g_hwndClients = CreateWindowExW(WS_EX_CLIENTEDGE, L"LISTBOX", nullptr,
                                        WS_CHILD | WS_VISIBLE | LBS_NOTIFY,
                                        0, 0, 0, 0, hwnd, reinterpret_cast<HMENU>(5), nullptr, nullptr);
        SendMessageW(g_hwndClients, WM_SETFONT, reinterpret_cast<WPARAM>(font), TRUE);
        break;
    }
    case WM_COMMAND:
        if (LOWORD(wParam) == 3 && HIWORD(wParam) == BN_CLICKED) {
            if (g_serverRunning) {
                StopServer();
            } else {
                if (StartServer(hwnd)) {
                    g_serverRunning = true;
                }
            }
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
        mmi->ptMinTrackSize.x = 600;
        mmi->ptMinTrackSize.y = 400;
        break;
    }
    case WM_DESTROY:
        StopServer();
        PostQuitMessage(0);
        break;
    default:
        if (msg == kSocketMessage) {
            HandleSocketMessage(hwnd, wParam, lParam);
            return 0;
        }
        return DefWindowProcW(hwnd, msg, wParam, lParam);
    }
    return 0;
}

int APIENTRY wWinMain(_In_ HINSTANCE hInstance,
                      _In_opt_ HINSTANCE,
                      _In_ LPWSTR,
                      _In_ int nCmdShow) {
    WSADATA wsaData;
    if (WSAStartup(MAKEWORD(2, 2), &wsaData) != 0) {
        MessageBoxW(nullptr, L"WSAStartup failed.", L"IRC Server", MB_ICONERROR);
        return 0;
    }

    const wchar_t kClassName[] = L"IrcChatServerWindow";

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

    HWND hwnd = CreateWindowExW(0, kClassName, L"Mini IRC Server",
                                WS_OVERLAPPEDWINDOW,
                                CW_USEDEFAULT, CW_USEDEFAULT, 800, 520,
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
