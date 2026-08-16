import { useState, useEffect } from "react";

export const formatDurationSec = (seconds: number): string => {
  if (!seconds || seconds <= 0) return "0m 00s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const padS = s < 10 ? `0${s}` : `${s}`;
  return h > 0 ? `${h}h ${m}m ${padS}s` : `${m}m ${padS}s`;
};

export const useElapsedTimer = (startDateStr?: string | null): string => {
  const computeCurrent = (): string => {
    if (!startDateStr) return "0m 00s";
    const start = new Date(startDateStr).getTime();
    if (isNaN(start)) return "0m 00s";
    const diffSec = Math.max(0, Math.floor((Date.now() - start) / 1000));
    return formatDurationSec(diffSec);
  };

  const [elapsedStr, setElapsedStr] = useState<string>(computeCurrent);

  useEffect(() => {
    if (!startDateStr) {
      setElapsedStr("0m 00s");
      return;
    }

    const updateTimer = () => {
      setElapsedStr(computeCurrent());
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [startDateStr]);

  return elapsedStr;
};
