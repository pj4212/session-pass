export default function ScannerGuideOverlay() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
      <div className="w-64 h-64 relative">
        {/* Semi-transparent border */}
        <div className="absolute inset-0 border-2 border-white/30 rounded-lg" />
        {/* Corner accents */}
        <div className="absolute -top-0.5 -left-0.5 w-10 h-10 border-t-4 border-l-4 border-primary rounded-tl-lg" />
        <div className="absolute -top-0.5 -right-0.5 w-10 h-10 border-t-4 border-r-4 border-primary rounded-tr-lg" />
        <div className="absolute -bottom-0.5 -left-0.5 w-10 h-10 border-b-4 border-l-4 border-primary rounded-bl-lg" />
        <div className="absolute -bottom-0.5 -right-0.5 w-10 h-10 border-b-4 border-r-4 border-primary rounded-br-lg" />
        {/* Scan line animation */}
        <div className="absolute left-2 right-2 top-1/2 h-0.5 bg-primary/60 animate-pulse" />
      </div>
    </div>
  );
}