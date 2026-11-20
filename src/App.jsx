import { Navigate, Route, Routes } from 'react-router-dom';
import { GuestOnly, RequireAuth, RequirePartner } from './auth.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import Platform from './pages/Platform.jsx';
import PartnerConsole from './pages/partner/PartnerConsole.jsx';
import { ForgotPassword, ResetPassword, VerifyEmail, AcceptInvite } from './pages/AccountPages.jsx';
import { DEMO } from './api.js';

const guest = (el) => <GuestOnly>{el}</GuestOnly>;

export default function App() {
  return (
    <>
      {DEMO && <p className="demo-banner">Versão de demonstração. Os dados ficam salvos só neste navegador.</p>}
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/entrar" element={guest(<Login />)} />
        <Route path="/criar-conta" element={guest(<Signup />)} />
        <Route path="/esqueci-senha" element={guest(<ForgotPassword />)} />
        <Route path="/redefinir-senha" element={<ResetPassword />} />
        <Route path="/confirmar-email" element={<VerifyEmail />} />
        <Route path="/convite" element={<AcceptInvite />} />
        <Route
          path="/app/*"
          element={
            <RequireAuth>
              <Platform />
            </RequireAuth>
          }
        />
        <Route
          path="/parceiro/*"
          element={
            <RequirePartner>
              <PartnerConsole />
            </RequirePartner>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
