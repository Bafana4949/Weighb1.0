"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { runReaderLoop, parseMettlerWeight } from "@/lib/serial-reader";

const VALID_BAUDS = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200] as const;
const VALID_FRAMINGS = ["8-none", "7-even", "7-odd"] as const;
import {
  Truck,
  Scale,
  CheckCircle2,
  Printer,
  RefreshCw,
  FileText,
  Clock,
  ExternalLink,
  PlusCircle,
  ArrowDownCircle,
  ArrowUpCircle,
  Plug,
  Unplug,
  Radio,
  Camera,
  ShieldAlert,
  TrafficCone,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { WeightGauge } from "@/components/weight-gauge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/components/providers";
import { formatKg } from "@/lib/utils";

type QueueItem = {
  id: string;
  reference: string;
  plate: string;
  driver: string;
  trailer: string;
  transporter: string;
  commodity: string;
  orderNumber?: string | null;
  customerName?: string | null;
  stockpile?: string | null;
  status: string;
};

type ActiveWeighment = {
  id: string;
  bookingId: string;
  bookingRef: string;
  plate: string;
  driver: string;
  trailer: string;
  transporter: string;
  commodity: string;
  orderNumber?: string | null;
  customerName?: string | null;
  supplierName?: string | null;
  stockpile?: string | null;
  firstWeightKg: number;
  firstWeightType: "TARE" | "GROSS";
  firstWeightCapturedAt: string;
  minutesInYard: number;
};

export function LiveOperatorDashboard({
  siteCode,
  availableSites,
  initialQueue,
  stats,
}: {
  siteCode: string;
  availableSites: { code: string; name: string }[];
  initialQueue: QueueItem[];
  stats: { trucks: number; tonnage: number; turnaround: number; pending: number };
}) {
  const [manualWeightKg, setManualWeightKg] = useState<number>(0);
  const [queue, setQueue] = useState<QueueItem[]>(initialQueue);
  const [activeWeighments, setActiveWeighments] = useState<ActiveWeighment[]>([]);
  const [loadingManual, setLoadingManual] = useState(false);

  // Manual Weighment Modal States
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"FIRST" | "SECOND" | "DIRECT">("FIRST");
  const [selectedBookingId, setSelectedBookingId] = useState<string>("");
  const [selectedWeighmentId, setSelectedWeighmentId] = useState<string>("");
  const [firstWeightInput, setFirstWeightInput] = useState<string>("");
  const [secondWeightInput, setSecondWeightInput] = useState<string>("");
  const [weighType, setWeighType] = useState<"DISPATCH" | "RECEIPT">("DISPATCH");
  const [mineTicketInput, setMineTicketInput] = useState<string>("");
  const [notesInput, setNotesInput] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [completedResult, setCompletedResult] = useState<any>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>("");

  // Walk-In / Unscheduled Truck Input States
  const [isWalkIn, setIsWalkIn] = useState(false);
  const [walkInPlate, setWalkInPlate] = useState("");
  const [walkInDriver, setWalkInDriver] = useState("");
  const [walkInTransporter, setWalkInTransporter] = useState("");
  const [walkInTrailer, setWalkInTrailer] = useState("");
  const [walkInCommodity, setWalkInCommodity] = useState("Coal (ROM)");

  const toast = useToast();
  const router = useRouter();

  // Physical Mettler Toledo Indicator (Web Serial API) States
  const [isSerialConnected, setIsSerialConnected] = useState(false);
  const [serialPort, setSerialPort] = useState<any>(null);
  const [serialReader, setSerialReader] = useState<any>(null);
  const [serialBaud, setSerialBaud] = useState<number>(9600);
  const [serialFraming, setSerialFraming] = useState<"8-none" | "7-even" | "7-odd">("8-none");
  const [indicatorRawText, setIndicatorRawText] = useState<string>("");
  const [indicatorPacketCount, setIndicatorPacketCount] = useState<number>(0);
  const [isIndicatorStable, setIsIndicatorStable] = useState<boolean>(true);
  const [lastPacketTime, setLastPacketTime] = useState<number>(0);
  const [signalLost, setSignalLost] = useState<boolean>(false);
  const [isAutoConnecting, setIsAutoConnecting] = useState<boolean>(false);

  const keepReadingRef = useRef<boolean>(true);
  const isReadingRef = useRef<boolean>(false);
  const activePortRef = useRef<any>(null);
  const activeReaderRef = useRef<any>(null);
  const readerLoopPromiseRef = useRef<Promise<void> | null>(null);
  const loopAbortControllerRef = useRef<AbortController | null>(null);

  const [capabilities, setCapabilities] = useState<{
    hasScale: boolean;
    scaleProtocol: string;
    hasAnpr: boolean;
    hasGates: boolean;
    hasTrafficLights: boolean;
    hasPositionSensors: boolean;
  }>({
    hasScale: true,
    scaleProtocol: "METTLER_TOLEDO_CONTINUOUS",
    hasAnpr: false,
    hasGates: false,
    hasTrafficLights: false,
    hasPositionSensors: false,
  });

  const [gatePulseActive, setGatePulseActive] = useState<"ENTRY" | "EXIT" | null>(null);

  useEffect(() => {
    if (!siteCode) return;
    fetch(`/api/sites/${siteCode}/capabilities`)
      .then((res) => res.json())
      .then((data) => {
        if (data?.data) {
          setCapabilities(data.data);
          if (data.data.scaleProtocol?.includes("7")) {
            setSerialFraming("7-even");
          }
        }
      })
      .catch(() => {});
  }, [siteCode]);

  function triggerGate(direction: "ENTRY" | "EXIT") {
    setGatePulseActive(direction);
    toast({
      title: `${direction} Boom Gate Opened`,
      body: `Relay pulse sent. Barrier will auto-close in 8 seconds.`,
    });
    setTimeout(() => {
      setGatePulseActive(null);
    }, 8000);
  }

  useEffect(() => {
    if (!isSerialConnected) {
      setSignalLost(false);
      return;
    }
    const interval = setInterval(() => {
      if (Date.now() - lastPacketTime > 2500 && lastPacketTime > 0) {
        setSignalLost(true);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isSerialConnected, lastPacketTime]);

  function startReaderLoop(port: any, framing: "8-none" | "7-even" | "7-odd") {
    if (activePortRef.current === port && isReadingRef.current) {
      return;
    }

    if (loopAbortControllerRef.current) {
      loopAbortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    loopAbortControllerRef.current = abortController;

    keepReadingRef.current = true;
    isReadingRef.current = true;
    activePortRef.current = port;

    readerLoopPromiseRef.current = (async () => {
      try {
        await runReaderLoop(port, {
          framing,
          signal: abortController.signal,
          onFrame: (frame) => {
            setIndicatorRawText(frame.replace(/[^\x20-\x7E]/g, " ").trim());
            setIndicatorPacketCount((prev) => (prev + 1) % 100000);
          },
          onWeight: (parsed) => {
            setManualWeightKg(parsed.weightKg);
            setIsIndicatorStable(parsed.isStable);
            setLastPacketTime(Date.now());
            setSignalLost(false);
          },
          onRecoverableError: (err) => {
            console.warn("Serial stream recoverable framing/parity hiccup:", err?.name || err);
          },
        });
      } catch (fatalErr: any) {
        console.warn("Fatal serial connection ended:", fatalErr);
      } finally {
        if (activePortRef.current === port) {
          isReadingRef.current = false;
          setIsSerialConnected(false);
          setManualWeightKg(0);
          setIsIndicatorStable(false);
          setSignalLost(true);
        }
      }
    })();
  }

  async function connectSerial() {
    if (typeof navigator === "undefined" || !("serial" in navigator)) {
      toast({
        title: "Web Serial Unsupported",
        body: "Please open this page in Google Chrome, Microsoft Edge, or Opera to connect directly to the USB scale indicator.",
        severity: "HIGH",
      });
      return;
    }
    try {
      const port = await (navigator as any).serial.requestPort();
      const dataBits = serialFraming.startsWith("7") ? 7 : 8;
      const parity = serialFraming.endsWith("even") ? "even" : serialFraming.endsWith("odd") ? "odd" : "none";
      await port.open({
        baudRate: serialBaud,
        dataBits,
        stopBits: 1,
        parity,
      });
      setSerialPort(port);
      setIsSerialConnected(true);

      try {
        const info = port.getInfo?.() || {};
        localStorage.setItem("weighbridge_scale_auto_connect", "true");
        localStorage.setItem("weighbridge_scale_baud", String(serialBaud));
        localStorage.setItem("weighbridge_scale_framing", serialFraming);
        if (info.usbVendorId) localStorage.setItem("weighbridge_scale_vendor_id", String(info.usbVendorId));
        if (info.usbProductId) localStorage.setItem("weighbridge_scale_product_id", String(info.usbProductId));
      } catch {}

      toast({
        title: "Scale Indicator Connected",
        body: `Listening for live weight from indicator at ${serialBaud} baud (${dataBits}-${parity.toUpperCase()}-1).`,
      });

      startReaderLoop(port, serialFraming);
    } catch (err: any) {
      if (err.name !== "NotFoundError") {
        const msg = err.message || String(err);
        const isInUse = msg.includes("in use") || msg.includes("already open") || err.name === "NetworkError";
        toast({
          title: isInUse ? "Port Locked By Another App" : "Serial Connection Failed",
          body: isInUse
            ? "The scale COM port is held by another program (e.g. site daemon or another browser tab). Please close conflicting software."
            : msg,
          severity: "HIGH",
        });
      }
    }
  }

  const [isDetecting, setIsDetecting] = useState(false);

  async function autoDetectScale() {
    if (typeof navigator === "undefined" || !("serial" in navigator)) {
      toast({
        title: "Web Serial Unsupported",
        body: "Please open this page in Google Chrome, Microsoft Edge, or Opera to connect directly to the USB scale indicator.",
        severity: "HIGH",
      });
      return;
    }

    try {
      const port = await (navigator as any).serial.requestPort();
      setIsDetecting(true);
      toast({
        title: "Sniffing Connected Scale...",
        body: "Probing serial baud rates and framing protocols...",
      });

      const PROFILES = [
        { baud: 9600, framing: "7-even" as const, label: "9600 baud, 7-E-1 (Mettler Toledo Continuous)" },
        { baud: 9600, framing: "8-none" as const, label: "9600 baud, 8-N-1 (Standard Continuous)" },
        { baud: 4800, framing: "7-even" as const, label: "4800 baud, 7-E-1 (Mettler Toledo 4800)" },
        { baud: 4800, framing: "8-none" as const, label: "4800 baud, 8-N-1 (Avery / Rice Lake)" },
        { baud: 2400, framing: "7-even" as const, label: "2400 baud, 7-E-1" },
        { baud: 19200, framing: "8-none" as const, label: "19200 baud, 8-N-1" },
      ];

      let detectedProfile: (typeof PROFILES)[0] | null = null;
      let activeReader: any = null;

      for (const profile of PROFILES) {
        const dataBits = profile.framing.startsWith("7") ? 7 : 8;
        const parity = profile.framing.endsWith("even") ? "even" : profile.framing.endsWith("odd") ? "odd" : "none";

        try {
          await port.open({
            baudRate: profile.baud,
            dataBits,
            stopBits: 1,
            parity,
          });

          const reader = port.readable.getReader();
          let candidateBuffer = "";
          const startTime = Date.now();

          // Probe for up to 600ms
          while (Date.now() - startTime < 600) {
            const readPromise = reader.read();
            const timeoutPromise = new Promise<{ value: undefined; done: boolean }>((res) =>
              setTimeout(() => res({ value: undefined, done: false }), 200)
            );

            const { value, done } = await Promise.race([readPromise, timeoutPromise]);
            if (done) break;
            if (value && value.length > 0) {
              const mask = dataBits === 7 || parity !== "none" ? 0x7f : 0xff;
              for (let i = 0; i < value.length; i++) {
                candidateBuffer += String.fromCharCode(value[i] & mask);
              }

              const parsed = parseMettlerWeight(candidateBuffer);
              if (parsed !== null && parsed.weightKg >= 0) {
                detectedProfile = profile;
                activeReader = reader;
                break;
              }
            }
          }

          if (detectedProfile) {
            break;
          } else {
            await reader.cancel();
            await port.close();
          }
        } catch {
          try {
            await port.close();
          } catch {}
        }
      }

      if (detectedProfile && activeReader) {
        setSerialBaud(detectedProfile.baud);
        setSerialFraming(detectedProfile.framing);
        setSerialPort(port);
        setIsSerialConnected(true);
        setIsDetecting(false);

        try {
          const info = port.getInfo?.() || {};
          localStorage.setItem("weighbridge_scale_auto_connect", "true");
          localStorage.setItem("weighbridge_scale_baud", String(detectedProfile.baud));
          localStorage.setItem("weighbridge_scale_framing", detectedProfile.framing);
          if (info.usbVendorId) localStorage.setItem("weighbridge_scale_vendor_id", String(info.usbVendorId));
          if (info.usbProductId) localStorage.setItem("weighbridge_scale_product_id", String(info.usbProductId));
        } catch {}

        toast({
          title: "Scale Auto-Detected!",
          body: `Locked onto ${detectedProfile.label}. Streaming live weight.`,
        });

        try {
          await activeReader.cancel();
          activeReader.releaseLock();
        } catch {}

        startReaderLoop(port, detectedProfile.framing);
      } else {
        setIsDetecting(false);
        // Fallback open with standard 9600 8-none
        await port.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: "none" });
        setSerialBaud(9600);
        setSerialFraming("8-none");
        setSerialPort(port);
        setIsSerialConnected(true);

        try {
          const info = port.getInfo?.() || {};
          localStorage.setItem("weighbridge_scale_auto_connect", "true");
          localStorage.setItem("weighbridge_scale_baud", "9600");
          localStorage.setItem("weighbridge_scale_framing", "8-none");
          if (info.usbVendorId) localStorage.setItem("weighbridge_scale_vendor_id", String(info.usbVendorId));
          if (info.usbProductId) localStorage.setItem("weighbridge_scale_product_id", String(info.usbProductId));
        } catch {}

        startReaderLoop(port, "8-none");

        toast({
          title: "Scale Connected",
          body: "Using default 9600 8-N-1. If weights do not stream, ensure the scale is in continuous output mode.",
          severity: "WARNING",
        });
      }
    } catch (err: any) {
      setIsDetecting(false);
      if (err.name !== "NotFoundError") {
        toast({
          title: "Auto-Detection Failed",
          body: err.message || String(err),
          severity: "HIGH",
        });
      }
    }
  }

  async function disconnectSerial() {
    try {
      localStorage.removeItem("weighbridge_scale_auto_connect");
    } catch {}

    // 1. Abort loop first to cleanly signal active reader
    if (loopAbortControllerRef.current) {
      loopAbortControllerRef.current.abort();
      loopAbortControllerRef.current = null;
    }
    keepReadingRef.current = false;
    isReadingRef.current = false;

    try {
      // 2. Await reader.cancel()
      const reader = activeReaderRef.current || serialReader;
      if (reader) {
        await reader.cancel().catch(() => {});
        activeReaderRef.current = null;
        setSerialReader(null);
      }
      // 3. Await loop's promise to finish cleanly
      if (readerLoopPromiseRef.current) {
        await readerLoopPromiseRef.current.catch(() => {});
        readerLoopPromiseRef.current = null;
      }
      // 4. Await port.close()
      const portToClose = activePortRef.current || serialPort;
      if (portToClose) {
        await portToClose.close().catch(() => {});
        activePortRef.current = null;
      }
      setSerialPort(null);
    } catch (e) {
      console.warn("Error disconnecting serial:", e);
    } finally {
      setIsSerialConnected(false);
      setManualWeightKg(0);
      setIsIndicatorStable(false);
      setSignalLost(true);
      toast({ title: "Scale Indicator Disconnected" });
    }
  }

  const lastQueueEtagRef = useRef<string | null>(null);

  // Fetch Queue from server with conditional ETag (HTTP 304 saves LTE data)
  const fetchQueue = async () => {
    try {
      const headers: Record<string, string> = {};
      if (lastQueueEtagRef.current) {
        headers["If-None-Match"] = lastQueueEtagRef.current;
      }
      const response = await fetch(`/api/bookings/queue?site=${siteCode}`, {
        cache: "no-store",
        headers,
      });
      if (response.status === 304) return; // 304 Not Modified — queue unchanged
      if (!response.ok) return;
      const etag = response.headers.get("etag");
      if (etag) lastQueueEtagRef.current = etag;
      const body = await response.json();
      if (Array.isArray(body.data)) setQueue(body.data);
    } catch {
      /* Keep showing last known queue */
    }
  };

  // Fetch In-Progress Manual Weighments
  const fetchActiveWeighments = async () => {
    try {
      setLoadingManual(true);
      const res = await fetch(`/api/transactions/manual?site=${siteCode}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && Array.isArray(data.data?.activeWeighments)) {
        setActiveWeighments(data.data.activeWeighments);
      }
    } catch {
      /* Keep showing last known active weighments */
    } finally {
      setLoadingManual(false);
    }
  };

  const tryAutoConnectScale = useCallback(async (isMountedCheck: () => boolean) => {
    if (typeof navigator === "undefined" || !("serial" in navigator)) return;
    if (activePortRef.current && isReadingRef.current) return;

    let autoConnectFlag: string | null = null;
    try {
      autoConnectFlag = localStorage.getItem("weighbridge_scale_auto_connect");
    } catch {}
    // If the operator explicitly clicked Disconnect, respect their choice
    if (autoConnectFlag === "false") return;

    try {
      const ports = await (navigator as any).serial.getPorts();
      if (!ports || ports.length === 0 || !isMountedCheck()) return;

      setIsAutoConnecting(true);

      // Validate stored baud against allowed settings to prevent NaN corruption
      const rawBaud = parseInt(localStorage.getItem("weighbridge_scale_baud") || "9600", 10);
      const savedBaud = (VALID_BAUDS as readonly number[]).includes(rawBaud) ? rawBaud : 9600;

      const rawFraming = localStorage.getItem("weighbridge_scale_framing") as any;
      const savedFraming: "8-none" | "7-even" | "7-odd" = (VALID_FRAMINGS as readonly string[]).includes(rawFraming)
        ? rawFraming
        : "8-none";

      const dataBits = savedFraming.startsWith("7") ? 7 : 8;
      const parity = savedFraming.endsWith("even") ? "even" : savedFraming.endsWith("odd") ? "odd" : "none";

      // Match port against stored USB Vendor / Product ID
      const savedVendor = localStorage.getItem("weighbridge_scale_vendor_id");
      const savedProduct = localStorage.getItem("weighbridge_scale_product_id");

      let selectedPort = ports[0];
      if (savedVendor) {
        const matched = ports.find((p: any) => {
          const info = p.getInfo?.() || {};
          return String(info.usbVendorId) === savedVendor && (!savedProduct || String(info.usbProductId) === savedProduct);
        });
        if (matched) selectedPort = matched;
      }

      // Retry with backoff to give the OS/browser time to release the previous document's handle
      let opened = false;
      const MAX_RETRIES = 6;
      const RETRY_DELAYS = [150, 300, 600, 1000, 1500, 2500];

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        if (!isMountedCheck()) break;

        if (selectedPort.readable) {
          opened = true;
          break;
        }

        try {
          await selectedPort.open({
            baudRate: savedBaud,
            dataBits,
            stopBits: 1,
            parity,
          });
          opened = true;
          break;
        } catch (openErr: any) {
          const msg = openErr?.message || String(openErr);
          const isBusy =
            msg.includes("in use") ||
            msg.includes("already open") ||
            openErr?.name === "NetworkError" ||
            msg.includes("access");

          if (isBusy && attempt < MAX_RETRIES - 1) {
            await new Promise((res) => setTimeout(res, RETRY_DELAYS[attempt]));
            continue;
          }

          if (attempt === MAX_RETRIES - 1 && isBusy) {
            console.warn("Scale COM port still busy after retries:", msg);
          }
        }
      }

      if (opened && selectedPort.readable && isMountedCheck()) {
        setSerialBaud(savedBaud);
        setSerialFraming(savedFraming);
        setSerialPort(selectedPort);
        setIsSerialConnected(true);
        startReaderLoop(selectedPort, savedFraming);
        toast({
          title: "Scale Auto-Connected",
          body: `Restored live indicator feed at ${savedBaud} baud (${dataBits}-${parity.toUpperCase()}-1).`,
        });
      }
    } catch (err) {
      console.warn("Auto-reconnect error:", err);
    } finally {
      if (isMountedCheck()) {
        setIsAutoConnecting(false);
      }
    }
  }, [toast]);

  // Web Serial persistent connection, cable replug listeners, and unmount cleanup
  useEffect(() => {
    let isMounted = true;
    tryAutoConnectScale(() => isMounted);

    const handleBeforeUnload = () => {
      if (loopAbortControllerRef.current) {
        loopAbortControllerRef.current.abort();
      }
      if (activeReaderRef.current) {
        try { activeReaderRef.current.cancel().catch(() => {}); } catch {}
      }
      if (activePortRef.current) {
        try { activePortRef.current.close().catch(() => {}); } catch {}
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", handleBeforeUnload);
      window.addEventListener("pagehide", handleBeforeUnload);
    }

    // Cable replug listeners: filter events to ensure printers don't disrupt scale feed
    const handleCableConnect = (event: any) => {
      if (!isMounted) return;
      if (activePortRef.current && isReadingRef.current) return;

      const connectedPort = event?.target;
      const savedVendor = localStorage.getItem("weighbridge_scale_vendor_id");
      const savedProduct = localStorage.getItem("weighbridge_scale_product_id");

      if (connectedPort && savedVendor) {
        const info = connectedPort.getInfo?.() || {};
        if (String(info.usbVendorId) !== savedVendor || (savedProduct && String(info.usbProductId) !== savedProduct)) {
          return;
        }
      }

      toast({ title: "Scale Cable Plugged In", body: "Re-establishing scale connection..." });
      tryAutoConnectScale(() => isMounted);
    };

    const handleCableDisconnect = (event: any) => {
      if (!isMounted) return;
      // Only disconnect if a scale port was active AND matches the disconnected port
      if (!activePortRef.current || event?.target !== activePortRef.current) {
        return;
      }

      keepReadingRef.current = false;
      isReadingRef.current = false;
      setIsSerialConnected(false);
      setManualWeightKg(0);
      setIsIndicatorStable(false);
      setSignalLost(true);
      activePortRef.current = null;
      setSerialPort(null);
      toast({
        title: "Scale Cable Unplugged",
        body: "Scale USB cable was disconnected. Live scale weight halted.",
        severity: "HIGH",
      });
    };

    if (typeof navigator !== "undefined" && "serial" in navigator) {
      (navigator as any).serial.addEventListener("connect", handleCableConnect);
      (navigator as any).serial.addEventListener("disconnect", handleCableDisconnect);
    }

    return () => {
      isMounted = false;
      keepReadingRef.current = false;
      isReadingRef.current = false;
      if (typeof window !== "undefined") {
        window.removeEventListener("beforeunload", handleBeforeUnload);
        window.removeEventListener("pagehide", handleBeforeUnload);
      }
      if (typeof navigator !== "undefined" && "serial" in navigator) {
        (navigator as any).serial.removeEventListener("connect", handleCableConnect);
        (navigator as any).serial.removeEventListener("disconnect", handleCableDisconnect);
      }
      if (loopAbortControllerRef.current) {
        loopAbortControllerRef.current.abort();
        loopAbortControllerRef.current = null;
      }
      (async () => {
        try {
          if (activeReaderRef.current) {
            await activeReaderRef.current.cancel().catch(() => {});
            activeReaderRef.current = null;
          }
          if (readerLoopPromiseRef.current) {
            await readerLoopPromiseRef.current.catch(() => {});
            readerLoopPromiseRef.current = null;
          }
          if (activePortRef.current) {
            await activePortRef.current.close().catch(() => {});
            activePortRef.current = null;
          }
        } catch {}
      })();
    };
  }, [tryAutoConnectScale]);

  // Queue and In-Progress polling (12s interval with document.hidden guard)
  useEffect(() => {
    fetchQueue();
    fetchActiveWeighments();
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      fetchQueue();
      fetchActiveWeighments();
    }, 12_000);
    return () => clearInterval(timer);
  }, [siteCode]);

  // Open modal prefilled for 1st weighment
  function handleOpenFirstWeigh(booking?: QueueItem, forceWalkIn = false) {
    setCompletedResult(null);
    setModalMode("FIRST");
    setIdempotencyKey(typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `IDEM-${Date.now()}`);
    if (booking) {
      setSelectedBookingId(booking.id);
      setIsWalkIn(false);
    } else if (forceWalkIn || queue.length === 0) {
      setSelectedBookingId("");
      setIsWalkIn(true);
    } else if (queue.length > 0 && queue[0]) {
      setSelectedBookingId(queue[0].id);
      setIsWalkIn(false);
    }
    // Metrology safety: never pre-fill stale weights if cable dropped or signal lost
    setFirstWeightInput(isSerialConnected && !signalLost && manualWeightKg > 0 ? String(manualWeightKg) : "");
    setSecondWeightInput("");
    setModalOpen(true);
  }

  // Open modal prefilled for 2nd weighment
  function handleOpenSecondWeigh(weighment?: ActiveWeighment) {
    setCompletedResult(null);
    setModalMode("SECOND");
    setIdempotencyKey(typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `IDEM-${Date.now()}`);
    if (weighment) {
      setSelectedWeighmentId(weighment.id);
      setSelectedBookingId(weighment.bookingId);
      setFirstWeightInput(String(weighment.firstWeightKg));
      setWeighType(weighment.firstWeightType === "TARE" ? "DISPATCH" : "RECEIPT");
    } else if (activeWeighments.length > 0 && activeWeighments[0]) {
      const w = activeWeighments[0];
      setSelectedWeighmentId(w.id);
      setSelectedBookingId(w.bookingId);
      setFirstWeightInput(String(w.firstWeightKg));
      setWeighType(w.firstWeightType === "TARE" ? "DISPATCH" : "RECEIPT");
    }
    // Metrology safety: never pre-fill stale weights if cable dropped or signal lost
    setSecondWeightInput(isSerialConnected && !signalLost && manualWeightKg > 0 ? String(manualWeightKg) : "");
    setModalOpen(true);
  }

  // Open modal for direct entry (both weights at once)
  function handleOpenDirectWeigh(booking?: QueueItem, forceWalkIn = false) {
    setCompletedResult(null);
    setModalMode("DIRECT");
    setIdempotencyKey(typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `IDEM-${Date.now()}`);
    if (booking) {
      setSelectedBookingId(booking.id);
      setIsWalkIn(false);
    } else if (forceWalkIn || queue.length === 0) {
      setSelectedBookingId("");
      setIsWalkIn(true);
    } else if (queue.length > 0 && queue[0]) {
      setSelectedBookingId(queue[0].id);
      setIsWalkIn(false);
    }
    setFirstWeightInput(isSerialConnected && !signalLost && manualWeightKg > 0 ? String(manualWeightKg) : "");
    setSecondWeightInput("");
    setModalOpen(true);
  }

  // Submit manual weighment action (carries idempotencyKey to prevent duplicate weighments on LTE retry)
  async function handleSubmitManual() {
    setSubmitting(true);
    try {
      if (modalMode === "FIRST") {
        const weightKg = Number(firstWeightInput);
        if (isWalkIn) {
          if (!walkInPlate.trim()) throw new Error("Please enter truck registration plate");
          if (!walkInDriver.trim()) throw new Error("Please enter driver name");
        } else {
          if (!selectedBookingId) throw new Error("Please select an approved booking/truck");
        }
        if (!weightKg || weightKg <= 0) throw new Error("Please enter a valid 1st scale reading (kg)");

        const res = await fetch("/api/transactions/manual", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "FIRST_WEIGH",
            idempotencyKey: idempotencyKey || undefined,
            siteCode,
            bookingId: isWalkIn ? undefined : selectedBookingId,
            plate: isWalkIn ? walkInPlate.trim().toUpperCase() : undefined,
            driverName: isWalkIn ? walkInDriver.trim() : undefined,
            transporterName: isWalkIn ? walkInTransporter.trim() : undefined,
            trailer: isWalkIn ? walkInTrailer.trim().toUpperCase() : undefined,
            commodity: isWalkIn ? walkInCommodity : undefined,
            weightKg,
            weighType,
            notes: notesInput || undefined,
          }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Failed to capture 1st weighment");

        toast({ title: "1st Weighment Captured", body: body.data.message });
        setModalOpen(false);
        fetchQueue();
        fetchActiveWeighments();
      } else if (modalMode === "SECOND") {
        const weightKg = Number(secondWeightInput);
        if (!selectedWeighmentId && !selectedBookingId) {
          throw new Error("Please select the active in-progress vehicle");
        }
        if (!weightKg || weightKg <= 0) throw new Error("Please enter a valid 2nd scale reading (kg)");

        const res = await fetch("/api/transactions/manual", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "SECOND_WEIGH",
            idempotencyKey: idempotencyKey || undefined,
            siteCode,
            transactionId: selectedWeighmentId || undefined,
            bookingId: selectedBookingId || undefined,
            weightKg,
            mineTicketNumber: mineTicketInput || undefined,
            notes: notesInput || undefined,
          }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Failed to finalize 2nd weighment");

        setCompletedResult(body.data);
        toast({ title: "Transaction Completed", body: body.data.message });
        fetchQueue();
        fetchActiveWeighments();
      } else if (modalMode === "DIRECT") {
        const weight1Kg = Number(firstWeightInput);
        const weight2Kg = Number(secondWeightInput);
        if (isWalkIn) {
          if (!walkInPlate.trim()) throw new Error("Please enter truck registration plate");
          if (!walkInDriver.trim()) throw new Error("Please enter driver name");
        } else {
          if (!selectedBookingId) throw new Error("Please select an approved booking/truck");
        }
        if (!weight1Kg || weight1Kg <= 0 || !weight2Kg || weight2Kg <= 0) {
          throw new Error("Both 1st and 2nd weights must be greater than 0 kg");
        }

        const res = await fetch("/api/transactions/manual", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "DIRECT_WEIGH",
            idempotencyKey: idempotencyKey || undefined,
            siteCode,
            bookingId: isWalkIn ? undefined : selectedBookingId,
            plate: isWalkIn ? walkInPlate.trim().toUpperCase() : undefined,
            driverName: isWalkIn ? walkInDriver.trim() : undefined,
            transporterName: isWalkIn ? walkInTransporter.trim() : undefined,
            trailer: isWalkIn ? walkInTrailer.trim().toUpperCase() : undefined,
            commodity: isWalkIn ? walkInCommodity : undefined,
            weight1Kg,
            weight2Kg,
            mineTicketNumber: mineTicketInput || undefined,
            notes: notesInput || undefined,
          }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Failed to record direct weighment");

        setCompletedResult(body.data);
        toast({ title: "Waybill Issued", body: body.data.message });
        fetchQueue();
        fetchActiveWeighments();
      }
    } catch (err: any) {
      toast({ title: "Weighment Failed", body: err.message || String(err), severity: "HIGH" });
    } finally {
      setSubmitting(false);
    }
  }

  // Live scale calculations for modal preview
  const w1Num = Math.round(Number(firstWeightInput) || 0);
  const w2Num = Math.round(Number(secondWeightInput) || 0);
  const previewGross = modalMode === "FIRST" ? (weighType === "RECEIPT" ? w1Num : 0) : Math.max(w1Num, w2Num);
  const previewTare = modalMode === "FIRST" ? (weighType === "DISPATCH" ? w1Num : 0) : Math.min(w1Num, w2Num);
  const previewNet = modalMode === "FIRST" ? 0 : Math.max(0, previewGross - previewTare);

  return (
    <div className="space-y-4">
      {/* Top Header & Site Selector */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-foreground">Manual Weighbridge Console</h1>
            <Badge variant="default" className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
              MANUAL OPERATION MODE
            </Badge>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <label htmlFor="site-select" className="text-xs text-muted-foreground">Site:</label>
            <select
              id="site-select"
              aria-label="Select Weighbridge Site"
              className="h-7 cursor-pointer rounded-sm border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              value={siteCode}
              onChange={(e) => router.push(`/operator?site=${e.target.value}`)}
            >
              {availableSites.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { fetchQueue(); fetchActiveWeighments(); }}
            className="h-8 text-xs gap-1.5 cursor-pointer"
          >
            <RefreshCw size={13} className={loadingManual ? "animate-spin" : ""} />
            Refresh Data
          </Button>
          <Button
            onClick={() => handleOpenDirectWeigh()}
            size="sm"
            className="h-8 text-xs gap-1.5 cursor-pointer"
          >
            <PlusCircle size={14} />
            Direct Waybill Entry
          </Button>
        </div>
      </div>

      {/* Top Stat Cards */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { label: "Completed Today", value: stats.trucks.toLocaleString(), unit: "vehicles" },
          { label: "Net Tonnage", value: (stats.tonnage / 1000).toFixed(1), unit: "t" },
          { label: "In Yard (Awaiting 2nd)", value: String(activeWeighments.length), unit: "trucks" },
          { label: "Pending Arrivals", value: String(queue.length), unit: "trucks" },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="p-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">{item.label}</p>
              <p className="mt-1 font-mono text-2xl font-semibold text-foreground">
                {item.value}
                <span className="ml-1 text-xs font-normal text-muted-foreground">{item.unit}</span>
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Central Manual Weight Entry Console */}
      <Card className="border-border bg-card/95">
        <CardHeader className="flex-row items-center justify-between pb-2 flex-wrap gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Scale size={18} className="text-primary" />
              Scale Indicator Weight Entry
            </CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {isSerialConnected 
                ? "Streaming live weight directly from connected Mettler Toledo indicator"
                : "Connect your physical USB/Serial indicator or type weight manually"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isSerialConnected ? (
              <Badge variant="default" className="font-mono text-xs flex items-center gap-1.5 animate-pulse bg-emerald-500/20 text-emerald-500 border-emerald-500/40">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                INDICATOR ONLINE: {manualWeightKg} KG
              </Badge>
            ) : isAutoConnecting ? (
              <Badge variant="warning" className="font-mono text-xs flex items-center gap-1.5 bg-amber-500/10 text-amber-500 border-amber-500/30">
                <RefreshCw size={11} className="animate-spin" />
                RECONNECTING SCALE…
              </Badge>
            ) : (
              <Badge variant="warning" className="font-mono text-xs">
                Indicator Offline
              </Badge>
            )}
            <div className="flex items-center gap-1.5">
              <select
                value={serialBaud}
                onChange={(e) => setSerialBaud(Number(e.target.value))}
                disabled={isSerialConnected}
                className="h-8 rounded-sm border border-border bg-background px-2 text-2xs font-mono"
                title="Baud Rate (Standard Mettler Toledo is 9600 or 4800)"
              >
                <option value="9600">9600 baud</option>
                <option value="4800">4800 baud</option>
                <option value="2400">2400 baud</option>
                <option value="19200">19200 baud</option>
              </select>
              <select
                value={serialFraming}
                onChange={(e) => setSerialFraming(e.target.value as any)}
                disabled={isSerialConnected}
                className="h-8 rounded-sm border border-border bg-background px-2 text-2xs font-mono"
                title="Framing / Parity (Mettler Toledo default is 7-Even-1 or 8-None-1)"
              >
                <option value="8-none">8-N-1 (None)</option>
                <option value="7-even">7-E-1 (Mettler Default)</option>
                <option value="7-odd">7-O-1 (Odd)</option>
              </select>
              {!isSerialConnected && (
                <Button
                  size="sm"
                  onClick={autoDetectScale}
                  disabled={isDetecting}
                  className="text-xs h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm font-semibold cursor-pointer"
                  title="Automatically probe baud rate and serial framing to connect instantly"
                >
                  {isDetecting ? (
                    <RefreshCw size={13} className="animate-spin" />
                  ) : (
                    <Sparkles size={13} className="text-amber-300" />
                  )}
                  {isDetecting ? "Sniffing Scale…" : "Auto-Detect Scale"}
                </Button>
              )}
              <Button
                variant={isSerialConnected ? "outline" : "secondary"}
                size="sm"
                onClick={isSerialConnected ? disconnectSerial : connectSerial}
                disabled={isDetecting}
                className="text-xs h-8 gap-1.5 cursor-pointer"
              >
                {isSerialConnected ? <Unplug size={13} /> : <Plug size={13} />}
                {isSerialConnected ? "Disconnect" : "Manual Connect"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <WeightGauge weight={manualWeightKg} stable={isSerialConnected ? isIndicatorStable && !signalLost : false} />

          {/* Live Indicator Stream Diagnostic Telemetry */}
          {isSerialConnected && (
            <div className={`flex items-center justify-between rounded-sm border px-3 py-1.5 text-2xs font-mono ${
              signalLost
                ? "border-amber-500/50 bg-amber-950/30 text-amber-300"
                : isIndicatorStable
                ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-400"
                : "border-blue-500/30 bg-blue-950/20 text-blue-300"
            }`}>
              <span className="flex items-center gap-1.5 overflow-hidden text-ellipsis whitespace-nowrap">
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                  signalLost ? "bg-amber-400" : isIndicatorStable ? "bg-emerald-400 animate-ping" : "bg-blue-400 animate-pulse"
                }`} />
                {signalLost ? (
                  <span className="font-bold text-amber-400">SIGNAL LOST (&gt;2.5s) — CHECK INDICATOR CABLE</span>
                ) : (
                  <>
                    <span className="font-bold uppercase">[{isIndicatorStable ? "STABLE" : "MOTION"}]</span>
                    <span>STREAM: [{indicatorRawText || "Receiving frames..."}] &rarr; PARSED: {manualWeightKg} KG</span>
                  </>
                )}
              </span>
              <span className="text-muted-foreground shrink-0 ml-2">Packets: {indicatorPacketCount}</span>
            </div>
          )}

          {/* Modular Hardware Peripherals Automation Bar */}
          {(capabilities.hasAnpr || capabilities.hasGates || capabilities.hasPositionSensors || capabilities.hasTrafficLights) && (
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4 rounded-md border border-border bg-surface/50 p-3 text-xs">
              {capabilities.hasAnpr && (
                <div className="flex items-center gap-2 rounded border border-blue-500/20 bg-blue-500/5 p-2">
                  <Camera size={16} className="text-blue-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">ANPR Camera Armed</p>
                    <p className="text-[10px] text-muted-foreground">Snapshot on stable weight</p>
                  </div>
                </div>
              )}
              {capabilities.hasGates && (
                <div className="flex items-center gap-2 rounded border border-amber-500/20 bg-amber-500/5 p-2">
                  <ShieldAlert size={16} className="text-amber-500 shrink-0" />
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px] px-2 font-medium"
                      disabled={gatePulseActive === "ENTRY"}
                      onClick={() => triggerGate("ENTRY")}
                    >
                      {gatePulseActive === "ENTRY" ? "Inbound Opening…" : "Open Entry Gate"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px] px-2 font-medium"
                      disabled={gatePulseActive === "EXIT"}
                      onClick={() => triggerGate("EXIT")}
                    >
                      {gatePulseActive === "EXIT" ? "Outbound Opening…" : "Open Exit Gate"}
                    </Button>
                  </div>
                </div>
              )}
              {capabilities.hasPositionSensors && (
                <div className="flex items-center gap-2 rounded border border-emerald-500/20 bg-emerald-500/5 p-2">
                  <Radio size={16} className="text-emerald-500 shrink-0 animate-pulse" />
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">Deck Position Straddle Beams</p>
                    <p className="text-[10px] text-emerald-500 font-mono font-medium">BEAMS CLEAR · ALIGNED</p>
                  </div>
                </div>
              )}
              {capabilities.hasTrafficLights && (
                <div className="flex items-center gap-2 rounded border border-rose-500/20 bg-rose-500/5 p-2">
                  <TrafficCone size={16} className="text-rose-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">Traffic Signal Lights</p>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      Signal: {isIndicatorStable && !signalLost ? "🟢 GREEN (PASS)" : "🔴 RED (HOLD)"}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="rounded-sm border border-border bg-muted/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Operator Scale Input (KG)
              </Label>
              <span className="text-2xs text-muted-foreground font-mono">
                Type weight from physical indicator
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Input
                  type="number"
                  aria-label="Scale weight in kilograms"
                  value={manualWeightKg || ""}
                  onChange={(e) => setManualWeightKg(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                  placeholder="e.g. 14250 or 48600"
                  className="font-mono text-3xl font-bold h-14 text-center tracking-wider bg-background border-primary/40 focus:border-primary text-foreground"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 font-mono text-sm font-semibold text-muted-foreground">
                  KG
                </span>
              </div>
              <Button
                variant="outline"
                onClick={() => setManualWeightKg(0)}
                className="h-14 px-4 text-xs font-mono cursor-pointer"
                title="Zero Scale"
              >
                CLEAR
              </Button>
            </div>


            {/* Primary Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-border">
              <Button
                onClick={() => handleOpenFirstWeigh()}
                className="w-full text-xs sm:text-sm font-medium h-11 bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer gap-2"
              >
                <ArrowDownCircle size={16} />
                Record 1st Weight
              </Button>
              <Button
                onClick={() => handleOpenSecondWeigh()}
                className="w-full text-xs sm:text-sm font-medium h-11 bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer gap-2"
              >
                <ArrowUpCircle size={16} />
                Record 2nd Weight
              </Button>
              <Button
                onClick={() => handleOpenFirstWeigh(undefined, true)}
                variant="outline"
                className="w-full text-xs sm:text-sm font-medium h-11 border-dashed border-primary/50 text-foreground hover:bg-primary/10 cursor-pointer gap-2"
              >
                <PlusCircle size={16} className="text-primary" />
                + Walk-In Truck
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dual Queue Layout */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* LEFT COLUMN: Arrival Queue (Ready for 1st Weight) */}
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <ArrowDownCircle size={16} className="text-primary" />
                Arrival Queue · Ready for 1st Weight
              </CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Approved bookings waiting to enter and record empty tare
              </p>
            </div>
            <Badge variant="muted">{queue.length} waiting</Badge>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
              {queue.length ? (
                queue.map((item, index) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-xs bg-muted font-mono text-2xs font-semibold text-foreground">
                          {index + 1}
                        </span>
                        <span className="font-mono text-sm font-bold text-foreground">
                          {item.plate}
                        </span>
                        {item.trailer && (
                          <span className="font-mono text-2xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            +{item.trailer}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">· {item.driver}</span>
                      </div>
                      <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-1.5">
                        <span className="font-mono font-medium text-foreground">{item.reference}</span>
                        {item.orderNumber && (
                          <span>· Order: <strong className="text-primary font-mono">{item.orderNumber}</strong></span>
                        )}
                        <span>· {item.commodity}</span>
                        <span>· {item.transporter}</span>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      onClick={() => handleOpenFirstWeigh(item)}
                      className="h-8 text-xs font-medium cursor-pointer shrink-0"
                    >
                      <Scale size={13} className="mr-1.5" />
                      Weigh In
                    </Button>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  <Truck className="mx-auto mb-2 opacity-50" size={24} />
                  No approved bookings currently waiting in arrival queue.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* RIGHT COLUMN: Active Vehicles In Yard (Awaiting 2nd Weight) */}
        <Card className="border-emerald-500/30">
          <CardHeader className="flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base text-emerald-600 dark:text-emerald-400">
                <ArrowUpCircle size={16} />
                In Yard · Awaiting 2nd Weight
              </CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Vehicles currently loading/unloading; ready to weigh out
              </p>
            </div>
            <Badge variant="default" className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">
              {activeWeighments.length} on site
            </Badge>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
              {activeWeighments.length ? (
                activeWeighments.map((w) => (
                  <div
                    key={w.id}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-foreground">
                          {w.plate}
                        </span>
                        {w.trailer && (
                          <span className="font-mono text-2xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            +{w.trailer}
                          </span>
                        )}
                        <Badge variant="muted" className="text-2xs font-mono">
                          1st: {formatKg(w.firstWeightKg)}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-1.5">
                        <span className="font-mono font-medium text-foreground">{w.bookingRef}</span>
                        {w.orderNumber && (
                          <span>· Order: <strong className="text-primary font-mono">{w.orderNumber}</strong></span>
                        )}
                        <span>· {w.commodity}</span>
                        <span className="flex items-center gap-1 text-2xs">
                          <Clock size={11} /> {w.minutesInYard}m in yard
                        </span>
                      </div>
                    </div>

                    <Button
                      onClick={() => handleOpenSecondWeigh(w)}
                      className="h-8 text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer shrink-0 gap-1"
                    >
                      <Scale size={13} />
                      Weigh Out
                    </Button>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  <Truck className="mx-auto mb-2 opacity-50 text-emerald-500" size={24} />
                  No vehicles currently in the yard awaiting 2nd weighment.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* MANUAL WEIGHMENT MODAL */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scale size={20} className="text-primary" />
              {modalMode === "FIRST" && "Capture 1st Weighment (Weigh-In)"}
              {modalMode === "SECOND" && "Finalize 2nd Weighment (Weigh-Out)"}
              {modalMode === "DIRECT" && "Direct Manual Waybill Entry"}
            </DialogTitle>
            <DialogDescription>
              {modalMode === "FIRST" &&
                "Record 1st scale weight to authorize vehicle yard entry."}
              {modalMode === "SECOND" &&
                "Record 2nd scale weight to calculate net weight and issue the official waybill."}
              {modalMode === "DIRECT" &&
                "Directly enter both weights to produce a completed waybill."}
            </DialogDescription>
          </DialogHeader>

          {/* Success / Waybill Summary */}
          {completedResult ? (
            <div className="space-y-4 py-2">
              <div className="rounded-sm border border-emerald-500/30 bg-emerald-500/10 p-4 text-center space-y-2">
                <CheckCircle2 size={36} className="mx-auto text-emerald-500" />
                <h3 className="text-lg font-semibold text-foreground">
                  Weighment Completed & Waybill Issued!
                </h3>
                <p className="font-mono text-sm font-bold text-primary">
                  {completedResult.waybillNumber}
                </p>
                <div className="grid grid-cols-3 gap-2 pt-2 text-xs border-t border-emerald-500/20">
                  <div>
                    <span className="text-muted-foreground block text-2xs">Gross Weight</span>
                    <strong className="font-mono">{formatKg(completedResult.grossWeightKg)}</strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-2xs">Tare Weight</span>
                    <strong className="font-mono">{formatKg(completedResult.tareWeightKg)}</strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-2xs">Net Cargo Mass</span>
                    <strong className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                      {formatKg(completedResult.netWeightKg)}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Waybill Action Links */}
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Print & Verification Documents:
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    href={completedResult.waybillUrl}
                    target="_blank"
                    className="flex items-center justify-center gap-2 h-9 rounded-sm bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
                  >
                    <ExternalLink size={14} />
                    View Waybill Details
                  </Link>

                  <Link
                    href={`/api/transactions/${completedResult.transaction?.id ?? ""}/waybill?copy=CLIENT`}
                    target="_blank"
                    className="flex items-center justify-center gap-2 h-9 rounded-sm border border-border bg-card text-foreground text-xs font-medium hover:bg-muted transition-colors"
                  >
                    <Printer size={14} />
                    Client Copy (PDF)
                  </Link>

                  <Link
                    href={`/api/transactions/${completedResult.transaction?.id ?? ""}/waybill?copy=DRIVER`}
                    target="_blank"
                    className="flex items-center justify-center gap-2 h-9 rounded-sm border border-border bg-card text-foreground text-xs font-medium hover:bg-muted transition-colors"
                  >
                    <Printer size={14} />
                    Driver Copy (PDF)
                  </Link>

                  <Link
                    href={`/api/transactions/${completedResult.transaction?.id ?? ""}/waybill?format=thermal`}
                    target="_blank"
                    className="flex items-center justify-center gap-2 h-9 rounded-sm border border-border bg-card text-foreground text-xs font-medium hover:bg-muted transition-colors"
                  >
                    <FileText size={14} />
                    80mm Thermal Slip
                  </Link>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <Button onClick={() => setModalOpen(false)} className="w-full sm:w-auto cursor-pointer">
                  Done / Close
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              {/* Modal Mode Selector */}
              <div className="flex rounded-sm border border-border p-0.5 bg-muted/40">
                <button
                  type="button"
                  onClick={() => setModalMode("FIRST")}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-xs transition-colors cursor-pointer ${
                    modalMode === "FIRST" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  1st Weigh (Weigh-In)
                </button>
                <button
                  type="button"
                  onClick={() => setModalMode("SECOND")}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-xs transition-colors cursor-pointer ${
                    modalMode === "SECOND" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  2nd Weigh (Weigh-Out)
                </button>
                <button
                  type="button"
                  onClick={() => setModalMode("DIRECT")}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-xs transition-colors cursor-pointer ${
                    modalMode === "DIRECT" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Direct Entry
                </button>
              </div>

              {/* Target Vehicle Selection */}
              {modalMode === "SECOND" ? (
                <div className="space-y-1.5">
                  <Label>Select Vehicle In Yard (Awaiting 2nd Weight):</Label>
                  <select
                    value={selectedWeighmentId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSelectedWeighmentId(id);
                      const item = activeWeighments.find((w) => w.id === id);
                      if (item) {
                        setFirstWeightInput(String(item.firstWeightKg));
                        setSelectedBookingId(item.bookingId);
                        setWeighType(item.firstWeightType === "TARE" ? "DISPATCH" : "RECEIPT");
                      }
                    }}
                    className="w-full h-9 rounded-sm border border-border bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                  >
                    <option value="">-- Choose active in-yard truck --</option>
                    {activeWeighments.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.plate} {w.trailer ? `+${w.trailer}` : ""} · 1st: {formatKg(w.firstWeightKg)} ({w.firstWeightType}) · {w.driver}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">Vehicle Identification:</Label>
                    <div className="flex rounded-xs border border-border p-0.5 bg-muted/40">
                      <button
                        type="button"
                        onClick={() => setIsWalkIn(false)}
                        className={`px-2.5 py-1 text-2xs font-medium rounded-xs transition-colors cursor-pointer ${
                          !isWalkIn ? "bg-background text-foreground shadow-xs font-semibold" : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        From Queue ({queue.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsWalkIn(true)}
                        className={`px-2.5 py-1 text-2xs font-medium rounded-xs transition-colors cursor-pointer ${
                          isWalkIn ? "bg-primary text-primary-foreground shadow-xs font-semibold" : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        + Walk-In / Ad-Hoc Truck
                      </button>
                    </div>
                  </div>

                  {!isWalkIn ? (
                    <div className="space-y-1.5">
                      <select
                        value={selectedBookingId}
                        onChange={(e) => setSelectedBookingId(e.target.value)}
                        className="w-full h-9 rounded-sm border border-border bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                      >
                        <option value="">-- Choose vehicle from queue --</option>
                        {queue.map((q) => (
                          <option key={q.id} value={q.id}>
                            {q.plate} {q.trailer ? `+${q.trailer}` : ""} · {q.reference} · {q.driver} ({q.commodity})
                          </option>
                        ))}
                      </select>
                      {queue.length === 0 && (
                        <p className="text-2xs text-amber-500">
                          Queue is empty. Switch to "+ Walk-In / Ad-Hoc Truck" to enter details directly.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-sm border border-primary/20 bg-primary/5 p-3 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div className="space-y-1">
                          <Label className="text-2xs">Truck Plate / Registration *</Label>
                          <Input
                            placeholder="e.g. CA 123-456"
                            value={walkInPlate}
                            onChange={(e) => setWalkInPlate(e.target.value.toUpperCase())}
                            className="h-8 font-mono uppercase text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-2xs">Trailer Reg (Optional)</Label>
                          <Input
                            placeholder="e.g. TR-994"
                            value={walkInTrailer}
                            onChange={(e) => setWalkInTrailer(e.target.value.toUpperCase())}
                            className="h-8 font-mono uppercase text-xs"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div className="space-y-1">
                          <Label className="text-2xs">Driver Full Name *</Label>
                          <Input
                            placeholder="e.g. Sipho Ndlovu"
                            value={walkInDriver}
                            onChange={(e) => setWalkInDriver(e.target.value)}
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-2xs">Transporter / Haulier Company</Label>
                          <Input
                            placeholder="e.g. Unitrans Logistics"
                            value={walkInTransporter}
                            onChange={(e) => setWalkInTransporter(e.target.value)}
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-2xs">Cargo / Commodity</Label>
                        <Input
                          placeholder="e.g. Coal (ROM), Washed Coal, Duff Coal"
                          value={walkInCommodity}
                          onChange={(e) => setWalkInCommodity(e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Operational Flow Type */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setWeighType("DISPATCH")}
                  className={`border rounded-sm p-2 text-left transition-colors cursor-pointer ${
                    weighType === "DISPATCH"
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:bg-muted/30"
                  }`}
                >
                  <div className="text-xs font-semibold">Dispatch (Outbound Cargo)</div>
                  <div className="text-2xs text-muted-foreground mt-0.5">
                    1st = Empty Tare · 2nd = Loaded Gross
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setWeighType("RECEIPT")}
                  className={`border rounded-sm p-2 text-left transition-colors cursor-pointer ${
                    weighType === "RECEIPT"
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:bg-muted/30"
                  }`}
                >
                  <div className="text-xs font-semibold">Receipt (Inbound Delivery)</div>
                  <div className="text-2xs text-muted-foreground mt-0.5">
                    1st = Loaded Gross · 2nd = Empty Tare
                  </div>
                </button>
              </div>

              {/* Weight Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">
                      1st Weight (kg) {modalMode === "FIRST" ? "· Scale Reading" : "(Captured)"}:
                    </Label>
                    {manualWeightKg > 0 && modalMode !== "SECOND" && (
                      <button
                        type="button"
                        onClick={() => setFirstWeightInput(String(manualWeightKg))}
                        className="text-2xs text-primary font-mono font-medium hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <RefreshCw size={10} /> Insert Scale ({formatKg(manualWeightKg)})
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Input
                      type="number"
                      value={firstWeightInput}
                      onChange={(e) => setFirstWeightInput(e.target.value)}
                      disabled={modalMode === "SECOND"}
                      placeholder="e.g. 14200"
                      className="font-mono text-base font-semibold bg-background pr-10"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-2xs font-mono text-muted-foreground">
                      KG
                    </span>
                  </div>
                </div>

                {(modalMode === "SECOND" || modalMode === "DIRECT") && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-emerald-600 dark:text-emerald-400 font-semibold text-xs">
                        2nd Weight (kg) · Scale Reading:
                      </Label>
                      {manualWeightKg > 0 && (
                        <button
                          type="button"
                          onClick={() => setSecondWeightInput(String(manualWeightKg))}
                          className="text-2xs text-emerald-600 dark:text-emerald-400 font-mono font-medium hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <RefreshCw size={10} /> Insert Scale ({formatKg(manualWeightKg)})
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Input
                        type="number"
                        value={secondWeightInput}
                        onChange={(e) => setSecondWeightInput(e.target.value)}
                        placeholder="e.g. 48600"
                        className="font-mono text-base font-semibold bg-background pr-10 border-emerald-500/40 focus:border-emerald-500"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-2xs font-mono text-muted-foreground">
                        KG
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Calculated Weight Summary (No Overload Logic) */}
              {(modalMode === "SECOND" || modalMode === "DIRECT") && (
                <div className="rounded-sm border border-border bg-muted/40 p-3 space-y-2">
                  <div className="text-xs font-semibold text-foreground">
                    Calculated Mass Summary
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-2xs text-muted-foreground block">Gross Weight</span>
                      <strong className="font-mono">{formatKg(previewGross)}</strong>
                    </div>
                    <div>
                      <span className="text-2xs text-muted-foreground block">Tare Weight</span>
                      <strong className="font-mono">{formatKg(previewTare)}</strong>
                    </div>
                    <div>
                      <span className="text-2xs text-muted-foreground block">Net Cargo Mass</span>
                      <strong className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                        {formatKg(previewNet)}
                      </strong>
                    </div>
                  </div>
                </div>
              )}

              {/* Additional Details */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <Label>Mine / Pit Ticket # (Optional):</Label>
                  <Input
                    value={mineTicketInput}
                    onChange={(e) => setMineTicketInput(e.target.value)}
                    placeholder="e.g. TK-49201"
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Operator Notes (Optional):</Label>
                  <Input
                    value={notesInput}
                    onChange={(e) => setNotesInput(e.target.value)}
                    placeholder="e.g. Manual scale reading"
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              {/* Modal Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setModalOpen(false)}
                  disabled={submitting}
                  className="cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleSubmitManual}
                  disabled={submitting}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
                >
                  {submitting
                    ? "Processing..."
                    : modalMode === "FIRST"
                    ? "Record 1st Weight & Authorize Entry"
                    : "Finalize Weighment & Issue Waybill"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
