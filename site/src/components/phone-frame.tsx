import { cn } from "@/lib/utils"

export function PhoneFrame({
  src,
  alt,
  caption,
  className,
  priority = false,
}: {
  src: string
  alt: string
  caption?: string
  className?: string
  priority?: boolean
}) {
  return (
    <figure className={cn("phone", className)}>
      <div className="phone-bezel">
        <img
          src={src}
          alt={alt}
          width={390}
          height={844}
          decoding="async"
          fetchPriority={priority ? "high" : "auto"}
        />
      </div>
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  )
}
