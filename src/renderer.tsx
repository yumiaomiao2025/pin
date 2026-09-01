import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { useUiStore } from './store/ui-store';
import './styles/global.scss';

function getWindowContext() {
  const params = new URLSearchParams(window.location.search);
  return {
    role: params.get('role') ?? 'unknown',
    id: params.get('id') ?? 'unknown',
  };
}

function App() {
  const compact = useUiStore((state) => state.compact);
  const toggleCompact = useUiStore((state) => state.toggleCompact);
  const [ping, setPing] = useState('连接中…');
  const context = getWindowContext();

  useEffect(() => {
    window.pinApi
      .ping()
      .then((result) => setPing(`IPC 已连接 · Electron ${result.version}`))
      .catch(() => setPing('IPC 连接失败'));
  }, []);

  return (
    <main className={compact ? 'app app--compact' : 'app'}>
      <p className="eyebrow">PIN · STAGE 1</p>
      <h1>工程骨架已启动</h1>
      <p className="meta">
        role={context.role} · id={context.id}
      </p>
      <p className="status">{ping}</p>
      <button type="button" onClick={toggleCompact}>
        Zustand 状态：{compact ? 'compact' : 'normal'}
      </button>
    </main>
  );
}

const root = document.getElementById('root');

if (!root) {
  throw new Error('Renderer root element is missing');
}

createRoot(root).render(<App />);
