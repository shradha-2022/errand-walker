'use client';
import { useState } from 'react';

async function parseWithAI(input: string): Promise<string[]> {
  try {
    const res = await fetch('/api/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input }),
    });
    if (!res.ok) throw new Error('API failed');
    const data = await res.json();
    const raw = data.response || '';
    let parsed: any;
    try {
      parsed = JSON.parse(raw.trim());
    } catch {
      const match = raw.match(/\[[\s\S]*?\]/);
      if (match) parsed = JSON.parse(match[0]);
      else throw new Error('Bad JSON');
    }
    let cats: string[] = [];
    if (Array.isArray(parsed)) cats = parsed;
    else if (parsed?.categories) cats = parsed.categories;
    const valid = ['supermarket', 'florist', 'cafe', 'bakery'];
    cats = cats.filter((c) => typeof c === 'string' && valid.includes(c));
    if (cats.length === 0 || cats.length > 3) return keywordFallback(input);
    return cats;
  } catch {
    return keywordFallback(input);
  }
}

function keywordFallback(input: string): string[] {
  const t = input.toLowerCase();
  const cats: string[] = [];

  // Florist
  if (/flower|phool|genda|rose|pushp/.test(t) || /फूल|पुष्प|गेंदा|गुलाब/.test(input))
    cats.push('florist');

  // Cafe
  if (/ice|cream|snack|cold drink|coffee|tea/.test(t) || /आइसक्रीम|स्नैक/.test(input))
    cats.push('cafe');

  // Bakery
  if (/bread|cake|pastry|bakery|bun/.test(t) || /ब्रेड|केक|बेकरी/.test(input))
    cats.push('bakery');

  // Supermarket — everything grocery-related
  if (
    /atta|biscuit|milk|grocery|kirana|doodh|dal|rice|chawal|sabzi|veg|fruit|phal|chips|namkeen|produce/.test(t) ||
    /सब्ज़ी|सब्जी|फल|तरकारी|आटा|दूध|बिस्किट|किराना|चावल|दाल|चिप्स|नमकीन/.test(input)
  ) {
    if (!cats.includes('supermarket')) cats.push('supermarket');
  }

  // If nothing matched, default to supermarket
  if (cats.length === 0) cats.push('supermarket');

  return cats;
}

function mapToBizData(cat: string): string {
  const map: Record<string, string> = {
    supermarket: 'supermarket',
    florist: 'florist',
    cafe: 'cafe',
    bakery: 'bakery',
  };
  return map[cat] || 'supermarket';
}

async function getWalkingDistance(startLat: number, startLng: number, endLat: number, endLng: number) {
  const url = `https://router.project-osrm.org/route/v1/walking/${startLng},${startLat};${endLng},${endLat}?overview=false`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.code !== 'Ok') throw new Error('Route not found');
  return data.routes[0].distance;
}

function distanceToSteps(meters: number) {
  return Math.round(meters / 0.75);
}

const CATEGORY_META: Record<string, { emoji: string; label: string }> = {
  supermarket: { emoji: '🛒', label: 'Groceries & Veggies' },
  florist: { emoji: '🌸', label: 'Flowers' },
  cafe: { emoji: '🍦', label: 'Snacks & Drinks' },
  bakery: { emoji: '🥖', label: 'Bakery' },
};

export default function Home() {
  const [input, setInput] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  const findShops = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setStatus('Reading your list...');
    setResults([]);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const categories = await parseWithAI(input);
          setStatus('Searching nearby shops...');

          const allShops: any[] = [];
          for (const cat of categories) {
            const bizCat = mapToBizData(cat);
            try {
              const res = await fetch(
                `https://bizdata-web.vercel.app/api/businesses?location=${latitude},${longitude}&category=${bizCat}&radius_km=10&limit=8`
              );
              const data = await res.json();
              if (data.businesses) {
                allShops.push(...data.businesses.map((s: any) => ({ ...s, category: cat })));
              }
            } catch {}
          }

          const seen = new Set();
          const unique = allShops.filter((s) => {
            const key = `${s.name}|${s.address}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });

          if (unique.length === 0) {
            setStatus('No shops found. Try different words.');
            setLoading(false);
            return;
          }

          setStatus('Calculating your walk...');

          const withSteps = await Promise.all(
            unique.map(async (shop) => {
              try {
                const meters = await getWalkingDistance(latitude, longitude, shop.lat, shop.lon);
                return { ...shop, distanceMeters: Math.round(meters), steps: distanceToSteps(meters) };
              } catch {
                return { ...shop, distanceMeters: null, steps: null };
              }
            })
          );

          withSteps.sort((a, b) => {
            if (a.distanceMeters === null) return 1;
            if (b.distanceMeters === null) return -1;
            return a.distanceMeters - b.distanceMeters;
          });

          setResults(withSteps);
          setStatus('');
        } catch {
          setStatus('Something went wrong. Try again.');
        }
        setLoading(false);
      },
      () => {
        setStatus('Location needed. Please allow access.');
        setLoading(false);
      }
    );
  };

  const isOpen = (hoursString: string | null): boolean | null => {
    if (!hoursString) return null;
    try {
      const oh = require('opening_hours');
      const hours = new oh(hoursString);
      return hours.getState();
    } catch {
      return null;
    }
  };

  const totalSteps = results.reduce((sum, p) => sum + (p.steps || 0), 0);

  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
      <div className="max-w-lg mx-auto p-5">

        <header className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">🚶 Errand Walker</h1>
          <p className="text-sm text-gray-600 mt-1">
            Type what you need. Walk to get it. Count your steps.
          </p>
        </header>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-2 mb-4">
          <div className="flex gap-2">
            <input
              className="flex-1 px-3 py-3 rounded-xl text-gray-900 placeholder-gray-400 outline-none"
              placeholder="sabzi, phool, biscuits..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && findShops()}
            />
            <button
              onClick={findShops}
              disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-5 py-3 rounded-xl disabled:opacity-50 transition"
            >
              {loading ? '...' : 'Find'}
            </button>
          </div>
        </div>

        {status && (
          <div className="text-center text-sm text-gray-500 py-3">
            {loading && <span className="inline-block animate-pulse">●</span>} {status}
          </div>
        )}

        {totalSteps > 0 && (
          <div className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-2xl p-4 mb-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide opacity-90">Total walk</p>
            <p className="text-3xl font-bold mt-1">
              {totalSteps.toLocaleString()} <span className="text-lg font-normal">steps</span>
            </p>
            <p className="text-xs opacity-90 mt-1">
              Across {results.length} {results.length === 1 ? 'shop' : 'shops'} nearby
            </p>
          </div>
        )}

        <div className="space-y-3">
          {results.map((place: any, i: number) => {
            const openStatus = isOpen(place.opening_hours);
            const meta = CATEGORY_META[place.category] || { emoji: '🏪', label: place.category };
            return (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                <div className="flex justify-between items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">{meta.emoji}</span>
                      <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                        {meta.label}
                      </span>
                    </div>
                    <p className="font-semibold text-gray-900 truncate">{place.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{place.address}</p>

                    {place.steps && (
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-sm font-semibold text-emerald-700">
                          🚶 {place.steps.toLocaleString()} steps
                        </span>
                        <span className="text-xs text-gray-400">
                          {place.distanceMeters < 1000
                            ? `${place.distanceMeters}m`
                            : `${(place.distanceMeters / 1000).toFixed(1)}km`}
                        </span>
                      </div>
                    )}
                  </div>

                  <span
                    className={`text-xs px-2 py-1 rounded-full whitespace-nowrap font-medium ${
                      openStatus === true
                        ? 'bg-green-100 text-green-700'
                        : openStatus === false
                        ? 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {openStatus === true ? '● Open' : openStatus === false ? '● Closed' : '● Hours?'}
                  </span>
                </div>

                <a
                  className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-800"
                  href={`https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lon}&travelmode=walking`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Get walking route →
                </a>
              </div>
            );
          })}
        </div>

        {!loading && results.length === 0 && !status && (
          <div className="text-center text-gray-400 text-sm py-12">
            <p className="text-4xl mb-3">🌿</p>
            <p>Type something like "sabzi" or "phool"</p>
            <p className="mt-1 text-xs">AI will find shops and count your steps</p>
          </div>
        )}

      </div>
    </main>
  );
}