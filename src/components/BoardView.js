"use client";
import React, { useState, useMemo } from 'react';

const L_PINS = [['IOB31B',38],['IOB31A',37],['IOB29B',36],['IOB33A',39],['IOB8A',25],['IOB8B',26],['IOB11A',27],['IOB11B',28],['IOB13A',29],['IOB13B',30],['IOB23A',33],['IOB23B',34],['IOB33B',40],['IOB29A',35],['IOB41A',41],['IOB41B',42],['IOR17B',51],['IOR15B',53],['IOR15A',54],['IOR14B',55],['IOR14A',56],['IOR13A',57],['IOT42B',68],['IOT42A',69]];
const R_PINS = [['IOR5A',63],['IOT8A',86],['IOT8B',85],['IOT10A',84],['IOT10B',83],['IOT11A',82],['IOT11B',81],['IOT12A',80],['IOT12B',79],['IOT37A',77],['IOT37B',76],['IOT38A',75],['IOT38B',74],['IOT39A',73],['IOT39B',72],['IOT41A',71],['IOT41B',70],['5V',null,'pwr'],['IOR24B',48],['IOR24A',49],['IOB15A',31],['IOB15B',32],['GND',null,'gnd'],['3V3',null,'pwr']];

export default function BoardView() {
  // Temporary state for UI preview
  const [leds, setLeds] = useState([false, true, false, true, false, false]);
  const [btn1, setBtn1] = useState(false);
  const [btn2, setBtn2] = useState(false);
  const [hoveredPin, setHoveredPin] = useState(null);

  const pins = useMemo(() => {
    const startY = 98, step = 20.4;
    const mk = (arr, side, cx) => arr.map((d, i) => ({ 
      id: side + i, name: d[0], num: d[1], kind: d[2] || 'io', side, cx, cy: startY + i * step 
    }));
    return [...mk(L_PINS, 'L', 114), ...mk(R_PINS, 'R', 246)];
  }, []);

  return (
    <div className="absolute inset-0 flex items-center justify-center p-8 pointer-events-none">
      <svg viewBox="0 0 660 360" style={{ width: '100%', maxWidth: '800px', height: 'auto', display: 'block', pointerEvents: 'auto' }} className="drop-shadow-[0_28px_60px_rgba(0,0,0,0.65)]">
        <defs>
          <linearGradient id="steel" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#eef0f3" />
            <stop offset="0.45" stopColor="#bcc0c7" />
            <stop offset="1" stopColor="#787c84" />
          </linearGradient>
          <radialGradient id="gold" cx="0.35" cy="0.3" r="0.85">
            <stop offset="0" stopColor="#f4dd92" />
            <stop offset="0.55" stopColor="#cda64e" />
            <stop offset="1" stopColor="#8f7029" />
          </radialGradient>
          <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.05" />
            <stop offset="0.25" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          {/* Custom Glow for LEDs */}
          <radialGradient id="ledGlow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#ff4444" stopOpacity="1" />
            <stop offset="0.5" stopColor="#ff0000" stopOpacity="0.8" />
            <stop offset="1" stopColor="#ff0000" stopOpacity="0" />
          </radialGradient>
        </defs>

        <g transform="translate(0, 360) rotate(-90)">
          {/* PCB */}
          <rect x="92" y="44" width="176" height="572" rx="13" fill="#13181a" stroke="#04070a" strokeWidth="2" />
          <rect x="92" y="44" width="176" height="572" rx="13" fill="url(#sheen)" />
          <rect x="97.5" y="49.5" width="165" height="561" rx="10" fill="none" stroke="#ffffff" strokeWidth="1" strokeOpacity="0.04" />

          {/* mounting holes */}
          <circle cx="107" cy="58" r="6.5" fill="#0c0f11" stroke="url(#gold)" strokeWidth="3" />
          <circle cx="253" cy="58" r="6.5" fill="#0c0f11" stroke="url(#gold)" strokeWidth="3" />
          <circle cx="107" cy="602" r="6.5" fill="#0c0f11" stroke="url(#gold)" strokeWidth="3" />
          <circle cx="253" cy="602" r="6.5" fill="#0c0f11" stroke="url(#gold)" strokeWidth="3" />

          {/* USB-C */}
          <rect x="151" y="26" width="58" height="32" rx="7" fill="url(#steel)" stroke="#5b5f66" strokeWidth="1" />
          <rect x="158" y="33" width="44" height="14" rx="6" fill="#2f3338" />
          <rect x="146" y="34" width="5" height="14" rx="2" fill="#9a9ea6" />
          <rect x="209" y="34" width="5" height="14" rx="2" fill="#9a9ea6" />

          {/* buttons */}
          <g 
            onMouseDown={() => setBtn2(true)} 
            onMouseUp={() => setBtn2(false)} 
            onMouseLeave={() => setBtn2(false)}
            className="cursor-pointer"
          >
            <rect x="104" y="62" width="27" height="25" rx="3" fill="#1f242a" stroke="#0a0d0f" strokeWidth="1" />
            <circle cx="117.5" cy="74.5" r="8" fill="url(#steel)" stroke="#6b6f76" strokeWidth="1" transform={btn2 ? "scale(0.95) translate(6, 4)" : ""} />
            <text x="117.5" y="99" textAnchor="middle" fill="#9aa0a8" fontFamily="'Geist Mono', monospace" fontSize="8" fontWeight="700">S2</text>
          </g>
          
          <g 
            onMouseDown={() => setBtn1(true)} 
            onMouseUp={() => setBtn1(false)} 
            onMouseLeave={() => setBtn1(false)}
            className="cursor-pointer"
          >
            <rect x="229" y="62" width="27" height="25" rx="3" fill="#1f242a" stroke="#0a0d0f" strokeWidth="1" />
            <circle cx="242.5" cy="74.5" r="8" fill="url(#steel)" stroke="#6b6f76" strokeWidth="1" transform={btn1 ? "scale(0.95) translate(12, 4)" : ""} />
            <text x="242.5" y="99" textAnchor="middle" fill="#9aa0a8" fontFamily="'Geist Mono', monospace" fontSize="8" fontWeight="700">S1</text>
          </g>

          {/* RF/BL chip + crystal + passives */}
          <rect x="156" y="92" width="48" height="36" rx="3" fill="#0c1013" stroke="#262b30" strokeWidth="1" />
          <text x="180" y="114" textAnchor="middle" fill="#3c4248" fontFamily="'Geist Mono', monospace" fontSize="7">BL702</text>
          <rect x="210" y="100" width="24" height="13" rx="2" fill="url(#steel)" stroke="#6b6f76" strokeWidth="0.8" />
          <rect x="146" y="98" width="6" height="3.4" rx="1" fill="#b6a06a" />
          <rect x="146" y="118" width="6" height="3.4" rx="1" fill="#b6a06a" />
          <rect x="208" y="120" width="6" height="3.4" rx="1" fill="#b6a06a" />

          {/* FPGA */}
          <rect x="138" y="176" width="84" height="84" rx="5" fill="#090b0d" stroke="#23272c" strokeWidth="1.5" />
          <rect x="142" y="180" width="76" height="76" rx="3" fill="none" stroke="#ffffff" strokeWidth="1" strokeOpacity="0.04" />
          <circle cx="149" cy="187" r="2.6" fill="#2c3137" />
          <text x="180" y="206" textAnchor="middle" fill="#80868d" fontFamily="'Geist Mono', monospace" fontSize="9.5" fontWeight="700" letterSpacing="1">GOWIN</text>
          <text x="180" y="221" textAnchor="middle" fill="#5b6168" fontFamily="'Geist Mono', monospace" fontSize="7.5">GW1NR-LV9</text>
          <text x="180" y="233" textAnchor="middle" fill="#5b6168" fontFamily="'Geist Mono', monospace" fontSize="7.5">QN88PC6/I5</text>
          <text x="180" y="245" textAnchor="middle" fill="#4e545a" fontFamily="'Geist Mono', monospace" fontSize="7.5">2108C</text>
          <text x="180" y="256" textAnchor="middle" fill="#4e545a" fontFamily="'Geist Mono', monospace" fontSize="7.5">PVY68.00</text>

          {/* RGB LED */}
          <rect x="226" y="184" width="10" height="10" rx="2" fill="#e9eaec" stroke="#c4c6c9" strokeWidth="0.8" />

          {/* TANG NANO 9K silk */}
          <text x="129" y="218" textAnchor="middle" transform="rotate(-90 129 218)" fill="#eef0f2" fontFamily="'Geist', sans-serif" fontSize="10.5" fontWeight="800" letterSpacing="1.5">TANG NANO 9K</text>

          {/* 6 user LEDs */}
          {[150, 162, 174, 186, 198, 210].map((cx, i) => {
            const isOn = leds[i];
            return (
              <g key={i}>
                <circle cx={cx} cy="274" r="4" fill={isOn ? "#ff4444" : "#3a1416"} stroke={isOn ? "#ff8888" : "#5a1d1d"} strokeWidth="0.8" />
                {isOn && <circle cx={cx} cy="274" r="8" fill="url(#ledGlow)" />}
              </g>
            );
          })}

          {/* SiPEED */}
          <text x="180" y="299" textAnchor="middle" fill="#eef0f2" fontFamily="'Geist', sans-serif" fontSize="15" fontWeight="800" fontStyle="italic" letterSpacing="0.5">SiPEED</text>

          {/* flash + regulator */}
          <rect x="140" y="310" width="30" height="18" rx="2" fill="#0d1013" stroke="#262a2f" strokeWidth="1" />
          <rect x="196" y="310" width="26" height="16" rx="2" fill="#0d1013" stroke="#262a2f" strokeWidth="1" />

          {/* FPC / LCD ribbon connector */}
          <rect x="110" y="338" width="140" height="32" rx="3" fill="#dcd6c6" stroke="#b3ac98" strokeWidth="1" />
          <rect x="110" y="338" width="140" height="9" rx="2" fill="#c7c0ac" />
          <rect x="104" y="344" width="6" height="20" rx="1" fill="#c7c0ac" />
          <rect x="250" y="344" width="6" height="20" rx="1" fill="#c7c0ac" />
          <g stroke="#a7a08b" strokeWidth="0.9">
            {[118, 128, 138, 148, 158, 168, 178, 188, 198, 208, 218, 228, 238].map((x) => (
              <line key={x} x1={x} y1="350" x2={x} y2="367" />
            ))}
          </g>

          {/* USB-JTAG chip + mid passives */}
          <rect x="150" y="384" width="60" height="30" rx="3" fill="#0d1013" stroke="#24282d" strokeWidth="1" />
          <text x="180" y="403" textAnchor="middle" fill="#3c4248" fontFamily="'Geist Mono', monospace" fontSize="6.5">2S2H 25Q</text>
          <rect x="150" y="440" width="34" height="22" rx="2" fill="#0d1013" stroke="#24282d" strokeWidth="1" />
          <g fill="#b6a06a">
            <rect x="200" y="442" width="6" height="3.4" rx="1" /><rect x="210" y="442" width="6" height="3.4" rx="1" /><rect x="200" y="456" width="6" height="3.4" rx="1" />
            <rect x="118" y="430" width="6" height="3.4" rx="1" /><rect x="118" y="500" width="6" height="3.4" rx="1" /><rect x="234" y="500" width="6" height="3.4" rx="1" />
          </g>
          <rect x="160" y="486" width="40" height="20" rx="2" fill="#0d1013" stroke="#24282d" strokeWidth="1" />

          {/* HDMI */}
          <text x="180" y="552" textAnchor="middle" fill="#aeb4ba" fontFamily="'Geist Mono', monospace" fontSize="8" fontWeight="700" letterSpacing="2">HDMI</text>
          <rect x="126" y="560" width="108" height="58" rx="4" fill="url(#steel)" stroke="#5e6268" strokeWidth="1" />
          <path d="M141 576 H219 L210 601 H150 Z" fill="#1b1f23" />
          <rect x="158" y="582" width="44" height="8" rx="2" fill="#3a3e44" />

          {/* PINS */}
          {pins.map((p) => (
            <g key={p.id}>
              <circle cx={p.cx} cy={p.cy} r="5.4" fill="url(#gold)" stroke="#0a0c0e" strokeWidth="1.4" />
              <circle cx={p.cx} cy={p.cy} r="2.1" fill="#0b0d0f" />
              <circle 
                cx={p.cx} cy={p.cy} r="9" 
                fill="transparent" 
                stroke="transparent" 
                strokeWidth="2.6" 
                pointerEvents="all" 
                onMouseEnter={() => setHoveredPin(p)} 
                onMouseLeave={() => setHoveredPin(null)} 
                className="cursor-pointer hover:stroke-[#ffd86b] transition-colors duration-150"
              />
            </g>
          ))}
        </g>

        {/* TOOLTIP */}
        {hoveredPin && (() => {
          const w = 116, hh = 40;
          const rotatedX = hoveredPin.cy;
          const rotatedY = 360 - hoveredPin.cx;
          
          const boxX = hoveredPin.side === 'L' ? rotatedX - w/2 : rotatedX - w/2;
          const boxY = hoveredPin.side === 'L' ? rotatedY + 15 : rotatedY - 15 - hh;
          
          const isPwr = hoveredPin.kind === 'pwr';
          const isGnd = hoveredPin.kind === 'gnd';
          const color = isPwr ? '#ef4444' : (isGnd ? '#9ca3af' : '#4ade80');
          const sub = hoveredPin.kind === 'io' ? `PIN ${hoveredPin.num}` : (isGnd ? 'GROUND' : 'POWER');

          return (
            <g className="pointer-events-none z-50 shadow-xl">
              <rect x={boxX} y={boxY} width={w} height={hh} rx="7" fill="#0f1316" stroke="#2b3137" strokeWidth="1.2" />
              <rect x={boxX} y={boxY} width="3.5" height={hh} fill={color} className="rounded-l-[7px]" />
              <text x={boxX + 14} y={boxY + 16} fill="#f2f4f6" fontFamily="'Geist Mono', monospace" fontSize="14" fontWeight="700">{hoveredPin.name}</text>
              <text x={boxX + 14} y={boxY + 31} fill={color} fontFamily="'Geist Mono', monospace" fontSize="9.5" fontWeight="700">{sub}</text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}
