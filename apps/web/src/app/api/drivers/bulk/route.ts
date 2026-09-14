import { UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { encryptSensitive,hashValue } from "@/lib/crypto";
import { driverSchema } from "@/lib/validation";
import { fail,ok,requireRole } from "@/lib/api";
const bulkSchema=z.object({rows:z.array(z.record(z.unknown())).min(1).max(500)});
export async function POST(request:Request){const a=await requireRole([UserRole.ADMIN]);if(a.error)return a.error;const parsed=bulkSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return fail("Invalid CSV payload",422);const errors:{row:number;message:string}[]=[];let created=0;for(let i=0;i<parsed.data.rows.length;i++){const rowNumber=i+2;const raw=parsed.data.rows[i] as Record<string,unknown>;const row=driverSchema.safeParse({...raw,consent:true});if(!row.success){errors.push({row:rowNumber,message:row.error.issues[0]?.message??"Invalid row"});continue}const organisationId=row.data.organisationId;if(!organisationId){errors.push({row:rowNumber,message:"Organisation is required"});continue}const {idNumber,consent,...data}=row.data;try{await prisma.driver.create({data:{...data,organisationId,idNumberEncrypted:encryptSensitive(idNumber),idNumberHash:hashValue(idNumber),consentCapturedAt:new Date()}});created++}catch{errors.push({row:rowNumber,message:"Driver ID, RFID tag, or licence number is already registered"})}}return ok({created,errors})}
