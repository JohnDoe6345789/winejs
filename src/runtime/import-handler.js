function normalizeResult(result) {
  if (result == null) return undefined;
  if (typeof result === 'number') return { rax: result };
  if (typeof result === 'object') {
    return {
      rax: result.rax ?? 0,
    };
  }
  return undefined;
}

export function createImportHandler({ readAnsiString, readWideString, log, plugins = [] }) {
  return function handleImportCall({ name, cpu, consoleLines, flagGui }) {
    const context = {
      name,
      cpu,
      consoleLines,
      flagGui,
      readAnsiString,
      readWideString,
      log,
    };
    for (const plugin of plugins) {
      if (!plugin) continue;
      const shouldRun = plugin.match ? plugin.match(context) : true;
      if (!shouldRun) continue;
      const result = plugin.handle?.(context);
      const normalized = normalizeResult(result);
      if (normalized) {
        return normalized;
      }
    }
    return { rax: 0 };
  };
}
