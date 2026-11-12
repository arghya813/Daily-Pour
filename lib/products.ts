export type Category = {
  id: string;
  name: string;
  aliases?: string[];
};

export type Product = {
  id: string;
  name: string;
  category: string;
  description: string;
  notes: string;
  price: number;
};

export const categories: Category[] = [
  { id: "coffee", name: "Coffee", aliases: ["beans", "java"] },
  { id: "tea", name: "Tea" },
  {
    id: "pastry",
    name: "Pastry",
    aliases: ["pastries", "bakery", "baked goods"],
  },
  {
    id: "grocery",
    name: "Grocery",
    aliases: ["groceries", "food", "produce", "pantry"],
  },
  {
    id: "electronics",
    name: "Electronics",
    aliases: ["electronic", "tech", "gadgets", "devices", "accessories"],
  },
  {
    id: "household",
    name: "Household",
    aliases: ["home", "cleaning", "cleaning supplies"],
  },
];

export const products: Product[] = [
  // Coffee
  {
    id: "ethiopia",
    name: "Ethiopia Guji",
    category: "coffee",
    description: "Light roast · Whole bean · 12 oz",
    notes: "Peach, jasmine, honey",
    price: 18,
  },
  {
    id: "colombia",
    name: "Colombia Supremo",
    category: "coffee",
    description: "Medium roast · Whole bean · 12 oz",
    notes: "Caramel, orange, cocoa",
    price: 16,
  },
  {
    id: "espresso",
    name: "House Espresso",
    category: "coffee",
    description: "Dark roast · Whole bean · 12 oz",
    notes: "Chocolate, toasted almond",
    price: 15,
  },

  // Tea
  {
    id: "sencha",
    name: "Sencha Green",
    category: "tea",
    description: "Loose leaf · 2 oz pouch",
    notes: "Grass, citrus, umami",
    price: 12,
  },
  {
    id: "earl-grey",
    name: "Earl Grey",
    category: "tea",
    description: "Loose leaf · 2 oz pouch",
    notes: "Bergamot, black tea",
    price: 10,
  },
  {
    id: "chamomile",
    name: "Chamomile",
    category: "tea",
    description: "Loose leaf · 2 oz pouch",
    notes: "Apple, honey, floral",
    price: 9,
  },

  // Pastry
  {
    id: "croissant",
    name: "Almond Croissant",
    category: "pastry",
    description: "Baked fresh · Each",
    notes: "Frangipane, toasted almond",
    price: 4.5,
  },
  {
    id: "banana-bread",
    name: "Banana Bread",
    category: "pastry",
    description: "Baked fresh · Each",
    notes: "Walnut, cinnamon",
    price: 4,
  },
  {
    id: "cookie",
    name: "Sea Salt Cookie",
    category: "pastry",
    description: "Baked fresh · Each",
    notes: "Dark chocolate, flaky salt",
    price: 3.5,
  },

  // Grocery
  {
    id: "whole-milk",
    name: "Whole Milk",
    category: "grocery",
    description: "1 gallon · Chilled",
    notes: "Dairy",
    price: 4.5,
  },
  {
    id: "eggs",
    name: "Free-Range Eggs",
    category: "grocery",
    description: "Dozen · Large",
    notes: "Farm fresh",
    price: 5.5,
  },
  {
    id: "bananas",
    name: "Bananas",
    category: "grocery",
    description: "Bunch · Ripe",
    notes: "Fair trade",
    price: 2.2,
  },
  {
    id: "olive-oil",
    name: "Extra Virgin Olive Oil",
    category: "grocery",
    description: "500 ml · Cold pressed",
    notes: "Peppery, grassy",
    price: 12,
  },
  {
    id: "jasmine-rice",
    name: "Jasmine Rice",
    category: "grocery",
    description: "5 lb bag · Long grain",
    notes: "Fragrant",
    price: 9.5,
  },
  {
    id: "sourdough",
    name: "Sourdough Loaf",
    category: "grocery",
    description: "Baked daily · Each",
    notes: "Crackly crust, tangy",
    price: 6,
  },
  {
    id: "peanut-butter",
    name: "Peanut Butter",
    category: "grocery",
    description: "16 oz jar · Smooth",
    notes: "Roasted peanuts",
    price: 6.5,
  },
  {
    id: "greek-yogurt",
    name: "Greek Yogurt",
    category: "grocery",
    description: "32 oz tub · Plain",
    notes: "Creamy, high protein",
    price: 7,
  },

  // Electronics
  {
    id: "usb-c-cable",
    name: "USB-C Cable",
    category: "electronics",
    description: "2 m · Braided",
    notes: "100W fast charge",
    price: 12,
  },
  {
    id: "power-bank",
    name: "Power Bank 20K",
    category: "electronics",
    description: "20,000 mAh · Dual port",
    notes: "Fast charge",
    price: 45,
  },
  {
    id: "earbuds",
    name: "Wireless Earbuds",
    category: "electronics",
    description: "Bluetooth 5.3 · Charging case",
    notes: "Noise isolation",
    price: 59,
  },
  {
    id: "phone-stand",
    name: "Aluminum Phone Stand",
    category: "electronics",
    description: "Adjustable · Desk",
    notes: "Foldable",
    price: 18,
  },
  {
    id: "bluetooth-speaker",
    name: "Bluetooth Speaker",
    category: "electronics",
    description: "Portable · 12 h battery",
    notes: "Water resistant",
    price: 39,
  },
  {
    id: "wall-charger",
    name: "65W Wall Charger",
    category: "electronics",
    description: "GaN · USB-C",
    notes: "Fast charge",
    price: 29,
  },

  // Household
  {
    id: "dish-soap",
    name: "Dish Soap",
    category: "household",
    description: "16 oz · Lemon",
    notes: "Cuts grease",
    price: 4,
  },
  {
    id: "paper-towels",
    name: "Paper Towels",
    category: "household",
    description: "6 rolls · 2-ply",
    notes: "Absorbent",
    price: 8,
  },
  {
    id: "laundry-detergent",
    name: "Laundry Detergent",
    category: "household",
    description: "64 loads · Fresh linen",
    notes: "HE compatible",
    price: 14,
  },
  {
    id: "trash-bags",
    name: "Trash Bags",
    category: "household",
    description: "40 ct · 13 gal",
    notes: "Drawstring",
    price: 9,
  },
  {
    id: "glass-cleaner",
    name: "Glass Cleaner",
    category: "household",
    description: "26 oz · Streak-free",
    notes: "Ammonia-free",
    price: 5.5,
  },
];

export const defaultUsuals: Record<string, string> = {};

export function findProduct(id: string): Product | undefined {
  return products.find((product) => product.id === id);
}

export function findCategory(id: string): Category | undefined {
  return categories.find((category) => category.id === id);
}

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

/**
 * Collapse a phrase to lowercase words so matching ignores punctuation,
 * hyphens and repeated spaces.
 */
function normalizeWords(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Turn each word into a simple singular form: bananas → banana, eggs → egg. */
function singularizeWords(value: string): string {
  return normalizeWords(value)
    .split(" ")
    .map((word) => {
      if (word.length <= 3) return word;
      if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
      if (/(ses|xes|zes|ches|shes)$/.test(word)) return word.slice(0, -2);
      if (word.endsWith("s")) return word.slice(0, -1);
      return word;
    })
    .join(" ");
}

function singularPhrase(value: string): string {
  return ` ${singularizeWords(value)} `;
}

/** Words that only belong to one product name make safe short-hand keys. */
const uniqueNameTokens = (() => {
  const counts = new Map<string, number>();

  for (const product of products) {
    const tokens = new Set(singularizeWords(product.name).split(" "));
    for (const token of tokens) {
      if (token.length < 3) continue;
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }

  return new Set(
    [...counts.entries()]
      .filter(([, count]) => count === 1)
      .map(([token]) => token),
  );
})();

/**
 * Match a product from free text. Full names and ids always win over single
 * distinctive words, so "banana bread" does not get mistaken for bananas.
 */
export function findMentionedProduct(message: string): Product | undefined {
  const text = singularPhrase(message);

  let best: { product: Product; score: number } | undefined;

  for (const product of products) {
    const candidates = new Set<string>([
      product.name,
      product.id.replace(/-/g, " "),
    ]);

    for (const token of singularizeWords(product.name).split(" ")) {
      if (uniqueNameTokens.has(token)) candidates.add(token);
    }

    for (const candidate of candidates) {
      const phrase = singularPhrase(candidate);
      const key = phrase.trim();

      if (!key || !text.includes(phrase)) continue;

      const score = key.split(" ").length * 100 + key.length;
      if (!best || score > best.score) best = { product, score };
    }
  }

  return best?.product;
}

/** Match a genre from free text, including common aliases and plurals. */
export function findMentionedCategory(message: string): Category | undefined {
  const text = singularPhrase(message);

  for (const category of categories) {
    const candidates = [
      category.id,
      category.name,
      ...(category.aliases ?? []),
    ];

    for (const candidate of candidates) {
      const phrase = singularPhrase(candidate);
      if (phrase.trim() && text.includes(phrase)) return category;
    }
  }

  return undefined;
}
