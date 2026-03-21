import { diffEnvFiles } from '../diff.js';
import { DiffOptions, DiffResult } from '../types.js';

/**
 * Run the environment diff command.
 *
 * Delegates key extraction to the pure `diffEnvFiles` engine (which never
 * exposes values), then wraps the result in a `DiffResult` with timing metadata.
 *
 * @param options - Resolved CLI options including file paths and flags.
 * @returns A structured diff result ready for output formatting.
 */
export async function diff(options: DiffOptions): Promise<DiffResult> {
  const start = Date.now();

  const raw = diffEnvFiles(options.envFiles);

  return {
    fileLabels: options.envFiles.map((f) => f.label),
    inSync: raw.inSync,
    drift: raw.drift,
    onlyInOne: raw.onlyInOne,
    durationMs: Date.now() - start,
  };
}
