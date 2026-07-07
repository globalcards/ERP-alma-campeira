import type { CSSProperties } from "react";

type AlmaLogoProps = Readonly<{
  className?: string;
}>;

const logoMaskStyle: CSSProperties = {
  backgroundColor: "var(--ac-accent)",
  maskImage: "url(/images/logo.png)",
  maskSize: "contain",
  maskRepeat: "no-repeat",
  maskPosition: "center",
  WebkitMaskImage: "url(/images/logo.png)",
  WebkitMaskSize: "contain",
  WebkitMaskRepeat: "no-repeat",
  WebkitMaskPosition: "center"
};

export function AlmaLogo({ className }: AlmaLogoProps) {
  return (
    <div className={["flex items-center gap-3", className].filter(Boolean).join(" ")}>
      <div
        className="size-10 shrink-0 sm:size-11"
        style={logoMaskStyle}
        aria-hidden
      />
      <div className="min-w-0 text-left">
        <p className="text-lg font-bold leading-tight text-[var(--ac-text)] sm:text-xl">
          Alma Campeira
        </p>
        <p className="text-xs font-medium text-[var(--ac-muted)] sm:text-sm">ERP</p>
      </div>
    </div>
  );
}
