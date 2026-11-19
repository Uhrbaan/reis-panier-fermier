<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { farms, type Farm } from "../data/farms";

const router = useRouter();
const mapContainer = ref<HTMLElement | null>(null);
let map: any = null;

const truncate = (text: string, max = 350) =>
  text.length <= max ? text : `${text.slice(0, max).trimEnd()}...`;

function loadMapLibre(): Promise<any> {
  return new Promise((resolve) => {
    if ((window as any).maplibregl) return resolve((window as any).maplibregl);

    const link = Object.assign(document.createElement("link"), {
      rel: "stylesheet",
      href: "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css",
    });
    const script = Object.assign(document.createElement("script"), {
      src: "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js",
      onload: () => resolve((window as any).maplibregl),
    });
    document.head.append(link, script);
  });
}

function buildPopup(farm: Farm): HTMLElement {
  const el = document.createElement("div");
  el.className = "w-80 max-h-96 overflow-y-auto text-gray-900";

  const items = farm.products
    .map(
      (p) =>
        `<li>${p.name} — ${p.unitPrice.toFixed(2)} CHF / ${p.unit}${
          !p.available ? " <em>(indisponible)</em>" : ""
        }</li>`
    )
    .join("");

  el.innerHTML = `
    <img src="${farm.bannerUrl}" alt="${farm.name}" class="block h-28 w-full object-cover" />
    <div class="p-3 space-y-2">
      <div class="flex items-baseline justify-between gap-2">
        <h3 class="text-base font-bold">${farm.name}</h3>
        <a href="/ferme/${farm.id}" class="shrink-0 text-sm font-semibold text-green-700 hover:underline">ouvrir →</a>
      </div>
      <p class="text-xs leading-relaxed text-gray-700">${truncate(farm.description)}</p>
      <p class="text-xs"><strong>Paiements :</strong> ${farm.paymentMethods.join(", ")}</p>
      <div class="text-xs">
        <strong>Produits :</strong>
        <ul class="mt-1 list-disc pl-4">${items}</ul>
      </div>
    </div>
  `;

  el.querySelector("a")?.addEventListener("click", (e) => {
    e.preventDefault();
    router.push(`/ferme/${farm.id}`);
  });

  return el;
}

onMounted(async () => {
  const maplibregl = await loadMapLibre();
  if (!mapContainer.value) return;

  map = new maplibregl.Map({
    container: mapContainer.value,
    style: "https://tiles.openfreemap.org/styles/liberty",
    center: [7.1619, 46.8065],
    zoom: 12,
  });

  map.addControl(new maplibregl.NavigationControl(), "top-right");

  farms.forEach((farm) => {
    const marker = document.createElement("div");
    marker.className =
      "flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-2 border-green-700 bg-white text-base shadow";
    marker.textContent = "🌾";

    const popup = new maplibregl.Popup({ offset: 16, maxWidth: "340px" }).setDOMContent(
      buildPopup(farm)
    );

    new maplibregl.Marker({ element: marker })
      .setLngLat([farm.longitude, farm.latitude])
      .setPopup(popup)
      .addTo(map);
  });
});

onUnmounted(() => map?.remove());
</script>

<template>
  <div class="flex h-[calc(100vh-45px)] flex-col">
    <header class="border-b border-gray-200 px-4 py-2">
      <h1 class="text-lg font-bold">PanierFermier</h1>
    </header>
    <div ref="mapContainer" class="w-full flex-1"></div>
  </div>
</template>

<style>
/* Nécessaire pour que la bannière touche les bords du popup MapLibre */
.maplibregl-popup-content {
  padding: 0 !important;
  overflow: hidden;
  border-radius: 0.5rem;
}
</style>