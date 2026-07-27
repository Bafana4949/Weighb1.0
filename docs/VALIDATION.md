# Validation Record

Validation date: 2026-07-22

## Completed in the build environment

- Python bytecode compilation succeeded for the simulator and site daemon.
- `pytest` edge suite: **11 passed**.
- Hardware-simulator TCP UART integration passed:
  - exact 100 ms telemetry frame received;
  - entry-gate command applied;
  - traffic-light command applied;
  - scenario-control input appeared in subsequent telemetry.
- TypeScript/TSX syntax transpilation: **87 files, 0 syntax failures**.
- Local TypeScript import-resolution scan: **0 unresolved local imports**.
- Required REST route coverage: **31 of 31 requested routes present**.
- JSON parsing succeeded for all package and TypeScript configuration files.
- YAML parsing succeeded for Docker Compose and both daemon configurations.
- Prisma-to-migration parity check: **17 models / 17 PostgreSQL tables**, with no missing or extra enums.
- Cross-language edge/cloud SHA-256 canonicalisation was checked during implementation.
- Five ANPR development images are present and readable.
- PIC18 firmware host-side C syntax check passed using a stubbed XC8 device header; final target-header compilation remains required in MPLAB X.

## Environment limitations

- A complete `npm install`, `next build`, Prisma client generation, and Vitest run could not be performed in the isolated build environment because the npm registry was unreachable.
- Docker Engine and PostgreSQL were not available in the build environment, so container startup and live migration execution were not run here.
- MPLAB X/XC8 was not available, so `main.c` must receive its final device-header compile in MPLAB X on the target developer laptop.

Run the commands in the root `README.md` after download. Treat a successful `npm run build`, `npm test`, `docker compose config`, migration/seed execution, and MPLAB build as the acceptance gate before field use.
