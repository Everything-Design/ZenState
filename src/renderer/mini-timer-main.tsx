import React from 'react';
import { createRoot } from 'react-dom/client';
import MiniTimerApp from './MiniTimerApp';
import './styles/zenstate.css';

const root = createRoot(document.getElementById('root')!);
if (!window.zenstate) {
  console.error('[ZenState] window.zenstate is not available in mini-timer preload.');
  root.render(
    <div style={{ color: '#ff6b6b', padding: 20, fontSize: 12, fontFamily: 'monospace', background: 'rgba(0,0,0,0.8)', borderRadius: 12, margin: 8 }}>
      <strong>Preload Error:</strong><br />
      window.zenstate is not available.<br />
      The preload script may have failed to load.
    </div>
  );
} else {
  root.render(<MiniTimerApp />);
}
