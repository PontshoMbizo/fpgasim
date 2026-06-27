// Board-level IO rules for the Tang Nano 9K (GW1NR-LV9QN88PC6/I5).
// Derived from:
//   - Tang_Nano_9k_3672_Schematic.pdf (Sipeed, 2022-10-23)
//   - UG289-1.9.2E Gowin Programmable IO (GPIO) User Guide
//
// All three IO banks on this board are powered at 3.3 V (VCCIO = 3.3 V).
// The 1.8 V IOs (IOT bank pins 79–88) are BL702 control signals and are
// NOT user-accessible from the FPGA design — they are omitted here.

// IO bank VCCIO voltages. GW1NR-9 bank names match the IOL/IOR/IOB/IOT prefix.
export const BANK_VOLTAGES = {
  IOL: '3.3V',  // Left IO bank  (pins 1–16, 18)
  IOR: '3.3V',  // Right IO bank (pins 51–67)
  IOB: '3.3V',  // Bottom IO bank (pins 17–50)
  IOT: '3.3V',  // Top IO bank, user-accessible portion (pins 68–78)
};

// IO types valid at 3.3 V VCCIO per GPIO guide Table 3-1.
export const ALLOWED_IO_TYPES_3V3 = new Set([
  'LVCMOS33', 'LVCMOS25', 'LVCMOS18', 'LVCMOS15', 'LVCMOS12',
  'LVTTL33',
  'SSTL25_I', 'SSTL25_II', 'SSTL33_I', 'SSTL33_II',
  'HSTL18_I', 'HSTL18_II',
  'LVDS25',    // differential — only valid on diff-pair pins
  'BLVDS25',
  'MLVDS25',
  'RSDS25',
  'LVPECL33',
  'TMDS33',    // used by HDMI TMDS pairs
]);

// Map bank prefix → allowed IO type set.
// All banks on this board are 3.3 V, so all return the same set.
export function allowedIoTypesForBank(bankPrefix) {
  return ALLOWED_IO_TYPES_3V3;
}

// Pin numbers that are connected to a clock-capable IOB on the GW1NR-9.
// Source: GW1NR-9 datasheet, global clock routing table.
// The 27 MHz crystal oscillator is hard-wired to pin 63 (IOR5A / RPLL_T_in).
export const CLOCK_CAPABLE_PINS = new Set([
  63,  // IOR5A — 27 MHz oscillator (RPLL_T_in) — primary board clock
  // Additional GCLK-capable pins (GW1NR-9 datasheet §IO section):
  5, 6, 10, 11, 15, 16, 54, 55, 56, 57,
]);

// The on-board 27 MHz crystal oscillator.
export const BOARD_CLOCK = {
  pinNum:   63,
  pinName:  'IOR5A',
  freqMHz:  27,
  periodNs: 1000 / 27,  // ≈ 37.037 ns
};

// Pull modes recognised by the Gowin toolchain (IO_PORT PULL_MODE=).
export const VALID_PULL_MODES = new Set([
  'NONE', 'UP', 'DOWN', 'KEEPER',
]);

// Drive strength values (mA) recognised by the toolchain (IO_PORT DRIVE=).
export const VALID_DRIVE_VALUES = new Set([4, 8, 12, 16, 24]);
