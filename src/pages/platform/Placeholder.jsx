import { IconDoc } from '../../components/Icons.jsx';
import { PageHead, EmptyState } from './common.jsx';

export default function Placeholder({ title, lede, empty, detail, action }) {
  return (
    <>
      <PageHead title={title} lede={lede} />
      <section className="panel">
        <EmptyState icon={<IconDoc />} title={empty} text={detail}>
          <button className="btn btn-secondary" disabled>
            {action}
          </button>
          <span className="muted soon">Disponível em breve</span>
        </EmptyState>
      </section>
    </>
  );
}
