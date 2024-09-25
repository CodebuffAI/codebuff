import { Button } from '@/components/ui/button'

export const Footer = () => {
  return (
    <footer className="text-muted-foreground w-full text-center text-sm">
      © {new Date().getFullYear()} coded with ❤️ by{' '}
      <Button variant="link" className="p-0" asChild>
        <a href="https://manicode.ai/">the Manicode team</a>
      </Button>
    </footer>
  )
}
