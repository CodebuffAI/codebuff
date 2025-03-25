'use client';

import { ComponentProps } from 'react';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';

type ThemeSwitcherProps = {
  className?: ComponentProps<'button'>['className'];
};

export const ThemeSwitcher = ({ className }: ThemeSwitcherProps) => {
  // Theme switcher is disabled, always showing dark mode icon
  return (
    <Button
      className={className}
      variant="secondary"
      size="icon"
      aria-label={'dark mode'}
      disabled={true}
    >
      <Icons.moon />
    </Button>
  );
};
