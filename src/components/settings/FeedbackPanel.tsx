import { feedbackLink } from '../../lib/feedback.js';

export default function FeedbackPanel() {
  const href = feedbackLink();
  if (!href) return null;
  return (
    <section className="panel">
      <h3>Send feedback</h3>
      <p>Found a bug or have an idea? It opens a short form in a new tab.</p>
      <div className="actions"><a className="btn" href={href} target="_blank" rel="noopener noreferrer">Open feedback form</a></div>
    </section>
  );
}
