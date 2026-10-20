import { useFeature } from '../../features.js';

// Diet will live here, inside Nutrition. Nothing is stored yet; the layout is decided once there is something to track. Admin-only for now (`diet` in features.ts).
export default function Diet() {
  if (!useFeature('diet')) return null;
  return (
    <section className="panel suppanel mt-16" aria-labelledby="diet-h">
      <h2 id="diet-h">Diet</h2>
      <p className="note">Nothing here yet. This is where what you eat will go.</p>
    </section>
  );
}
