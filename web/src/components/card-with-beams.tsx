import { BackgroundBeams } from './ui/background-beams'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from './ui/card'

const CardWithBeams = ({
  title,
  description,
  content,
}: {
  title: string
  description: string
  content?: JSX.Element
}) => (
  <div className="overflow-hidden">
    <BackgroundBeams />

    <main className="container mx-auto flex flex-col items-center relative z-10">
      <div className="w-full sm:w-1/2 md:w-2/3">
        <Card>
          <CardHeader className="">
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          {content && (
            <CardContent className="flex flex-col items-center space-y-2">
              {content}
            </CardContent>
          )}
        </Card>
      </div>
    </main>
  </div>
)

export default CardWithBeams
