'use client'
import { BackgroundBeams } from '@/components/ui/background-beams'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'
import Image from 'next/image'

const Onboard = () => {
  return (
    <div className="overflow-hidden">
      <BackgroundBeams />

      <main className="container mx-auto flex flex-col items-center relative z-10">
        <div className="w-full sm:w-1/2 md:w-1/3">
          <Card>
            <CardHeader>
              <CardTitle>Nicely done!</CardTitle>
              <CardDescription>
                Feel free to head back to your terminal and start coding. Enjoy
                the extra api credits!
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col space-y-2">
              <Image
                src="/auth-success.jpg"
                alt="Successful authentication"
                width={600}
                height={600}
              />
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}

export default Onboard
