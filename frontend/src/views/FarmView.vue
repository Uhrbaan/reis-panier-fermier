<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { fetchFarmById, createBasket, paymentMethodLabel, type Farm, type PaymentMethod } from "../api";

const route = useRoute();
const router = useRouter();

const farm = ref<Farm | null>(null);
const loading = ref(true);
const loadError = ref<string | null>(null);
const quantities = ref<Record<number, number>>({});
const selectedPayment = ref<PaymentMethod | "">("");
const orderSubmitted = ref(false);
const submitting = ref(false);
const submitError = ref<string | null>(null);

const MAX_QTY = 50;

async function loadFarm() {
  const id = Number(route.params.id);
  loading.value = true;
  loadError.value = null;
  farm.value = null;
  orderSubmitted.value = false;
  submitError.value = null;

  try {
    const found = await fetchFarmById(id);
    farm.value = found;
    quantities.value = Object.fromEntries(found.products.map((p) => [p.id, 0]));
    selectedPayment.value = found.paymentMethods[0] ?? "";
  } catch {
    loadError.value = "Ferme introuvable ou non approuvée.";
  } finally {
    loading.value = false;
  }
}

onMounted(loadFarm);
watch(() => route.params.id, loadFarm);

function setQty(productId: number, value: number) {
  const clean = Number.isFinite(value) ? Math.floor(value) : 0;
  quantities.value[productId] = Math.min(MAX_QTY, Math.max(0, clean));
}

// Products have no stock/availability flag (`C2-F3`): the producer adjusts the
// basket afterwards (`C2-F5`), so every catalog item is requestable.
const basketLines = computed(() => {
  if (!farm.value) return [];
  return farm.value.products
    .filter((p) => (quantities.value[p.id] || 0) > 0)
    .map((p) => ({
      product: p,
      quantity: quantities.value[p.id] ?? 0,
      lineTotal: p.unitPrice * (quantities.value[p.id] ?? 0),
    }));
});

const subtotal = computed(() =>
  basketLines.value.reduce((sum, line) => sum + line.lineTotal, 0)
);

/**
 * Reference of the basket just placed.
 *
 * No link or token is handed out any more: the guest session cookie keeps the
 * device attached to the order (ADR-10), so the reference is only the number to
 * quote if something goes wrong.
 */
const placed = ref<{ reference: string } | null>(null);

async function submitOrder() {
  if (!farm.value || basketLines.value.length === 0 || !selectedPayment.value) return;

  submitError.value = null;
  submitting.value = true;

  try {
    const result = await createBasket(
      farm.value.id,
      selectedPayment.value,
      basketLines.value.map((l) => ({ productId: l.product.id, quantity: l.quantity }))
    );
    placed.value = { reference: result.reference };
    orderSubmitted.value = true;
  } catch (error) {
    submitError.value =
      error instanceof Error ? error.message : "La demande n'a pas pu être envoyée.";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div v-if="loading" class="p-8 text-center text-gray-600">Chargement de la ferme…</div>

  <div v-else-if="farm" class="mx-auto max-w-3xl pb-12">
    <nav class="p-3">
      <button type="button" class="text-sm text-green-700 hover:underline" @click="router.push('/')">
        ← Retour à la carte
      </button>
    </nav>

    <!-- 1. Bannière photo (nullable tant que le producteur n'a rien téléversé) -->
    <img
      v-if="farm.bannerUrl"
      :src="farm.bannerUrl"
      :alt="farm.name"
      class="h-60 w-full object-cover"
    />
    <div
      v-else
      class="flex h-60 w-full items-center justify-center bg-green-50 text-6xl"
    >
      🌾
    </div>

    <main class="space-y-6 px-4 pt-6">
      <!-- 2. Nom de la ferme -->
      <h1 class="text-2xl font-bold">{{ farm.name }}</h1>

      <!-- 3. Description (rendu HTML assaini par le serveur, ADR-04) -->
      <div
        v-if="farm.descriptionHtml"
        class="description-html text-gray-700"
        v-html="farm.descriptionHtml"
      />
      <p v-else class="leading-relaxed text-gray-700">{{ farm.description }}</p>

      <!-- 4. Adresse (formatée) -->
      <section>
        <h2 class="mb-2 border-b border-gray-200 pb-1 text-lg font-semibold">Adresse</h2>
        <address class="whitespace-pre-line not-italic text-gray-700">{{ farm.address }}</address>
      </section>

      <!-- 5. Horaires d'ouverture -->
      <section>
        <h2 class="mb-2 border-b border-gray-200 pb-1 text-lg font-semibold">
          Horaires d'ouverture
        </h2>
        <p class="whitespace-pre-line text-gray-700">{{ farm.openingHours }}</p>
      </section>

      <!-- 6. Liste des produits -->
      <section>
        <h2 class="mb-2 border-b border-gray-200 pb-1 text-lg font-semibold">
          Produits disponibles
        </h2>
        <table class="w-full border-collapse text-left text-sm">
          <thead>
            <tr class="border-b border-gray-200 text-gray-600">
              <th class="py-2">Produit</th>
              <th class="py-2">Prix / Unité</th>
              <th class="py-2">Quantité</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="product in farm.products"
              :key="product.id"
              class="border-b border-gray-100"
            >
              <td class="py-2.5 font-medium">{{ product.name }}</td>
              <td class="py-2.5">{{ product.unitPrice.toFixed(2) }} CHF / {{ product.unit }}</td>
              <td class="py-2.5">
                <div class="flex items-center gap-1.5">
                  <button
                    type="button"
                    class="h-7 w-7 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-40"
                    :disabled="(quantities[product.id] ?? 0) <= 0"
                    @click="setQty(product.id, (quantities[product.id] ?? 0) - 1)"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    class="w-14 rounded border border-gray-300 py-0.5 text-center"
                    :value="quantities[product.id] ?? 0"
                    min="0"
                    :max="MAX_QTY"
                    @input="setQty(product.id, Number(($event.target as HTMLInputElement).value))"
                  />
                  <button
                    type="button"
                    class="h-7 w-7 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-40"
                    :disabled="(quantities[product.id] ?? 0) >= MAX_QTY"
                    @click="setQty(product.id, (quantities[product.id] ?? 0) + 1)"
                  >
                    +
                  </button>
                  <span class="ml-1 text-xs text-gray-500">{{ product.unit }}</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="farm.products.length === 0" class="text-sm italic text-gray-500">
          Ce producteur n’a pas encore publié de produit.
        </p>
      </section>

      <!-- 7. Paiements acceptés -->
      <section>
        <h2 class="mb-2 border-b border-gray-200 pb-1 text-lg font-semibold">Paiements acceptés</h2>
        <div class="space-y-1.5">
          <label
            v-for="method in farm.paymentMethods"
            :key="method"
            class="flex cursor-pointer items-center gap-2 text-sm"
          >
            <input type="radio" :value="method" v-model="selectedPayment" />
            <span>{{ paymentMethodLabel(method) }}</span>
          </label>
        </div>
        <p class="mt-2 text-xs text-gray-500">
          Règlement direct au producteur lors du retrait à la ferme, sans frais de plateforme.
        </p>
      </section>

      <!-- Validation -->
      <div
        v-if="orderSubmitted"
        class="rounded border border-green-700 bg-green-50 p-4 text-sm text-green-900"
      >
        <p>
          <strong>Demande envoyée !</strong> Le producteur va vérifier la disponibilité de vos
          articles et vous transmettre son offre finale.
        </p>

        <!-- La référence sert de numéro de dossier en cas de litige (C3-F5). -->
        <p v-if="placed" class="mt-3">
          Votre référence de panier :
          <strong class="rounded bg-white px-2 py-0.5 font-mono text-base">
            {{ placed.reference }}
          </strong>
        </p>
        <p v-if="placed" class="mt-1 text-xs text-green-800">
          Notez-la : c'est le numéro à indiquer à l'administrateur en cas de problème avec cette
          commande.
        </p>

        <p class="mt-3 text-xs text-green-800">
          Votre panier est rattaché à cet appareil : retrouvez-le dans « Mes paniers » sans créer de
          compte. Un compte n'est utile que pour être prévenu par e-mail.
        </p>

        <button
          type="button"
          class="mt-3 block text-sm font-semibold text-green-800 underline"
          @click="router.push('/mes-paniers')"
        >
          Suivre mes paniers
        </button>
      </div>

      <footer
        v-else
        class="flex items-center justify-between gap-4 rounded border border-gray-300 bg-gray-50 p-4"
      >
        <div>
          <p class="font-semibold">Estimation du panier : {{ subtotal.toFixed(2) }} CHF</p>
          <p class="text-xs text-gray-500">
            {{ basketLines.length }} article(s) — ajustable par le producteur avant confirmation
          </p>
        </div>
        <button
          type="button"
          class="rounded bg-green-700 px-5 py-2 font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="basketLines.length === 0 || !selectedPayment || submitting"
          @click="submitOrder"
        >
          {{ submitting ? "Envoi…" : "Commander" }}
        </button>
      </footer>

      <p v-if="submitError" class="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
        {{ submitError }}
      </p>
    </main>
  </div>

  <div v-else class="p-8 text-center text-gray-600">
    {{ loadError ?? "Ferme introuvable." }}
    <button type="button" class="ml-2 text-green-700 underline" @click="router.push('/')">
      Retour à la carte
    </button>
  </div>
</template>