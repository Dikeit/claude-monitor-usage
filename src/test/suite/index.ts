import * as path from 'path';
import * as Mocha from 'mocha';
import * as fs from 'fs';

export function run(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mocha = new (Mocha as any)({ ui: 'tdd', color: true, timeout: 10000 });

  const testsRoot = path.resolve(__dirname);

  // Collect test files manually (avoid glob dependency issues)
  function collectTestFiles(dir: string): string[] {
    const results: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...collectTestFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.test.js')) {
        results.push(fullPath);
      }
    }
    return results;
  }

  for (const file of collectTestFiles(testsRoot)) {
    mocha.addFile(file);
  }

  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mocha.run((failures: number) => {
      if (failures > 0) {
        reject(new Error(`${failures} tests failed.`));
      } else {
        resolve();
      }
    });
  });
}
