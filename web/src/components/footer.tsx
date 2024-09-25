import { Button } from '@/components/ui/button'
import Link from 'next/link'

export const Footer = () => {
  return (
    <footer className="text-muted-foreground w-full text-center text-sm">
      © {new Date().getFullYear()} coded with 🤖 by{' '}
      <Button variant="link" className="p-0" asChild>
        <Link href="https://jamesgrugett.com/p/announcing-manicode-v0">
          the Manicode team
        </Link>
      </Button>
    </footer>
  )
}
