'use client'

import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card'
import { BackgroundBeams } from '@/components/ui/background-beams'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  CalendarIcon,
  ClockIcon,
  MapPinIcon,
  TrophyIcon,
  ExternalLinkIcon,
} from 'lucide-react'

const HackathonPage = () => {
  const eventDetails = {
    title: 'Codebuff Hackathon @ Mox',
    date: 'Sunday, April 13th, 2025',
    time: '11:00 AM - 8:00 PM PDT',
    location: 'Mox Coworking Space',
    address: '1680 Mission St, San Francisco, CA 94103',
    mapLink: 'https://maps.app.goo.gl/qnDi87Bf3vERdose7',
  }

  const prizes = [
    { rank: '1st Place', reward: '1000 Codebuff credits/month' },
    { rank: '2nd Place', reward: '500 Codebuff credits/month' },
    { rank: '3rd Place', reward: '250 Codebuff credits/month' },
  ]

  return (
    <div className="overflow-hidden min-h-screen">
      <BackgroundBeams />

      <main className="container mx-auto px-4 py-12 md:py-20 text-center relative z-10">
        <div className="mb-12">
          <h1 className="text-4xl md:text-6xl font-bold bg-clip-text text-transparent bg-gradient-to-br from-blue-600 via-blue-800 to-purple-700 dark:from-blue-400 dark:via-blue-600 dark:to-purple-500">
            {eventDetails.title}
          </h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            Join us for a day of coding, collaboration, and innovation!
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto mb-16">
          {/* Event Details Card */}
          <Card className="text-left bg-gradient-to-br from-gray-900/90 to-gray-800/90 text-white border border-gray-800/50 backdrop-blur-sm shadow-lg">
            <CardHeader>
              <CardTitle className="text-2xl font-bold text-blue-400">
                Event Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <CalendarIcon className="h-5 w-5 text-purple-400 flex-shrink-0" />
                <span>{eventDetails.date}</span>
              </div>
              <div className="flex items-center gap-3">
                <ClockIcon className="h-5 w-5 text-purple-400 flex-shrink-0" />
                <span>{eventDetails.time}</span>
              </div>
              <div className="flex items-start gap-3">
                <MapPinIcon className="h-5 w-5 text-purple-400 flex-shrink-0 mt-1" />
                <div>
                  <p>{eventDetails.location}</p>
                  <p className="text-sm text-gray-400">{eventDetails.address}</p>
                  <Link
                    href={eventDetails.mapLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 text-sm mt-1"
                  >
                    View on Google Maps <ExternalLinkIcon className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Prizes Card */}
          <Card className="text-left bg-gradient-to-br from-gray-900/90 to-gray-800/90 text-white border border-gray-800/50 backdrop-blur-sm shadow-lg">
            <CardHeader>
              <CardTitle className="text-2xl font-bold text-yellow-400">
                Prizes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {prizes.map((prize, index) => (
                <div key={index} className="flex items-center gap-3">
                  <TrophyIcon className="h-5 w-5 text-yellow-500 flex-shrink-0" />
                  <div>
                    <p className="font-semibold">{prize.rank}</p>
                    <p className="text-sm text-gray-300">{prize.reward}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Optional: Add a placeholder for RSVP/Registration */}
        {/* <div className="mt-12">
          <Button size="lg" variant="gradient">
            Register Now (Coming Soon!)
          </Button>
        </div> */}

        <div className="mt-16 text-muted-foreground text-sm">
          More details coming soon. Stay tuned!
        </div>
      </main>
    </div>
  )
}

export default HackathonPage