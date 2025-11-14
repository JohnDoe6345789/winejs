import * as React from 'react';
import {
  Card,
  CardHeader,
  CardContent,
  Box,
  Typography,
  Stack,
  Switch,
  FormControlLabel,
  Grid,
  TextField,
  Divider,
} from '@mui/material';
import { pluginSections } from '../config/pluginPresets.js';

function FieldControl({ sectionType, pluginId, field, value, onChange }) {
  if (field.type === 'boolean') {
    return (
      <FormControlLabel
        control={
          <Switch
            color="secondary"
            checked={Boolean(value)}
            onChange={(event) => onChange(sectionType, pluginId, field.key, event.target.checked)}
          />
        }
        label={field.label}
      />
    );
  }

  const type = field.type === 'number' ? 'number' : 'text';
  return (
    <TextField
      fullWidth
      type={type}
      label={field.label}
      value={value ?? ''}
      onChange={(event) => onChange(sectionType, pluginId, field.key, event.target.value)}
      helperText={field.helperText}
      size="small"
    />
  );
}

function SettingsPanel({ pluginState, onTogglePlugin, onSettingChange }) {
  return (
    <Card variant="outlined" sx={{ backgroundColor: 'rgba(6,8,20,0.8)', borderColor: 'rgba(255,255,255,0.08)' }}>
      <CardHeader
        title="Plugin & Import Settings"
        subheader="Wire runtime, import, and simulator plugins on the fly."
      />
      <CardContent>
        <Stack spacing={4}>
          {pluginSections.map((section, sectionIndex) => (
            <Box key={section.type}>
              {sectionIndex > 0 && <Divider sx={{ mb: 2 }} />}
              <Typography variant="overline" color="text.secondary">
                {section.title}
              </Typography>
              <Stack spacing={2} mt={1}>
                {section.plugins.map((plugin) => {
                  const pluginConfig = pluginState?.[section.type]?.[plugin.id] ?? {};
                  const enabled = Boolean(pluginConfig.enabled);
                  return (
                    <Box key={plugin.id} sx={{ p: 2, borderRadius: 2, border: '1px solid rgba(255,255,255,0.06)' }}>
                      <Stack
                        direction={{ xs: 'column', sm: 'row' }}
                        justifyContent="space-between"
                        alignItems={{ xs: 'flex-start', sm: 'center' }}
                        spacing={1.5}
                      >
                        <Box>
                          <Typography variant="subtitle1">{plugin.label}</Typography>
                          <Typography variant="body2" color="text.secondary">
                            {plugin.description}
                          </Typography>
                        </Box>
                        <FormControlLabel
                          control={
                            <Switch
                              color="primary"
                              checked={enabled}
                              onChange={(event) =>
                                onTogglePlugin(section.type, plugin.id, event.target.checked)
                              }
                            />
                          }
                          label={enabled ? 'Enabled' : 'Disabled'}
                        />
                      </Stack>
                      {enabled && plugin.fields?.length ? (
                        <Grid container spacing={2} mt={1}>
                          {plugin.fields.map((field) => (
                            <Grid item xs={12} sm={field.type === 'boolean' ? 6 : 12} key={field.key}>
                              <FieldControl
                                sectionType={section.type}
                                pluginId={plugin.id}
                                field={field}
                                value={pluginConfig.settings?.[field.key]}
                                onChange={onSettingChange}
                              />
                            </Grid>
                          ))}
                        </Grid>
                      ) : null}
                    </Box>
                  );
                })}
              </Stack>
            </Box>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}

export default SettingsPanel;
