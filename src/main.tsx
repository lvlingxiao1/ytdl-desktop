import { createRoot } from 'react-dom/client';
import App from './App';

// Create root for React rendering
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
} else {
  console.error('Root element not found');
}
