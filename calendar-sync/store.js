import fs from 'node:fs/promises';
import path from 'node:path';

const initial = { updatedAt: null, events: {} };

export async function loadState(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(initial, null, 2));
    return structuredClone(initial);
  }
}

export async function saveState(file, state) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(state, null, 2));
  await fs.rename(tmp, file);
}
