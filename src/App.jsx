import { Navigate, Route, Routes } from 'react-router-dom';
import { GuestOnly, RequireAuth } from './auth.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import Platform from './pages/Platform.jsx';
import { DEMO } from './api.js';

export default function App() {
  return (
    <>
      {DEMO && (
        <p className="demo-banner">
          Versão de demonstração. Contas e agentes ficam salvos só neste navegador.
        </p>
      )}
      <Routes>
      <Route path="/" element={<Landing />} />
      <Route
        path="/entrar"
        element={
          <GuestOnly>
            <Login />
          </GuestOnly>
        }
      />
      <Route
        path="/criar-conta"
        element={
          <GuestOnly>
            <Signup />
          </GuestOnly>
        }
      />
      <Route
        path="/app/*"
        element={
          <RequireAuth>
            <Platform />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
