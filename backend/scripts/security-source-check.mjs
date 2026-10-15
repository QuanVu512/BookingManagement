import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Focused static gate, not a substitute for semantic AppSec review or history scanning.
const deleted = new Set(
  execFileSync('git', ['ls-files', '--deleted', '-z'], {
    encoding: 'utf8',
  }).split('\0'),
);
const files = execFileSync(
  'git',
  ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter((file) => file && !deleted.has(file));
const rules = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  [
    'github-token',
    /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/,
  ],
  ['aws-access-key', /\bAKIA[A-Z0-9]{16}\b/],
];
const sourceRules = [
  ['dynamic-evaluation', /(?<![\w.])(?:eval\s*\(|new\s+Function\s*\()/],
  ['interpolated-shell', /\b(?:exec|execSync)\s*\(\s*`/],
  ['unsafe-prisma-query', /\.\$(?:queryRawUnsafe|executeRawUnsafe)\s*\(/],
];
let failures = 0;
for (const file of files) {
  if (
    !/\.(?:[cm]?[jt]sx?|json|ya?ml|md|sql)$/.test(file) ||
    file === 'package-lock.json'
  )
    continue;
  const content = readFileSync(file, 'utf8');
  const checks =
    /^(?:backend\/src|frontend)\//.test(file) && !/\.spec\./.test(file)
      ? [...rules, ...sourceRules]
      : rules;
  for (const [name, pattern] of checks) {
    if (!pattern.test(content)) continue;
    console.error(`${name}: ${file}`); // Never print the matched credential.
    failures++;
  }
}
console.log(
  JSON.stringify({
    scanner: 'focused-source-security-v1',
    files: files.length,
    findings: failures,
  }),
);
process.exitCode = failures ? 1 : 0;
