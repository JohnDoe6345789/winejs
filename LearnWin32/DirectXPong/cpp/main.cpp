#include <windows.h>
#include <d2d1.h>
#include <chrono>
#include <algorithm>
#include <cmath>
#include <sstream>
#include <string>

#pragma comment(lib, "d2d1")

#include "basewin.h"

template <class T>
void SafeRelease(T **ppT)
{
    if (*ppT)
    {
        (*ppT)->Release();
        *ppT = NULL;
    }
}

class PongWindow : public BaseWindow<PongWindow>
{
    static constexpr float PaddleHeight = 90.0f;
    static constexpr float PaddleWidth = 12.0f;
    static constexpr float BallSize = 12.0f;
    static constexpr float PaddleSpeed = 360.0f;
    static constexpr float BallSpeed = 320.0f;
    static constexpr float PaddleOffset = 30.0f;
    static constexpr UINT_PTR TimerId = 1;
    static constexpr UINT FrameMs = 16;

    ID2D1Factory *pFactory;
    ID2D1HwndRenderTarget *pRenderTarget;
    ID2D1SolidColorBrush *pBrush;

    std::chrono::steady_clock::time_point lastTick;

    float leftPaddleY;
    float rightPaddleY;
    D2D1_POINT_2F ballPos;
    D2D1_POINT_2F ballVel;
    int leftScore;
    int rightScore;
    bool wPressed;
    bool sPressed;
    bool upPressed;
    bool downPressed;

    HRESULT CreateGraphicsResources();
    void DiscardGraphicsResources();
    void OnPaint();
    void Resize();
    void UpdateGame();
    void MovePaddle(float &y, float direction, float limit, float dt);
    void ResetRound(int direction);
    void UpdateWindowTitle();
    bool Intersects(const D2D1_RECT_F &a, const D2D1_RECT_F &b) const;
    void BounceFromPaddle(const D2D1_RECT_F &paddle, bool fromLeft);
    D2D1_RECT_F MakePaddleRect(bool left, float width) const;

public:
    PongWindow();

    PCWSTR ClassName() const { return L"DirectXPongWindow"; }
    LRESULT HandleMessage(UINT uMsg, WPARAM wParam, LPARAM lParam);
};

PongWindow::PongWindow()
    : pFactory(NULL),
      pRenderTarget(NULL),
      pBrush(NULL),
      leftPaddleY(0.0f),
      rightPaddleY(0.0f),
      ballPos(D2D1::Point2F(0.0f, 0.0f)),
      ballVel(D2D1::Point2F(0.0f, 0.0f)),
      leftScore(0),
      rightScore(0),
      wPressed(false),
      sPressed(false),
      upPressed(false),
      downPressed(false)
{
}

HRESULT PongWindow::CreateGraphicsResources()
{
    HRESULT hr = S_OK;
    if (pRenderTarget == NULL)
    {
        RECT rc;
        GetClientRect(m_hwnd, &rc);

        D2D1_SIZE_U size = D2D1::SizeU(rc.right - rc.left, rc.bottom - rc.top);

        hr = pFactory->CreateHwndRenderTarget(
            D2D1::RenderTargetProperties(),
            D2D1::HwndRenderTargetProperties(m_hwnd, size),
            &pRenderTarget);

        if (SUCCEEDED(hr))
        {
            hr = pRenderTarget->CreateSolidColorBrush(
                D2D1::ColorF(D2D1::ColorF::White), &pBrush);
        }
    }
    return hr;
}

void PongWindow::DiscardGraphicsResources()
{
    SafeRelease(&pRenderTarget);
    SafeRelease(&pBrush);
}

void PongWindow::UpdateWindowTitle()
{
    std::wstringstream ss;
    ss << L"DirectX Pong - " << leftScore << L" : " << rightScore;
    std::wstring title = ss.str();
    SetWindowText(m_hwnd, title.c_str());
}

void PongWindow::ResetRound(int direction)
{
    RECT rc;
    GetClientRect(m_hwnd, &rc);
    float width = static_cast<float>(rc.right - rc.left);
    float height = static_cast<float>(rc.bottom - rc.top);
    if (width <= 0.0f)
    {
        width = 640.0f;
    }
    if (height <= 0.0f)
    {
        height = 360.0f;
    }

    float limit = std::max(0.0f, height - PaddleHeight);
    leftPaddleY = std::clamp(leftPaddleY, 0.0f, limit);
    rightPaddleY = std::clamp(rightPaddleY, 0.0f, limit);

    ballPos = D2D1::Point2F(width * 0.5f - BallSize * 0.5f, height * 0.5f - BallSize * 0.5f);

    static size_t arcIndex = 0;
    const float arcs[] = {-0.65f, -0.35f, 0.35f, 0.65f};
    float spread = arcs[arcIndex];
    arcIndex = (arcIndex + 1) % (sizeof(arcs) / sizeof(arcs[0]));

    float horizontal = (direction >= 0 ? 1.0f : -1.0f) * BallSpeed;
    ballVel = D2D1::Point2F(horizontal, BallSpeed * spread);

    lastTick = std::chrono::steady_clock::now();
    UpdateWindowTitle();
}

void PongWindow::MovePaddle(float &y, float direction, float limit, float dt)
{
    y += direction * PaddleSpeed * dt;
    float maxY = std::max(0.0f, limit - PaddleHeight);
    if (y < 0.0f)
    {
        y = 0.0f;
    }
    if (y > maxY)
    {
        y = maxY;
    }
}

bool PongWindow::Intersects(const D2D1_RECT_F &a, const D2D1_RECT_F &b) const
{
    return !(a.right <= b.left ||
             a.left >= b.right ||
             a.bottom <= b.top ||
             a.top >= b.bottom);
}

void PongWindow::BounceFromPaddle(const D2D1_RECT_F &paddle, bool fromLeft)
{
    float paddleCenter = (paddle.top + paddle.bottom) * 0.5f;
    float ballCenter = ballPos.y + BallSize * 0.5f;
    float offset = (ballCenter - paddleCenter) / (PaddleHeight * 0.5f);
    offset = std::clamp(offset, -1.0f, 1.0f);

    float horizontal = std::min(std::fabs(ballVel.x) + 40.0f, 620.0f);
    ballVel.x = (fromLeft ? 1.0f : -1.0f) * horizontal;
    ballVel.y += offset * 180.0f;
}

D2D1_RECT_F PongWindow::MakePaddleRect(bool left, float width) const
{
    float x = left ? PaddleOffset : width - PaddleOffset - PaddleWidth;
    float y = left ? leftPaddleY : rightPaddleY;
    return D2D1::RectF(x, y, x + PaddleWidth, y + PaddleHeight);
}

void PongWindow::UpdateGame()
{
    auto now = std::chrono::steady_clock::now();
    float dt = std::chrono::duration<float>(now - lastTick).count();
    lastTick = now;
    dt = std::min(dt, 0.05f);

    RECT rc;
    GetClientRect(m_hwnd, &rc);
    float width = static_cast<float>(rc.right - rc.left);
    float height = static_cast<float>(rc.bottom - rc.top);
    if (width <= 0.0f || height <= 0.0f)
    {
        return;
    }

    float leftDir = 0.0f;
    if (wPressed)
    {
        leftDir -= 1.0f;
    }
    if (sPressed)
    {
        leftDir += 1.0f;
    }
    MovePaddle(leftPaddleY, leftDir, height, dt);

    float rightDir = 0.0f;
    if (upPressed)
    {
        rightDir -= 1.0f;
    }
    if (downPressed)
    {
        rightDir += 1.0f;
    }
    if (rightDir == 0.0f)
    {
        float target = ballPos.y - (PaddleHeight - BallSize) * 0.5f;
        float delta = target - rightPaddleY;
        if (std::fabs(delta) > 4.0f)
        {
            rightDir = (delta > 0.0f ? 0.6f : -0.6f);
        }
    }
    MovePaddle(rightPaddleY, rightDir, height, dt);

    ballPos.x += ballVel.x * dt;
    ballPos.y += ballVel.y * dt;

    if (ballPos.y <= 0.0f)
    {
        ballPos.y = 0.0f;
        ballVel.y = std::fabs(ballVel.y);
    }
    else if (ballPos.y + BallSize >= height)
    {
        ballPos.y = height - BallSize;
        ballVel.y = -std::fabs(ballVel.y);
    }

    D2D1_RECT_F ballRect = D2D1::RectF(ballPos.x, ballPos.y, ballPos.x + BallSize, ballPos.y + BallSize);
    D2D1_RECT_F leftRect = MakePaddleRect(true, width);
    D2D1_RECT_F rightRect = MakePaddleRect(false, width);

    if (Intersects(ballRect, leftRect) && ballVel.x < 0.0f)
    {
        ballPos.x = leftRect.right;
        BounceFromPaddle(leftRect, true);
    }
    else if (Intersects(ballRect, rightRect) && ballVel.x > 0.0f)
    {
        ballPos.x = rightRect.left - BallSize;
        BounceFromPaddle(rightRect, false);
    }

    if (ballPos.x + BallSize < 0.0f)
    {
        ++rightScore;
        ResetRound(1);
        return;
    }
    else if (ballPos.x > width)
    {
        ++leftScore;
        ResetRound(-1);
        return;
    }
}

void PongWindow::OnPaint()
{
    HRESULT hr = CreateGraphicsResources();
    if (SUCCEEDED(hr))
    {
        PAINTSTRUCT ps;
        BeginPaint(m_hwnd, &ps);

        pRenderTarget->BeginDraw();

        D2D1_SIZE_F size = pRenderTarget->GetSize();
        pRenderTarget->Clear(D2D1::ColorF(0.02f, 0.05f, 0.09f));

        const float midX = size.width * 0.5f;
        pBrush->SetColor(D2D1::ColorF(0.15f, 0.85f, 0.55f, 0.65f));
        for (float y = 0.0f; y < size.height; y += 26.0f)
        {
            D2D1_RECT_F dash = D2D1::RectF(midX - 2.0f, y, midX + 2.0f, y + 14.0f);
            pRenderTarget->FillRectangle(dash, pBrush);
        }

        pBrush->SetColor(D2D1::ColorF(0.93f, 0.93f, 0.93f));
        pRenderTarget->FillRectangle(MakePaddleRect(true, size.width), pBrush);
        pRenderTarget->FillRectangle(MakePaddleRect(false, size.width), pBrush);

        pBrush->SetColor(D2D1::ColorF(1.0f, 0.95f, 0.45f));
        D2D1_RECT_F ballRect = D2D1::RectF(ballPos.x, ballPos.y, ballPos.x + BallSize, ballPos.y + BallSize);
        pRenderTarget->FillRectangle(ballRect, pBrush);

        hr = pRenderTarget->EndDraw();
        if (FAILED(hr) || hr == D2DERR_RECREATE_TARGET)
        {
            DiscardGraphicsResources();
        }
        EndPaint(m_hwnd, &ps);
    }
}

void PongWindow::Resize()
{
    if (pRenderTarget != NULL)
    {
        RECT rc;
        GetClientRect(m_hwnd, &rc);
        D2D1_SIZE_U size = D2D1::SizeU(rc.right - rc.left, rc.bottom - rc.top);
        pRenderTarget->Resize(size);
    }
}

LRESULT PongWindow::HandleMessage(UINT uMsg, WPARAM wParam, LPARAM lParam)
{
    switch (uMsg)
    {
    case WM_CREATE:
        if (FAILED(D2D1CreateFactory(D2D1_FACTORY_TYPE_SINGLE_THREADED, &pFactory)))
        {
            return -1;
        }
        SetTimer(m_hwnd, TimerId, FrameMs, NULL);
        ResetRound((GetTickCount64() & 1) ? 1 : -1);
        return 0;

    case WM_DESTROY:
        KillTimer(m_hwnd, TimerId);
        DiscardGraphicsResources();
        SafeRelease(&pFactory);
        PostQuitMessage(0);
        return 0;

    case WM_TIMER:
        UpdateGame();
        InvalidateRect(m_hwnd, NULL, FALSE);
        return 0;

    case WM_PAINT:
        OnPaint();
        return 0;

    case WM_SIZE:
        Resize();
        return 0;

    case WM_KEYDOWN:
        switch (wParam)
        {
        case 'W':
            wPressed = true;
            break;
        case 'S':
            sPressed = true;
            break;
        case VK_UP:
            upPressed = true;
            break;
        case VK_DOWN:
            downPressed = true;
            break;
        case VK_ESCAPE:
            DestroyWindow(m_hwnd);
            break;
        case VK_SPACE:
            ResetRound(ballVel.x >= 0.0f ? 1 : -1);
            break;
        default:
            break;
        }
        return 0;

    case WM_KEYUP:
        switch (wParam)
        {
        case 'W':
            wPressed = false;
            break;
        case 'S':
            sPressed = false;
            break;
        case VK_UP:
            upPressed = false;
            break;
        case VK_DOWN:
            downPressed = false;
            break;
        default:
            break;
        }
        return 0;
    }
    return DefWindowProc(m_hwnd, uMsg, wParam, lParam);
}

int WINAPI wWinMain(HINSTANCE hInstance, HINSTANCE, PWSTR, int nCmdShow)
{
    PongWindow win;

    if (!win.Create(L"DirectX Pong", WS_OVERLAPPEDWINDOW, 0, CW_USEDEFAULT, CW_USEDEFAULT, 900, 600))
    {
        return 0;
    }

    ShowWindow(win.Window(), nCmdShow);
    UpdateWindow(win.Window());

    MSG msg = {0};
    while (GetMessage(&msg, NULL, 0, 0))
    {
        TranslateMessage(&msg);
        DispatchMessage(&msg);
    }

    return 0;
}
