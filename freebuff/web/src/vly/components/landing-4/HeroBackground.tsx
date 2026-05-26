import Image from "next/image";

export function HeroBackground() {
  return (
    <>
      {/* Background with optimized WebP image and responsive sizes */}
      <div
        className="absolute inset-0 z-0 h-full min-h-full w-full"
        style={{ backgroundColor: "#D3C1E5" }}
      >
        <Image
          src="/landing/bg-clouds.webp"
          alt="Hero background clouds"
          fill
          priority
          quality={85}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 100vw, 100vw"
          style={{
            objectFit: "cover",
            objectPosition: "center",
          }}
          placeholder="blur"
          blurDataURL="data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA="
        />
      </div>
    </>
  );
}
