import React from "react";

export function LogoVMM({ className, width, height }: { className?: string; width?: number | string; height?: number | string }) {
  return (
    <svg 
      className={className} 
      width={width || "100%"} 
      height={height || "100%"} 
      viewBox="0 0 751.81 253.9" 
      fill="currentColor" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <g>
        <polygon points="516.1 161.6 612.25 0 751.81 253.9 691.07 253.9 615.37 119.24 555.23 220.23 516.1 161.6"/>
        <polygon points="103.72 198.15 135.12 253.9 280.19 17.11 216.54 17.11 103.72 198.15"/>
        <polygon points="97.13 186.83 126.39 138.95 62.47 23.64 0 22.57 97.13 186.83"/>
        <polygon points="169.38 253.59 239.35 253.59 313 127.31 386.55 253.59 459.75 253.59 309.33 17.11 169.38 253.59"/>
        <polygon points="333.46 186.83 370.46 253.59 295.66 253.59 333.46 186.83"/>
        <polygon points="381.73 102.37 441.25 1.83 596.49 253.59 528.92 253.59 444.72 120.07 419.53 165.92 381.73 102.37"/>
      </g>
    </svg>
  );
}
