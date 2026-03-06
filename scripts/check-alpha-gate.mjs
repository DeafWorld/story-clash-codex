import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const file = process.argv[2] || process.env.ALPHA_RESULTS_FILE || 'output/alpha-sessions.json';

const sessions = JSON.parse(readFileSync(resolve(process.cwd(), file), 'utf8'));
if (!Array.isArray(sessions)) {
  console.error('alpha-gate: expected array of session results');
  process.exit(1);
}

const recapCount = sessions.filter((s) => Boolean(s.reachedRecap)).length;
const rerunCount = sessions.filter((s) => Boolean(s.gmWouldRunAgain)).length;
const blockerCount = sessions.reduce((sum, s) => sum + Number(s.blockerCount || 0), 0);

const pass = sessions.length >= 10 && recapCount >= 8 && rerunCount >= 7 && blockerCount === 0;

console.log(`alpha-gate sessions=${sessions.length} recap=${recapCount} rerun=${rerunCount} blockers=${blockerCount}`);

if (!pass) {
  console.error('alpha-gate: failed launch criteria (need >=10 sessions, >=8 recap, >=7 rerun intent, 0 blockers)');
  process.exit(1);
}

console.log('alpha-gate: pass');
