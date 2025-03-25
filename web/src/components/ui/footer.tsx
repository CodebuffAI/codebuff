import Link from "next/link";

export function Footer() {
  return (
    <footer className="bg-black text-white py-16 border-t border-zinc-800">
      <div className="codebuff-container">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
          <div>
            <Link href="/" className="flex items-center space-x-2 mb-4">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <rect width="24" height="24" rx="4" fill="black" stroke="white" strokeWidth="1" />
                <path d="M6 6H18V9H6V6Z" fill="#AAFF33" />
                <path d="M6 10.5H12V13.5H6V10.5Z" fill="#AAFF33" />
                <path d="M6 15H15V18H6V15Z" fill="#AAFF33" />
              </svg>
              <span className="text-lg font-medium">codebuff</span>
            </Link>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider mb-4">Product</h3>
            <ul className="space-y-2">
              <li><Link href="#" className="text-sm text-zinc-400 hover:text-white transition-colors duration-300">Home</Link></li>
              <li><Link href="#" className="text-sm text-zinc-400 hover:text-white transition-colors duration-300">Pricing</Link></li>
              <li><Link href="#" className="text-sm text-zinc-400 hover:text-white transition-colors duration-300">Features</Link></li>
              <li><Link href="#" className="text-sm text-zinc-400 hover:text-white transition-colors duration-300">Docs</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider mb-4">Legal</h3>
            <ul className="space-y-2">
              <li><Link href="#" className="text-sm text-zinc-400 hover:text-white transition-colors duration-300">Privacy Policy</Link></li>
              <li><Link href="#" className="text-sm text-zinc-400 hover:text-white transition-colors duration-300">Terms of Service</Link></li>
              <li><Link href="#" className="text-sm text-zinc-400 hover:text-white transition-colors duration-300">Cookie Policy</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider mb-4">Community</h3>
            <ul className="space-y-2">
              <li><Link href="#" className="text-sm text-zinc-400 hover:text-white transition-colors duration-300">GitHub</Link></li>
              <li><Link href="#" className="text-sm text-zinc-400 hover:text-white transition-colors duration-300">Discord</Link></li>
              <li><Link href="#" className="text-sm text-zinc-400 hover:text-white transition-colors duration-300">Twitter</Link></li>
              <li><Link href="#" className="text-sm text-zinc-400 hover:text-white transition-colors duration-300">Blog</Link></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-zinc-800 pt-8 flex flex-col md:flex-row justify-between items-center">
          <div className="text-sm text-zinc-500 mb-4 md:mb-0">
            &copy; {new Date().getFullYear()} Codebuff. All rights reserved.
          </div>
          <div className="flex space-x-6">
            <Link href="#" className="text-zinc-400 hover:text-white transition-colors duration-300">
              <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.167 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.026A9.578 9.578 0 0 1 12 6.835c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.026 2.747-1.026.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.337-.012 2.416-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"></path>
              </svg>
            </Link>
            <Link href="#" className="text-zinc-400 hover:text-white transition-colors duration-300">
              <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.162 5.656a8.384 8.384 0 0 1-2.402.658A4.196 4.196 0 0 0 21.6 4c-.82.488-1.719.83-2.656 1.015a4.182 4.182 0 0 0-7.126 3.814 11.874 11.874 0 0 1-8.62-4.37 4.168 4.168 0 0 0-.566 2.103c0 1.45.738 2.731 1.86 3.481a4.168 4.168 0 0 1-1.894-.523v.052a4.185 4.185 0 0 0 3.355 4.101 4.21 4.21 0 0 1-1.89.072A4.185 4.185 0 0 0 7.97 16.65a8.394 8.394 0 0 1-6.191 1.732 11.83 11.83 0 0 0 6.41 1.88c7.693 0 11.9-6.373 11.9-11.9 0-.18-.005-.362-.013-.54a8.496 8.496 0 0 0 2.087-2.165z"></path>
              </svg>
            </Link>
            <Link href="#" className="text-zinc-400 hover:text-white transition-colors duration-300">
              <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c5.51 0 10-4.48 10-10S17.51 2 12 2zm6.605 4.61a8.502 8.502 0 0 1 1.93 5.314c-.281-.054-3.101-.629-5.943-.271-.065-.141-.12-.293-.184-.445a25.416 25.416 0 0 0-.564-1.236c3.145-1.28 4.577-3.124 4.761-3.362zM12 3.475c2.17 0 4.154.813 5.662 2.148-.152.216-1.443 1.941-4.48 3.08-1.399-2.57-2.95-4.675-3.189-5A8.687 8.687 0 0 1 12 3.475zm-3.633.803a53.896 53.896 0 0 1 3.167 4.935c-3.992 1.063-7.517 1.04-7.896 1.04a8.581 8.581 0 0 1 4.729-5.975zM3.453 12.01v-.26c.37.01 4.512.065 8.775-1.215.25.477.477.965.694 1.453-.109.033-.228.065-.336.098-4.404 1.42-6.747 5.303-6.942 5.629a8.522 8.522 0 0 1-2.19-5.705zM12 20.547a8.482 8.482 0 0 1-5.239-1.8c.152-.315 1.888-3.656 6.703-5.337.022-.01.033-.01.054-.022a35.318 35.318 0 0 1 1.823 6.475 8.4 8.4 0 0 1-3.341.684zm4.761-1.465c-.086-.52-.542-3.015-1.659-6.084 2.679-.423 5.022.271 5.314.369a8.468 8.468 0 0 1-3.655 5.715z"></path>
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}