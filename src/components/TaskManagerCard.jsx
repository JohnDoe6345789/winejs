import { Card, CardHeader, CardContent, Stack, Box, Typography, Chip, Button, LinearProgress } from '@mui/material';
import MemoryIcon from '@mui/icons-material/Memory';
import { formatFileSize, formatTimestamp } from '../utils/formatters.js';

function TaskManagerCard({ tasks, onCloseTask }) {
  return (
    <Card variant="outlined" sx={{ borderColor: 'rgba(255,255,255,0.08)' }}>
      <CardHeader
        avatar={<MemoryIcon color="primary" />}
        title="Task Manager"
        subheader="Inspect simulated processes and terminate noisy workloads."
      />
      <CardContent>
        {tasks.length ? (
          <Stack spacing={2}>
            {tasks.map((task) => {
              const chipColor = task.status === 'Failed' ? 'error' : task.status === 'Analyzing' ? 'warning' : 'success';
              return (
                <Box key={task.id} sx={{ p: 1.5, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2 }}>
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    justifyContent="space-between"
                    alignItems={{ xs: 'flex-start', sm: 'center' }}
                    spacing={1.5}
                  >
                    <Box>
                      <Typography variant="subtitle1">{task.name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {task.intent} • {formatFileSize(task.size)} • Started {formatTimestamp(task.startedAt)}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Chip size="small" color={chipColor} label={task.status} />
                      <Button size="small" color="error" onClick={() => onCloseTask(task.id)}>
                        End task
                      </Button>
                    </Stack>
                  </Stack>
                  <Stack direction="row" spacing={2} mt={1}>
                    <Typography variant="caption" color="text.secondary">
                      CPU {task.cpu}%
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Memory {task.memory} MB
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Updated {formatTimestamp(task.lastUpdated ?? task.startedAt)}
                    </Typography>
                  </Stack>
                  <LinearProgress variant="determinate" value={Math.min(100, Math.round(task.progress))} sx={{ mt: 1, height: 6, borderRadius: 999 }} />
                </Box>
              );
            })}
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary">
            Load an executable to seed the task list and manage its workload from here.
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

export default TaskManagerCard;
