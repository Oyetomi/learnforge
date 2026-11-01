// A deterministic boundary audit, NOT a tutor-generation or learning benchmark.
// Requires Node >=22.18 for native TypeScript stripping; no application data read.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { validateLearningCheck } from '../../src/services/learning/checks.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const { values } = parseArgs({ options: { learnharness: { type: 'string' } } });
const harness = path.resolve(values.learnharness || path.join(root, '../learnharness'));
const { quizInputProblems, probeQuizInputSchema } = await import(pathToFileURL(path.join(harness, 'src/core/question-core.ts')).href);
const requireHarness = createRequire(path.join(harness, 'package.json'));
const { Value } = await import(pathToFileURL(requireHarness.resolve('typebox/value')).href);
const cases = [
  { id: 'correct-key', question: 'What is 2 + 2?', labels: ['4', '5'], key: 'a', explanation: 'Two pairs total four.', semanticStatus: 'correct' },
  { id: 'wrong-key', question: 'What is 2 + 2?', labels: ['4', '5'], key: 'b', explanation: 'Two plus two is five.', semanticStatus: 'incorrect' },
  { id: 'ambiguous-single-select', question: 'Which number is greater than zero?', labels: ['1', '2', '-1'], key: 'a', explanation: 'One is positive.', semanticStatus: 'two-correct-options' },
  { id: 'nonexistent-key', question: 'What is 2 + 2?', labels: ['4', '5'], key: 'missing', explanation: 'Two pairs total four.', semanticStatus: 'structurally-invalid' },
];
const results = cases.map(({ labels, key, ...fixture }) => {
  const options = labels.map((label, index) => ({ id: String.fromCharCode(97 + index), label }));
  const forge = { question: fixture.question, options, correctOptionIds: [key], multiple: false, explanation: fixture.explanation };
  const lh = { question: fixture.question, options: options.map(o => ({ label: o.label, value: o.id })), correctAnswer: key, multiSelect: false, explanation: fixture.explanation };
  return { ...fixture, options, key,
    learnforgeAccepted: validateLearningCheck(forge) !== null,
    learnharnessAccepted: Value.Check(probeQuizInputSchema, lh) && quizInputProblems(lh).length === 0,
  };
});
const revision = directory => execFileSync('git', ['-C', directory, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const fingerprint = async file => createHash('sha256').update(await readFile(file)).digest('hex');
console.log(JSON.stringify({
  scope: 'Pure question-authoring boundary only; deliberately injected fixtures, not generated questions. Accepted means format-valid, not factually verified.',
  createdAt: new Date().toISOString(),
  node: process.version, commits: { learnforge: revision(root), learnharness: revision(harness) }, results,
  sourceSha256: {
    learnforgeChecks: await fingerprint(path.join(root, 'src/services/learning/checks.ts')),
    learnharnessQuestions: await fingerprint(path.join(harness, 'src/core/question-core.ts')),
    learnharnessValueNormalization: await fingerprint(path.join(harness, 'src/core/value-debris.ts')),
  },
}, null, 2));
