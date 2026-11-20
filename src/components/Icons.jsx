// Ícones lineares (traço 1.8), desenhados para o Squad AI.
const Svg = ({ size = 20, children, ...rest }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...rest}
  >
    {children}
  </svg>
);

export const IconHome = (p) => (
  <Svg {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
  </Svg>
);
export const IconAgent = (p) => (
  <Svg {...p}>
    <rect x="4" y="7" width="16" height="12" rx="3" />
    <path d="M12 3v4M9 12h.01M15 12h.01M9 16h6" />
  </Svg>
);
export const IconProcess = (p) => (
  <Svg {...p}>
    <circle cx="6" cy="6" r="2.5" />
    <circle cx="18" cy="18" r="2.5" />
    <path d="M8.5 6H14a4 4 0 0 1 4 4v5.5" />
  </Svg>
);
export const IconDoc = (p) => (
  <Svg {...p}>
    <path d="M6 3h9l4 4v14H6z" />
    <path d="M9 12h7M9 16h5" />
  </Svg>
);
export const IconPlug = (p) => (
  <Svg {...p}>
    <path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0z" />
    <path d="M12 17v4" />
  </Svg>
);
export const IconCheck = (p) => (
  <Svg {...p}>
    <path d="M5 12.5 10 17l9-10" />
  </Svg>
);
export const IconShield = (p) => (
  <Svg {...p}>
    <path d="M12 3 5 6v6c0 4.2 3 7.5 7 9 4-1.5 7-4.8 7-9V6z" />
    <path d="m9 12 2 2 4-4" />
  </Svg>
);
export const IconChat = (p) => (
  <Svg {...p}>
    <path d="M4 5h16v11H9l-5 4z" />
  </Svg>
);
export const IconTeam = (p) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c1-3.5 3.5-5 6.5-5s5.5 1.5 6.5 5" />
    <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 15c2 .6 3.2 2.2 3.8 5" />
  </Svg>
);
export const IconSearch = (p) => (
  <Svg size={18} {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </Svg>
);
export const IconArrowLeft = (p) => (
  <Svg size={18} {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Svg>
);
export const IconCopy = (p) => (
  <Svg size={16} {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h8" />
  </Svg>
);
export const IconBolt = (p) => (
  <Svg {...p}>
    <path d="M13 3 5 13h6l-1 8 8-10h-6z" />
  </Svg>
);
export const IconClock = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);
export const IconAlert = (p) => (
  <Svg size={18} {...p}>
    <path d="M12 4 2.5 20h19z" />
    <path d="M12 10v4M12 17h.01" />
  </Svg>
);
export const IconSend = (p) => (
  <Svg size={18} {...p}>
    <path d="M4 12 20 4l-5 16-3-7z" />
  </Svg>
);
export const IconMenu = (p) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);
export const IconLock = (p) => (
  <Svg {...p}>
    <rect x="5" y="10" width="14" height="10" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </Svg>
);
export const IconHistory = (p) => (
  <Svg {...p}>
    <path d="M4 12a8 8 0 1 0 2.5-5.8L4 8.5" />
    <path d="M4 4v4.5h4.5M12 8v4l3 2" />
  </Svg>
);
