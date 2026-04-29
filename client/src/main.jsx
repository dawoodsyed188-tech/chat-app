import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

class ErrorFallback extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error('React render failed:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="app-shell">
          <section className="fallback-panel">
            <h1>Chat App Loaded</h1>
            <p>The chat UI hit a render error, but React mounted successfully.</p>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

const rootElement = document.getElementById('root');

if (rootElement) {
  createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorFallback>
        <App />
      </ErrorFallback>
    </React.StrictMode>
  );
} else {
  document.body.innerHTML = '<main class="app-shell"><section class="fallback-panel"><h1>Chat App Loaded</h1></section></main>';
}
