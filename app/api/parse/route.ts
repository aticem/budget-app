import { DEFAULT_CATEGORIES } from "@/lib/categories";

export const runtime = "nodejs";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

function buildPrompt(known: string[]) {
  return `You parse short free-text expense or income statements written in Turkish or English (US-based budget app, USD).

Return STRICT JSON matching the schema. Rules:
- "amount": numeric price in USD. Strip currency symbols ($, USD). If no number is present, set 0.
- "type": "income" if the user is RECEIVING money (e.g. "got paid", "salary", "maaş aldım", "received"); otherwise "expense".
- "description": short clean English summary of WHAT was bought/paid/received. Translate Turkish to English. Keep quantity. Examples: "3 cigarettes", "rent payment", "3 perfumes (gift for girlfriend)".
- "category": pick the BEST fitting category. Prefer one of the existing categories: ${known.join(", ")}.
   IMPORTANT: If type is "income" (salary, paycheck, freelance payment, gift money received, refund, bonus, maaş, gelen para, kazanç, etc.) ALWAYS use category "Income". Do NOT invent new categories for income.
   If the user EXPLICITLY says to put an EXPENSE in a category (e.g. "put this in Gifts", "kız arkadaşa hediye kategorisine koy"), use that category exactly (PascalCase, English) — even if it doesn't exist yet.
   If none of the existing expense categories fits and no explicit category is given, INVENT a sensible NEW expense category (one or two English words, PascalCase, e.g. "Gifts", "Pets", "Travel", "Education").
   Hints for existing categories:
    - cigarette/sigara → Cigarettes
    - coffee/kahve/latte/espresso/starbucks → Coffee
    - rent, kira, airbnb, hotel, lodging → Accommodation
    - restaurant, lunch, dinner, breakfast, takeout, doordash, uber eats, yemek, kahvaltı → Food
    - groceries, supermarket, walmart, costco, market alışverişi → Groceries
    - bus, taxi, uber, lyft, fuel, gas, metro, parking, otobüs, benzin → Transport
    - electricity, water, internet, phone bill, fatura, elektrik → Bills
    - movie, concert, netflix, spotify, sinema → Entertainment
    - doctor, pharmacy, medicine, dentist, gym, gym membership, fitness, dumbbells, gym gloves, protein, vitamins, yoga, personal trainer, sports equipment, sağlık, eczane, ilaç, spor salonu → Health
    - salary, paycheck, maaş, freelance payment, refund, bonus, gift money received → Income (type=income)
- "isNewCategory": true ONLY if you returned a category that is not in the existing list above; false otherwise.`;
}

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Missing GEMINI_API_KEY" }, { status: 500 });
  }

  let text: string;
  let knownCategories: string[];
  try {
    const body = await req.json();
    text = String(body?.text ?? "").trim();
    knownCategories = Array.isArray(body?.knownCategories) && body.knownCategories.length
      ? body.knownCategories.map(String)
      : [...DEFAULT_CATEGORIES];
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!text) {
    return Response.json({ error: "Empty text" }, { status: 400 });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

  const payload = {
    systemInstruction: { parts: [{ text: buildPrompt(knownCategories) }] },
    contents: [{ role: "user", parts: [{ text }] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          description: { type: "STRING" },
          amount: { type: "NUMBER" },
          type: { type: "STRING", enum: ["expense", "income"] },
          category: { type: "STRING" },
          isNewCategory: { type: "BOOLEAN" },
        },
        required: ["description", "amount", "type", "category", "isNewCategory"],
      },
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    return Response.json(
      { error: "Gemini request failed", detail: errText.slice(0, 500) },
      { status: 502 },
    );
  }

  const data = await res.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  let parsed: {
    description: string;
    amount: number;
    type: "expense" | "income";
    category: string;
    isNewCategory: boolean;
  };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return Response.json(
      { error: "Could not parse model output", raw: String(raw).slice(0, 500) },
      { status: 502 },
    );
  }

  if (!Number.isFinite(parsed.amount) || parsed.amount <= 0) {
    return Response.json(
      { error: "no_amount", message: "Couldn't read a price — please include an amount." },
      { status: 400 },
    );
  }
  if (parsed.type !== "income" && parsed.type !== "expense") parsed.type = "expense";
  if (!parsed.category) parsed.category = "Other";
  parsed.category = String(parsed.category).trim().slice(0, 30);
  parsed.isNewCategory = !knownCategories.includes(parsed.category);

  return Response.json(parsed);
}
