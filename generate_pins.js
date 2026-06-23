const fs = require('fs');

/*
 * Tang Nano 9K (Sipeed, GW1NR-LV9QN88PC6/I5) pin ground-truth.
 *
 * Net -> FPGA ball assignments below follow the official Sipeed reference
 * constraints (.cst) for the on-board peripherals:
 *   LEDs (active-low):  led[0..5] = 10, 11, 13, 14, 15, 16
 *   27 MHz clock:       sys_clk   = 52
 *   Buttons:            S1 = 3, S2 = 4
 *   UART <-> BL702:     tx = 17, rx = 18
 *   HDMI TMDS:          clk_n/p = 68/69, d0 = 70/71, d1 = 72/73, d2 = 74/75
 *   microSD (TF):       sclk = 36, mosi = 37, cs = 38, miso = 39
 *
 * Header balls are laid out along the two physical pad rows of the board image.
 * On-board parts (LEDs / clk / buttons / UART) sit on the PCB; their x/y here
 * are close approximations (S1/S2 sampled from the image) and can be nudged in
 * the /pin-mapper tool — the net<->ball mapping is the authoritative part.
 */

// Breakout header balls: [name, ballNumber, kind?]
const TOP_PINS = [
  ['IOB31B', 38], ['IOB31A', 37], ['IOB29B', 36], ['IOB33A', 39],
  ['IOB8A', 25], ['IOB8B', 26], ['IOB11A', 27], ['IOB11B', 28],
  ['IOB13A', 29], ['IOB13B', 30], ['IOB23A', 33], ['IOB23B', 34],
  ['IOB33B', 40], ['IOB29A', 35], ['IOB41A', 41], ['IOB41B', 42],
  ['IOR17B', 51], ['IOR15B', 53], ['IOR15A', 54], ['IOR14B', 55],
  ['IOR14A', 56], ['IOR13A', 57], ['IOT42B', 68], ['IOT42A', 69],
];
const BOTTOM_PINS = [
  ['IOR5A', 63], ['IOT8A', 86], ['IOT8B', 85], ['IOT10A', 84],
  ['IOT10B', 83], ['IOT11A', 82], ['IOT11B', 81], ['IOT12A', 80],
  ['IOT12B', 79], ['IOT37A', 77], ['IOT37B', 76], ['IOT38A', 75],
  ['IOT38B', 74], ['IOT39A', 73], ['IOT39B', 72], ['IOT41A', 71],
  ['IOT41B', 70], ['5V', null, 'pwr'], ['IOR24B', 48], ['IOR24A', 49],
  ['IOB15A', 31], ['IOB15B', 32], ['GND', null, 'gnd'], ['3V3', null, 'pwr'],
];

// Special-function / layer tags by ball number (or power-rail name).
const SPECIAL = {
  // HDMI TMDS pairs (bottom header region)
  '68': { special: ['HDMI_CK_N'], layer: 'HDMI' },
  '69': { special: ['HDMI_CK_P'], layer: 'HDMI' },
  '70': { special: ['HDMI_D0_N'], layer: 'HDMI' },
  '71': { special: ['HDMI_D0_P'], layer: 'HDMI' },
  '72': { special: ['HDMI_D1_N'], layer: 'HDMI' },
  '73': { special: ['HDMI_D1_P'], layer: 'HDMI' },
  '74': { special: ['HDMI_D2_N'], layer: 'HDMI' },
  '75': { special: ['HDMI_D2_P'], layer: 'HDMI' },
  // microSD (TF) slot
  '36': { special: ['TF_SCLK'], layer: 'SD' },
  '37': { special: ['TF_MOSI'], layer: 'SD' },
  '38': { special: ['TF_CS'], layer: 'SD' },
  '39': { special: ['TF_MISO'], layer: 'SD' },
  // Power rails
  '5V': { special: [], layer: 'POWER' },
  '3V3': { special: [], layer: 'POWER' },
  'GND': { special: [], layer: 'POWER' },
};

// On-board peripherals (not on the breakout headers).
const ONBOARD = [
  { id: '52', name: 'CLK27', num: 52, kind: 'clk', special: ['CLK'], x: 660, y: 300 },
  { id: '3', name: 'S1', num: 3, kind: 'btn', special: ['BTN1'], x: 71, y: 302 },
  { id: '4', name: 'S2', num: 4, kind: 'btn', special: ['BTN2'], x: 71, y: 408 },
  { id: '17', name: 'UART_TX', num: 17, kind: 'uart', special: ['UART_TX'], x: 250, y: 255 },
  { id: '18', name: 'UART_RX', num: 18, kind: 'uart', special: ['UART_RX'], x: 285, y: 255 },
  { id: '10', name: 'LED0', num: 10, kind: 'led', special: ['LED0'], x: 360, y: 255 },
  { id: '11', name: 'LED1', num: 11, kind: 'led', special: ['LED1'], x: 400, y: 255 },
  { id: '13', name: 'LED2', num: 13, kind: 'led', special: ['LED2'], x: 440, y: 255 },
  { id: '14', name: 'LED3', num: 14, kind: 'led', special: ['LED3'], x: 480, y: 255 },
  { id: '15', name: 'LED4', num: 15, kind: 'led', special: ['LED4'], x: 520, y: 255 },
  { id: '16', name: 'LED5', num: 16, kind: 'led', special: ['LED5'], x: 560, y: 255 },
];

// Header geometry against the 1200x700 viewBox. Derived from the gold-pad
// positions in tang-nano-9k.png (1024x1400): 24 pads span PNG x54..832 on the
// top row (y~558) and bottom row (y~860); scaled by 1200/1024 and 700/1400.
const X_START = 63, X_END = 975;
const TOP_Y = 279, BOTTOM_Y = 430;

const mkRow = (arr, side, y) => {
  const step = (X_END - X_START) / (arr.length - 1);
  return arr.map((d, i) => {
    const id = String(d[1] || d[0]);
    const tag = SPECIAL[id] || {};
    const kind = d[2] || (tag.layer === 'POWER' ? 'pwr' : 'io');
    return {
      id, name: d[0], num: d[1], bank: d[0].substring(0, 5), side, kind,
      special: tag.special || [], layer: tag.layer || 'IO',
      x: Math.round(X_START + i * step), y,
    };
  });
};

const mkOnboard = (d) => ({
  id: d.id, name: d.name, num: d.num, bank: '', side: 'ONBOARD',
  kind: d.kind, special: d.special, layer: 'ONBOARD', x: d.x, y: d.y,
});

const pins = [
  ...mkRow(TOP_PINS, 'TOP', TOP_Y),
  ...mkRow(BOTTOM_PINS, 'BOTTOM', BOTTOM_Y),
  ...ONBOARD.map(mkOnboard),
];
fs.writeFileSync('src/data/pins.json', JSON.stringify(pins, null, 2) + '\n');
console.log(`Wrote ${pins.length} pins to src/data/pins.json`);
