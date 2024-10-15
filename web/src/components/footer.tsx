import { Button } from '@/components/ui/button'
import Link from 'next/link'

export const Footer = () => {
  return (
    <footer className="text-muted-foreground w-full text-center text-sm">
      © {new Date().getFullYear()} coded with 🤖{' '}
      <Button variant="link" className="p-0" asChild>
        <Link href="https://discord.gg/mcWTGjgTj3" target="_blank">
          (Keep in touch!)
        </Link>
      </Button>
    </footer>
  )
}
