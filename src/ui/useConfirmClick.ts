import { useEffect, useRef, useState } from "react";


export function useConfirmClick(action: () => void, ms = 3000) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const onClick = () => {
    if (armed) {
      clearTimeout(timer.current);
      setArmed(false);
      action();
      return;
    }
    setArmed(true);
    timer.current = setTimeout(() => setArmed(false), ms);
  };
  return { armed, onClick };
}
