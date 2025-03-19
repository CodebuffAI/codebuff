import Image from "next/image";
import { YellowSplash, ColorBar } from '@/components/ui/decorative-splash';

interface TestimonialProps {
  name: string;
  role: string;
  quote: string;
  avatarUrl: string;
}

function TestimonialCard({ name, role, quote, avatarUrl }: TestimonialProps) {
  return (
    <div className="bg-[#ffff33]/70 p-6 rounded-lg transform transition-all duration-300 hover:translate-y-[-5px] hover:shadow-lg relative group">
      <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-lg"></div>
      <div className="flex items-center mb-4 relative z-10">
        <div className="w-12 h-12 relative mr-3 rounded-full overflow-hidden border-2 border-black/10">
          <Image
            src={avatarUrl}
            alt={name}
            fill
            className="object-cover"
          />
        </div>
        <div>
          <h3 className="font-medium text-black">{name}</h3>
          <p className="text-sm text-black/70">{role}</p>
        </div>
      </div>
      <p className="text-black/80 relative z-10">"{quote}"</p>
      <div className="absolute bottom-0 right-0 w-8 h-8 bg-[#ffff33] rounded-tl-xl"></div>
    </div>
  );
}

export function TestimonialsSection() {
  const testimonials: TestimonialProps[] = [
    {
      name: "Kevin Wang",
      role: "Technical Pro",
      quote: "Terminal AI has never been more intuitive!",
      avatarUrl: "https://web-assets.same.dev/1106086184/3770701448.png"
    },
    {
      name: "Carlos Diaz",
      role: "Streamlining code efficiency",
      quote: "Incredible developer experience.",
      avatarUrl: "https://web-assets.same.dev/3081073322/2576816647.png"
    },
    {
      name: "Alex Ha",
      role: "A must-have for modern devs",
      quote: "Literally saving hours every week.",
      avatarUrl: "https://web-assets.same.dev/2675534277/3763943484.png"
    },
    {
      name: "Sarah Stevens",
      role: "Our productivity has skyrocketed",
      quote: "We're shocked!",
      avatarUrl: "https://web-assets.same.dev/1801376880/4250091479.png"
    }
  ];

  return (
    <section className="py-24 bg-[#ffff33] relative overflow-hidden">
      {/* Decorative elements */}
      <YellowSplash className="top-20 left-20 opacity-70" />
      <YellowSplash className="bottom-20 right-20 opacity-50" />
      <ColorBar
        color="yellow"
        width={150}
        className="absolute top-12 right-24 opacity-80 rotate-12 hidden md:block"
      />
      <ColorBar
        color="yellow"
        width={180}
        className="absolute bottom-16 left-10 opacity-80 -rotate-12 hidden md:block"
      />

      <div className="codebuff-container relative z-10">
        <div className="text-center mb-16">
          <span className="text-xs font-semibold uppercase tracking-wider text-black/70 inline-block mb-2">Testimonials</span>
          <h2 className="text-3xl lg:text-4xl font-serif font-medium mb-6 text-black relative inline-block">
            What Developers Are Saying
            <span className="absolute -bottom-2 left-0 w-full h-1 bg-black"></span>
          </h2>
          <p className="text-lg mb-8 text-black/70 max-w-3xl mx-auto">
            Join thousands of developers who have already supercharged their workflow.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {testimonials.map((testimonial, index) => (
            <TestimonialCard
              key={index}
              name={testimonial.name}
              role={testimonial.role}
              quote={testimonial.quote}
              avatarUrl={testimonial.avatarUrl}
            />
          ))}
        </div>
      </div>
    </section>
  );
}