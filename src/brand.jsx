import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const BrandContext = createContext(null);

const FALLBACK = {
  name: 'Squad AI',
  isPlatform: true,
  logo: null,
  colors: { action: '#B8F479', dark: '#10271E', accent: '#346A42' },
  showPoweredBy: true,
  allowSignup: false,
};

// Texto escuro ou claro sobre a cor de ação, conforme o contraste.
function onColor(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.4 ? null : '#ffffff';
}

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v + (amount < 0 ? v * amount : (255 - v) * amount))));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function applyBrand(brand) {
  const root = document.documentElement.style;
  const { action, dark, accent } = brand.colors;
  root.setProperty('--lime', action);
  root.setProperty('--lime-hover', shade(action, -0.08));
  root.setProperty('--forest', dark);
  root.setProperty('--forest-2', shade(dark, 0.1));
  root.setProperty('--leaf', accent);
  root.setProperty('--on-action', onColor(action) || dark);
  document.title = `${brand.name} | Agentes de IA para processos repetitivos`;
  const icon = document.querySelector('link[rel="icon"]');
  if (icon && brand.logo) icon.href = brand.logo;
}

export function BrandProvider({ children }) {
  const [brand, setBrand] = useState(null);

  useEffect(() => {
    api('/brand')
      .then(({ brand }) => brand)
      .catch(() => FALLBACK)
      .then((b) => {
        applyBrand(b);
        setBrand(b);
      });
  }, []);

  if (!brand) return null;
  return <BrandContext.Provider value={{ brand, setBrand: (b) => (applyBrand(b), setBrand(b)) }}>{children}</BrandContext.Provider>;
}

export const useBrand = () => useContext(BrandContext).brand;
export const useBrandControl = () => useContext(BrandContext);
