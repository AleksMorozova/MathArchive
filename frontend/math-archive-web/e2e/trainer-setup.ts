import { execFileSync } from 'node:child_process';
import { mkdtempSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export default function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'matharchive-browser-'));
  const path = join(directory, 'response.json');
  process.env.TRAINER_BROWSER_FIXTURE_PATH = path;
  try {
    execFileSync('dotnet', ['test', 'backend/MathArchive.sln', '--configuration', 'Release', '--filter', 'FullyQualifiedName~ExportBrowserFixture'], {
      cwd: resolve('../..'), env: process.env, stdio: 'inherit', timeout: 120000
    });
  } catch (error) { rmdirSync(directory); throw error; }
  return () => { unlinkSync(path); rmdirSync(directory); };
}
