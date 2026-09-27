import logo from "../assets/festfund-logo.png";

export function Logo({ className = "h-14 w-14", title = "FestFund" }: { className?: string; title?: string }) {
  return (
    <span className={`relative inline-block shrink-0 overflow-hidden ${className}`}>
      <img src={logo} alt={title} style={{ maxWidth: "none" }} className="absolute left-1/2 top-[-1%] h-[150%] w-auto -translate-x-1/2" />
    </span>
  );
}

export { logo as logoSrc };
