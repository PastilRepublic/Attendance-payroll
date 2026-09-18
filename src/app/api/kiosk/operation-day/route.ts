import { NextResponse } from "next/server";
import { getOperationDay, setOperationDay, type OperationDay } from "@/lib/settings";

const VALID: OperationDay[] = ["COOKING", "JAR_FILLING"];

export async function GET() {
  const operationDay = await getOperationDay();
  return NextResponse.json({ operationDay });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const value = body?.operationDay;
  if (!VALID.includes(value)) {
    return NextResponse.json({ error: "Invalid operationDay" }, { status: 400 });
  }
  const operationDay = await setOperationDay(value);
  return NextResponse.json({ operationDay });
}
