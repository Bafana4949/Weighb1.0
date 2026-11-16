# PIC18 Firmware

Open this folder as the source directory of a new **MPLAB X IDE 6.20+** standalone project.

## Prototype target

- Device: `PIC18F45K22`
- Compiler: `XC8`
- Clock: internal 16 MHz
- Programmer/debugger: PICkit 4 or compatible
- EUSART1: site-daemon UART, 115200 baud, 8-N-1 (`RC6/TX1`, `RC7/RX1`)
- EUSART2: ASCII RFID reader, 9600 baud, 8-N-1 (`RD6/TX2`, `RD7/RX2`)
- Scale prototype input: `RA0/AN0`
- Position beams: `RD0`, `RD1`
- Relay/light outputs: `RB0` through `RB6`

## Build in MPLAB X

1. Create **File → New Project → Microchip Embedded → Standalone Project**.
2. Select `PIC18F45K22`, your PICkit tool, and the installed XC8 compiler.
3. Add `main.c` under **Source Files**.
4. Build once with **Production → Build Main Project**.
5. Update the pin macros and active levels to match the reviewed PCB before flashing hardware.

The firmware starts in a fail-safe condition: both gate relays are off, both lane lights are red, and the buzzer is off. It never approves a journey or calculates an overload. It only reports physical inputs and applies explicit commands from the site daemon.

The RFID service consumes CR/LF-delimited printable tags from EUSART2 and expires a tag after five seconds so a previous driver's credential cannot remain active indefinitely.

## Metrology limitation of the prototype ADC

A 10-bit ADC spread over 80,000 kg has a theoretical step size of about 78 kg before electrical noise and calibration error. It therefore cannot satisfy a 20 kg stability tolerance or legal-for-trade accuracy by itself. The analog potentiometer path is only a software/bench prototype. Production should read a certified weighbridge indicator or a suitable high-resolution, approved measurement chain, while retaining the same UART packet contract.

Before production, review the oscillator, watchdog, brown-out behavior, relay de-energised state, limit switches, emergency stop, surge protection, galvanic isolation, PCB creepage/clearance, RFID reader electrical levels, and calibration mapping. Relay outputs require optocouplers or isolated drivers, flyback protection, hardwired interlocks, and a site-approved fail-safe design.
