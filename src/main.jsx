import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import './styles/global.css';
import App from './App.jsx';
import { AuthProvider } from './auth.jsx';
import { DEMO } from './api.js';

// A demonstração roda dentro de um frame que não aceita rotas na URL.
const Router = DEMO ? MemoryRouter : BrowserRouter;

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router>
      <AuthProvider>
        <App />
      </AuthProvider>
    </Router>
  </React.StrictMode>,
);
