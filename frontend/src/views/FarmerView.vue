<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { fetchMyFarm, type Farm, type Product } from "../api";
import { getToken, getUser, setSession, clearSession } from "../auth";
import FarmEditor from "../components/FarmEditor.vue";
import ProductManager from "../components/ProductManager.vue";

const token = ref(getToken());
const pastedToken = ref("");

const farm = ref<Farm | null>(null);
//si aucune ferme n'existe, affiche une ferme test 
//tant que backend n'est pas fait
/*const farm = ref<Farm | null>({
  id: 1,
  name: "Ferme de test",
  description: "## Bienvenue\n- Légumes frais",
  address: "Route du Coteau 12, 1700 Fribourg",
  latitude: 46.8,
  longitude: 7.16,
  bannerUrl: null,
  openingHours: "Samedi : 08h30 – 12h30",
  paymentMethods: ["CASH", "TWINT_FARM"],
  status: "APPROVED",
  products: [{ id: 1, farmId: 1, name: "Tomates", unit: "kg", unitPrice: 4.5 }],
});*/
const loading = ref(false);
const loadError = ref<string | null>(null);

const statusInfo = computed(() => {
  if (!farm.value) return null;
  switch (farm.value.status) {
    case "APPROVED":
      return {
        label: "Approuvée — visible sur la carte (modifications instantanées)",
        classes: "border-green-300 bg-green-50 text-green-800",
      };
    case "REJECTED":
      return {
        label: "Rejetée — corrige tes informations et réenregistre",
        classes: "border-red-300 bg-red-50 text-red-800",
      };
    default:
      return {
        label: "En attente d'approbation — masquée du public",
        classes: "border-amber-300 bg-amber-50 text-amber-800",
      };
  }
});

async function loadFarm() {
  if (!token.value) return;
  loading.value = true;
  loadError.value = null;
  try {
    farm.value = await fetchMyFarm();
  } catch (err) {
    loadError.value =
      err instanceof Error ? err.message : "Impossible de charger votre espace producteur.";
  } finally {
    loading.value = false;
  }
}

async function applyDevToken() {
  const value = pastedToken.value.trim();
  if (!value) return;
  setSession(value, getUser() ?? { id: 0, name: "Producteur", email: "marc@example.ch", role: "FARMER" });
  token.value = value;
  await loadFarm();
}

function logout() {
  clearSession();
  token.value = null;
  farm.value = null;
  loadError.value = null;
}

function onFarmSaved(saved: Farm) {
  farm.value = { ...saved, products: saved.products ?? farm.value?.products ?? [] };
}

function onProductsUpdated(products: Product[]) {
  if (farm.value) {
    farm.value = { ...farm.value, products };
  }
}

onMounted(loadFarm); //comment if you want to see the catalogue part
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-6 px-4 py-8 text-left">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Espace Producteur</h1>
        <p class="text-sm text-gray-500">Gère ta vitrine et ton catalogue de produits.</p>
      </div>

      <div class="flex items-center gap-3">
        <span
          v-if="statusInfo"
          class="rounded-full border px-3 py-1 text-xs font-medium"
          :class="statusInfo.classes"
        >
          {{ statusInfo.label }}
        </span>
        <button
          v-if="token"
          type="button"
          class="rounded border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
          @click="logout"
        >
          Se déconnecter
        </button>
      </div>
    </header>

    <!-- Connexion temporaire (en attendant le futur écran de login) -->
    <div
      v-if="!token"
      class="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm"
    >
      <p class="font-medium text-amber-900">
        Connecte-toi avec un compte Producteur pour gérer ta vitrine.
      </p>
      <p class="text-xs text-amber-800">
        En développement, génère un jeton avec :
        <code class="rounded bg-white px-1.5 py-0.5">cd backend &amp;&amp; npm run token -- marc@example.ch</code>
      </p>
      <textarea
        v-model="pastedToken"
        rows="2"
        class="w-full rounded border border-amber-300 bg-white p-2 font-mono text-xs"
        placeholder="Colle ton jeton JWT ici (eyJhbGciOi...)"
      />
      <button
        type="button"
        class="rounded bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800"
        @click="applyDevToken"
      >
        Utiliser ce jeton
      </button>
    </div>

    <template v-else>
      <div v-if="loading" class="py-8 text-center text-sm text-gray-500">
        Chargement de ta vitrine…
      </div>

      <div
        v-else-if="loadError"
        class="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800"
      >
        {{ loadError }}
      </div>

      <template v-else>
        <!-- Bloc 1 : Vitrine (photo, texte riche, horaires, paiements) -->
        <FarmEditor :farm="farm" @saved="onFarmSaved" />

        <!-- Bloc 2 : Catalogue produits (débloqué dès que la vitrine existe) -->
        <ProductManager
          v-if="farm"
          :products="farm.products ?? []"
          @updated="onProductsUpdated"
        />
        <p
          v-else
          class="rounded-lg border border-dashed border-gray-300 p-4 text-center text-sm text-gray-500"
        >
          Enregistre d'abord ta vitrine ci-dessus pour pouvoir ajouter tes produits au catalogue.
        </p>
      </template>
    </template>
  </div>
</template>