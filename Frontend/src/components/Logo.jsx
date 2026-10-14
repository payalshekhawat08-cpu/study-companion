const SHOW_TAGLINE = false;
const WELCOME_LOGO_DESKTOP_WIDTH = 120;
const WELCOME_LOGO_PHONE_WIDTH = 100;
const WELCOME_LOGO_SHORT_WIDTH = 80;

const crops = {
  full: { x1: 165, y1: 190, x2: 1090, y2: SHOW_TAGLINE ? 1000 : 930 },
  mark: { x1: 300, y1: 190, x2: 955, y2: 770 },
};

const widths = {
  full: { sm: 120, md: 140, lg: WELCOME_LOGO_DESKTOP_WIDTH },
  mark: { sm: 40, md: 64, lg: 96 },
};

export default function Logo({
  variant = "full",
  size = "md",
  className = "",
}) {
  const crop = crops[variant] || crops.full;
  const cropWidth = crop.x2 - crop.x1;
  const cropHeight = crop.y2 - crop.y1;
  const width = widths[variant]?.[size] || widths[variant]?.md;
  const height = width * (cropHeight / cropWidth);
  const decorativeMark = className.split(/\s+/).includes("logo-mark-decorative");
  const isMark = variant === "mark";
  const fallbackText = !isMark || !decorativeMark;

  return (
    <span
      className={`logo logo-${variant} logo-size-${size} ${className}`.trim()}
      style={{
        "--logo-width": `${width}px`,
        "--logo-height": `${height}px`,
        "--welcome-logo-desktop-width": `${WELCOME_LOGO_DESKTOP_WIDTH}px`,
        "--welcome-logo-phone-width": `${WELCOME_LOGO_PHONE_WIDTH}px`,
        "--welcome-logo-short-width": `${WELCOME_LOGO_SHORT_WIDTH}px`,
      }}
    >
      <span
        className="logo-crop"
        style={{ aspectRatio: `${cropWidth} / ${cropHeight}` }}
      >
        <img
          className="logo-image"
          src="/avatars/bodhix-logo.jpeg"
          alt={isMark ? (decorativeMark ? "" : "BODHIX") : "BODHIX"}
          aria-hidden={isMark && decorativeMark ? "true" : undefined}
          width="1254"
          height="1254"
          style={{
            width: `${(1254 / cropWidth) * 100}%`,
            height: `${(1254 / cropHeight) * 100}%`,
            left: `${(-crop.x1 / cropWidth) * 100}%`,
            top: `${(-crop.y1 / cropHeight) * 100}%`,
          }}
          onError={(event) => {
            event.currentTarget.hidden = true;
            event.currentTarget.parentElement?.classList.add("logo-image-failed");
          }}
        />
      </span>
      {fallbackText && <span className="logo-fallback">BODHIX</span>}
    </span>
  );
}
