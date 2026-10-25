import { Component, type ErrorInfo, type ReactNode } from 'react';
import { feedbackLink } from '../lib/feedback.js';
import { useAppStore } from '../store/useAppStore.js';
import { ChunkLoadError } from '../lib/lazyTab.js';

interface Props {
  children: ReactNode;
  /** 'view' wraps one tab: the header and tabs stay, so Try again redraws it and another tab still works. 'app' wraps everything. */
  where: 'view' | 'app';
}

// A render error used to leave a white screen (backlog #71). This shows what happened and the ways out instead: try again, keep a copy of
// the data, tell the developer. The data is not touched: a render error happens while drawing, after anything was saved. Reporting the
// error to the server is done once for the whole app, in createRoot's onCaughtError (main.tsx).
export default class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(_error: unknown, _info: ErrorInfo) { /* reported by onCaughtError in main.tsx */ }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const view = this.props.where === 'view';
    // A tab that did not download: drawing it again cannot work (see lazyTab), so the way out is a reload.
    const download = error instanceof ChunkLoadError;
    const feedback = feedbackLink();
    // Only when the store has a downloads handle: in a broken app the export may fail too, and then nothing else is lost by trying.
    const canExport = !!useAppStore.getState().dl;
    return (
      <section className="notice crash" role="alert" aria-labelledby="crash-h">
        <h2 id="crash-h">Something went wrong</h2>
        <p>{download ? 'This screen could not be downloaded. Check your connection, then reload. ' : `${view ? 'This screen' : 'Loadbearer'} hit an error while drawing. `}What you saved before is still stored. {download ? 'The other tabs still work.' : view ? 'Try again, or use the other tabs.' : 'Reload to start again.'}</p>
        <div className="actions">
          {view && !download
            ? <button type="button" className="btn primary" onClick={() => this.setState({ error: null })}>Try again</button>
            : <button type="button" className="btn primary" onClick={() => window.location.reload()}>Reload</button>}
          {canExport && <button type="button" className="btn" onClick={() => void useAppStore.getState().downloadData()}>Export all data</button>}
          {feedback && <a className="btn" href={feedback} target="_blank" rel="noopener noreferrer">Report the problem</a>}
        </div>
        <details>
          <summary>Error details</summary>
          <pre>{error.message}</pre>
        </details>
      </section>
    );
  }
}
