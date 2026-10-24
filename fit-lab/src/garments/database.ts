export type Category = "top" | "bottom";
export type FitStyle = "slim" | "regular" | "relaxed" | "oversized";

/**
 * Garment measurements in cm. Chest, waist and hip are full circumferences
 * (twice a flat pit-to-pit or flat waist). Shoulder is seam to seam, sleeve is
 * shoulder seam to cuff, length is high point shoulder to hem.
 */
export type GarmentKey = "chest" | "waist" | "hip" | "shoulder" | "sleeve" | "length" | "inseam";

export interface GarmentSize {
  label: string;
  measurements: Partial<Record<GarmentKey, number>>;
}

export interface Garment {
  id: string;
  name: string;
  category: Category;
  fit: FitStyle;
  fabric: { name: string; stretchPct: number };
  /** Made-up example figures, not a real product's chart. */
  sample: boolean;
  sizes: GarmentSize[];
}

const sizes = (labels: string[], cols: Partial<Record<GarmentKey, number[]>>): GarmentSize[] =>
  labels.map((label, i) => ({
    label,
    measurements: Object.fromEntries(Object.entries(cols).map(([k, v]) => [k, v[i]])),
  }));

export const GARMENTS: Garment[] = [
  {
    id: "linen-shirt",
    name: "Linen shirt",
    category: "top",
    fit: "regular",
    fabric: { name: "Linen", stretchPct: 0 },
    sample: true,
    sizes: sizes(["S", "M", "L", "XL", "XXL"], {
      chest: [100, 106, 112, 118, 124],
      waist: [96, 102, 108, 114, 120],
      shoulder: [43, 45, 47, 49, 51],
      sleeve: [61, 62, 63, 64, 65],
      length: [72, 74, 76, 78, 80],
    }),
  },
  {
    id: "cotton-tee",
    name: "Cotton T-shirt",
    category: "top",
    fit: "regular",
    fabric: { name: "Cotton jersey", stretchPct: 5 },
    sample: true,
    sizes: sizes(["S", "M", "L", "XL", "XXL"], {
      chest: [96, 102, 108, 114, 120],
      shoulder: [42, 44, 46, 48, 50],
      length: [68, 70, 72, 74, 76],
    }),
  },
  {
    id: "oversized-tee",
    name: "Oversized T-shirt",
    category: "top",
    fit: "oversized",
    fabric: { name: "Cotton jersey", stretchPct: 5 },
    sample: true,
    sizes: sizes(["S", "M", "L", "XL"], {
      chest: [112, 118, 124, 130],
      shoulder: [52, 54, 56, 58],
      length: [70, 72, 74, 76],
    }),
  },
  {
    id: "fitted-blouse",
    name: "Fitted blouse",
    category: "top",
    fit: "slim",
    fabric: { name: "Cotton poplin with elastane", stretchPct: 2 },
    sample: true,
    sizes: sizes(["XS", "S", "M", "L", "XL"], {
      chest: [84, 88, 94, 100, 106],
      waist: [72, 76, 82, 88, 94],
      shoulder: [36, 37.5, 39, 40.5, 42],
      length: [60, 61, 62, 63, 64],
    }),
  },
  {
    id: "stretch-chinos",
    name: "Stretch chinos",
    category: "bottom",
    fit: "slim",
    fabric: { name: "Cotton with elastane", stretchPct: 3 },
    sample: true,
    sizes: sizes(["28", "30", "32", "34", "36", "38"], {
      waist: [72, 77, 82, 87, 92, 97],
      hip: [92, 97, 102, 107, 112, 117],
      inseam: [81, 81, 82, 82, 83, 83],
    }),
  },
];
