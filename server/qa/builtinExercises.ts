/* The built-in exercises (id to name and equipment), as plain data (generated from src/lib/data.ts EX: `npx tsx scripts/qa-builtin-programs.mjs`). The QA seed writes them into a program persona's cfg.ex so the exercise library lists them (a synced account lists only cfg.ex, ADR 024); src/lib/qaBuiltinPrograms.test.ts fails when it drifts from EX. */
export const BUILTIN_EXERCISES: Record<string, { n: string; eq?: string; url?: string }> = {
 "latpd": {
  "n": "Lat Pulldown, alternating single-arm",
  "eq": "cable"
 },
 "wristpd": {
  "n": "Cable Wrist Pulldown",
  "eq": "cable"
 },
 "platerot": {
  "n": "Plate Torso Rotation",
  "eq": "plate"
 },
 "innerthigh": {
  "n": "Inner Thigh Abduction",
  "eq": "machine"
 },
 "romanadd": {
  "n": "Roman Chair Hip Adduction",
  "url": "https://www.youtube.com/watch?v=j5HWZOfIePI",
  "eq": "bodyweight"
 },
 "chestpress": {
  "n": "Chest Press",
  "eq": "machine"
 },
 "zercher": {
  "n": "Seated Zercher Good Morning",
  "url": "https://youtu.be/ahfSSi4MVJQ",
  "eq": "barbell"
 },
 "zottman": {
  "n": "Zottman Curl",
  "eq": "dumbbell"
 },
 "kbleg": {
  "n": "Kettlebell Leg Raise",
  "eq": "kettlebell"
 },
 "grip": {
  "n": "Grip Trainer",
  "eq": "other"
 },
 "canoe": {
  "n": "Canoe Stretch",
  "url": "https://youtu.be/yR6EnBqjKNs",
  "eq": "barbell"
 },
 "suitcase": {
  "n": "Suitcase Bottom-Up, single-arm",
  "eq": "kettlebell"
 },
 "reardelt": {
  "n": "Side Rear Delt Fly",
  "eq": "cable"
 },
 "facepull": {
  "n": "Face Pull",
  "eq": "cable"
 },
 "legext": {
  "n": "Leg Extension ISO hold",
  "eq": "machine"
 },
 "cablecrunch": {
  "n": "Kneeling Cable Ab Crunch",
  "eq": "cable"
 },
 "hipthrust": {
  "n": "Hip Thrust",
  "eq": "machine"
 },
 "dip": {
  "n": "Wide Tricep Dip",
  "eq": "bodyweight"
 },
 "kneeraise": {
  "n": "Hanging Knee Raise",
  "eq": "bodyweight"
 },
 "db6": {
  "n": "DB 6 Ways",
  "eq": "dumbbell"
 },
 "hack": {
  "n": "Hack Squat",
  "eq": "machine"
 },
 "pallof": {
  "n": "Pallof Press",
  "eq": "cable"
 },
 "cablerow": {
  "n": "Explosive Unilateral Cable Row",
  "url": "https://youtu.be/OrAcowGGU2U",
  "eq": "cable"
 },
 "deskbands": {
  "n": "Desk Bands",
  "url": "https://youtu.be/o_uZcQnXaFA",
  "eq": "band"
 },
 "arnold": {
  "n": "Arnold Press",
  "eq": "dumbbell"
 },
 "dbclean": {
  "n": "DB Clean & Jerk Press",
  "eq": "dumbbell"
 },
 "trxpike": {
  "n": "TRX Pike Push-Up",
  "url": "https://youtu.be/GIWNRslPEv4",
  "eq": "trx"
 },
 "trxrow": {
  "n": "TRX Wide-Grip Row",
  "url": "https://youtu.be/o9M1k6OzI-g",
  "eq": "trx"
 },
 "medball": {
  "n": "Med Ball Rotational Scoop",
  "url": "https://youtu.be/xmQfXggU2mU",
  "eq": "medball"
 },
 "latwall": {
  "n": "Lateral Wall Push",
  "url": "https://youtu.be/tIFjnucY09Q",
  "eq": "bodyweight"
 },
 "spinal": {
  "n": "Spinal Waves",
  "url": "https://youtu.be/KCfh_wCssK8"
 },
 "pogo": {
  "n": "Pogo Hops",
  "url": "https://youtu.be/iU-TKr4YesM",
  "eq": "bodyweight"
 },
 "skater": {
  "n": "Lateral Bound / Skater Hop with Stick",
  "url": "https://youtu.be/4nTDP0G3nhc",
  "eq": "bodyweight"
 },
 "splitjump": {
  "n": "Split Squat Jumps",
  "url": "https://www.youtube.com/watch?v=4DMvFDaqIys",
  "eq": "bodyweight"
 },
 "depthcombo": {
  "n": "Depth Drop → Broad Jump → Box Jump",
  "url": "https://youtu.be/GZLyZCqF8BQ",
  "eq": "bodyweight"
 },
 "latpdbi": {
  "n": "Lat Pulldown",
  "eq": "cable"
 },
 "outerthigh": {
  "n": "Outer Thigh Adduction",
  "eq": "machine"
 },
 "qlext": {
  "n": "Side Lateral QL Extension",
  "url": "https://www.youtube.com/watch?v=UaydER2VIUc",
  "eq": "machine"
 },
 "farmers": {
  "n": "Farmers Carry",
  "eq": "dumbbell"
 },
 "dblunge": {
  "n": "DB Lunge",
  "eq": "dumbbell"
 },
 "ohtri": {
  "n": "Overhead Tricep Extension",
  "eq": "cable"
 },
 "bss": {
  "n": "Bulgarian Split Squat",
  "eq": "dumbbell"
 },
 "legcurl": {
  "n": "Prone Leg Curl",
  "eq": "machine"
 },
 "cablepunch": {
  "n": "Cable Punch ISO hold",
  "eq": "cable"
 },
 "sledlat": {
  "n": "Sled push → lateral pull",
  "eq": "sled"
 },
 "sled": {
  "n": "Sled push → pull",
  "eq": "sled"
 }
};
