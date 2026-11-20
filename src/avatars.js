import a1 from './assets/avatars/avatar-1.webp';
import a2 from './assets/avatars/avatar-2.webp';
import a3 from './assets/avatars/avatar-3.webp';
import a4 from './assets/avatars/avatar-4.webp';
import a5 from './assets/avatars/avatar-5.webp';
import a6 from './assets/avatars/avatar-6.webp';
import a7 from './assets/avatars/avatar-7.webp';
import a8 from './assets/avatars/avatar-8.webp';

export const AVATARS = [
  { id: 'avatar-1', src: a1 },
  { id: 'avatar-2', src: a2 },
  { id: 'avatar-3', src: a3 },
  { id: 'avatar-4', src: a4 },
  { id: 'avatar-5', src: a5 },
  { id: 'avatar-6', src: a6 },
  { id: 'avatar-7', src: a7 },
  { id: 'avatar-8', src: a8 },
];

export const avatarSrc = (id) => AVATARS.find((a) => a.id === id)?.src || null;
