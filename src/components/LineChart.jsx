import { PHASES, PH_KEYS } from '../lib/data.js';
import { parseDate, fmtShort } from '../shared/dates.js';

// Weight-over-time line(s). HTML labels over a stretched SVG path so text stays readable at any width.
// With byPhase, each training phase gets its own line (phase hue + marker shape + legend).
export default function LineChart({ entries, height = 180, label = 'Weight over time', byPhase = false }) {
  const all = entries.filter(e => e.w != null && e.w !== '' && Number(e.w) > 0).map(e => ({ x: parseDate(e.d).getTime(), y: Number(e.w), d: e.d, ph: e.ph || '' }));
  const groups = {}; all.forEach(p => { const k = byPhase ? p.ph : '_'; (groups[k] = groups[k] || []).push(p); });
  const order = [...PH_KEYS, '', '_'];
  const series = Object.keys(groups).sort((a, b) => order.indexOf(a) - order.indexOf(b))
    .map(k => { const byDay = {}; groups[k].forEach(p => { byDay[p.d] = p; }); return { k, pts: Object.keys(byDay).sort().map(d => byDay[d]) }; })
    .filter(sr => sr.pts.length);
  if (!series.some(sr => sr.pts.length >= 2)) return <p className="note">Log at least two sessions with a weight to see a trend.</p>;

  const multi = series.length > 1;
  const xs = all.map(p => p.x), ys = all.map(p => p.y);
  let x0 = Math.min(...xs), x1 = Math.max(...xs); if (x0 === x1) { x0 -= 864e5; x1 += 864e5; }
  const maxTicks = height < 150 ? 3 : 4;
  let y0 = Math.min(...ys), y1 = Math.max(...ys); const span = Math.max(y1 - y0, 5);
  const step = [1, 2.5, 5, 10, 20, 25, 50, 100, 200].find(s => span / s <= maxTicks - 1) || 250;
  y0 = Math.floor(y0 / step) * step; y1 = Math.ceil(y1 / step) * step; if (y1 === y0) y1 = y0 + step; if (y0 < 0) y0 = 0;
  const px = x => (x - x0) / (x1 - x0) * 100, py = y => (1 - (y - y0) / (y1 - y0)) * 100;
  const name = k => k === '_' ? '' : k ? PHASES[k].label : 'No phase';
  const grid = []; for (let v = y0; v <= y1 + 1e-9; v += step) grid.push(v);
  const aria = series.map(sr => `${multi ? name(sr.k) + ': ' : ''}${sr.pts.map(p => `${fmtShort(parseDate(p.d))} ${p.y} lb`).join(', ')}`).join('; ');

  return (
    <>
      {multi && (
        <div className="lleg">
          {series.map(sr => (
            <span key={sr.k}><i className={`lsw s-${sr.k || 'none'}`} />{name(sr.k)} <b>{sr.pts[sr.pts.length - 1].y} lb</b></span>
          ))}
        </div>
      )}
      <div className="lchart" style={{ height }} role="img" aria-label={`${label}. ${aria}`}>
        <div className="lgrid">
          {grid.map(v => <span key={v} style={{ bottom: `${(v - y0) / (y1 - y0) * 100}%` }}><b>{Math.round(v * 10) / 10}</b></span>)}
        </div>
        <div className="lplot">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {series.map(sr => {
              const P = sr.pts, cls = multi ? ` s-${sr.k || 'none'}` : '';
              const d = P.map((p, i) => `${i ? 'L' : 'M'}${px(p.x).toFixed(2)},${py(p.y).toFixed(2)}`).join('');
              return (
                <g key={sr.k}>
                  {!multi && P.length > 1 && <path className="ar" d={`${d}L${px(P[P.length - 1].x).toFixed(2)},100L${px(P[0].x).toFixed(2)},100Z`} />}
                  {P.length > 1 && <path className={`ln${cls}`} d={d} />}
                </g>
              );
            })}
          </svg>
          {series.flatMap(sr => sr.pts.map((p, i) => (
            <i
              key={`${sr.k}-${p.d}`}
              className={`ldot${multi ? ` s-${sr.k || 'none'}` : ''}${i === sr.pts.length - 1 ? ' end' : ''}`}
              style={{ left: `${px(p.x)}%`, top: `${py(p.y)}%` }}
              data-tip={`${multi ? name(sr.k) + ' · ' : ''}${fmtShort(parseDate(p.d))}: ${p.y} lb`}
            />
          )))}
        </div>
        <div className="lx"><span>{fmtShort(new Date(x0))}</span><span>{fmtShort(new Date(x1))}</span></div>
      </div>
    </>
  );
}
