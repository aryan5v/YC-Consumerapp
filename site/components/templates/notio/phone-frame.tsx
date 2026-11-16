import Image from "next/image";
import { cn } from "@/lib/utils";

export default function PhoneFrame({
  src,
  alt,
  width,
  height,
  priority,
  className,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  priority?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "w-full p-[1px] rounded-4xl bg-gradient-to-r from-primary/50 via-secondary/40 to-muted-foreground/20",
        className
      )}
    >
      <div className="overflow-hidden rounded-4xl bg-background">
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          priority={priority}
          className="block h-auto w-full"
        />
      </div>
    </div>
  );
}
