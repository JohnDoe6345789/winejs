import * as React from 'react';
import { ToggleButtonGroup, ToggleButton, Tooltip } from '@mui/material';

function ThemeMenu({ value, onChange, options }) {
  const handleChange = React.useCallback(
    (_, next) => {
      if (next) {
        onChange(next);
      }
    },
    [onChange],
  );

  return (
    <ToggleButtonGroup
      value={value}
      exclusive
      onChange={handleChange}
      size="small"
      color="primary"
      sx={{ flexWrap: 'wrap', gap: 0.5 }}
    >
      {Object.entries(options).map(([key, option]) => (
        <Tooltip key={key} title={option.description} arrow placement="bottom">
          <ToggleButton value={key} sx={{ textTransform: 'none', px: 1.5 }}>
            {option.label}
          </ToggleButton>
        </Tooltip>
      ))}
    </ToggleButtonGroup>
  );
}

export default ThemeMenu;
