import sprite from "@design/screens/icons.svg?raw";

/** Inlines the design icon sprite once; icons then reference symbols by id (single source). */
export function IconSprite() {
  return <div hidden dangerouslySetInnerHTML={{ __html: sprite }} />;
}

export function Icon({ name, small = false, className = "" }: { name: string; small?: boolean; className?: string }) {
  return (
    <svg className={`ic${small ? " ic--sm" : ""}${className ? ` ${className}` : ""}`} aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  );
}
