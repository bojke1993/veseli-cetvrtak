import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App, createQueryClient } from './App';
import './styles/app.css';

const queryClient = createQueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App queryClient={queryClient} />
  </StrictMode>,
);
