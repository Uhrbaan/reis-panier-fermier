<script setup lang="ts">
import { ref, computed, watchEffect } from "vue";
import { useRoute, useRouter } from "vue-router";
import { farms, type Farm, type PaymentMethod } from "../data/farms";

const route = useRoute();
const router = useRouter();

const farm = ref<Farm | null>(null);
const quantities = ref<Record<number, number>>({});
const selectedPayment = ref<PaymentMethod | "">("");
const orderSubmitted = ref(false);

const MAX_QTY = 50;

watchEffect(() => {
  const id = Number(route.params.id);
  const found = farms.find((f) => f.id === id) ?? null;
  farm.value = found;
  orderSubmitted.value = false;

  if (found) {
    quantities.value = Object.fromEntries(found.products.map((p) => [p.id, 0]));
    selectedPayment.value = found.paymentMethods[0] ?? "";
  }
});

function setQty(productId: number, value: number) {
  const clean = Number.isFinite(value) ? Math.floor(value) : 0;
  quantities.value[productId] = Math.min(MAX_QTY, Math.max(0, clean));
}

const basketLines = computed(() => {
  if (!farm.value) return [];
  return farm.value.products
    .filter((p) => p.available && (quantities.value[p.id] || 0) > 0)
    .map((p) => ({
      product: p,
      quantity: quantities.value[p.id],
      lineTotal: p.unitPrice * quantities.value[p.id],
    }));
});

const subtotal = computed(() =>
  basketLines.value.reduce((sum, line) => sum + line.lineTotal, 0)
);

function submitOrder() {
  if (!farm.value || basketLines.value.length === 0 || !selectedPayment.value) return;

  const payload = {
    farmId: farm.value.id,
    paymentMethod: selectedPayment.value,
    lines: basketLines.value.map((l) => ({
      productId: l.product.id,
      quantity: l.quantity,
    })),
  };

  console.log("Order submitted:", payload);
  orderSubmitted.value = true;
}
</script>

<template>
  <div v-if="farm" class="mx-auto max-w-3xl pb-12">
    <nav class="p-3">
      <button type="button" class="text-sm text-green-700 hover:underline" @click="router.push('/')">
        ← Retour à la carte
      </button>
    </nav>

    <!-- 1. Bannière photo -->
    <img :src="farm.bannerUrl" :alt="farm.name" class="h-60 w-full object-cover" />

    <main class="space-y-6 px-4 pt-6">
      <!-- 2. Nom de la ferme -->
      <h1 class="text-2xl font-bold">{{ farm.name }}</h1>

      <!-- 3. Description (complète) -->
      <p class="leading-relaxed text-gray-700">{{ farm.description }}</p>

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
              :class="{ 'opacity-50': !product.available }"
            >
              <td class="py-2.5 font-medium">{{ product.name }}</td>
              <td class="py-2.5">{{ product.unitPrice.toFixed(2) }} CHF / {{ product.unit }}</td>
              <td class="py-2.5">
                <div v-if="product.available" class="flex items-center gap-1.5">
                  <button
                    type="button"
                    class="h-7 w-7 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-40"
                    :disabled="quantities[product.id] <= 0"
                    @click="setQty(product.id, quantities[product.id] - 1)"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    class="w-14 rounded border border-gray-300 py-0.5 text-center"
                    :value="quantities[product.id]"
                    min="0"
                    :max="MAX_QTY"
                    @input="setQty(product.id, Number(($event.target as HTMLInputElement).value))"
                  />
                  <button
                    type="button"
                    class="h-7 w-7 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-40"
                    :disabled="quantities[product.id] >= MAX_QTY"
                    @click="setQty(product.id, quantities[product.id] + 1)"
                  >
                    +
                  </button>
                  <span class="ml-1 text-xs text-gray-500">{{ product.unit }}</span>
                </div>
                <span v-else class="italic text-gray-500">Indisponible</span>
              </td>
            </tr>
          </tbody>
        </table>
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
            <span>{{ method }}</span>
          </label>
        </div>
        <p class="mt-2 text-xs text-gray-500">
          {{
            selectedPayment === "Online"
              ? "Paiement garanti via la plateforme (fonds en séquestre pendant 7 jours, commission fixe appliquée lors de l'offre finale)."
              : "Règlement direct au producteur lors du retrait à la ferme, sans frais de plateforme."
          }}
        </p>
      </section>

      <!-- Validation -->
      <div
        v-if="orderSubmitted"
        class="rounded border border-green-700 bg-green-50 p-4 text-sm text-green-900"
      >
        <strong>Demande envoyée !</strong> Le producteur va vérifier la disponibilité de vos articles
        et vous transmettre son offre finale.
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
          :disabled="basketLines.length === 0 || !selectedPayment"
          @click="submitOrder"
        >
          Commander
        </button>
      </footer>
    </main>
  </div>

  <div v-else class="p-8 text-center text-gray-600">
    Ferme introuvable.
    <button type="button" class="ml-2 text-green-700 underline" @click="router.push('/')">
      Retour à la carte
    </button>
  </div>
</template>