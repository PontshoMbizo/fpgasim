import PINS from '../data/pins.json' with { type: 'json' };
import COMPONENTS from '../data/components.json' with { type: 'json' };
import { BOARD_CLOCK, BANK_VOLTAGES, allowedIoTypesForBank, CLOCK_CAPABLE_PINS } from './boardRules.js';

// Tang Nano 9K (Sipeed) — GW1NR-LV9QN88PC6/I5
// Schematic: Tang_Nano_9k_3672_Schematic.pdf (Sipeed, 2022-10-23)
// Pin numbering matches the GW1NR-9 QN88 package.
//
// KEY CORRECTIONS vs prior estimates (verified from schematic):
//   LEDs  : PIN10(LED1), PIN11(LED2), PIN13(LED3), PIN14(LED4), PIN15(LED5), PIN16(LED6)
//           All active-LOW, common-anode, orange, on IOL bank.
//   BTN S1: PIN3_IOT2A  (active-LOW, pulled up 10K)
//   BTN S2: PIN4_IOL5A  (active-LOW, pulled up 10K)
//   UART  : PIN17_IOB2A = FPGA_TX → BL702 RXD
//           PIN18_IOB2B = FPGA_RX ← BL702 TXD   (internal BL702 bridge, not header)
//   Flash : CS=pin60, SCLK=pin59, MOSI=pin61, MISO=pin62  (Winbond W25Q32JV via PUYA P25Q32U)
//   SD    : CS=pin38, SCLK=pin36, MOSI=pin37, MISO=pin39  (TF card slot, SPI mode)
//   OSC   : 27 MHz crystal on pin63 (IOR5A / RPLL_T_in)
//   HDMI  : CK_P=69, CK_N=68, D0_P=71, D0_N=70, D1_P=73, D1_N=72, D2_P=75, D2_N=74

export const TANG_NANO_9K = {
  clock: { net: 'clk', pin: '63', hz: 27_000_000, ioType: 'LVCMOS33' }, // 27 MHz osc on IOR5A

  leds: {
    activeLow: true,   // common-anode: LED ON when FPGA drives LOW
    ioType: 'LVCMOS33',
    bits: [
      { net: 'leds[0]', pin: '10' },  // LED1 — IOL15A
      { net: 'leds[1]', pin: '11' },  // LED2 — IOL16B
      { net: 'leds[2]', pin: '13' },  // LED3 — IOL21B
      { net: 'leds[3]', pin: '14' },  // LED4 — IOL22B
      { net: 'leds[4]', pin: '15' },  // LED5 — IOL25B
      { net: 'leds[5]', pin: '16' },  // LED6 — IOL26B
    ],
  },

  buttons: {
    activeLow: true,   // pulled HIGH; pressing connects to GND
    ioType: 'LVCMOS33',
    items: [
      { net: 'btn1', pin: '3',  label: 'S1' },  // IOT2A  — silkscreen fixed 2022-10-23
      { net: 'btn2', pin: '4',  label: 'S2' },  // IOL5A  — JTAG_SEL in JTAG mode
    ],
  },

  uart: {
    baud: 115200,
    ioType: 'LVCMOS33',
    // Routed through the BL702 USB-to-UART bridge chip (internal, not on header).
    tx: { net: 'uart_tx', pin: '17' },  // IOB2A — FPGA_TX → BL702 UART1_RX
    rx: { net: 'uart_rx', pin: '18' },  // IOB2B — FPGA_RX ← BL702 UART1_TX
  },

  flash: {
    // Winbond W25Q32JV / PUYA P25Q32U, 32 Mbit SPI NOR flash
    ioType: 'LVCMOS33',
    cs:   { net: 'flash_cs',   pin: '60' },  // IOR12A — MCS_N
    clk:  { net: 'flash_clk',  pin: '59' },  // IOR12B — MCLK
    mosi: { net: 'flash_mosi', pin: '61' },  // IOR11B — MO/D6
    miso: { net: 'flash_miso', pin: '62' },  // IOR11A — MI/D7
  },

  sd: {
    // TF card slot (micro-SD), SPI mode
    ioType: 'LVCMOS33',
    cs:   { net: 'sd_cs',   pin: '38' },  // IOB31B — TF_CS
    clk:  { net: 'sd_clk',  pin: '36' },  // IOB29B — TF_SCLK
    mosi: { net: 'sd_mosi', pin: '37' },  // IOB31A — TF_MOSI
    miso: { net: 'sd_miso', pin: '39' },  // IOB33A — TF_MISO
  },

  hdmi: {
    // HDMI Type-A connector, TMDS differential pairs
    ioType: 'TMDS33',
    clk:  { p: { net: 'hdmi_clk_p', pin: '69' }, n: { net: 'hdmi_clk_n', pin: '68' } }, // IOT42A/B
    data: [
      { p: { net: 'hdmi_d0_p', pin: '71' }, n: { net: 'hdmi_d0_n', pin: '70' } }, // IOT41A/B
      { p: { net: 'hdmi_d1_p', pin: '73' }, n: { net: 'hdmi_d1_n', pin: '72' } }, // IOT39A/B
      { p: { net: 'hdmi_d2_p', pin: '75' }, n: { net: 'hdmi_d2_n', pin: '74' } }, // IOT38A/B
    ],
  },
};

// Flatten the peripheral tree into a list of { net, pin, role, activeLow?, ioType, label? }.
function flattenPeripherals(p) {
  const out = [];
  const add = (e, role, extra = {}) => out.push({ net: e.net, pin: e.pin, role, ...extra });
  add(p.clock, 'clock', { ioType: p.clock.ioType });
  for (const b of p.leds.bits)     add(b, 'led',    { activeLow: p.leds.activeLow,    ioType: p.leds.ioType });
  for (const b of p.buttons.items) add(b, 'button', { activeLow: p.buttons.activeLow, ioType: p.buttons.ioType, label: b.label });
  add(p.uart.tx, 'uart_tx', { ioType: p.uart.ioType });
  add(p.uart.rx, 'uart_rx', { ioType: p.uart.ioType });
  for (const k of ['cs', 'clk', 'mosi', 'miso']) add(p.flash[k], `flash_${k}`, { ioType: p.flash.ioType });
  for (const k of ['cs', 'clk', 'mosi', 'miso']) add(p.sd[k],    `sd_${k}`,    { ioType: p.sd.ioType });
  const h = p.hdmi;
  add(h.clk.p, 'hdmi', { ioType: h.ioType }); add(h.clk.n, 'hdmi', { ioType: h.ioType });
  for (const d of h.data) { add(d.p, 'hdmi', { ioType: h.ioType }); add(d.n, 'hdmi', { ioType: h.ioType }); }
  return out;
}

export const PERIPHERAL_PINS = flattenPeripherals(TANG_NANO_9K);

// pin id → peripheral metadata, for the hardware view / inspector / validation.
export const PIN_FUNCTION = Object.fromEntries(PERIPHERAL_PINS.map((e) => [e.pin, e]));

// Default net → physical pin id map (what a full-board .cst would contain).
export const DEFAULT_PIN_MAP = Object.fromEntries(PERIPHERAL_PINS.map((e) => [e.net, e.pin]));

export const TangNano9kBoard = {
  id:     'tang-nano-9k',
  name:   'Tang Nano 9K',
  image:  '/images/tang-nano-9k.png',
  width:  1200,
  height: 700,
  pins:   PINS,
  components: COMPONENTS,

  // Canonical board-net → physical pin mapping.
  pinAssignments: DEFAULT_PIN_MAP,

  // Peripheral descriptors — used by the harness generator and API.
  peripherals: [
    { id: 'uart',  label: 'UART (BL702 bridge)', pins: ['uart_tx', 'uart_rx'],                                         baud: 115200 },
    { id: 'flash', label: 'SPI Flash 32Mbit',    pins: ['flash_cs', 'flash_clk', 'flash_mosi', 'flash_miso'] },
    { id: 'sd',    label: 'SD Card (SPI)',        pins: ['sd_cs', 'sd_clk', 'sd_mosi', 'sd_miso'] },
    { id: 'hdmi',  label: 'HDMI',                pins: ['hdmi_clk_p', 'hdmi_clk_n', 'hdmi_d0_p', 'hdmi_d0_n', 'hdmi_d1_p', 'hdmi_d1_n', 'hdmi_d2_p', 'hdmi_d2_n'] },
  ],

  // Board clock (27 MHz crystal on IOR5A / pin 63)
  clock: BOARD_CLOCK,

  // IO bank rules (forwarded from boardRules for validation)
  bankVoltages:         BANK_VOLTAGES,
  allowedIoTypesForBank,
  clockCapablePins:     CLOCK_CAPABLE_PINS,

  // Active-low peripherals — device is active when FPGA pin is LOW.
  activeLow: new Set([
    'leds[0]', 'leds[1]', 'leds[2]', 'leds[3]', 'leds[4]', 'leds[5]',
    'btn1', 'btn2',
  ]),

  // Legacy flat peripheral view (for hardware overlay / constraint compiler).
  peripheralPins:        PERIPHERAL_PINS,
  pinFunction:           PIN_FUNCTION,
  pinAssignmentsLegacy:  DEFAULT_PIN_MAP,
};
