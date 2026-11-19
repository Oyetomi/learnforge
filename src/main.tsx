import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './styles/foundation.css';

import { db } from './services/db';
import { hydrateAIKey } from './services/ai/connection';
import { hydrateExaKey } from './services/plugins/registry';

// Learning records load from IndexedDB, and provider keys from macOS Keychain,
// before the first render. A stalled database or an unanswered Keychain prompt
// must not leave a blank window, so rendering proceeds after 4s; late keys
// arrive through the connection and plugin change events.
const render = () =>
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
Promise.race([Promise.all([db.ready(), hydrateAIKey(), hydrateExaKey()]), new Promise((resolve) => setTimeout(resolve, 4000))])
  .catch(() => undefined)
  .then(render);
