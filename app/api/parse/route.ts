import { DEFAULT_CATEGORIES } from "@/lib/categories";

export const runtime = "nodejs";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

function buildPrompt(known: string[]) {
  return `You parse free-text expense or income statements written in Turkish, English, or both mixed (US-based budget app, USD).

Return STRICT JSON with the schema { "items": ParseItem[] }.

CRITICAL — MULTI-EVENT INPUT:
The user MAY describe several independent financial events in one message. Split into separate items. Each financial event = one item. Do NOT merge unrelated events. Do NOT skip events.

PER-ITEM RULES:

1. "amount" — total dollar amount for this item, as a positive number. Strip currency words/symbols ($, USD, dolar, dolars, dlar, dollar). Be tolerant of typos.
   - QUANTITIES: "X tane Y, tanesi Z dolar" / "X of Y at Z each" / "Z each, bought X" → ONE item with amount = X * Z, description keeps the quantity (e.g. "10 sex dolls"). Do NOT emit X separate items.
   - "1 kilo X for 10 dolar" → amount = 10, description = "1 kg X".

2. "type"
   - "income" if user is RECEIVING money: salary, paycheck, got paid, received, refund, bonus, maaş yattı/aldım, kazanç, gelen para, geldi.
   - otherwise "expense".

3. "description" — short clean ENGLISH summary of the item (translate Turkish → English). Keep quantities and key qualifiers ("10 sex dolls", "1 kg cucumbers", "gift for girlfriend", "salary received").

4. "category" — pick the BEST fit. Existing categories: ${known.join(", ")}.
   - INCOME items MUST use category = "Income". Never invent income categories.
   - For EXPENSE items, if the user EXPLICITLY assigns a category — phrasings include:
       "put in X", "in X category", "X kategorisine koy", "kategori X olsun", "call it X", "call X", "label as X", "tag X"
     — use that category exactly. PascalCase it (≤30 chars). If user says "babe" → "Babe". This is a hard override even if the word looks unusual.
   - If no override and an existing category fits, use that.
   - Hints (existing categories):
       cigarette/sigara → Cigarettes
       coffee/kahve/latte/espresso/starbucks → Coffee
       rent, kira, airbnb, hotel, lodging → Accommodation
       restaurant, lunch, dinner, breakfast, takeout, doordash, uber eats, yemek, kahvaltı → Food
       groceries, supermarket, walmart, costco, market, hıyar, salatalık, sebze, meyve → Groceries
       bus, taxi, uber, lyft, fuel, gas, metro, parking, otobüs, benzin → Transport
       electricity, water, internet, phone bill, fatura, elektrik → Bills
       movie, concert, netflix, spotify, sinema → Entertainment
       doctor, pharmacy, medicine, dentist, gym, gym membership, fitness, dumbbells, gym gloves, protein, vitamins, yoga, sağlık, eczane, ilaç, spor salonu → Health
   - If no override and no existing fit, INVENT a sensible English PascalCase category (e.g. "Gifts", "Pets", "Travel", "Education"). Avoid "Other" unless genuinely unclassifiable.

5. "isNewCategory" — true if your chosen category is NOT in the existing list above; false otherwise.

EXAMPLE (the rules in action):

Input:
"kendme on tane sisme kari aldim tanesi 1000 dolar sonra markete gittim bir kilo hiyar aldim 10dlar verdim, eve gelirkende aaaa ne goreyim maas yatmis 5000 dolar and I got a gift for my girlfriend 500dolar but that gift in a category and call babe"

Output:
{
  "items": [
    { "description": "10 sex dolls", "amount": 10000, "type": "expense", "category": "Other", "isNewCategory": false },
    { "description": "1 kg cucumbers", "amount": 10, "type": "expense", "category": "Groceries", "isNewCategory": false },
    { "description": "salary received", "amount": 5000, "type": "income", "category": "Income", "isNewCategory": false },
    { "description": "gift for girlfriend", "amount": 500, "type": "expense", "category": "Babe", "isNewCategory": true }
  ]
}`;
}

type ParseItem = {
  description: string;
  amount: number;
  type: "expense" | "income";
  category: string;
  isNewCategory: boolean;
};

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
          items: {
            type: "ARRAY",
            items: {
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
        },
        required: ["items"],
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

  let parsed: { items: ParseItem[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return Response.json(
      { error: "Could not parse model output", raw: String(raw).slice(0, 500) },
      { status: 502 },
    );
  }

  const rawItems = Array.isArray(parsed?.items) ? parsed.items : [];
  const items: ParseItem[] = [];
  for (const it of rawItems) {
    const amount = Number(it?.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const type: ParseItem["type"] = it?.type === "income" ? "income" : "expense";
    let category = String(it?.category ?? "").trim().slice(0, 30);
    if (!category) category = "Other";
    if (type === "income") category = "Income";
    const description = String(it?.description ?? "").trim() || "(no description)";
    const isNewCategory = !knownCategories.includes(category);
    items.push({ description, amount, type, category, isNewCategory });
  }

  if (items.length === 0) {
    return Response.json(
      { error: "no_amount", message: "Couldn't read any priced item — please include amounts." },
      { status: 400 },
    );
  }

  return Response.json({ items });
}
