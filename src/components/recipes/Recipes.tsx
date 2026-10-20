// Recipes will live here. Nothing is stored yet; the layout is decided once there is something to keep. Admin-only for now (`recipes` in features.ts).
export default function Recipes() {
  return (
    <section className="panel" aria-labelledby="recipes-h">
      <h2 id="recipes-h" tabIndex={-1}>Recipes</h2>
      <p className="note">Nothing here yet. This is where your recipes will go.</p>
    </section>
  );
}
