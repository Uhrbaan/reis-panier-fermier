<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { fetchApprovedFarms, paymentMethodLabel, type Farm } from "../api";

const router = useRouter();
const mapContainer = ref<HTMLElement | null>(null);
const farms = ref<Farm[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
let map: any = null;


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

/**
 * Escape text before interpolating it into an `innerHTML` template.
 *
 * Popup content is built as a string rather than with Vue templates, so every
 * producer-controlled value (farm name, product names, units) must be escaped
 * explicitly. The description is *not* escaped here: it is the server-rendered
 * `descriptionHtml`, already sanitised at the write boundary (`ADR-04`).
 */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Trim rendered HTML to a popup-sized excerpt without cutting a tag. */
function truncateHtml(html: string, max = 350): string {
  if (html.length <= max) return html;
  const cut = html.slice(0, max);
  const lastClose = cut.lastIndexOf(">");
  return lastClose > 0 ? `${cut.slice(0, lastClose + 1)}…` : "";
}

function buildPopup(farm: Farm): HTMLElement {
  const el = document.createElement("div");
  el.className = "w-80 max-h-96 overflow-y-auto text-gray-900";

  const items = farm.products
    .map((p) => `<li>${esc(p.name)} — ${p.unitPrice.toFixed(2)} CHF / ${esc(p.unit)}</li>`)
    .join("");

  // `bannerUrl` is nullable in SQLite when a farm has no photo yet (`C2-F1`).
  const banner = farm.bannerUrl
    ? `<img src="${esc(farm.bannerUrl)}" alt="${esc(farm.name)}" class="block h-28 w-full object-cover" />`
    : `<div class="flex h-28 w-full items-center justify-center bg-green-50 text-3xl">🌾</div>`;

  // Only the server-rendered, sanitised rendition is injected as HTML.
  const description = truncateHtml(farm.descriptionHtml || "");

  el.innerHTML = `
    ${banner}
    <div class="p-3 space-y-2">
      <div class="flex items-baseline justify-between gap-2">
        <h3 class="text-base font-bold">${esc(farm.name)}</h3>
        <a href="/ferme/${farm.id}" class="shrink-0 text-sm font-semibold text-green-700 hover:underline">ouvrir →</a>
      </div>
      <div class="description-html text-xs leading-relaxed text-gray-700">${description}</div>
      <p class="text-xs"><strong>Paiements :</strong> ${esc(
        farm.paymentMethods.map(paymentMethodLabel).join(", "),
      )}</p>
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

  // Farms come from SQLite through `GET /api/client/farms` (`C1-F1`).
  // The endpoint only ever returns APPROVED farms.
  try {
    farms.value = await fetchApprovedFarms();
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Chargement impossible";
    return;
  } finally {
    loading.value = false;
  }

  farms.value.forEach((farm) => {
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
    <header class="flex items-baseline justify-between border-b border-gray-200 px-4 py-2">
      <h1 class="text-lg font-bold">PanierFermier</h1>
      <p class="text-xs text-gray-500">
        <span v-if="loading">Chargement des fermes…</span>
        <span v-else-if="error" class="text-red-600">{{ error }}</span>
        <span v-else>{{ farms.length }} ferme(s) approuvée(s)</span>
      </p>
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