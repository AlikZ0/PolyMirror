import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/index.css';
import { Providers } from '../components/Providers';
import { PopupApp } from './PopupApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Providers>
      <PopupApp />
    </Providers>
  </StrictMode>,
);
