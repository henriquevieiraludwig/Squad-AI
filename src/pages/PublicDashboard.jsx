import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import DashboardView, { presentDashboard } from '../components/dashboard/DashboardView.jsx';
import { BrandMark } from '../components/Logo.jsx';
import { useBrand } from '../brand.jsx';

// Dashboard aberto pelo link público (sem login).
export default function PublicDashboard() {
  const { token } = useParams();
  const brand = useBrand();
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api(`/public/dashboards/${token}`)
      .then((r) => {
        setD(r.dashboard);
        document.title = `${r.dashboard.title} · ${r.dashboard.orgName}`;
      })
      .catch((err) => setError(err.message));
  }, [token]);
  return (
    <div className="public-dash">
      {error && <p className="public-dash-error">{error}</p>}
      {d && (
        <DashboardView
          spec={d.spec}
          footer={
            <footer className="public-dash-foot">
              <span>
                {d.orgName} ·{' '}
                <button type="button" className="public-dash-present" onClick={presentDashboard}>
                  Apresentar em tela inteira
                </button>
              </span>
              <span className="public-dash-brand">
                Feito com <BrandMark size={18} /> {brand.name}
              </span>
            </footer>
          }
        />
      )}
    </div>
  );
}
