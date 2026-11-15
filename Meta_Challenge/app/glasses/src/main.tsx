import {Component, StrictMode} from 'react';
import type {ErrorInfo, ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root mount element');

interface BoundaryState {
  failed: boolean;
  reset: number;
}

class AppBoundary extends Component<{children: ReactNode}, BoundaryState> {
  state: BoundaryState = {failed: false, reset: 0};

  static getDerivedStateFromError(): Partial<BoundaryState> {
    return {failed: true};
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    window.setTimeout(() => this.setState(state => ({failed: false, reset: state.reset + 1})), 0);
  }

  render(): ReactNode {
    if (this.state.failed) return <div className="center">WonderWhy</div>;
    return <div className="fill" key={this.state.reset}>{this.props.children}</div>;
  }
}

createRoot(root).render(
  <StrictMode>
    <AppBoundary>
      <App />
    </AppBoundary>
  </StrictMode>,
);
