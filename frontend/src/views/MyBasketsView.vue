<script setup lang="ts">
// "Mes paniers" — the client side of the negotiation (`C1-F4`, `T3.3`).
//
// The client only ever sees their own baskets: the server scopes the query by
// `client_id`, so this view never has to filter anything itself.

import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import {
  basketStatusLabel,
  fetchMyBaskets,
  paymentMethodLabel,
  respondToBasket,
  type Basket,
} from "../api";
import { isAuthenticated } from "../auth";

const router = useRouter();

const baskets = ref<Basket[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);
/** Basket id currently being answered, to disable its buttons. */
const busyId = ref<number | null>(null);
const actionError = ref<string | null>(null);

// Buying is not a role: any signed-in user sees their own baskets, including
// producers and administrators.
const canUseView = computed(() => isAuthenticated.value);

async function loadBaskets() {
  loading.value = true;
  loadError.value = null;

  try {
    baskets.value = await fetchMyBaskets();
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : "Chargement impossible.";
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  if (canUseView.value) void loadBaskets();
});

async function respond(basket: Basket, accept: boolean) {
  busyId.value = basket.id;
  actionError.value = null;

  try {
    const updated = await respondToBasket(basket.id, accept);
    // Replace in place so the list keeps its order and scroll position.
    baskets.value = baskets.value.map((b) => (b.id === updated.id ? updated : b));
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : "Action impossible.";
  } finally {
    busyId.value = null;
  }
}

/** Only the retained lines are billed; removed ones are shown struck through. */
function retainedTotal(basket: Basket): number {
  return basket.items
    .filter((item) => !item.removedByFarmer)
    .reduce((sum, item) => sum + item.lineTotal, 0);
}

const statusClasses: Record<string, string> = {
  PENDING_FARMER: "bg-amber-100 text-amber-900",
  OFFER_PROPOSED: "bg-blue-100 text-blue-900",
  CONFIRMED: "bg-green-100 text-green-900",
  REJECTED: "bg-red-100 text-red-900",
};
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 pb-12">
    <nav class="py-3">
      <button type="button" class="text-sm text-green-700 hover:underline" @click="router.push('/')">
        ← Retour à la carte
      </button>
    </nav>

    <h1 class="mb-1 text-2xl font-bold text-gray-900">Mes paniers</h1>
    <p class="mb-6 text-sm text-gray-600">
      Le producteur retire les articles indisponibles et vous transmet une offre finale à accepter
      ou refuser.
    </p>

    <!-- Pas connecté / mauvais rôle -->
    <div
      v-if="!canUseView"
      class="rounded border border-gray-300 bg-gray-50 p-4 text-sm text-gray-700"
    >
      <p v-if="!isAuthenticated">Connectez-vous pour voir vos paniers.</p>
      <p v-else>
        Vos paniers apparaîtront ici.
      </p>
    </div>

    <div v-else-if="loading" class="p-8 text-center text-gray-600">Chargement…</div>

    <div v-else-if="loadError" class="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-800">
      {{ loadError }}
    </div>

    <div v-else-if="baskets.length === 0" class="rounded border border-gray-300 bg-gray-50 p-6 text-center text-gray-700">
      <p class="font-semibold">Aucun panier pour le moment.</p>
      <button type="button" class="mt-2 text-green-700 underline" @click="router.push('/')">
        Explorer la carte pour composer un panier
      </button>
    </div>

    <p v-if="actionError" class="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
      {{ actionError }}
    </p>

    <ul class="space-y-4">
      <li
        v-for="basket in baskets"
        :key="basket.id"
        class="rounded border border-gray-300 bg-white p-4 shadow-sm"
      >
        <header class="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 class="font-semibold text-gray-900">{{ basket.farmName }}</h2>
            <p class="text-xs text-gray-500">
              Panier #{{ basket.id }} · {{ basket.createdAt }} ·
              {{ paymentMethodLabel(basket.paymentMethod) }}
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
          Total : {{ retainedTotal(basket).toFixed(2) }} CHF
        </p>

        <!-- Accept / refuse only makes sense once the producer answered (`C1-F4`). -->
        <div v-if="basket.status === 'OFFER_PROPOSED'" class="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="busyId === basket.id"
            @click="respond(basket, true)"
          >
            Accepter l'offre
          </button>
          <button
            type="button"
            class="rounded border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="busyId === basket.id"
            @click="respond(basket, false)"
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
          En attente de la vérification de disponibilité par le producteur.
        </p>
      </li>
    </ul>
  </div>
</template>
