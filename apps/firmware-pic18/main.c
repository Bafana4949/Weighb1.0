/**
 * Weighbridge I/O Controller - PIC18F45K22 / MPLAB X / XC8
 *
 * This firmware intentionally does not make business decisions. It exposes
 * physical inputs over UART and enforces commands issued by the site daemon.
 * Replace pin assignments and oscillator values to match the final PCB.
 */
#include <xc.h>
#include <stdint.h>
#include <stdbool.h>
#include <stdio.h>
#include <string.h>

#define _XTAL_FREQ 16000000UL

// PIC18F45K22 configuration bits (prototype defaults).
#pragma config FOSC = INTIO67
#pragma config PLLCFG = OFF
#pragma config PRICLKEN = ON
#pragma config FCMEN = OFF
#pragma config IESO = OFF
#pragma config PWRTEN = ON
#pragma config BOREN = SBORDIS
#pragma config BORV = 190
#pragma config WDTEN = OFF
#pragma config MCLRE = EXTMCLR
#pragma config LVP = OFF
#pragma config XINST = OFF

#define ENTRY_GATE_RELAY_LAT   LATBbits.LATB0
#define EXIT_GATE_RELAY_LAT    LATBbits.LATB1
#define ENTRY_RED_LAT          LATBbits.LATB2
#define ENTRY_GREEN_LAT        LATBbits.LATB3
#define EXIT_RED_LAT           LATBbits.LATB4
#define EXIT_GREEN_LAT         LATBbits.LATB5
#define BUZZER_LAT             LATBbits.LATB6

#define POSITION_1_PORT        PORTDbits.RD0
#define POSITION_2_PORT        PORTDbits.RD1

#define ADC_CHANNEL_SCALE      0u
#define TELEMETRY_PERIOD_MS    100u
#define COMMAND_BUFFER_SIZE    96u
#define RFID_BUFFER_SIZE       25u
#define RFID_STALE_TICKS        50u  // 5 seconds at the 100 ms telemetry cadence.
#define STABILITY_WINDOW       16u
#define STABILITY_RAW_DELTA    2u

static char command_buffer[COMMAND_BUFFER_SIZE];
static uint8_t command_index = 0u;
static char rfid_tag[RFID_BUFFER_SIZE] = "00000000";
static char rfid_rx_buffer[RFID_BUFFER_SIZE];
static uint8_t rfid_rx_index = 0u;
static uint8_t rfid_age_ticks = RFID_STALE_TICKS;
static uint16_t stability_samples[STABILITY_WINDOW];
static uint8_t stability_index = 0u;
static bool stability_filled = false;

static void Clock_Init(void);
static void GPIO_Init(void);
void UART_Init(void);
static void UART_WriteChar(char value);
static void UART_WriteString(const char *value);
static bool UART_CharAvailable(void);
static char UART_ReadChar(void);
static void UART_ServiceRx(void);
static void RFID_UART_Init(void);
static bool RFID_UART_CharAvailable(void);
static char RFID_UART_ReadChar(void);
static void Process_Command(const char *command);
static void RFID_Service(void);
static void ADC_Init(void);
uint16_t ADC_Read(uint8_t channel);
static uint32_t ADC_ToWeightKg(uint16_t adc_value);
static bool Scale_IsStable(uint16_t raw_adc);
static void Build_And_SendTelemetry(uint32_t weight_kg, bool stable);
static bool Command_Equals(const char *command, const char *expected);

static void Clock_Init(void)
{
    OSCCONbits.IRCF = 0b111; // 16 MHz HFINTOSC
    OSCCONbits.SCS = 0b10;
    while (!OSCCONbits.HFIOFS) {
        ;
    }
}

static void GPIO_Init(void)
{
    ANSELA = 0x01u; // RA0 / AN0 is the scale ADC input.
    ANSELB = 0x00u;
    ANSELC = 0x00u;
    ANSELD = 0x00u;

    TRISAbits.TRISA0 = 1u;
    TRISDbits.TRISD0 = 1u;
    TRISDbits.TRISD1 = 1u;
    TRISDbits.TRISD6 = 0u; // EUSART2 TX (unused by most readers)
    TRISDbits.TRISD7 = 1u; // EUSART2 RX from RFID reader

    TRISB = 0x00u;
    LATB = 0x00u;

    // Fail-safe boot state: both gates closed and all lanes red.
    ENTRY_GATE_RELAY_LAT = 0u;
    EXIT_GATE_RELAY_LAT = 0u;
    ENTRY_RED_LAT = 1u;
    ENTRY_GREEN_LAT = 0u;
    EXIT_RED_LAT = 1u;
    EXIT_GREEN_LAT = 0u;
    BUZZER_LAT = 0u;
}

void UART_Init(void)
{
    // EUSART1 at 115200 baud, 8-N-1, BRGH=1, BRG16=1.
    TRISCbits.TRISC6 = 0u; // TX1 output
    TRISCbits.TRISC7 = 1u; // RX1 input
    TXSTA1bits.SYNC = 0u;
    TXSTA1bits.BRGH = 1u;
    BAUDCON1bits.BRG16 = 1u;
    SPBRGH1 = 0u;
    SPBRG1 = 34u; // 16 MHz / (4 * (34 + 1)) = 114285 baud (-0.79%).
    RCSTA1bits.SPEN = 1u;
    TXSTA1bits.TXEN = 1u;
    RCSTA1bits.CREN = 1u;
}

static void UART_WriteChar(char value)
{
    while (!PIR1bits.TX1IF) {
        ;
    }
    TXREG1 = value;
}

static void UART_WriteString(const char *value)
{
    while (*value != '\0') {
        UART_WriteChar(*value++);
    }
}

static bool UART_CharAvailable(void)
{
    return PIR1bits.RC1IF != 0u;
}

static char UART_ReadChar(void)
{
    if (RCSTA1bits.OERR) {
        RCSTA1bits.CREN = 0u;
        RCSTA1bits.CREN = 1u;
    }
    return (char)RCREG1;
}


static void RFID_UART_Init(void)
{
    // EUSART2 at 9600 baud, 8-N-1 for common ASCII RFID readers.
    TXSTA2bits.SYNC = 0u;
    TXSTA2bits.BRGH = 1u;
    BAUDCON2bits.BRG16 = 1u;
    SPBRGH2 = 0x01u;
    SPBRG2 = 0xA0u; // 16 MHz / (4 * (416 + 1)) = 9592 baud (-0.08%).
    RCSTA2bits.SPEN = 1u;
    TXSTA2bits.TXEN = 1u;
    RCSTA2bits.CREN = 1u;
}

static bool RFID_UART_CharAvailable(void)
{
    return PIR3bits.RC2IF != 0u;
}

static char RFID_UART_ReadChar(void)
{
    if (RCSTA2bits.OERR) {
        RCSTA2bits.CREN = 0u;
        RCSTA2bits.CREN = 1u;
    }
    return (char)RCREG2;
}

static void ADC_Init(void)
{
    ADCON0 = 0x01u; // ADC enabled, AN0 selected.
    ADCON1 = 0x00u; // VDD/VSS references.
    ADCON2bits.ADFM = 1u;
    ADCON2bits.ACQT = 0b101; // 12 TAD acquisition.
    ADCON2bits.ADCS = 0b110; // Fosc/64.
}

uint16_t ADC_Read(uint8_t channel)
{
    ADCON0bits.CHS = channel & 0x1Fu;
    __delay_us(20);
    ADCON0bits.GO = 1u;
    while (ADCON0bits.GO) {
        UART_ServiceRx();
    }
    return ((uint16_t)ADRESH << 8u) | ADRESL;
}

static uint32_t ADC_ToWeightKg(uint16_t adc_value)
{
    // Integer scaling avoids floating point on the MCU.
    return ((uint32_t)adc_value * 80000UL + 511UL) / 1023UL;
}

static bool Scale_IsStable(uint16_t raw_adc)
{
    uint16_t minimum = 1023u;
    uint16_t maximum = 0u;
    uint8_t count = stability_filled ? STABILITY_WINDOW : (uint8_t)(stability_index + 1u);
    uint8_t index;

    stability_samples[stability_index] = raw_adc;
    stability_index++;
    if (stability_index >= STABILITY_WINDOW) {
        stability_index = 0u;
        stability_filled = true;
        count = STABILITY_WINDOW;
    }

    for (index = 0u; index < count; index++) {
        if (stability_samples[index] < minimum) {
            minimum = stability_samples[index];
        }
        if (stability_samples[index] > maximum) {
            maximum = stability_samples[index];
        }
    }
    return stability_filled && ((maximum - minimum) <= STABILITY_RAW_DELTA);
}

static void Build_And_SendTelemetry(uint32_t weight_kg, bool stable)
{
    char packet[96];
    (void)snprintf(
        packet,
        sizeof(packet),
        "#WT:%06lu;P1:%u;P2:%u;RF:%s;ST:%s$\r\n",
        (unsigned long)weight_kg,
        POSITION_1_PORT ? 1u : 0u,
        POSITION_2_PORT ? 1u : 0u,
        rfid_tag,
        stable ? "STABLE" : "UNSTABLE"
    );
    UART_WriteString(packet);
}

static bool Command_Equals(const char *command, const char *expected)
{
    return strcmp(command, expected) == 0;
}

static void Process_Command(const char *command)
{
    if (Command_Equals(command, "@CMD:GATE_OPEN;TGT:ENTRY$")) {
        ENTRY_GATE_RELAY_LAT = 1u;
    } else if (Command_Equals(command, "@CMD:GATE_CLOSE;TGT:ENTRY$")) {
        ENTRY_GATE_RELAY_LAT = 0u;
    } else if (Command_Equals(command, "@CMD:GATE_OPEN;TGT:EXIT$")) {
        EXIT_GATE_RELAY_LAT = 1u;
    } else if (Command_Equals(command, "@CMD:GATE_CLOSE;TGT:EXIT$")) {
        EXIT_GATE_RELAY_LAT = 0u;
    } else if (Command_Equals(command, "@CMD:LIGHT;TGT:ENTRY;VAL:GREEN$")) {
        ENTRY_RED_LAT = 0u;
        ENTRY_GREEN_LAT = 1u;
    } else if (Command_Equals(command, "@CMD:LIGHT;TGT:ENTRY;VAL:RED$")) {
        ENTRY_GREEN_LAT = 0u;
        ENTRY_RED_LAT = 1u;
    } else if (Command_Equals(command, "@CMD:LIGHT;TGT:EXIT;VAL:GREEN$")) {
        EXIT_RED_LAT = 0u;
        EXIT_GREEN_LAT = 1u;
    } else if (Command_Equals(command, "@CMD:LIGHT;TGT:EXIT;VAL:RED$")) {
        EXIT_GREEN_LAT = 0u;
        EXIT_RED_LAT = 1u;
    } else if (Command_Equals(command, "@CMD:BUZZER;VAL:ON$")) {
        BUZZER_LAT = 1u;
    } else if (Command_Equals(command, "@CMD:BUZZER;VAL:OFF$")) {
        BUZZER_LAT = 0u;
    }
}

static void UART_ServiceRx(void)
{
    while (UART_CharAvailable()) {
        char value = UART_ReadChar();
        if (value == '@') {
            command_index = 0u;
        }
        if (command_index < (COMMAND_BUFFER_SIZE - 1u)) {
            command_buffer[command_index++] = value;
            command_buffer[command_index] = '\0';
        } else {
            command_index = 0u;
        }
        if (value == '$') {
            Process_Command(command_buffer);
            command_index = 0u;
            command_buffer[0] = '\0';
        }
    }
}

static void RFID_Service(void)
{
    while (RFID_UART_CharAvailable()) {
        char value = RFID_UART_ReadChar();
        if ((value == '\r') || (value == '\n')) {
            if (rfid_rx_index >= 4u) {
                rfid_rx_buffer[rfid_rx_index] = '\0';
                (void)strncpy(rfid_tag, rfid_rx_buffer, RFID_BUFFER_SIZE - 1u);
                rfid_tag[RFID_BUFFER_SIZE - 1u] = '\0';
                rfid_age_ticks = 0u;
            }
            rfid_rx_index = 0u;
            continue;
        }
        if ((value >= 0x20) && (value <= 0x7Eu)) {
            if (rfid_rx_index < (RFID_BUFFER_SIZE - 1u)) {
                rfid_rx_buffer[rfid_rx_index++] = value;
            } else {
                // Overflow invalidates the current reader frame.
                rfid_rx_index = 0u;
            }
        }
    }
}

void main(void)
{
    uint16_t raw_adc;
    uint32_t weight_kg;
    bool stable;

    Clock_Init();
    GPIO_Init();
    UART_Init();
    RFID_UART_Init();
    ADC_Init();
    __delay_ms(50);

    while (true) {
        UART_ServiceRx();
        RFID_Service();
        raw_adc = ADC_Read(ADC_CHANNEL_SCALE);
        weight_kg = ADC_ToWeightKg(raw_adc);
        stable = Scale_IsStable(raw_adc);
        Build_And_SendTelemetry(weight_kg, stable);
        if (rfid_age_ticks < RFID_STALE_TICKS) {
            rfid_age_ticks++;
        } else {
            (void)strcpy(rfid_tag, "00000000");
        }

        // Keep servicing commands and the RFID UART while waiting for the next frame.
        for (uint8_t tick = 0u; tick < 10u; tick++) {
            UART_ServiceRx();
            RFID_Service();
            __delay_ms(10);
        }
    }
}
