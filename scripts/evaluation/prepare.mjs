// Preparation only: no providers, browser profiles or learner databases are read.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = fileURLToPath(new URL('../../', import.meta.url));
const { values } = parseArgs({ options: { out: { type: 'string' }, learnharness: { type: 'string' } } });
if (!values.out) throw new Error('Provide --out <new-directory>. This command makes no model calls.');
const output = path.resolve(values.out);
const harness = path.resolve(values.learnharness || path.join(root, '../learnharness'));
const packText = await readFile(path.join(root, 'docs/evaluation/task-pack.json'), 'utf8');
const pack = JSON.parse(packText);
if (pack.version !== 1 || pack.cases.length !== 3 || new Set(pack.cases.map(c => c.id)).size !== 3) {
  throw new Error('Unexpected task pack version or duplicate/missing cases.');
}
for (const item of pack.cases) {
  if (!item.brief.goal || !item.brief.reference || !item.scenario.misconception) throw new Error(`Incomplete case: ${item.id}`);
  for (const stage of ['baseline', 'transfer', 'delayed']) {
    if (!item[stage].prompt || !item[stage].oracle || !item[stage].criteria.length) throw new Error(`Incomplete ${stage}: ${item.id}`);
  }
}
const hash = text => createHash('sha256').update(text).digest('hex');
async function snapshot(directory) {
  const git = args => execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8' });
  const pkg = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
  return {
    version: pkg.version,
    commit: git(['rev-parse', 'HEAD']).trim(),
    dirty: git(['status', '--porcelain']).trim().length > 0,
    trackedDiffSha256: hash(git(['diff', '--no-ext-diff', 'HEAD', '--', '.'])),
  };
}
const apps = { learnforge: await snapshot(root), learnharness: await snapshot(harness) };
// A new directory prevents accidentally overwriting captured evaluation evidence.
await mkdir(output, { recursive: false });
const write = (name, value) => writeFile(path.join(output, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
await write('manifest.json', {
  version: 1, createdAt: new Date().toISOString(), status: 'prepared-not-run',
  taskPackSha256: hash(packText), reviewStatus: pack.reviewStatus, apps,
  scope: 'Manual app comparison; no live driver or model judge is implemented by this command.',
  controls: { provider: null, tutorModel: null, reasoning: null, auxiliaryModels: null, viewport: null, sessionMinutes: 15, turnLimit: 12, costLimit: null },
  confounds: [],
});
await write('tutor-briefs.json', pack.cases.map(({ id, subject, brief }) => ({ id, subject, ...brief })));
await write('observer-cards.json', pack.cases.map(({ id, scenario, baseline, transfer, delayed, failureSignals }) => ({
  id, scenario, baseline: baseline.prompt, transfer: transfer.prompt, delayed: delayed.prompt, failureSignals,
})));
await write('reviewer-only.json', { reviewStatus: pack.reviewStatus, cases: pack.cases.map(({ id, baseline, transfer, delayed }) => ({ id, baseline, transfer, delayed })) });
await write('observations.json', Object.entries(apps).flatMap(([app, revision]) => pack.cases.map(({ id }) => ({
  app, revision: revision.commit, caseId: id, status: 'not-run',
  tutorModel: null, auxiliaryModels: null, transcriptPath: null,
  scores: Object.fromEntries(['accuracy', 'goalAlignment', 'misconceptionRepair', 'pacing', 'feedbackVisibility', 'helpContinuity', 'visualMeaning', 'recovery'].map(key => [key, { status: 'not-observed', score: null, evidence: null }])),
  baselineScore: null, transferScore: null, delayedScore: null, reviewer: null, confounds: [],
}))));
console.log(`Prepared ${pack.cases.length} cases for each app in ${output}. No sessions or model calls were run.`);
