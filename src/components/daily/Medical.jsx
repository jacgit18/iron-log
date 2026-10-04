// Medical data will live here. Nothing is stored yet; the layout is decided once there is something to track.
export default function Medical() {
  return (
    <section className="panel" aria-labelledby="med-h">
      <h2 id="med-h" tabIndex={-1}>Medical</h2>
      <p className="note">Nothing here yet. This is where medical data you track day to day will go.</p>
    </section>
  );
}
