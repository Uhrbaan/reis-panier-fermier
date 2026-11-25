<script setup lang="ts">
// Guest basket page (`C1-F3`, `C1-F4`).
//
// A guest has no account, so the basket is reached with a public `reference`
// plus the secret `token` from the access link. Both live in the query string:
// the link *is* the credential, which is why it is long, random and never shown
// to anyone but the person who placed the order.

import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  basketStatusLabel,
  fetchGuestBasket,
  paymentMethodLabel,
  respondToGuestBasket,
  type Basket,
} from "../api";

const route = useRoute();
const router = useRouter();

const basket = ref<Basket | null>(null);
const loading = ref(true);
const loadError = ref<string | null>(null);
const actionError = ref<string | null>(null);
const busy = ref(false);

const reference = computed(() => {
  const value = route.query.reference;
  return typeof value === "string" ? value : "";
});

const token = computed(() => {
  const value = route.query.token;
  return typeof value === "string" ? value : "";
});

/** Only the retained lines are billed; removed ones stay visible struck through. */
const retainedTotal = computed(
  () =>
    basket.value?.items
      .filter((item) => !item.removedByFarmer)
      .reduce((sum, item) => sum + item.lineTotal, 0) ?? 0
);

async function load() {
  loading.value = true;
  loadError.value = null;

  if (!reference.value || !token.value) {
    loadError.value = "Lien incomplet : la référence et le jeton sont nécessaires.";
    loading.value = false;
    return;
  }

  try {
    basket.value = await fetchGuestBasket(reference.value, token.value);
  } catch {
    loadError.value =
      "Panier introuvable. Le lien est peut-être incomplet ou a été modifié.";
  } finally {
    loading.value = false;
  }
}

onMounted(load);

async function respond(accept: boolean) {
  if (!basket.value) return;

  busy.value = true;
  actionError.value = null;

  try {
    basket.value = await respondToGuestBasket(reference.value, token.value, accept);
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : "Action impossible.";
  } finally {
    busy.value = false;
  }
}

const statusClasses: Record<string, string> = {
  PENDING_FARMER: "bg-amber-100 text-amber-900",
  OFFER_PROPOSED: "bg-blue-100 text-blue-900",
  CONFIRMED: "bg-green-100 text-green-900",
  REJECTED: "bg-red-100 text-red-900",
};
</script>

<template>
  <div class="mx-auto max-w-2xl px-4 pb-12">
    <nav class="py-3">
      <button type="button" class="text-sm text-green-700 hover:underline" @click="router.push('/')">
        ← Retour à la carte
      </button>
    </nav>

    <h1 class="mb-1 text-2xl font-bold text-gray-900">Mon panier</h1>
    <p class="mb-6 text-sm text-gray-600">
      Cette page est accessible uniquement par votre lien personnel.
    </p>

    <div v-if="loading" class="p-8 text-center text-gray-600">Chargement…</div>

    <div v-else-if="loadError" class="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-800">
      <p>{{ loadError }}</p>
      <p class="mt-2 text-xs">
        Si vous avez perdu votre lien, contactez l'administrateur en indiquant votre référence de
        panier.
      </p>
    </div>

    <div v-else-if="basket" class="rounded border border-gray-300 bg-white p-4 shadow-sm">
      <header class="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 class="font-semibold text-gray-900">{{ basket.farmName }}</h2>
          <p class="text-xs text-gray-500">
            Référence
            <strong class="font-mono">{{ basket.reference }}</strong>
            · {{ paymentMethodLabel(basket.paymentMethod) }}
          </p>
        </div>
        <span
          class="rounded-full px-3 py-1 text-xs font-semibold"
          :class="statusClasses[basket.status] ?? 'bg-gray-100 text-gray-800'"
        >
          {{ basketStatusLabel(basket.status) }}
        </span>
      </header>

      <ul class="mt-3 divide-y divide-gray-100 text-sm">
        <li
          v-for="item in basket.items"
          :key="item.id"
          class="flex items-center justify-between gap-3 py-1"
          :class="item.removedByFarmer ? 'text-gray-400 line-through' : 'text-gray-800'"
        >
          <span>
            {{ item.name }}
            <span class="text-xs text-gray-500">({{ item.unit }})</span>
            <span
              v-if="item.removedByFarmer"
              class="ml-2 text-xs font-semibold text-red-700"
              style="text-decoration: none"
            >
              indisponible
            </span>
          </span>
          <span class="whitespace-nowrap">
            {{ item.quantity }} × {{ item.unitPrice.toFixed(2) }} =
            {{ item.lineTotal.toFixed(2) }} CHF
          </span>
        </li>
      </ul>

      <p class="mt-3 border-t border-gray-200 pt-2 text-right font-semibold text-gray-900">
        Total : {{ retainedTotal.toFixed(2) }} CHF
      </p>

      <p v-if="actionError" class="mt-3 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">
        {{ actionError }}
      </p>

      <div v-if="basket.status === 'OFFER_PROPOSED'" class="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="busy"
          @click="respond(true)"
        >
          Accepter l'offre
        </button>
        <button
          type="button"
          class="rounded border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="busy"
          @click="respond(false)"
        >
          Refuser
        </button>
      </div>

      <p v-if="basket.status === 'CONFIRMED'" class="mt-3 text-sm text-green-800">
        Panier confirmé : il vous attend à la ferme. Le règlement se fait sur place.
      </p>
      <p v-else-if="basket.status === 'REJECTED'" class="mt-3 text-sm text-red-700">
        Cette demande n'a pas abouti.
      </p>
      <p v-else-if="basket.status === 'PENDING_FARMER'" class="mt-3 text-sm text-gray-600">
        En attente de la vérification de disponibilité par le producteur. Revenez sur cette page
        pour accepter ou refuser son offre.
      </p>

      <p class="mt-4 border-t border-gray-200 pt-3 text-xs text-gray-500">
        En cas de problème, indiquez la référence
        <strong class="font-mono">{{ basket.reference }}</strong>
        à l'administrateur.
      </p>
    </div>
  </div>
</template>
