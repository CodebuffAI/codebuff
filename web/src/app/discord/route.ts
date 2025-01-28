import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  return NextResponse.redirect('https://discord.gg/mcWTGjgTj3', 302)
}
