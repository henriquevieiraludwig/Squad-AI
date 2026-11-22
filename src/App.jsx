import { Navigate, Route, Routes } from 'react-router-dom';
import { GuestOnly, RequireAuth, RequirePartner } from './auth.jsx';
import Landing from './pages/Landing.jsx';
import ZadokHome from './pages/ZadokHome.jsx';
import ZadokErp from './pages/ZadokErp.jsx';
import { useBrand } from './brand.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import Platform from './pages/Platform.jsx';
import PartnerConsole from './pages/partner/PartnerConsole.jsx';
import { ForgotPassword, ResetPassword, VerifyEmail, AcceptInvite } from './pages/AccountPages.jsx';
import { DEMO } from './api.js';
import { useNewVersion } from './useNewVersion.js';

const guest = (el) => <GuestOnly>{el}</GuestOnly>;

export default function App() {
  const newVersion = useNewVersion();
  const brand = useBrand();
  return (
    <>
      {DEMO && <p className="demo-banner">Versão de demonstração. Os dados ficam salvos só neste navegador.</p>}
      {newVersion && (
        <div className="update-banner" role="status">
          <span>Há uma versão nova da plataforma.</span>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => window.location.reload()}>
            Atualizar agora
          </button>
        </div>
      )}
      <Routes>
        {/* Na plataforma, "/" é o site da Zadok e o Squad AI é a página de produto. Nos parceiros, "/" é o Squad AI com a marca deles. */}
        <Route path="/" element={brand.isPlatform ? <ZadokHome /> : <Landing />} />
        <Route path="/produtos/squad-ai" element={brand.isPlatform ? <Landing embedded /> : <Navigate to="/" replace />} />
        <Route path="/produtos/zadok-erp" element={brand.isPlatform ? <ZadokErp /> : <Navigate to="/" replace />} />
        <Route path="/entrar" element={guest(<Login />)} />
        <Route path="/acesso/:slug" element={guest(<Login />)} />
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
