// Types related to farms, and temporary data for frontend testing.

export type PaymentMethod =
    | "Online"
    | "TWINT (sur place)"
    | "Cash (sur place)"
    | "Carte (sur place)";

export interface Product {
    id: number;
    name: string;
    unit: string;
    unitPrice: number;
    available: boolean;
}

export interface Farm {
    id: number;
    name: string;
    description: string;
    address: string;
    latitude: number;
    longitude: number;
    bannerUrl: string;
    openingHours: string;
    paymentMethods: PaymentMethod[];
    products: Product[];
}

export const farms: Farm[] = [
    {
        id: 1,
        name: "Ferme des Tilleuls",
        description:
            "Exploitation familiale située aux portes de Fribourg. Nous cultivons des légumes de saison en pleine terre dans le respect des sols, et proposons chaque semaine les œufs frais de nos poules élevées en plein air ainsi que du fromage d'alpage affiné dans notre cave. Venez découvrir nos produits récoltés le matin même.",
        address: "Route de la Glâne 42\n1700 Fribourg",
        latitude: 46.7985,
        longitude: 7.145,
        bannerUrl:
            "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1200&q=80",
        openingHours: "Mercredi : 14h00 – 18h00\nSamedi : 08h30 – 12h30",
        paymentMethods: ["Online", "TWINT (sur place)", "Cash (sur place)"],
        products: [
            { id: 101, name: "Tomates cœur de bœuf", unit: "kg", unitPrice: 5.5, available: true },
            { id: 102, name: "Œufs fermiers bio", unit: "boîte de 6", unitPrice: 4.8, available: true },
            { id: 103, name: "Gruyère AOP", unit: "morceau (~300g)", unitPrice: 8.5, available: true },
            { id: 104, name: "Miel de fleurs", unit: "pot 250g", unitPrice: 9.0, available: false },
        ],
    },
    {
        id: 2,
        name: "Verger du Lac",
        description:
            "Arboriculture fruitière traditionnelle. Pommes, poires, jus de pomme artisanal pressé à la ferme et cidre fermier élaboré sans additifs.",
        address: "Chemin du Lac 15\n1782 Belfaux",
        latitude: 46.824,
        longitude: 7.108,
        bannerUrl:
            "https://images.unsplash.com/photo-1570913149827-d2ac84ab3f9a?auto=format&fit=crop&w=1200&q=80",
        openingHours: "Vendredi : 15h00 – 19h00\nSamedi : 09h00 – 13h00",
        paymentMethods: ["TWINT (sur place)", "Cash (sur place)", "Carte (sur place)"],
        products: [
            { id: 201, name: "Pommes Gala", unit: "kg", unitPrice: 3.8, available: true },
            { id: 202, name: "Jus de pomme trouble", unit: "bouteille 1L", unitPrice: 4.5, available: true },
            { id: 203, name: "Cidre brut fermier", unit: "bouteille 75cl", unitPrice: 7.0, available: true },
        ],
    },
    {
        id: 3,
        name: "Maraîchage de la Sarine",
        description:
            "Produits maraîchers diversifiés, herbes aromatiques et paniers de légumes récoltés à la demande.",
        address: "Route de Marly 112\n1723 Marly",
        latitude: 46.779,
        longitude: 7.163,
        bannerUrl:
            "https://images.unsplash.com/photo-1464226184884-fa280b87c399?auto=format&fit=crop&w=1200&q=80",
        openingHours: "Mardi et Jeudi : 16h00 – 18h30",
        paymentMethods: ["Online"],
        products: [
            { id: 301, name: "Carottes fanes", unit: "botte", unitPrice: 3.2, available: true },
            { id: 302, name: "Salade batavia", unit: "pièce", unitPrice: 2.5, available: true },
            { id: 303, name: "Pommes de terre Charlotte", unit: "sac 2.5kg", unitPrice: 6.0, available: true },
        ],
    },
];