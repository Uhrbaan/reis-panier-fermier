<script setup lang="ts">
// "Commandes reçues" — the producer side of the negotiation (`C2-F5`, `T3.4`).
//
// The producer never sets a price: they tick the items they cannot provide and
// the server recomputes the total from the price snapshot (`C3-F3`). The live
// preview below mirrors that arithmetic so the amount shown before saving is the
// amount the client will see.

import { computed, onMounted, ref } from "vue";
import {
  adjustBasket,
  basketStatusLabel,
  fetchReceivedBaskets,
  paymentMethodLabel,
  type Basket,
} from "../api";
import { currentRole, isAuthenticated } from "../auth";

const baskets = ref<Basket[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);
const actionError = ref<string | null>(null);
const busyId = ref<number | null>(null);

/** Item ids ticked for removal, per basket. Unticking restores the item. */
const removals = ref<Record<number, Set<number>>>({});

const canUseView = computed(() => isAuthenticated.value && currentRole.value === "FARMER");

async function loadBaskets() {
  loading.value = true;
  loadError.value = null;

  try {
    baskets.value = await fetchReceivedBaskets();
    // Every request starts with nothing ticked.
    removals.value = Object.fromEntries(baskets.value.map((b) => [b.id, new Set<number>()]));
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : "Chargement impossible.";
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  if (canUseView.value) void loadBaskets();
});

function removalSet(basketId: number): Set<number> {
  return removals.value[basketId] ?? new Set<number>();
}

function toggle(basketId: number, itemId: number) {
  const set = new Set(removalSet(basketId));
  if (set.has(itemId)) {
    set.delete(itemId);
  } else {
    set.add(itemId);
  }
  removals.value = { ...removals.value, [basketId]: set };
}

/** Live total of the lines that would survive this adjustment. */
function previewTotal(basket: Basket): number {
  const removed = removalSet(basket.id);
  return basket.items
    .filter((item) => !item.removedByFarmer && !removed.has(item.id))
    .reduce((sum, item) => sum + item.lineTotal, 0);
}

function willRejectEverything(basket: Basket): boolean {
  const removed = removalSet(basket.id);
  return basket.items.every((item) => item.removedByFarmer || removed.has(item.id));
}

async function submitAdjustment(basket: Basket) {
  busyId.value = basket.id;
  actionError.value = null;

  try {
    const updated = await adjustBasket(basket.id, [...removalSet(basket.id)]);
    baskets.value = baskets.value.map((b) => (b.id === updated.id ? updated : b));
    removals.value = { ...removals.value, [basket.id]: new Set<number>() };
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : "Action impossible.";
  } finally {
    busyId.value = null;
  }
}

const statusClasses: Record<string, string> = {
  PENDING_FARMER: "bg-amber-100 text-amber-900",
  OFFER_PROPOSED: "bg-blue-100 text-blue-900",
  CONFIRMED: "bg-green-100 text-green-900",
  REJECTED: "bg-red-100 text-red-900",
};

/** Only baskets awaiting this producer can be edited. */
function isActionable(basket: Basket): boolean {
  return basket.status === "PENDING_FARMER";
}
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 pb-12">
    <h1 class="mb-1 mt-6 text-2xl font-bold text-gray-900">Commandes reçues</h1>
    <p class="mb-6 text-sm text-gray-600">
      Retirez les articles indisponibles : le total est recalculé automatiquement et transmis au
      client, qui accepte ou refuse l'offre.
    </p>

    <div
      v-if="!canUseView"
      class="rounded border border-gray-300 bg-gray-50 p-4 text-sm text-gray-700"
    >
      <p v-if="!isAuthenticated">Connectez-vous avec un compte producteur.</p>
      <p v-else>
        Cette page est réservée aux comptes producteurs. Vous êtes connecté en tant que
        <strong>{{ currentRole }}</strong>.
      </p>
    </div>

    <div v-else-if="loading" class="p-8 text-center text-gray-600">Chargement…</div>

    <div v-else-if="loadError" class="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-800">
      {{ loadError }}
    </div>

    <div
      v-else-if="baskets.length === 0"
      class="rounded border border-gray-300 bg-gray-50 p-6 text-center text-gray-700"
    >
      <p class="font-semibold">Aucune commande reçue pour le moment.</p>
      <p class="mt-1 text-sm">
        Les demandes de panier des clients apparaîtront ici dès qu'elles seront envoyées.
      </p>
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
            <h2 class="font-semibold text-gray-900">
              {{ basket.clientName }}
              <!-- Un invité n'a pas de compte : pas de cloche à notifier (`C3-F2`). -->
              <span
                v-if="basket.isGuest"
                class="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-normal text-gray-600"
                title="Commande passée sans compte : le client suit son panier par son lien personnel."
              >
                invité
              </span>
            </h2>
            <p class="text-xs text-gray-500">
              Référence <strong class="font-mono">{{ basket.reference }}</strong> ·
              {{ basket.createdAt }} ·
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
            class="flex items-center justify-between gap-3 py-2"
          >
            <label
              class="flex flex-1 items-center gap-2"
              :class="
                item.removedByFarmer || removalSet(basket.id).has(item.id)
                  ? 'text-gray-400 line-through'
                  : 'text-gray-800'
              "
            >
              <input
                v-if="isActionable(basket) && !item.removedByFarmer"
                type="checkbox"
                class="h-4 w-4 accent-red-600"
                :checked="removalSet(basket.id).has(item.id)"
                @change="toggle(basket.id, item.id)"
              />
              <span>
                {{ item.name }}
                <span class="text-xs text-gray-500">({{ item.unit }})</span>
              </span>
            </label>
            <span class="whitespace-nowrap" :class="item.removedByFarmer ? 'text-gray-400 line-through' : ''">
              {{ item.quantity }} × {{ item.unitPrice.toFixed(2) }} =
              {{ item.lineTotal.toFixed(2) }} CHF
            </span>
          </li>
        </ul>

        <div
          v-if="isActionable(basket)"
          class="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-3"
        >
          <p class="text-sm">
            <span class="text-gray-500">Nouveau total :</span>
            <strong class="text-gray-900">{{ previewTotal(basket).toFixed(2) }} CHF</strong>
            <span v-if="removalSet(basket.id).size > 0" class="ml-2 text-xs text-red-700">
              {{ removalSet(basket.id).size }} article(s) retiré(s)
            </span>
          </p>
          <button
            type="button"
            class="rounded bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="busyId === basket.id"
            @click="submitAdjustment(basket)"
          >
            {{ willRejectEverything(basket) ? "Refuser la demande" : "Valider l'offre" }}
          </button>
        </div>

        <p v-if="willRejectEverything(basket) && isActionable(basket)" class="mt-2 text-xs text-red-700">
          Tous les articles sont retirés : la demande sera refusée et le client notifié.
        </p>

        <p
          v-if="!isActionable(basket)"
          class="mt-3 border-t border-gray-200 pt-2 text-right text-sm text-gray-700"
        >
          Total actuel : <strong>{{ basket.totalAmount.toFixed(2) }} CHF</strong>
        </p>

        <p v-if="basket.status === 'OFFER_PROPOSED'" class="mt-2 text-sm text-blue-800">
          Offre transmise au client, en attente de sa décision.
        </p>
        <p v-else-if="basket.status === 'CONFIRMED'" class="mt-2 text-sm text-green-800">
          Commande confirmée : à préparer pour le retrait à la ferme.
        </p>
        <p v-else-if="basket.status === 'REJECTED'" class="mt-2 text-sm text-red-700">
          Demande refusée ou annulée.
        </p>
      </li>
    </ul>
  </div>
</template>
