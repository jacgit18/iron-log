import Icon from './Icon.jsx';
import { videoLabel } from '../lib/data.js';
import './WatchLink.css';

// The one "Watch on <site>" link for an exercise or recipe video. Large is a tile (Ideas to try, recipe detail); Compact is the small inline link (Board card, lists).
export default function WatchLink({ url, name, size = 'large' }: { url: string; name: string; size?: 'large' | 'compact' }) {
  const label = videoLabel(url);
  return (
    <a className={`watch watch-${size}`} href={url} target="_blank" rel="noopener noreferrer" aria-label={`${label}: ${name} (opens in a new tab)`}>
      <span className="watch-play" aria-hidden="true"><Icon name="play" /></span>{' '}<span>{label}</span>
    </a>
  );
}
