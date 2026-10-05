import logo from "@/assets/logo.png";


export function Logo({ size = 28 }: { size?: number }) {
  return <img src={logo} width={size} height={size} alt="ZIT-Suite" draggable={false} className="shrink-0 select-none" />;
}
