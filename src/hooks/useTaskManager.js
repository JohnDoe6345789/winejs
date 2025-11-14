import * as React from 'react';

const MAX_TASKS = 6;

export function useTaskManager(wine, setStatusText) {
  const [selectedFile, setSelectedFile] = React.useState(null);
  const [isSimulating, setIsSimulating] = React.useState(false);
  const [tasks, setTasks] = React.useState([]);

  const handleFileSelect = React.useCallback(
    async (event) => {
      const file = event.target.files?.[0];
      if (!file || !wine) return;
      const input = event.target;
      setSelectedFile({ name: file.name, size: file.size });
      const taskId = `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const startedAt = Date.now();
      const baseTask = {
        id: taskId,
        name: file.name,
        size: file.size,
        status: 'Analyzing',
        startedAt,
        progress: 35 + Math.random() * 20,
        cpu: Math.round(30 + Math.random() * 40),
        memory: Math.max(24, Math.round(file.size / (1024 * 1024)) || 24),
        intent: 'Import scan',
      };
      setTasks((prev) => {
        const filtered = prev.filter((task) => task.id !== taskId);
        return [baseTask, ...filtered].slice(0, MAX_TASKS);
      });
      setIsSimulating(true);
      try {
        await wine.loadBinary(file);
        const simulation = wine.run(file);
        setTasks((prev) =>
          prev.map((task) =>
            task.id === taskId
              ? {
                  ...task,
                  status: simulation?.error ? 'Failed' : 'Ready',
                  intent: simulation?.guiIntent ? 'GUI intent' : 'Console intent',
                  progress: simulation?.error ? task.progress : 100,
                  cpu: simulation?.error ? 0 : Math.min(100, task.cpu + Math.round(Math.random() * 10)),
                  memory: Math.max(task.memory, Math.round((file.size || 0) / (1024 * 1024)) || task.memory),
                  lastUpdated: Date.now(),
                }
              : task,
          ),
        );
      } catch (err) {
        setStatusText(`Failed to load ${file.name}. ${err?.message ?? err}`);
        setTasks((prev) =>
          prev.map((task) => (task.id === taskId ? { ...task, status: 'Failed', progress: 100, lastUpdated: Date.now() } : task)),
        );
      } finally {
        setIsSimulating(false);
        if (input) {
          input.value = '';
        }
      }
    },
    [wine, setStatusText],
  );

  const handleCloseTask = React.useCallback(
    (taskId) => {
      setTasks((prev) => {
        const closing = prev.find((task) => task.id === taskId);
        if (closing && wine?.log) {
          wine.log(`[WineJS] Task "${closing.name}" closed from Task Manager.`);
        }
        return prev.filter((task) => task.id !== taskId);
      });
    },
    [wine],
  );

  return {
    selectedFile,
    isSimulating,
    tasks,
    handleFileSelect,
    handleCloseTask,
  };
}
