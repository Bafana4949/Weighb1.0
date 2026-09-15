import { z } from "zod";

export const transporterSchema = z.object({
  companyName: z.string().min(2).max(120),
  registrationNo: z.string().max(60).optional().nullable(),
  contactEmail: z.string().email().optional().nullable(),
  contactPhone: z.string().max(30).optional().nullable(),
  firstName: z.string().min(2).max(80),
  lastName: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(8),
  phone: z.string().max(30).optional().nullable(),
});

export const transporterUpdateSchema = z.object({
  companyName: z.string().min(2).max(120).optional(),
  registrationNo: z.string().max(60).optional().nullable(),
  contactEmail: z.string().email().optional().nullable(),
  contactPhone: z.string().max(30).optional().nullable(),
});

// Mining companies are onboarded the same way transporters are (company details
// + first login in one step) — same shape, reused rather than duplicated.
export const companySchema = transporterSchema;

// Own object (not an alias of transporterUpdateSchema): mining companies carry
// extra profile fields transporters don't, and the two schemas must be able
// to evolve independently.
export const companyUpdateSchema = z.object({
  companyName: z.string().min(2).max(120).optional(),
  registrationNo: z.string().max(60).optional().nullable(),
  contactEmail: z.string().email().optional().nullable(),
  contactPhone: z.string().max(30).optional().nullable(),
  legalName: z.string().min(2).max(160).optional().nullable(),
  tradingName: z.string().min(2).max(160).optional().nullable(),
  taxNumber: z.string().max(60).optional().nullable(),
  physicalAddress: z.string().max(250).optional().nullable(),
  postalAddress: z.string().max(250).optional().nullable(),
  logoUrl: z.string().max(500).optional().nullable(),
  timezone: z.string().max(60).optional().nullable(),
  defaultCurrency: z.string().min(3).max(3).optional().nullable(),
});

export const suspendCompanySchema = z.object({ reason: z.string().min(5).max(500) });

export const siteSchema = z.object({
  organisationId: z.string().uuid(),
  code: z.string().min(2).max(20),
  name: z.string().min(2).max(120),
  type: z.enum(["MINE", "WEIGHBRIDGE", "DEPOT", "CUSTOMER_SITE"]),
  address: z.string().min(2).max(250),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  operatingStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  operatingEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  topology: z.enum(["BIDIRECTIONAL_SINGLE", "DUAL_ENTRY_EXIT"]).optional(),
});

export const laneSchema = z.object({
  laneNumber: z.number().int().min(1).max(20),
  name: z.string().min(1).max(60),
  direction: z.enum(["ENTRY", "EXIT"]).optional().nullable(),
});
export const laneUpdateSchema = laneSchema.partial();

export const orderBaseSchema = z.object({
  orderNumber: z.string().min(2).max(60).optional().nullable(),
  type: z.enum(["DISPATCH", "RECEIPT"]),
  siteId: z.string().uuid(),
  originSiteId: z.string().uuid().optional().nullable(),
  destinationSiteId: z.string().uuid().optional().nullable(),
  sourceId: z.string().uuid().optional().nullable(),
  destinationId: z.string().uuid().optional().nullable(),
  customerName: z.string().min(2).max(120).optional().nullable(),
  supplierName: z.string().min(2).max(120).optional().nullable(),
  product: z.string().min(2).max(80).optional().nullable(),
  productId: z.string().uuid().optional().nullable(),
  estimatedMassKg: z.number().int().min(1_000).max(2_147_483_000),
  stockpile: z.string().max(80).optional().nullable(),
  varianceThresholdPercent: z.number().min(0).max(25).optional(),
  varianceThresholdKg: z.number().int().min(0).max(50_000).optional().nullable(),
  ratePerTonZar: z.number().min(0).max(1_000_000).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});
export const orderSchema = orderBaseSchema
  .refine((value) => value.type !== "DISPATCH" || !!value.customerName, { message: "Customer is required for a dispatch order", path: ["customerName"] })
  .refine((value) => value.type !== "RECEIPT" || !!value.supplierName, { message: "Supplier is required for a receipt order", path: ["supplierName"] });

export const vehicleSchema = z.object({
  organisationId: z.string().uuid().optional(),
  plate: z.string().min(5).max(20),
  make: z.string().min(2).max(60),
  model: z.string().min(1).max(60),
  year: z.number().int().min(1980).max(2100).optional(),
  vin: z.string().max(40).optional().nullable(),
  tareWeightKg: z.number().int().min(0).max(50_000).default(0).optional(),
  legalMaxGvwKg: z.number().int().min(5_000).max(100_000),
  insuranceExpiry: z.coerce.date(),
});

export const trailerSchema = z.object({
  vehicleId: z.string().uuid(),
  trailerId: z.string().min(2).max(30),
  registrationNo: z.string().max(20).optional().nullable(),
  type: z.string().max(60).optional().nullable(),
  tareWeightKg: z.number().int().min(500).max(30_000).optional().nullable(),
});

export const driverSchema = z.object({
  organisationId: z.string().uuid().optional(),
  firstName: z.string().min(2).max(80),
  lastName: z.string().min(2).max(80),
  idNumber: z.string().min(8).max(30),
  rfidTag: z.string().min(2).max(30).optional().nullable(),
  photoUrl: z.string().optional().nullable(),
  licenceNumber: z.string().min(4).max(50),
  licenceExpiry: z.coerce.date(),
  consent: z.literal(true),
});

export const bookingSchema = z.object({
  vehicleId: z.string().uuid(),
  trailerId: z.string().uuid().optional().nullable(),
  additionalTrailerIds: z.array(z.string().uuid()).max(5).optional(),
  driverId: z.string().uuid(),
  siteId: z.string().uuid(),
  orderId: z.string().uuid().optional().nullable(),
  commodity: z.string().min(2).max(80),
  commodityDescription: z.string().max(250).optional().nullable(),
  targetTonnageKg: z.number().int().min(1_000).max(80_000),
  windowStart: z.coerce.date(),
  windowEnd: z.coerce.date(),
}).refine((value) => value.windowEnd > value.windowStart, { message: "Arrival window end must follow its start", path: ["windowEnd"] });

export const SERVICE_ORDER_CATEGORIES = ["HARDWARE", "SOFTWARE", "NETWORK", "ANPR", "SCALE", "GATE", "PRINTER", "REPORTING", "USER_ACCESS", "CALIBRATION", "TRAINING", "OTHER"] as const;
export const SERVICE_ORDER_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const SERVICE_ORDER_STATUSES = ["OPEN", "ACKNOWLEDGED", "IN_PROGRESS", "WAITING_FOR_CLIENT", "RESOLVED", "CLOSED", "CANCELLED"] as const;

export const serviceOrderSchema = z.object({
  organisationId: z.string().uuid().optional(),
  siteId: z.string().uuid().optional().nullable(),
  title: z.string().min(3).max(150),
  description: z.string().min(5).max(2000),
  category: z.enum(SERVICE_ORDER_CATEGORIES),
  priority: z.enum(SERVICE_ORDER_PRIORITIES).optional(),
  contactName: z.string().max(120).optional().nullable(),
  contactPhone: z.string().max(30).optional().nullable(),
  contactEmail: z.string().email().optional().nullable(),
  deviceId: z.string().uuid().optional().nullable(),
  transactionId: z.string().uuid().optional().nullable(),
  incidentId: z.string().uuid().optional().nullable(),
  dueAt: z.coerce.date().optional().nullable(),
});

export const serviceOrderUpdateSchema = z.object({
  status: z.enum(SERVICE_ORDER_STATUSES).optional(),
  priority: z.enum(SERVICE_ORDER_PRIORITIES).optional(),
  assignedToId: z.string().uuid().optional().nullable(),
  resolutionNotes: z.string().max(2000).optional().nullable(),
});

export const serviceOrderCommentSchema = z.object({
  body: z.string().min(1).max(2000),
  isInternal: z.boolean().optional(),
});

export const vehicleAssignmentSchema = z.object({
  transporterOrganisationId: z.string().uuid(),
  relationshipType: z.enum(["OWNER", "PRIMARY_CONTRACTOR", "SUBCONTRACTOR", "TEMPORARY_ASSIGNMENT", "THIRD_PARTY_HAULIER"]).optional(),
  contractReference: z.string().max(80).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  validFrom: z.coerce.date().optional(),
  validTo: z.coerce.date().optional().nullable(),
});

export const reconcileSchema = z.object({
  edge_transaction_id: z.string().uuid(),
  booking_id: z.string().uuid(),
  vehicle_id: z.string().uuid(),
  trailer_id: z.string().uuid().optional().nullable(),
  driver_id: z.string().uuid(),
  site_id: z.string(),
  gross_weight_kg: z.number().int().nonnegative(),
  tare_weight_kg: z.number().int().nonnegative(),
  net_weight_kg: z.number().int(),
  commodity: z.string().min(1),
  captured_at: z.coerce.date(),
  entry_at: z.coerce.date().optional().nullable(),
  exit_at: z.coerce.date().optional().nullable(),
  turnaround_seconds: z.number().int().nonnegative().optional().nullable(),
  waybill_number: z.string().min(8),
  previous_hash: z.string().regex(/^[a-f0-9]{64}$/),
  integrity_hash: z.string().regex(/^[a-f0-9]{64}$/),
  overload: z.boolean(),
  overload_variance_kg: z.number().int().nonnegative(),
  underweight_empty: z.boolean().default(false),
  overweight_loaded: z.boolean().default(false),
  anpr_confidence: z.number().min(0).max(1).optional().nullable(),
  entry_photo_url: z.string().optional().nullable(),
  scale_photo_url: z.string().optional().nullable(),
  driver_decision: z.string().optional().nullable(),
  lane_number: z.number().int().positive().optional().nullable(),
});
