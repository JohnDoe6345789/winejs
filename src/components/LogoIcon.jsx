import * as React from 'react';

function LogoIcon({ size = 40 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="WineJS icon"
    >
      <defs>
        <linearGradient id="logo-glass" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#f72585" />
          <stop offset="50%" stopColor="#b5179e" />
          <stop offset="100%" stopColor="#7209b7" />
        </linearGradient>
        <linearGradient id="logo-stem" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#8e2de2" />
          <stop offset="100%" stopColor="#4a00e0" />
        </linearGradient>
      </defs>
      <rect width="128" height="128" rx="28" fill="#05040a" />
      <path
        d="M36 18h56c1.8 0 3.3 1.4 3.4 3.2C96 46 82.2 62 64 62S32 46 32.6 21.2C32.7 19.4 34.2 18 36 18z"
        fill="url(#logo-glass)"
      />
      <path
        d="M52 64h24v8c0 11-6.5 20-12 20s-12-9-12-20z"
        fill="#120a1d"
        opacity="0.6"
      />
      <rect x="60" y="72" width="8" height="36" rx="4" fill="url(#logo-stem)" />
      <rect x="44" y="110" width="40" height="8" rx="4" fill="#f4f2ff" opacity="0.9" />
    </svg>
  );
}

export default LogoIcon;
