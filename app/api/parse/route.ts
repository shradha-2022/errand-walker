import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { input } = await req.json();

  const prompt = `Extract shop categories from the user's text.

VALID CATEGORIES (pick only matching ones):
- supermarket (atta, biscuits, milk, grocery, kirana, sabzi, fruits, vegetables, chips, namkeen, rice, dal, chawal, doodh)
- florist (flowers, phool, genda, rose, pushp, gulab)
- cafe (ice cream, snacks, cold drinks, coffee, tea)
- bakery (bread, cake, pastry, bun, biscuit)

RULES:
1. Return ONLY categories that match. Do NOT return all.
2. If unsure, pick the SINGLE closest category.
3. Output raw JSON array. No explanation.

EXAMPLES:
"sabzi" -> ["supermarket"]
"fruits and veggies" -> ["supermarket"]
"phool" -> ["florist"]
"ice cream" -> ["cafe"]
"atta biscuits" -> ["supermarket"]
"chips" -> ["supermarket"]
"bread" -> ["bakery"]
"sabzi aur phool" -> ["supermarket","florist"]
"सब्जी" -> ["supermarket"]
"चिप्स" -> ["supermarket"]

User text: "${input}"
JSON array:`;

  try {
    const res = await fetch('http://127.0.0.1:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen2.5:3b',
        prompt,
        stream: false,
        options: { temperature: 0.1 },
      }),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Ollama returned ' + res.status },
        { status: 500 }
      );
    }

    const data = await res.json();
    return NextResponse.json({ response: data.response });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Cannot reach Ollama: ' + err.message },
      { status: 500 }
    );
  }
}