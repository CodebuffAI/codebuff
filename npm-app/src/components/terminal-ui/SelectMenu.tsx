import React from 'react';
import { Box, Text, useStdin } from 'ink';

type MenuItem = string | { type: 'header'; label: string };

export interface SelectMenuProps {
  items: MenuItem[];
  onSelect: (index: number) => void;
}

export const SelectMenu: React.FC<SelectMenuProps> = ({ items, onSelect }) => {
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const { stdin, setRawMode } = useStdin();

  React.useEffect(() => {
    setRawMode(true);
    const handleKeyPress = (data: Buffer) => {
      const key = data.toString();

      if (key === '\u001B[A') { // up arrow
        setSelectedIndex(prev => {
          let next = prev - 1;
          while (next >= 0 && typeof items[next] !== 'string') {
            next--;
          }
          return next >= 0 ? next : prev;
        });
      }
      if (key === '\u001B[B') { // down arrow
        setSelectedIndex(prev => {
          let next = prev + 1;
          while (next < items.length && typeof items[next] !== 'string') {
            next++;
          }
          return next < items.length ? next : prev;
        });
      }
      if (key === '\r' && typeof items[selectedIndex] === 'string') { // enter
        onSelect(selectedIndex);
      }
    };

    stdin?.on('data', handleKeyPress);
    return () => {
      setRawMode(false);
      stdin?.off('data', handleKeyPress);
    };
  }, [stdin, setRawMode, items, selectedIndex, onSelect]);

  return (
    <Box flexDirection="column">
      {items.map((item, i) => {
        if (typeof item === 'string') {
          return (
            <Text key={i} color={i === selectedIndex ? 'green' : undefined}>
              {i === selectedIndex ? '> ' : '  '}{item}
            </Text>
          );
        } else {
          return (
            <Text key={i} color="blue" bold>
              {item.label}
            </Text>
          );
        }
      })}
    </Box>
  );
};
