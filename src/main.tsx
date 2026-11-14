import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './styles/foundation.css';

import { db } from './services/db';

// Learning records load from IndexedDB before the first render. A stalled
// database must not leave a blank window, so rendering proceeds after 4s.
const render = () =>
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
Promise.race([db.ready(), new Promise((resolve) => setTimeout(resolve, 4000))])
  .catch(() => undefined)
  .then(render);
