#!/usr/bin/env node
import React from 'react';
import { render, Box, Text } from 'ink';
import { SelectMenu } from './components/terminal-ui/SelectMenu.js';
import { ProgressBar } from './components/terminal-ui/ProgressBar.js';

const MenuDemo = () => {
  const handleSelect = (index: number) => {
    console.log(`Selected option ${index}`);
    if (index === 6) process.exit(0);
  };

  return (
    <Box flexDirection="column">
      <Text bold>Terminal UI Demo - Menu Component</Text>
      <SelectMenu
        items={[
          { type: 'header', label: 'DEMO MENU' },
          'Option 1',
          'Option 2',
          'Option 3',
          { type: 'header', label: 'MORE OPTIONS' },
          'Option 4',
          'Exit'
        ]}
        onSelect={handleSelect}
      />
    </Box>
  );
};

const ProgressDemo = () => (
  <Box flexDirection="column">
    <Text bold>Terminal UI Demo - Progress Bar Component</Text>
    <ProgressBar
      percent={75}
      label="Demo Progress"
    />
  </Box>
);

const App = () => {
  const component = process.argv[2];

  if (!component) {
    console.error('Please specify a component to demo: menu or progress');
    process.exit(1);
  }

  switch (component.toLowerCase()) {
    case 'menu':
      return <MenuDemo />;
    case 'progress':
      return <ProgressDemo />;
    default:
      return (
        <Box>
          <Text color="red">Unknown component. Available components: menu, progress</Text>
        </Box>
      );
  }
};

render(<App />);
